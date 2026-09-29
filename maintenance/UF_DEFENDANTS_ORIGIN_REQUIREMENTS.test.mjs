import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRAZILIAN_UFS,
  inferUfFromCnj,
  getUfInfoFromCnj,
} from '../src/utils/cnj.ts';
import {
  classifyDefendantGroup,
  extractDefendantsFromText,
  ensureProcessDefendants,
} from '../server/services/defendantApplicationHelper.ts';
import {
  deriveCompetencia,
  ensureProcessOrigin,
} from '../server/services/processOriginHelper.ts';

// ---------------------------------------------------------------------------
// 1. REQUISITO 4.1: Cobertura completa de 27 UFs e inferência determinística
// ---------------------------------------------------------------------------

test('1. BRAZILIAN_UFS contém todas as 27 UFs brasileiras (26 estados + DF)', () => {
  assert.equal(BRAZILIAN_UFS.length, 27);
  assert.ok(BRAZILIAN_UFS.includes('PB'), 'Paraíba (PB) deve estar presente');
  assert.ok(BRAZILIAN_UFS.includes('MA'), 'Maranhão (MA) deve estar presente');
  assert.ok(BRAZILIAN_UFS.includes('DF'), 'Distrito Federal (DF) deve estar presente');
  assert.ok(BRAZILIAN_UFS.includes('SP'), 'São Paulo (SP) deve estar presente');
  assert.ok(BRAZILIAN_UFS.includes('AC'), 'Acre (AC) deve estar presente');
  assert.ok(BRAZILIAN_UFS.includes('TO'), 'Tocantins (TO) deve estar presente');
});

test('2. inferUfFromCnj mapeia corretamente PB (0802191-66.2026.8.15.7701) e MA (0800883-19.2025.8.10.0151)', () => {
  // Caso 1 do Requisitos.md: PB (J=8, TR=15)
  const cnjPb = '0802191-66.2026.8.15.7701';
  assert.equal(inferUfFromCnj(cnjPb), 'PB');
  const infoPb = getUfInfoFromCnj(cnjPb);
  assert.equal(infoPb?.uf, 'PB');
  assert.equal(infoPb?.tribunal, 'TJPB');
  assert.equal(infoPb?.confianca, 1.0);

  // Caso 2 do Requisitos.md: MA (J=8, TR=10)
  const cnjMa = '0800883-19.2025.8.10.0151';
  assert.equal(inferUfFromCnj(cnjMa), 'MA');
  const infoMa = getUfInfoFromCnj(cnjMa);
  assert.equal(infoMa?.uf, 'MA');
  assert.equal(infoMa?.tribunal, 'TJMA');
  assert.equal(infoMa?.confianca, 1.0);
});

test('3. inferUfFromCnj não infere tribunais federais ou não estaduais (ex: J=1, J=4, J=5)', () => {
  // TRF1: J=4, TR=01 -> não deve inferir como estadual AC
  const cnjFederal = '0001234-56.2026.4.01.3400';
  assert.equal(inferUfFromCnj(cnjFederal), null);

  // TST / TRT: J=5
  const cnjTrt = '0001234-56.2026.5.02.0001';
  assert.equal(inferUfFromCnj(cnjTrt), null);
});

// ---------------------------------------------------------------------------
// 2. REQUISITO 4.2: Classificação e extração de rés (separadas da empresa do contrato)
// ---------------------------------------------------------------------------

test('4. classifyDefendantGroup categoriza SB Saúde, San Miguel e Outros', () => {
  assert.equal(classifyDefendantGroup('Saúde Brasil'), 'SB_SAUDE');
  assert.equal(classifyDefendantGroup('OPERADORA SAÚDE BRASIL LTDA'), 'SB_SAUDE');
  assert.equal(classifyDefendantGroup('SANTA BARBARA ASSISTENCIA MEDICA'), 'SB_SAUDE');
  assert.equal(classifyDefendantGroup('SB Saúde'), 'SB_SAUDE');

  assert.equal(classifyDefendantGroup('San Miguel'), 'SAN_MIGUEL');
  assert.equal(classifyDefendantGroup('SAN MIGUEL SAÚDE S/A'), 'SAN_MIGUEL');
  assert.equal(classifyDefendantGroup('Clínica San Miguel'), 'SAN_MIGUEL');

  assert.equal(classifyDefendantGroup('Hub Health'), 'OUTROS');
  assert.equal(classifyDefendantGroup('Unimed Seguros'), 'OUTROS');
  assert.equal(classifyDefendantGroup('Bradesco Saúde'), 'OUTROS');
  assert.equal(classifyDefendantGroup(''), 'INDETERMINADO');
  assert.equal(classifyDefendantGroup(null), 'INDETERMINADO');
});

test('5. extractDefendantsFromText preserva co-rés em ação "em face de Saúde Brasil e Hub Health"', () => {
  const narrative = 'Ação de obrigação de fazer ajuizada em face de Saúde Brasil e Hub Health requerendo cobertura de cirurgia.';
  const candidates = extractDefendantsFromText(narrative);

  assert.ok(candidates.length >= 2, `Deveria extrair ao menos 2 rés, obteve ${candidates.length}`);
  const names = candidates.map((c) => c.nome.toLowerCase());
  assert.ok(names.some((n) => n.includes('saúde brasil') || n.includes('saude brasil')), 'Deveria conter Saúde Brasil');
  assert.ok(names.some((n) => n.includes('hub health')), 'Deveria conter Hub Health como co-ré');

  // Verifica que papéis foram atribuídos como co-rés / rés solidárias
  assert.ok(candidates.every((c) => ['REU', 'REU_SOLIDARIO'].includes(c.papel || '')));
});

// ---------------------------------------------------------------------------
// 3. REQUISITO 4.3: Competência de origem (período AAAA-MM)
// ---------------------------------------------------------------------------

test('6. deriveCompetencia extrai mês e ano com fuso horário America/Sao_Paulo', () => {
  const comp1 = deriveCompetencia('2026-09-29T12:00:00Z');
  assert.deepEqual(comp1, { mes: 9, ano: 2026 });

  const comp2 = deriveCompetencia('2026-01-01T01:30:00Z');
  // 01:30 UTC em 01/01 no fuso SP (-03:00) cai na noite de 31/12/2025
  assert.deepEqual(comp2, { mes: 12, ano: 2025 });

  const comp3 = deriveCompetencia('2025-05-15');
  assert.deepEqual(comp3, { mes: 5, ano: 2025 });

  assert.equal(deriveCompetencia('data-invalida'), null);
});

// ---------------------------------------------------------------------------
// 4. REQUISITOS SEÇÃO 3.1 & 7: ensureProcessDefendants (Autonomia, Catálogo e Idempotência)
// ---------------------------------------------------------------------------

test('7. ensureProcessDefendants auto-confirma grupos canônicos com alta confiança e deixa outros como sugestão pendente', async () => {
  const insertedRows = [];
  const mockSupabase = {
    from: (table) => {
      if (table === 'process_defendants') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
          insert: (rows) => {
            insertedRows.push(...rows);
            return {
              select: () => Promise.resolve({ data: rows, error: null }),
            };
          },
        };
      }
      if (table === 'companies' || table === 'company_aliases') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
            or: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  };

  const res = await ensureProcessDefendants({
    supabase: mockSupabase,
    processId: 'p1',
    candidates: [
      { nome: 'Operadora Saúde Brasil Ltda', confianca: 0.95 },
      { nome: 'Clínica Especializada Xpto', confianca: 0.70 },
    ],
  });

  assert.equal(res.createdCount, 2);
  const sbRow = insertedRows.find((r) => r.nome_livre.includes('Saúde Brasil'));
  const xptoRow = insertedRows.find((r) => r.nome_livre.includes('Xpto'));

  // SB Saúde com alta confiança é auto-confirmada
  assert.equal(sbRow.confirmado, true);
  // Empresa não catalogada ou com confiança inferior fica pendente para revisão
  assert.equal(xptoRow.confirmado, false);
});

test('8. ensureProcessDefendants é idempotente e não duplica rés já existentes', async () => {
  const existingRows = [
    { id: 'def-1', nome_livre: 'Saúde Brasil', company_id: null, confirmado: true, papel: 'REU' },
  ];
  let insertCalled = false;

  const mockSupabase = {
    from: (table) => {
      if (table === 'process_defendants') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: existingRows, error: null }),
          }),
          insert: () => {
            insertCalled = true;
            return { select: () => Promise.resolve({ data: [], error: null }) };
          },
        };
      }
      const chainable = {
        eq: () => chainable,
        or: () => chainable,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      return {
        select: () => chainable,
      };
    },
  };

  const res = await ensureProcessDefendants({
    supabase: mockSupabase,
    processId: 'p1',
    candidates: [
      { nome: 'Saúde Brasil', confianca: 0.95 },
    ],
  });

  assert.equal(res.createdCount, 0);
  assert.equal(insertCalled, false, 'Não deve chamar insert para ré já existente');
});

// ---------------------------------------------------------------------------
// 5. REQUISITOS SEÇÃO 3.2 & 7: ensureProcessOrigin (Precedência, Auditoria e Unicidade)
// ---------------------------------------------------------------------------

test('9. ensureProcessOrigin preserva confirmação manual humana contra sobrescrita por IA', async () => {
  let insertCalled = false;
  const mockSupabase = {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: {
                id: 'orig-manual-1',
                data_origem: '2025-01-10',
                competencia_mes: 1,
                competencia_ano: 2025,
                tipo_data: 'DATA_MANUAL',
                confiabilidade: 'MANUAL',
                manual: true,
                definido_por: 'USUARIO',
              },
              error: null,
            }),
          }),
        }),
      }),
      insert: () => {
        insertCalled = true;
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'orig-new' }, error: null }) }) };
      },
    }),
  };

  const res = await ensureProcessOrigin({
    supabase: mockSupabase,
    processId: 'p1',
    receivedAt: '2026-09-29T10:00:00Z',
    definidoPor: 'IA',
  });

  assert.equal(res.originCreated, false);
  assert.equal(res.reason, 'PRESERVED_HUMAN');
  assert.equal(insertCalled, false, 'Origem manual humana não pode ser sobrescrita por IA');
});

test('10. ensureProcessOrigin prioriza data declarada (COMPROVADA) e inativa correntes anteriores', async () => {
  let insertedOrigin = null;
  let updatedFields = null;

  const mockSupabase = {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: {
                id: 'orig-inferida-1',
                data_origem: '2026-09-01',
                competencia_mes: 9,
                competencia_ano: 2026,
                tipo_data: 'DATA_RECEBIMENTO_CAIXA',
                confiabilidade: 'INFERIDA',
                manual: false,
                definido_por: 'IA',
              },
              error: null,
            }),
          }),
        }),
      }),
      insert: (payload) => {
        insertedOrigin = payload;
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'orig-declarada-2' }, error: null }),
          }),
        };
      },
      update: (fields) => {
        updatedFields = fields;
        return {
          eq: () => ({
            eq: () => ({
              neq: () => Promise.resolve({ error: null }),
            }),
          }),
        };
      },
    }),
  };

  const res = await ensureProcessOrigin({
    supabase: mockSupabase,
    processId: 'p1',
    explicitDate: '2026-08-15',
    receivedAt: '2026-09-29T10:00:00Z',
    definidoPor: 'IA',
  });

  assert.equal(res.originCreated, true);
  assert.equal(insertedOrigin.tipo_data, 'DATA_DECLARADA_EMAIL');
  assert.equal(insertedOrigin.confiabilidade, 'COMPROVADA');
  assert.equal(insertedOrigin.data_origem, '2026-08-15');
  assert.equal(insertedOrigin.competencia_mes, 8);
  assert.equal(insertedOrigin.competencia_ano, 2026);
  assert.equal(updatedFields.is_current, false);
  assert.equal(updatedFields.substituido_por, 'orig-declarada-2');
});

