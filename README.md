# SB Gestão Jurídica

Aplicação interna para gestão operacional de demandas jurídicas da operadora de saúde suplementar, com Supabase como fonte de verdade, leitura IMAP, triagem determinística e interpretação jurídica assistida por Gemini (`pipelineVersion: 2.5-gemini-semantic`).

## Configuração

A fonte única de configuração do backend é:

`server/config/env.ts`

Somente credenciais e segredos permanecem fora do código:

- `SUPABASE_SECRET_KEY`
- `IMAP_LOGIN_PASSWORD`
- `GEMINI_API_KEY`

O frontend Vite requer as variáveis públicas:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

`SUPABASE_URL` é opcional no backend; se ausente, o servidor utiliza `VITE_SUPABASE_URL`.

Parâmetros operacionais como host/usuário IMAP, mailbox, porta/TLS, lote de sincronização, modelo Gemini, timeout, orçamento, OCR, thresholds e retries ficam centralizados em `server/config/env.ts`.

A rota `GET /api/health` apresenta inventário seguro da configuração efetiva, sem revelar credenciais.

## Banco de Dados (Supabase)

O banco de dados já se encontra **integralmente provisionado e saneado**, não sendo necessária nem recomendada a execução de migrações legadas.

Para fins de verificação e auditoria técnica segura (somente leitura), utilize:
- `maintenance/AUDITORIA_BANCO_READONLY.sql` (acompanhado das orientações em `maintenance/AUDITORIA_BANCO_README.md`).

O histórico de saneamentos e intervenções estruturais prévias está documentado em `maintenance/HISTORICO_MANUTENCOES.md`.

## Desenvolvimento e Validação

```bash
npm install
npm run dev
```

Scripts de validação do projeto:

```bash
# Verificação estática de tipos TypeScript
npm run lint

# Execução da suíte de testes de integridade e regras
npm test

# Compilação de produção (frontend Vite + backend bundled + OCR worker)
npm run build
```

## Governança Operacional

- `pipelineVersion: 2.5-gemini-semantic`.
- Não persistir corpo bruto de e-mail ou OCR integral no banco de dados.
- CNJ inválido ou múltiplo ambíguo nunca é vinculado automaticamente (encaminhado para exceções determinísticas).
- Roteamento resiliente de IA com circuit breaker e controle de cotas/orçamento.
- Reanálise manual preserva trilha de auditoria e não sobrescreve campos consolidados silenciosamente.
- Novos e-mails têm prioridade; backlog IMAP é drenado em lotes controlados com locks distribuídos protegidos por lease e heartbeat.
