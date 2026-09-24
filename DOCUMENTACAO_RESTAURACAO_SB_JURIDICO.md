# Documentação de Restauração e Operação: SB Gestão Jurídica

Este documento descreve como a plataforma **SB Gestão Jurídica** foi restaurada e configurada contra o Supabase CLI local, e como reproduzir o processo integralmente.

---

## 1. Arquitetura e Serviços Locais

- **Docker Stack:** Gerenciado via Supabase CLI (`projeto-4`).
- **Host:** `192.168.91.103` (e `127.0.0.1`).
- **Portas:**
  - API Gateway (Kong): `57321` (usada pelo frontend `VITE_SUPABASE_URL` e backend `SUPABASE_URL`)
  - PostgreSQL: `57322`
  - Studio Web: `57323`
  - Inbucket / Mailpit: `57324`
  - Aplicação Web (Node/Express + Vite): `3000`

---

## 2. Passo a Passo de Reprodução

### Passo 1: Inicialização do Supabase CLI
```bash
npx supabase start
```

### Passo 2: Aplicação do Esquema de Banco Versionado
O esquema foi estruturado com base nas definições reais extraídas do backup, corrigindo papéis para o enum `app_role` (`ADMIN`, `GESTOR`, `ANALISTA`, `CONSULTA`) e aplicando políticas RLS e funções `SECURITY DEFINER` seguras:
```bash
npx supabase db reset --local --no-seed
```

### Passo 3: Importação dos Dados do Backup
O script `scripts/import_backup_data.mjs` realiza:
- Leitura em stream dos blocos `COPY` do arquivo `db_cluster-23-09-2026@06-15-11.backup.gz`.
- Desativação temporária de triggers de histórico para preservação dos dados originais.
- Migração dos 7 usuários em `auth.users` e criação das identidades em `auth.identities` para autenticação por senha.
- Atribuição de logins únicos normalizados (`username`) para os colaboradores em `public.user_profiles`.
- Definição de senhas iniciais aleatórias salvas em `.env.local` e flag `must_change_password = true`.
- Importação topológica estrita das 37 tabelas restantes sem violação de integridade referencial.
- Sincronização da sequência `demand_classification_catalog_id_seq` para o valor máximo (32).
- Gravação do evento de bootstrap em `public.user_access_audit`.

Comando de execução:
```bash
node scripts/import_backup_data.mjs
```

### Passo 4: Validação Automatizada de Integridade e Segurança
Execute a suíte de testes unitários e de integração:
```bash
# Verificação de tipos TypeScript
npm run lint

# Suíte de 172 testes automatizados
npm test

# Testes de integração end-to-end (Banco, RLS, Auth, IMAP e Gemini)
node --import tsx scripts/verify_all.mjs
```

### Passo 5: Inicialização da Aplicação
```bash
npm run dev
```
Acesse a aplicação no navegador em `http://localhost:3000` ou `http://192.168.91.103:3000`.

---

## 3. Autenticação Corporativa e Primeiro Acesso

- O Google OAuth foi integralmente removido da interface e dos fluxos de autenticação.
- O acesso é realizado por formulário corporativo em `/login` informando **Identificador** (`username` ou e-mail corporativo) e **Senha**.
- Mapeamento de usuários:
  - `juridico.sb` (`juridico.sb.dev2@gmail.com`) - Papel: `ADMIN`
  - `thyago.lustosa` (`thyago.lustosa@opsaudebrasil.com.br`) - Papel: `GESTOR`
  - `douglas.melo` (`douglas.melo@opsaudebrasil.com.br`) - Papel: `GESTOR`
  - `ramon.reis` (`ramon.reis@opsaudebrasil.com.br`) - Papel: `ANALISTA`
  - `notificacao.saudebrasil` (`notificacao@opsaudebrasil.com.br`) - Papel: `CONSULTA`
- **Senha inicial:** Foi gerada aleatoriamente e registrada no arquivo `.env.local` na variável `BOOTSTRAP_ADMIN_PASSWORD`.
- **Troca obrigatória:** Ao autenticar pela primeira vez, o modal de troca obrigatória de senha será apresentado, exigindo a definição de uma nova senha pessoal permanente (mínimo 6 caracteres).

---

## 4. Integrações Externas

### IMAP
- **Conta:** `juridico.dev@opsaudebrasil.com.br`
- **Servidor:** `email-ssl.com.br`, porta 993, SSL/TLS ativo.
- **Configurações:** Janela de 3650 dias, lote de 100 e-mails, monitoramento ativo.
- As configurações encontram-se persistidas em `public.email_account_config`. Para atualizar a senha de aplicativo em produção/desenvolvimento, utilize a tela administrativa em `/admin/conta-email`.

### Gemini AI
- **Chave de API:** Configurada exclusivamente no backend via `GEMINI_API_KEY`.
- **Modelos:** Roteamento configurado para `gemini-3-flash-preview` (primário) e `gemini-flash-lite-latest` (secundário).
