import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { getBackendSupabase } from '../integrations/supabase';
import { getOperationalDiagnostic } from '../services/operationalDiagnosticService';
import {
  confirmCompanyResolutionCandidate,
  rejectCompanyResolutionCandidate,
  resolveOrphanProcessCompany,
} from '../services/companyResolutionService';

const router = Router();
router.use(requireAuth);

function canManage(req: AuthenticatedRequest) {
  return ['ADMIN', 'GESTOR'].includes(String(req.user?.role || ''));
}

router.get('/diagnostic', async (req: AuthenticatedRequest, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Apenas ADMIN ou GESTOR pode exportar o diagnóstico.' });
  const supabase = getBackendSupabase();
  if (!supabase) return res.status(503).json({ error: 'Supabase backend indisponível.' });
  try {
    return res.json(await getOperationalDiagnostic(supabase));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao gerar diagnóstico.' });
  }
});

router.get('/candidates', async (req: AuthenticatedRequest, res) => {
  const supabase = getBackendSupabase();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Supabase backend indisponível.' });

  const status = String(req.query?.status || 'PENDENTE').toUpperCase();
  const requested = Number(req.query?.limit || 50);
  const limit = Math.max(1, Math.min(200, Number.isFinite(requested) ? requested : 50));

  let query = supabase
    .from('company_resolution_candidates')
    .select(
      'id,process_id,status,suggested_name,suggested_cnpj,confidence,candidate_names,candidate_cnpjs,evidence,created_at,updated_at,resolved_company_id,processes!inner(numero_processo,objeto_demanda)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status !== 'TODOS') query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, candidates: data || [], total: count ?? 0, limit });
});

router.post('/candidates/:id/confirm', async (req: AuthenticatedRequest, res) => {
  if (!canManage(req)) return res.status(403).json({ ok: false, error: 'Apenas ADMIN ou GESTOR pode confirmar vínculos de empresa.' });
  const supabase = getBackendSupabase();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Supabase backend indisponível.' });
  try {
    const result = await confirmCompanyResolutionCandidate(supabase, {
      candidateId: req.params.id,
      actorId: req.user!.id,
      companyId: req.body?.companyId || null,
      name: req.body?.name || null,
      cnpj: req.body?.cnpj || null,
    });
    return res.json({ ok: true, ...result });
  } catch (error: any) {
    return res.status(400).json({ ok: false, error: error?.message || String(error) });
  }
});

router.post('/candidates/:id/reject', async (req: AuthenticatedRequest, res) => {
  if (!canManage(req)) return res.status(403).json({ ok: false, error: 'Apenas ADMIN ou GESTOR pode rejeitar candidatos de empresa.' });
  const supabase = getBackendSupabase();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Supabase backend indisponível.' });
  try {
    const result = await rejectCompanyResolutionCandidate(supabase, {
      candidateId: req.params.id,
      actorId: req.user!.id,
    });
    return res.json({ ok: true, candidate: result });
  } catch (error: any) {
    return res.status(400).json({ ok: false, error: error?.message || String(error) });
  }
});

router.post('/reprocess-orphans', async (req: AuthenticatedRequest, res) => {
  if (!canManage(req)) return res.status(403).json({ ok:false, error:'Apenas ADMIN ou GESTOR pode reprocessar vínculos de empresa.' });
  const supabase = getBackendSupabase();
  if (!supabase) return res.status(503).json({ ok:false, error:'Supabase backend indisponível.' });

  const isExecute = req.body?.execute === true;
  const rawIds = req.body?.processIds;

  // Se execute === true OU se processIds foram enviados explicitamente:
  if (isExecute || Array.isArray(rawIds)) {
    if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 10 ||
        new Set(rawIds).size !== rawIds.length || rawIds.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
      return res.status(400).json({ ok:false, error:'Envie processIds explícitos: de 1 a 10 UUIDs únicos.' });
    }
    const { data: processes, error } = await supabase.from('processes').select('id,numero_processo').in('id', rawIds).is('company_id', null).order('id');
    if (error) return res.status(500).json({ ok:false, error:error.message });
    if (!isExecute) return res.json({ ok:true, dryRun:true, processes: processes || [], available: (processes || []).length, scanned:0 });
    try {
      let linked=0, unresolved=0, ambiguous=0, autoCreated=0, pendingConfirmation=0;
      const details:any[]=[];
      for (const process of processes || []) {
        const resolution = await resolveOrphanProcessCompany(supabase, process.id, req.user?.id || null);
        if (resolution.companyId) {
          const { data:updated, error:updateError } = await supabase.from('processes').update({ company_id: resolution.companyId, updated_by:req.user?.id || null, updated_at:new Date().toISOString() }).eq('id',process.id).is('company_id',null).select('id');
          if (!updateError && updated?.length === 1) {
            linked += 1;
            if (resolution.method === 'CNPJ_AUTO_CADASTRO') autoCreated += 1;
          } else unresolved += 1;
        } else if (resolution.method === 'AMBIGUO') ambiguous += 1;
        else {
          unresolved += 1;
          if (resolution.method === 'AGUARDANDO_CONFIRMACAO') pendingConfirmation += 1;
        }
        details.push({ processId:process.id, numeroProcesso:process.numero_processo, method:resolution.method, companyId:resolution.companyId, candidateId: resolution.candidateId || null });
      }
      return res.json({ ok:true, scanned:(processes||[]).length, linked, unresolved, ambiguous, autoCreated, pendingConfirmation, details });
    } catch (error:any) {
      return res.status(500).json({ ok:false, error:error?.message || String(error), partial:true });
    }
  }

  // Chamada dinâmica de prévia (sem processIds e execute !== true)
  let limit = 10;
  if (typeof req.body?.limit !== 'undefined') {
    const requested = Number(req.body.limit);
    if (!Number.isInteger(requested) || requested < 1 || requested > 10) {
      return res.status(400).json({ ok: false, error: 'O limite deve ser um número inteiro de 1 a 10.' });
    }
    limit = requested;
  }

  try {
    const { data: pendingCandidates, error: candError } = await supabase
      .from('company_resolution_candidates')
      .select('process_id')
      .eq('status', 'PENDENTE');

    if (candError) return res.status(500).json({ ok: false, error: candError.message });

    const pendingSet = new Set((pendingCandidates || []).map((c: any) => c.process_id).filter(Boolean));

    const NAO_RESOLVIDO_COOLDOWN_HOURS = 24;
    const cooldownSince = new Date(Date.now() - NAO_RESOLVIDO_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
    const { data: recentAudits, error: auditError } = await supabase
      .from('company_resolution_audit')
      .select('process_id,resolution_method,created_at')
      .gte('created_at', cooldownSince)
      .order('created_at', { ascending: false });

    if (auditError) return res.status(500).json({ ok: false, error: auditError.message });

    const latestRecentAuditByProcess = new Map<string, any>();
    for (const audit of recentAudits || []) {
      if (audit?.process_id && !latestRecentAuditByProcess.has(audit.process_id)) {
        latestRecentAuditByProcess.set(audit.process_id, audit);
      }
    }
    const cooldownSet = new Set(
      [...latestRecentAuditByProcess.values()]
        .filter((audit: any) => audit?.resolution_method === 'NAO_RESOLVIDO')
        .map((audit: any) => audit.process_id),
    );

    let query = supabase
      .from('processes')
      .select('id,numero_processo,created_at')
      .is('company_id', null);

    if (typeof (query as any).order === 'function') {
      query = query.order('created_at', { ascending: true });
    }

    const { data: orphans, error: procError } = await query;
    if (procError) return res.status(500).json({ ok: false, error: procError.message });

    const eligible = (orphans || []).filter((p: any) => !pendingSet.has(p.id) && !cooldownSet.has(p.id));
    const sorted = [...eligible].sort((a: any, b: any) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

    const batch = sorted.slice(0, limit);
    const available = batch.length;
    const remainingEligible = Math.max(0, sorted.length - available);

    return res.json({
      ok: true,
      dryRun: true,
      processes: batch.map((p: any) => ({ id: p.id, numero_processo: p.numero_processo })),
      available,
      remainingEligible,
      cooldownExcluded: cooldownSet.size,
      cooldownHours: NAO_RESOLVIDO_COOLDOWN_HOURS,
      scanned: 0,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});
export default router;
