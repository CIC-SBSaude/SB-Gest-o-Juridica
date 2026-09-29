import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { ENV } from '../config/env';

const router = Router();
router.use(requireAuth);

router.get('/beneficiaries/search', async (req: AuthenticatedRequest, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    return res.json({ ok: true, data: [] });
  }

  const cleaned = query.replace(/\D/g, '');
  const baseUrl = ENV.assistencial.url.replace(/\/+$/, '');
  const targetUrl = new URL(`${baseUrl}/rest/v1/beneficiaries`);

  targetUrl.searchParams.set(
    'select',
    'id,nome,cpf,cpf_normalizado,carteirinha,data_nascimento,empresa,municipio,uf,status,data_inclusao,genero'
  );
  targetUrl.searchParams.set('limit', '20');

  if (cleaned.length >= 3) {
    targetUrl.searchParams.set(
      'or',
      `(cpf_normalizado.ilike.*${cleaned}*,cpf.ilike.*${cleaned}*,nome.ilike.*${query}*)`
    );
  } else {
    targetUrl.searchParams.set('nome', `ilike.*${query}*`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENV.assistencial.timeoutMs);

  try {
    const response = await fetch(targetUrl.toString(), {
      signal: controller.signal,
      headers: {
        apikey: ENV.assistencial.anonKey,
        Authorization: `Bearer ${ENV.assistencial.anonKey}`,
        Accept: 'application/json',
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn('[ASSISTENCIAL SEARCH] Erro da API externa:', response.status, errText);
      return res.status(502).json({
        ok: false,
        error: 'Falha na resposta do sistema de Gestão Assistencial.',
        data: [],
      });
    }

    const data = await response.json();
    return res.json({ ok: true, data: Array.isArray(data) ? data : [] });
  } catch (error: any) {
    clearTimeout(timer);
    const isTimeout = error?.name === 'AbortError';
    console.warn('[ASSISTENCIAL SEARCH] Erro de rede/conexão:', isTimeout ? 'Timeout' : error?.message);
    return res.status(504).json({
      ok: false,
      error: isTimeout
        ? 'Tempo limite esgotado ao consultar Gestão Assistencial.'
        : 'Sistema de Gestão Assistencial indisponível.',
      data: [],
    });
  }
});

export default router;
