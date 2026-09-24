# Histórico de Manutenções e Intervenções do Sistema

Este documento consolida o registro histórico de implantações, saneamentos e governança técnica realizados no repositório e no banco de dados.

## Registro Histórico Consolidado

1. **Empresa Vinculada Concluída:**
   - Resolução e vinculação dinâmica de operadoras/empresas consolidadas;
   - Scripts legados executados e arquivados/higienizados do repositório.

2. **Saneamento CNJ (A1, A2, B1 e B2) Concluído:**
   - Correção e saneamento integral de inconsistências de numeração CNJ (formatos sem pontuação, múltiplos CNJs e ambiguidades);
   - Rotinas pontuais concluídas e descontinuadas.

3. **Prevenção CNJ Futura Implantada:**
   - Rotinas determinísticas no pipeline de entrada com validação estrita de dígitos verificadores e controle de ambiguidade;
   - Cobertura por testes automatizados (`CNJ_FUTURE_ROUTING.test.mjs`, `CNJ_AMBIGUITY_*.test.mjs`).

4. **Governança Gemini Implantada:**
   - Roteamento resiliente de modelos (`gemini-3.8-flash` e fallback `gemini-3.5-flash-lite`);
   - Controle de orçamento diário (RPD), circuit breaker atômico e tratamento de capacity/quota.

5. **Recuperação Automática de `email_processing_runs` Implantada:**
   - Reconciliação atômica de execuções órfãs/stale sob lock distribuído com heartbeat e controle estrito de lease;
   - Política de auditoria read-only para diagnóstico técnico sem alertas falsos para leases expirados recuperáveis.

6. **Faxina do Repositório (16/09/2026):**
   - Higienização física de artefatos temporários, planilhas obsoletas e arquivos scratch da raiz;
   - Exclusão de 37 SQLs históricos de migração/verificação e scripts de intervenção encerrados, unificando a rastreabilidade neste documento;
   - Preservação exclusiva de ferramentas permanentes (`AUDITORIA_BANCO_READONLY.sql`, `AUDITORIA_BANCO_README.md`, `copy-ocr-worker.mjs`, `party-role-backfill-dry-run.ts`, `reclassify-cnj-multiplo-readonly.ts`).

7. **Baseline Operacional e Versão:**
   - Baseline validada e coberta pela suíte de testes contínuos;
   - `pipelineVersion`: `2.5-gemini-semantic`.
