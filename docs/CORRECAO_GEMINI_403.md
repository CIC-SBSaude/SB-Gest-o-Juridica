# Tratamento de acesso negado no Gemini

O router já interrompia retries e fallback para um 403. Entretanto, não persistia essa falha na saúde do modelo. O intérprete retornava apenas a mensagem e o processamento de e-mail recriava qualquer falha como HTTP 502; o worker então a classificava como erro transitório de banco/rede.

A correção preserva status e código, registra `AI_ACCESS_DENIED`, mantém o e-mail pendente e bloqueia chamadas automáticas dos modelos afetados. A mensagem explícita de projeto recusado bloqueia toda a cadeia da mesma credencial; uma recusa genérica bloqueia o modelo que respondeu. O reset de quota não libera esse estado.

Após regularizar o acesso no Google, um ADMIN pode usar **Verificar acesso após regularização** na tela Uso da IA, em cada modelo bloqueado. A rota autenticada `POST /api/ai/access-check` aceita somente modelos da cadeia configurada e envia a frase sintética “Responda apenas OK.”. Não envia documentos. Consome uma chamada e respeita orçamento/controle de concorrência existentes. Somente uma resposta bem-sucedida com gravação da recuperação limpa o bloqueio daquele modelo; uma tentativa sem sucesso o preserva.

Não requer migração: usa as colunas existentes de `ai_model_health`. Confirmar a existência da tabela e permissão de escrita antes da implantação. Se a gravação falhar, o processo Node mantém bloqueio em memória e registra a falha; essa proteção local não sobrevive a reinício nem é compartilhada entre instâncias. É necessário corrigir a persistência para garantir bloqueio durável em todas as instâncias.

Esta mudança não libera projetos recusados pelo Google. O operador deve verificar o projeto e a credencial carregados no backend e seguir a orientação do provedor. Nenhuma credencial deve ser registrada em logs.

Validação: executar `npm test`, `npm run lint` e `npm run build`. O teste `AI_ACCESS_DENIED.test.mjs` usa serviços reais com provedores e banco simulados, sem acessar Gemini ou dados de produção.
