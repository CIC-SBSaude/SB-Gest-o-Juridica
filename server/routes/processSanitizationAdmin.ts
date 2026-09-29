import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { getBackendSupabase } from '../integrations/supabase';
import { ensureProcessOrigin } from '../services/processOriginHelper';
import {
  extractDefendantsFromText,
  ensureProcessDefendants,
  classifyDefendantGroup,
} from '../services/defendantApplicationHelper';

const router = Router();
router.use(requireAuth);

function canManage(req: AuthenticatedRequest) {
  return ['ADMIN', 'GESTOR'].includes(String(req.user?.role || ''));
}

/**
 * Endpoint de saneamento retroativo de competência de origem e rés (Requisitos 4.4, 6 e 11).
 * Suporta dry-run (prévia) idempotente e execução controlada em lotes de 1 a 50 processos.
 */
router.post('/origins-defendants', async (req: AuthenticatedRequest, res) => {
  if (!canManage(req)) {
    return res.status(403).json({ ok: false, error: 'Apenas ADMIN ou GESTOR pode executar saneamento de processos.' });
  }

  const supabase = getBackendSupabase();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Supabase backend indisponível.' });

  const isExecute = req.body?.execute === true;
  const rawIds = req.body?.processIds;
  const requestedLimit = Number(req.body?.limit || 10);
  const limit = Math.max(1, Math.min(50, Number.isInteger(requestedLimit) ? requestedLimit : 10));

  try {
    let targetProcesses: any[] = [];
    if (Array.isArray(rawIds) && rawIds.length > 0) {
      if (rawIds.length > 50 || new Set(rawIds).size !== rawIds.length) {
        return res.status(400).json({ ok: false, error: 'Envie no máximo 50 processIds únicos.' });
      }
      const { data, error } = await supabase
        .from('processes')
        .select('id, numero_processo, created_at, uf')
        .in('id', rawIds);
      if (error) return res.status(500).json({ ok: false, error: error.message });
      targetProcesses = data || [];
    } else {
      const { data: existingOrigins } = await supabase
        .from('process_origin')
        .select('process_id')
        .eq('is_current', true);
      const originProcessIds = new Set((existingOrigins || []).map((o: any) => o.process_id).filter(Boolean));

      const { data: procs, error: procErr } = await supabase
        .from('processes')
        .select('id, numero_processo, created_at, uf')
        .order('created_at', { ascending: true })
        .limit(200);

      if (procErr) return res.status(500).json({ ok: false, error: procErr.message });
      targetProcesses = (procs || []).filter((p: any) => !originProcessIds.has(p.id)).slice(0, limit);
    }

    const previewList: any[] = [];
    for (const proc of targetProcesses) {
      const { data: links } = await supabase
        .from('process_email_links')
        .select('processed_email_id, created_at, processed_emails(id, received_at, metadata, interpretation_history(summary, action_summary))')
        .eq('process_id', proc.id)
        .order('created_at', { ascending: true })
        .limit(10);

      const { data: timelines } = await supabase
        .from('process_timeline')
        .select('id, title, description, event_date, created_at')
        .eq('process_id', proc.id)
        .order('created_at', { ascending: true })
        .limit(10);

      let candidateDate: string | null = null;
      let candidateEmailId: string | null = null;
      const defendantTexts: string[] = [];

      for (const link of links || []) {
        const pe = (link as any).processed_emails;
        if (pe?.received_at && !candidateDate) {
          candidateDate = pe.received_at;
          candidateEmailId = pe.id;
        }
        if (pe?.interpretation_history?.[0]?.action_summary) {
          defendantTexts.push(pe.interpretation_history[0].action_summary);
        }
      }

      for (const tl of timelines || []) {
        if (!candidateDate && tl.event_date) {
          candidateDate = tl.event_date;
        }
        if (tl.description) defendantTexts.push(tl.description);
        if (tl.title) defendantTexts.push(tl.title);
      }

      if (!candidateDate && proc.created_at) {
        candidateDate = proc.created_at;
      }

      const extractedCandidates = extractDefendantsFromText(defendantTexts.join(' \n '));

      previewList.push({
        processId: proc.id,
        numeroProcesso: proc.numero_processo,
        candidateDate,
        candidateEmailId,
        hasCandidateOrigin: Boolean(candidateDate),
        candidateDefendantsCount: extractedCandidates.length,
        candidateDefendants: extractedCandidates.map((c) => ({
          nome: c.nome,
          papel: c.papel,
          grupo: classifyDefendantGroup(c.nome),
        })),
      });
    }

    if (!isExecute) {
      return res.json({
        ok: true,
        dryRun: true,
        totalIdentified: previewList.length,
        preview: previewList,
      });
    }

    let originsCreated = 0;
    let defendantsCreatedTotal = 0;
    const executionResults: any[] = [];

    for (const item of previewList) {
      let originSuccess = false;
      let createdDefs = 0;

      if (item.candidateDate) {
        const originRes = await ensureProcessOrigin({
          supabase,
          processId: item.processId,
          emailId: item.candidateEmailId,
          receivedAt: item.candidateDate,
          actorId: req.user?.id || null,
          definidoPor: 'SISTEMA',
        });
        if (originRes.originCreated) {
          originsCreated += 1;
          originSuccess = true;
        }
      }

      if (item.candidateDefendants?.length > 0) {
        const defRes = await ensureProcessDefendants({
          supabase,
          processId: item.processId,
          candidates: item.candidateDefendants,
          actorId: req.user?.id || null,
        });
        createdDefs = defRes.createdCount;
        defendantsCreatedTotal += createdDefs;
      }

      executionResults.push({
        processId: item.processId,
        numeroProcesso: item.numeroProcesso,
        originCreated: originSuccess,
        defendantsCreated: createdDefs,
      });
    }

    return res.json({
      ok: true,
      executed: true,
      originsCreated,
      defendantsCreatedTotal,
      details: executionResults,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
});

export default router;
