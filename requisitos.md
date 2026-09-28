# Levantamento complementar de requisitos do SB Gestão Jurídica

Demandas assistenciais e processos de prestadores de serviços

**Versão 2.0 proposta — 28 de setembro de 2026**  
**Destinatários:** gestão jurídica, operação, equipe de desenvolvimento e responsáveis pelo cadastro assistencial.  
**Finalidade:** orientar refinamento, desenvolvimento, saneamento dos dados e homologação das funcionalidades.

## 1 Objetivo e recomendação

Evoluir o sistema existente para analisar processos por empresa ré, competência, localização e vínculo do beneficiário; classificar os atendimentos; separar valores pedidos e sentenciados; estruturar os serviços e as cobranças de prestadores; e resumir, com evidências, as dificuldades alegadas pelos beneficiários.

**Recomendação principal:** implementar primeiro o modelo de dados, o cadastro revisável e a consistência dos indicadores; depois integrar o cadastro assistencial e ampliar a extração por IA. A automação deve preencher sugestões verificáveis, preservando a decisão humana e os dados já confirmados.

A interface atual já oferece processos, obrigações, histórico, interpretação de comunicações, sugestões de IA e exceções. Esses recursos são pontos de extensão. Não há evidência que justifique substituir a aplicação inteira para atender às correções.

O complemento mais importante em relação à versão 1.0 é tratar a **qualidade e a identidade dos dados como parte da entrega**. Um filtro por ré não pode usar indistintamente a empresa do contrato. Uma busca por CPF não pode escolher arbitrariamente entre várias carteirinhas. Um total por processo precisa explicitar como trata cadastros com o mesmo CNJ. E a existência de uma sugestão de IA não equivale a um dado aprovado.

## 2 Base da análise e grau de evidência

### 2.1 Fontes

| Código | Fonte | Uso neste levantamento |
|---|---|---|
| DOC01 | Correções Juridico.docx | Solicitações de negócio, lidas no conteúdo textual do anexo. |
| DOC02 | Levantamento_de_Requisitos_SB_Juridico.md, versão 1.0, de 28/09/2026 | Requisitos RF01 a RF14, propostas técnicas, decisões D01 a D10 e relato da análise estática anterior. |
| UI01 | Sistema jurídico, `/painel` | Indicadores, recortes, completude e filtros disponíveis. |
| UI02 | Sistema jurídico, `/processos`, formulário Novo Processo | Lista, filtros, identificação, datas, empresa vinculada, classificação e valores. |
| UI03 | Detalhe de processo, Visão Geral e Gestão Operacional | Campos existentes, pendências cadastrais, sugestões e aplicação humana de IA. |
| UI04 | Sistema jurídico, `/caixa-juridica` | Estados de tratamento, eventos interpretados e vínculo das comunicações. |
| UI05 | Sistema jurídico, `/admin/uso-ia` | Fila, capacidade apresentada, classificação retroativa e proteção de classificações humanas. |
| UI06 | Sistema jurídico, `/admin/excecoes` | Tipos de exceção e exemplos de comunicações com múltiplos CNJs. |
| UI07 | Sistema assistencial, Base de Beneficiários e formulário Novo Beneficiário | Identificadores, campos cadastrais, volume apresentado e multiplicidade de carteirinhas. |

Endereços consultados: `http://192.168.91.103:3002` e `http://192.168.91.103:3000`. Inspeção realizada em 28/09/2026, em sessões já autenticadas, por navegação e leitura. Formulários foram abertos e cancelados, sem salvar cadastros. Não foram acionados processamento, reparos ou aplicação de sugestões.

**Classificação das afirmações:** “observado” significa visível nas telas examinadas; “herdado” significa descrito em DOC02; “proposto” significa recomendação desta especificação; “a confirmar” significa decisão de negócio ou verificação técnica necessária. A ausência de um campo nas telas examinadas não prova sua inexistência em todas as tabelas ou APIs.

Não houve nova inspeção do código-fonte, consulta direta ao banco, teste de escrita, teste dos demais perfis nem validação do contrato de API assistencial. As referências a React, Express, Supabase, arquivos e serviços são herdadas de DOC02 e devem ser conferidas contra a versão implantada antes do desenvolvimento. Os números abaixo são uma fotografia da interface, não uma auditoria da base nem comprovação de defeito no cálculo.

### 2.2 Diagnóstico observado

| ID | Constatação | Consequência para o projeto |
|---|---|---|
| A01 | Painel com 758 processos ativos e 758 sem responsável; aviso de classificação gerencial pendente. | Acrescentar fila de saneamento, responsável pela revisão e indicadores de cobertura. Não interpretar ausência de classificação como risco baixo. |
| A02 | Perfil das demandas com 166 sem classificação e 402 sem subclassificação; completude apresentada de 47,0%. | A entrega precisa incluir tratamento do histórico e diferenciar classificação ausente de demanda fora do recorte. |
| A03 | Painel com 307 prazos críticos, 502 obrigações pendentes e 173 processos críticos/atrasados. | Preservar a operação de prazos. Esses números têm unidades distintas e não devem ser comparados como se fossem o mesmo indicador. |
| A04 | Painel com 2.044 e-mails aguardando IA e 536 exceções abertas; bloco de e-mails apresenta 532 e-mails em exceção. | Distinguir contagem de exceções da contagem de e-mails; não presumir erro apenas pela diferença. Monitorar idade, vazão e motivo das filas. |
| A05 | Formulário rotula o campo como “Empresa Vinculada (Cliente / Contrato PJ)”. | Criar relação explícita de rés. A empresa contratante do plano não pode ser convertida automaticamente em ré. |
| A06 | Não apareceu opção identificada como San Miguel no seletor de empresas examinado. | Validar razão social, CNPJ e aliases; essa observação não comprova inexistência sob outro nome. |
| A07 | Lista oferece status, empresa vinculada, prioridade e arquivados; painel oferece todo o histórico, 30/90 dias e ano atual. | Não foi localizado o conjunto solicitado de filtros por mês/ano de origem, ré, cidade, UF, vínculo e detalhe assistencial. |
| A08 | Catálogo assistencial do formulário contém Cirurgia e Exame, mas não Consulta; detalhamento é textual. | Acrescentar Consulta e catálogo controlado de procedimentos/especialidades, mantendo classes já existentes. |
| A09 | Formulário apresenta Valor da Causa; detalhe operacional apresenta Exposição estimada. | Criar campos e regras próprios para pedido, sentença, dívida, dano material e dano moral. |
| A10 | Detalhe examinado possui “Situação do Beneficiário”, mas não expõe o contexto contratual e territorial solicitado. | Complementar o vínculo com beneficiário e contrato; manter jurisdição separada da residência. |
| A11 | Novo Processo informa expressamente que permite múltiplos registros com o mesmo CNJ. | Definir unidade de contagem, associação de comunicações e política de duplicidade antes de publicar totais analíticos. |
| A12 | Há protocolos com fragmentos de palavras e um campo de autor contendo uma frase narrativa na amostra da lista. | Introduzir validação semântica e revisão dos identificadores. A origem técnica dessas ocorrências precisa ser investigada. |
| A13 | Gestão Operacional apresenta sugestões de risco, responsável e status com botão Aplicar; no exemplo, há sugestão de risco alto ainda não aplicada. | Reutilizar a revisão existente. Distinguir valor aprovado, sugestão pendente e cobertura da classificação. |
| A14 | Existem vocabulários diferentes: status da lista, status operacional e status da comunicação. | Não unificá-los por simples troca de rótulo. Documentar cada dimensão e sua influência nos filtros. |
| A15 | Exceções mostram mensagens com múltiplos CNJs e anexos sem separação segura. | Vincular evidência ao processo correto antes de extrair valores, origem e alegações. |
| A16 | Uso da IA apresenta fila, cotas locais, falhas anteriores, custo não configurado e rotina retroativa restrita à classificação. | Novas extrações precisam de orçamento, prioridade e fila próprios ou tipos de trabalho distintos; não reutilizar o reprocessamento como se já cobrisse todos os campos. |
| A17 | Base assistencial apresenta 257.612 registros, dos quais 28.103 ativos e 229.509 inativos. | Consultar por identificador e paginar candidatos; não carregar a base inteira no navegador jurídico. Inativos podem ser relevantes para processos históricos. |
| A18 | A amostra assistencial contém o mesmo CPF em carteirinhas diferentes, inclusive com situação cadastral diferente. | Separar pessoa, inscrição/carteirinha e contexto contratual. CPF sozinho não resolve qual vínculo deve representar o processo. |
| A19 | Formulário assistencial apresenta carteirinha, CPF opcional, nome, empresa em texto, município, UF e status; não expõe tipo de contratação, CNPJ da empresa, regional ou vigências contratuais. | A integração cobre apenas o que a origem realmente fornecer. Os demais dados exigem contrato técnico, enriquecimento validado ou complemento manual rastreado. |

### 2.3 Ajustes em relação ao levantamento anterior

Mantêm-se os objetivos dos RF01 a RF14 e os cuidados com origem, revisão humana e valores. Esta versão amplia cinco pontos:

1. RF05 passa a distinguir pessoa de inscrição assistencial e a prever várias carteirinhas por CPF, inclusive inativas.
2. RF04 passa a exigir definição explícita da unidade “processo”, pois a interface permite CNJ repetido.
3. RF08 mantém um atendimento predominante no início, mas recomenda estrutura de itens para evitar perda futura em processos com vários procedimentos.
4. RF14 ganha tratamento operacional das pendências, evidências vinculadas e versões aprovadas.
5. RF15 a RF20 são novos complementos: qualidade, filas, indicadores, identidade processual, enriquecimento cadastral e usabilidade.

## 3 Escopo e rastreabilidade

### 3.1 Correspondência com Correções Juridico

| Solicitação | Resultado esperado | Requisitos |
|---|---|---|
| S01 Separar SB Saúde e San Miguel como rés nos dois grupos | Rés confirmadas e filtros independentes da empresa do contrato | RF02 |
| S02 Competência pelo primeiro e-mail e total dos filtros | Origem rastreada; mês/ano, ano ou todo o período; contagem consistente | RF03, RF04, RF17, RF18 |
| S03 Região, cidade e estado do beneficiário | Contexto territorial associado ao beneficiário correto | RF05, RF06, RF19 |
| S04 Coletivo empresarial, adesão e nome do CNPJ vinculado | Modalidade, pessoa jurídica, papel e referência temporal | RF05, RF07, RF19 |
| S05 Classificação bruta de exame, cirurgia e consulta | Classe assistencial controlada | RF08 |
| S06 Procedimento ou especialidade | Subclassificação subordinada à classe | RF08 |
| S07 Valor requerido se não houver sentença | Pedido preservado e destaque condicionado ao estado da sentença | RF09 |
| S08 Priorizar valor sentenciado | Sentença de referência confirmada, inclusive zero ou ilíquida | RF09 |
| S09 Dificuldades alegadas interpretadas por IA e ressalva inicial | Resumo específico, dados estruturados e evidências | RF10, RF14, RF16 |
| S10 Nome do prestador | Prestador identificado separadamente da ré | RF11 |
| S11 Período de prestação | Um ou mais períodos com precisão da informação | RF12 |
| S12 Tipo do serviço prestado | Serviço classificado e descrito | RF12 |
| S13 Dívida separada de danos materiais e morais | Componentes financeiros sem dupla contagem | RF13 |
| S14 Desconsiderar CLT e considerar médico PJ | Recorte de prestadores com vínculo confirmado | RF01, RF11 |

RF15 a RF20 e requisitos não funcionais são propostas complementares motivadas pela análise. Não são transcrições de solicitações expressas do anexo.

### 3.2 Limites do escopo

Inclui evolução funcional, integração de leitura, preenchimento manual, sugestões por IA, saneamento histórico, filtros e homologação. Não inclui cálculo automático de prazos legais, juros ou correção monetária; determinação da veracidade das alegações; nova gestão trabalhista; exclusão dos registros CLT; escrita no cadastro assistencial; nem alteração da infraestrutura ou implantação durante este levantamento.

A prioridade sugerida é **P0** para decisões e controles que impedem resultados confiáveis, **P1** para o núcleo funcional solicitado e **P2** para a automação e otimizações após validação do núcleo. P2 não significa retirar a funcionalidade do escopo final.

## 4 Experiência de uso proposta

### 4.1 Lista e análise

Acrescentar recortes “Todos”, “Assistenciais”, “Prestadores” e “A classificar”. O recorte é independente da natureza jurídica: uma cobrança pode pertencer a Prestadores, e uma demanda indenizatória pode decorrer de atendimento assistencial.

Apresentar filtros de ré, competência, UF, município, regional, vínculo, empresa do contrato, classe e detalhe, com chips dos filtros aplicados e ação Limpar. Exibir “Sem informação” em cada dimensão pertinente. O filtro Empresa vinculada legado deve manter seu significado até que a transição seja validada.

Mostrar total de registros, unidade de contagem, dados pendentes e data de atualização. No assistencial, as colunas propostas são identificação, ré, beneficiário, competência, município/UF, vínculo, classificação, valor em destaque com sua natureza e revisão. Em Prestadores, substituir os dados do beneficiário por prestador, serviço, período, dívida e indenizações. Colunas operacionais de prazo e responsabilidade continuam acessíveis.

Criar uma visão analítica histórica distinta do painel operacional. No painel operacional, preservar o foco em prazos e ações atuais. Na análise histórica, permitir encerrados, com controle explícito de arquivados e dos estados de revisão considerados. Os filtros de um bloco não devem aparentar alterar indicadores globais que não os utilizem.

### 4.2 Detalhe do processo

Reaproveitar o detalhe existente com seções “Rés”, “Beneficiários e contratos”, “Atendimentos”, “Valores e decisões”, “Prestadores e serviços” e “Alegações e evidências”, apresentando somente as seções aplicáveis. Pendências e histórico continuam integrados às abas existentes.

Cada informação crítica deve exibir origem, estado de revisão e data de referência. A consulta cadastral deve apresentar candidatos antes da associação; a revisão de IA deve mostrar lado a lado dado atual, sugestão e evidência. O usuário precisa poder salvar parcialmente e retomar sem perder o controle de prazos.

### 4.3 Fluxos

**Assistencial:** comunicação recebida → vínculo processual revisado → segmento e rés → pessoa e carteirinha → contexto territorial/contratual → atendimento → pedido e sentença → alegações → revisão → indicadores.

**Prestadores:** comunicação ou cadastro manual → vínculo processual → segmento e rés → prestador e vínculo PJ/PF/CLT → serviços e períodos → dívida e indenizações → revisão → indicadores.

**Exceção:** falha ou ambiguidade → motivo específico → responsável → evidência → correção ou justificativa → nova validação → encerramento da pendência com histórico. Uma falha técnica não deve ser resolvida simplesmente classificando o dado como inexistente.

## 5 Requisitos funcionais detalhados

### RF01 Segmentos de acompanhamento

**Origem:** S14 e organização de DOC01. **Prioridade:** P1. **Dependências:** D08.

Manter segmento ASSISTENCIAL, PRESTADOR, OUTRO ou NAO_CLASSIFICADO, separado da natureza jurídica e da categoria da demanda. No recorte Prestadores, incluir médico PJ confirmado e excluir casos CLT confirmados, mantendo estes no cadastro geral. Vínculo controvertido permanece em revisão; profissão, nome ou ramo judicial isolados não decidem o vínculo.

**Aceite:** hospital cobrando serviços aparece em Prestadores; médico PJ confirmado é incluído; CLT sai apenas do recorte; vínculo insuficiente aparece como pendência sem exclusão definitiva.

### RF02 Empresas rés e papéis das partes

**Origem:** S01. **Prioridade:** P1. **Dependências:** D02, RF14.

Permitir uma ou várias rés por processo, identificadas pelo cadastro canônico de empresas e pelo papel processual. SB Saúde e San Miguel devem ter razão social, documento e aliases homologados. Admitir outra ré e ré não identificada, sem obrigar escolha incorreta entre as duas.

Separar ré, beneficiário, representante, prestador, contratante, estipulante e administradora. Manter a empresa vinculada legada sem mudar silenciosamente sua semântica. Somente evidência adequada do polo passivo autoriza confirmar a ré; menção a um CNPJ não basta.

**Aceite:** processo com duas rés é encontrado por qualquer uma e conta uma vez no total geral; hospital autor não vira ré; correção humana registra anterior/novo, motivo, usuário e horário e resiste a reprocessamento.

### RF03 Competência de origem

**Origem:** S02. **Prioridade:** P1. **Dependências:** D01, RF18.

Persistir data de origem, procedência, confiabilidade e comunicação de referência. A proposta é usar a menor data confiável de uma comunicação elegível, efetivamente vinculada ao processo. Separar data declarada da mensagem, recebimento na caixa, importação e cadastro jurídico. A equipe deve confirmar qual delas é a data de negócio.

Derivar competência no fuso America/Sao_Paulo. Não deduzir pelo ano do CNJ, pela data do serviço ou pela criação do registro. Comunicação sem data confiável deixa origem pendente; data manual exige justificativa e identificação como manual. Uma data inferida não pode aparecer como comprovada.

Recalcular quando uma mensagem antiga for incluída ou a mensagem de origem for desvinculada. Não usar automaticamente todos os CNJs citados em jurisprudência, listas ou anexos como processos destinatários daquele e-mail.

**Aceite:** cadastro criado em junho com e-mail elegível de março tem competência março; inclusão de mensagem de fevereiro recalcula com histórico; 01/03 às 00h30 UTC pertence a fevereiro no fuso indicado; fallback de importação é sinalizado e não afirmado como origem histórica.

### RF04 Filtros e totais compartilhados

**Origem:** S02 a S06. **Prioridade:** P1. **Dependências:** RF01 a RF08, RF17, RF18.

Disponibilizar mês e ano, somente ano, todo o período e sem competência. Mês exige ano. Todo o período remove apenas a restrição temporal. Combinar dimensões com AND e seleções da mesma dimensão com OR.

Localização, vínculo e empresa contratual devem corresponder ao mesmo beneficiário e contexto selecionado; não combinar cidade de uma pessoa com contrato de outra. Classe e detalhe devem corresponder ao mesmo item assistencial quando houver vários itens.

Aplicar autorização, busca e filtros no serviço/banco antes da paginação. Lista, total, gráficos e exportação devem compartilhar o contrato de consulta. A relação com várias rés, pessoas ou serviços não multiplica processos nem valores. O total por registro usa identificador interno distinto; a contagem por processo judicial segue RF18.

**Aceite:** interseção ré + março/2026 + UF + vínculo retorna os mesmos IDs na lista e nos agregados; mais registros que uma página não alteram o total; zero resultado é zero; todo o período inclui sem competência; períodos definidos excluem estes últimos e informam a incompletude.

### RF05 Identidade e integração do beneficiário

**Origem:** S03 e S04. **Prioridade:** P1. **Dependências:** D03, D05, RF19.

Integrar por adaptador de leitura no backend. Consultar identificador estável ou carteirinha e, quando disponível e autorizado, CPF normalizado. A interface examinada trata carteirinha como identificador principal e CPF como opcional; o contrato de integração deve confirmar a unicidade e o escopo da carteirinha.

Separar pessoa de inscrição no plano. O mesmo CPF pode retornar várias carteirinhas, contratos ou situações. Não selecionar automaticamente o primeiro resultado nem preferir o ativo sem considerar a data do processo. Nome serve para localizar candidatos, nunca para associação definitiva automática.

Permitir vários beneficiários no processo, um principal para exibição e associação explícita entre representante e pessoa representada. Preservar inativos para pesquisa histórica. Respostas distintas: localizado, múltiplos candidatos, não localizado, identificador insuficiente, indisponível e acesso negado.

**Aceite:** CPF com duas carteirinhas exige identificação do contexto correto; inativo permanece localizável; falta de CPF não impede busca por carteirinha; indisponibilidade não apaga dado anterior nem vira “não localizado”; homônimo não é associado sem confirmação.

### RF06 Localização e regionalização

**Origem:** S03. **Prioridade:** P1. **Dependências:** D04, D05, RF05.

Guardar município e UF do beneficiário em campos próprios, preferencialmente com código municipal. Comarca e foro permanecem dados judiciais. Derivar regional por mapa administrável município/UF, com versão e vigência, após definir se se trata de regional operacional ou região geográfica.

Manter a fotografia utilizada no processo, a data de referência e a data de consulta. Quando a origem só fornecer cadastro atual, identificá-lo como atual; não atribuir retroativamente aquele endereço à data do fato. Município sem mapeamento permanece com regional pendente.

**Aceite:** beneficiário com residência diferente da comarca é filtrado pela residência; municípios homônimos são distinguidos pela UF/código; atualização não apaga fotografia anterior; dois beneficiários em regiões diferentes não duplicam o total geral.

### RF07 Vínculo contratual e pessoa jurídica vinculada

**Origem:** S04. **Prioridade:** P1. **Dependências:** D05, RF05, RF19.

Registrar modalidade COLETIVO_EMPRESARIAL, COLETIVO_ADESAO, OUTRO ou NAO_INFORMADO; identificador contratual; CNPJ/razão social; papel da pessoa jurídica; vigência e fonte quando disponíveis. Preservar o valor original recebido para auditoria da normalização.

Empresa em texto no cadastro assistencial não comprova CNPJ, modalidade nem papel contratual. Não inferir adesão por conter “associação” no nome nem empresarial por conter “LTDA”. Ausência de informação exige complemento revisado ou fonte contratual validada.

**Aceite:** contratante é distinta da operadora ré; modalidade não identificada permanece desconhecida; vínculo atual não substitui o histórico automaticamente; mais de uma PJ é armazenada com papéis explícitos.

### RF08 Classificação assistencial em níveis

**Origem:** S05 e S06. **Prioridade:** P1. **Dependências:** D06.

Preservar categoria e natureza jurídica existentes. Dentro do recorte assistencial, apresentar “Classificação do atendimento” para Exame, Cirurgia, Consulta e demais classes atuais; apresentar “Subclassificação” para o procedimento ou especialidade. Exemplos: Exame → Ultrassonografia; Cirurgia → Cirurgia de hérnia; Consulta → Endocrinologia.

Usar catálogo único, identificadores estáveis, sinônimos, itens ativos/inativos e relações válidas entre classe e detalhe. Texto livre continua disponível como complemento. Desativar item não apaga o histórico. Não converter automaticamente o texto “endócrino” em diagnóstico de saúde; trata-se de especialidade solicitada.

**Implementação recomendada:** preparar relação de itens assistenciais por processo, mesmo que a primeira interface edite um item predominante. DOC02 previa terceiro nível escalar; esse modelo serve ao mínimo, mas perde granularidade em múltiplos pedidos. A adoção de vários itens precisa ser validada em D06. Enquanto houver apenas o predominante, rotular expressamente os gráficos como predominância, sem apresentá-los como inventário completo dos procedimentos.

**Aceite:** Consulta aparece no catálogo; especialidade é subordinada à classe; combinação incompatível é rejeitada também no servidor; classificação humana fica protegida; um processo com três itens conta uma vez no total de processos e três somente no indicador explicitamente denominado itens.

### RF09 Pedidos e sentenças

**Origem:** S07 e S08. **Prioridade:** P1. **Dependências:** D07, RF14.

Guardar pedido, situação da sentença e decisões versionadas separadamente de valor da causa e exposição estimada. Decisão/tutela não equivale automaticamente a sentença. A simples presença de evento “Sentença” na triagem não confirma seu conteúdo financeiro.

Interpretar “valor requerido somente se não tiver sentença” como regra de destaque, preservando o histórico do pedido. Esta interpretação requer validação do jurídico. O destaque é derivado, nunca um terceiro valor editável.

| Situação revisada | Destaque | Regra de agregação |
|---|---|---|
| Sem sentença, pedido conhecido | Valor requerido | Soma de pedidos conhecidos sem sentença, com quantidade coberta. |
| Sentença quantificada | Valor sentenciado, inclusive R$ 0,00 | Soma de sentenças de referência confirmadas. |
| Sentença ilíquida | Valor sentenciado a apurar | Não substituir pelo pedido nem por zero. |
| Sentença sem obrigação monetária | Sentença não monetária | Não transformar ausência de condenação monetária em montante zero sem regra validada. |
| Sentença existente, valor não identificado | Extração/revisão pendente | Excluir da soma monetária e contar a pendência. |
| Situação da sentença desconhecida | Referência pendente de revisão | Pedido pode ser consultado em campo próprio; não presumir inexistência de sentença. |

Registrar documento, data, versão, decisão de referência, substituição/anulação e motivo da escolha. Recurso ou decisão posterior gera proposta de atualização, sem sobrescrever referência confirmada. Acordo e pagamentos, se futuramente incluídos, serão naturezas próprias; não devem ser importados como sentença.

**Aceite:** pedido de R$ 20 mil e sentença de R$ 8 mil destacam R$ 8 mil sem apagar pedido; zero não vira nulo; ilíquida não usa pedido como substituto; somas não misturam pedido, condenação, multa diária e exposição estimada.

### RF10 Dificuldades alegadas pelo beneficiário

**Origem:** S09. **Prioridade:** P2. **Dependências:** RF05, RF14, RF16.

Criar resumo próprio, distinto do resumo executivo operacional. Toda narrativa deve começar literalmente com **“Supostamente, o(a) beneficiário(a)”**, conforme DOC01. Validar o prefixo no servidor ao gerar e ao editar. O texto descreve alegações atribuídas à fonte, sem afirmar sua veracidade ou falsidade.

Extrair tentativas de contato, canal, setor mencionado, duração/intervalo de espera, dificuldade e desfecho alegado. Para cada informação, guardar fonte, trecho, página ou posição, beneficiário relacionado e precisão. “Diversas ligações” não equivale a quantidade numérica; “dez dias” deve indicar se é duração declarada ou calculada entre datas explícitas.

Deduplicar relatos repetidos em respostas de e-mail ou anexos. Contradições permanecem identificadas para revisão, sem síntese que escolha arbitrariamente uma versão. Informar quais documentos/páginas foram processados, falhas de OCR e cobertura parcial. Evidência insuficiente gera estado próprio, não resumo inventado. Ausência de resumo não exige criar artificialmente uma narrativa só para cumprir o prefixo.

**Aceite:** relato fictício de três ligações ao SAC e dez dias de espera produz esses dados com evidência e prefixo; expressões vagas permanecem vagas; repetições não aumentam contatos; documento parcial gera alerta; novo processamento preserva narrativa revisada.

### RF11 Prestador e natureza do vínculo

**Origem:** S10 e S14. **Prioridade:** P1. **Dependências:** RF01, RF02, D08.

Registrar prestador relacionado à parte correta, nome/razão social, tipo PF/PJ, documento quando disponível, categoria e natureza do vínculo. Categorias iniciais: hospital, clínica, OPME, médico PJ, manutenção e outros. Permitir vários prestadores sem duplicar identidade já existente nas partes.

Não atribuir o papel de prestador autor a todo hospital citado como local de atendimento. Incluir PF não CLT somente após a regra de D08; documento ausente fica pendente. A distinção do vínculo depende de evidência contratual/processual, não só do tipo de pessoa.

**Aceite:** médico PJ confirmado entra no recorte; CLT permanece fora dele e no cadastro geral; hospital apenas citado não é confirmado como autor; pessoas homônimas não são fundidas automaticamente.

### RF12 Serviços e períodos

**Origem:** S11 e S12. **Prioridade:** P1. **Dependências:** RF11.

Permitir várias linhas de serviço por prestador/processo: tipo controlado, descrição, período inicial/final, precisão da data e fonte. Separar competência de entrada, período da prestação e vencimento de fatura.

Preservar datas mensais, intervalos abertos e datas desconhecidas. É possível normalizar limites para pesquisa, mas esses limites técnicos não devem ser exibidos como dias comprovados. Validar fim não anterior ao início.

**Aceite:** serviços de janeiro a março com origem em julho mantêm os dois recortes; “março/2026” continua mensal; dois serviços não se sobrescrevem; período inválido é rejeitado.

### RF13 Dívida e indenizações de prestadores

**Origem:** S13. **Prioridade:** P1. **Dependências:** RF11, RF12, RF14.

Registrar componentes DIVIDA_SERVICO, DANO_MATERIAL, DANO_MORAL e OUTRO_IDENTIFICADO, com grupo do pedido, valor, fonte e serviço associado quando identificável. Guardar total declarado separadamente do subtotal de componentes conhecidos.

Não repartir valor global por suposição. Não somar o mesmo principal de dívida novamente por aparecer descrito como dano material. Pedidos alternativos, subsidiários ou potencialmente sobrepostos devem ser marcados e submetidos à revisão; não entram automaticamente como parcelas cumulativas.

Quando a composição estiver completa, confirmada e sem sobreposição, derivar o total. Caso contrário, apresentar subtotal conhecido e estado de incompletude. Moeda, precisão decimal e versão pertencem a cada registro financeiro.

**Aceite:** dívida de R$ 50 mil, dano material adicional de R$ 5 mil e moral de R$ 10 mil totalizam R$ 65 mil quando cumulativos; total global sem discriminação não vira dívida; alegação repetida não cria novo componente; divergência entre declarado e calculado gera pendência.

### RF14 Revisão humana e procedência

**Origem:** DOC02 e A13. **Prioridade:** P0 para infraestrutura, P1 para campos. **Dependências:** modelo aditivo.

Reutilizar o mecanismo de sugestões com estados PENDENTE, ACEITA, CORRIGIDA, REJEITADA e SUPERADA. Guardar fonte, trecho, versão do extrator/modelo quando aplicável, autor da revisão, horário e justificativa. Estado de revisão é independente de haver ou não valor.

Novos valores financeiros e associações ambíguas exigem confirmação humana na primeira entrega. Aumento de confiança não autoriza automaticamente sobrescrever dado confirmado. Processamento posterior gera sugestão de divergência. Aceite, dado aplicado e auditoria devem ser atômicos, com controle de versão para edição concorrente.

**Aceite:** falha ao gravar histórico reverte a alteração; reprocessar a mesma fonte não duplica item; revisão simultânea retorna conflito identificável; usuário de consulta não aplica sugestões por interface ou chamada direta.

### RF15 Qualidade e saneamento cadastral

**Origem:** complemento novo, A01, A02 e A12. **Prioridade:** P0/P1. **Dependências:** RF14.

Transformar “Cadastro incompleto” em pendências identificáveis por campo e motivo: identidade processual, autor, ré, segmento, origem, beneficiário, vínculo, classe, detalhe, situação da sentença e composição financeira. Cada pendência deve ter responsável, criação, prioridade e resolução/justificativa.

Validar protocolos contra fragmentos narrativos e autores contra conteúdo incompatível, usando regras de detecção para encaminhar à revisão, sem apagar automaticamente dados existentes. Diferenciar NAO_INFORMADO, NAO_APLICAVEL, PENDENTE_CONFIRMACAO e ERRO_CONSULTA. Remover valores iniciais arbitrários para informações desconhecidas, como UF predeterminada em cadastro sem evidência.

**Aceite:** saneamento de um campo encerra apenas sua pendência; protocolo suspeito não é confirmado automaticamente; cadastro parcial salva sem impedir prazos; indicador informa quais campos faltam e quem deve revisar.

### RF16 Filas e capacidade de automação

**Origem:** complemento novo, A04, A15 e A16. **Prioridade:** P1 para controles, P2 para novos extratores.

Separar captura, vínculo documental, extração, sugestão e aplicação. Distinguir trabalhos de classificação, beneficiário, valores, serviços e alegações. Medir entrada, saída, idade do item mais antigo, falhas, tentativas e motivo de bloqueio. Não considerar “modelo disponível” como prova de que o executor está processando a fila.

Novos enriquecimentos devem compartilhar orçamento de forma controlada, preservando prioridade das comunicações operacionais urgentes. Usar idempotência, tentativas limitadas, retomada por checkpoint e quarentena após esgotamento. Não repetir automaticamente erros de contrato/autorização como se fossem falhas transitórias.

Registrar custo como desconhecido enquanto não houver tabela de preços validada. Estimativa de conclusão usa vazão medida e novas entradas; cotas locais não bastam para prometer prazo de escoamento.

**Aceite:** falha em um item não interrompe o lote; reinício não duplica dados; bloqueio por cota é distinto de revisão humana; novo resumo não deixa comunicação urgente sem processamento por consumir todo o orçamento.

### RF17 Indicadores com significado explícito

**Origem:** complemento novo, A01 a A04 e A14. **Prioridade:** P1. **Dependências:** RF04, RF18.

Manter dicionário de indicadores com nome, unidade, população, filtros, base temporal, estados de revisão e regra de cálculo. Distinguir risco jurídico aprovado, semáforo operacional calculado e prioridade de trabalho. “Zero alto risco” junto de baixa cobertura precisa exibir quantos registros foram efetivamente classificados.

Separar totais monetários de pedidos, sentenças e componentes de prestadores. Uma soma mista, se solicitada, deve ser identificada como valor de referência heterogêneo e não como condenação ou exposição. Preferir não apresentar essa soma como indicador principal.

Documentar status cadastral, operacional e da comunicação separadamente. Alertar divergências relevantes sem fazer conversão automática não homologada. Comparar a completude do painel com a da fila de classificação somente após alinhar universo e data; os 166 sem classificação do painel e 281 exibidos na rotina retroativa podem ter recortes distintos.

**Aceite:** cada card informa unidade e cobertura; clique abre a população correspondente; exceções e e-mails em exceção reconciliam por relacionamento, sem exigir igualdade artificial; filtros não alteram silenciosamente o significado de status.

### RF18 Identidade processual e evidência com múltiplos CNJs

**Origem:** complemento novo, A11 e A15. **Prioridade:** P0. **Dependências:** D11.

Definir `process_id` como registro interno e CNJ normalizado como identificador judicial. Como o sistema permite CNJ repetido, o relatório inicial deve rotular explicitamente “Registros” e, se homologado, disponibilizar “CNJs distintos”. Registros sem CNJ exigem quantidade separada e não devem ser agrupados como um único caso nulo.

Criar análise de possíveis duplicidades por CNJ, partes e contexto. Não impor índice único de CNJ nem fundir casos automaticamente antes de esclarecer por que existem múltiplos registros. Consolidação futura exige escolha de registro canônico, preservação de referências e auditoria.

Em e-mail com vários processos, confirmar os vínculos e os trechos/anexos aplicáveis a cada um. Uma evidência pode ser compartilhada quando isso for confirmado, mas valores, origem e alegações devem ser associados ao destinatário correto. Diferenciar CNJ de destino de CNJ apenas citado em decisão ou jurisprudência.

**Aceite:** dois registros de um CNJ produzem dois registros e um CNJ distinto, conforme a visualização; réplica de comunicação não duplica vínculo; anexo referente a outro processo não altera competência nem valor do caso errado; ambiguidade bloqueia aplicação automática e permite triagem.

### RF19 Complementação do cadastro assistencial

**Origem:** complemento novo, A18 e A19. **Prioridade:** P1. **Dependências:** D03, D05.

Mapear explicitamente campos disponíveis, ausentes e derivados. Carteirinha, CPF opcional, nome, empresa textual, município, UF e situação foram observados. API, identificador interno, CNPJ, modalidade, vigência e histórico precisam ser confirmados com a TI assistencial.

Se a fonte não possuir modalidade e CNPJ, oferecer complemento manual no jurídico com documento/fonte e revisão, ou ampliar a origem por projeto acordado. Preferir referência a contrato cadastrado e mapeamento validado de empresa textual para entidade canônica. Não criar associação definitiva somente por semelhança de nomes.

**Aceite:** informação complementada aparece como manual ou documental, nunca como recebida da API; conflito com atualização externa é apresentado à revisão; ausência de CNPJ não é substituída pelo CNPJ da operadora.

### RF20 Usabilidade e saídas analíticas

**Origem:** complemento novo, A07 e formulários examinados. **Prioridade:** P1 para uso, P2 para exportação estruturada.

Usar rótulos de negócio, campos condicionais, navegação por teclado, filtros persistidos durante a sessão e retorno da lista ao mesmo contexto. Rótulos de status devem ser legíveis, preservando os códigos técnicos internamente. Remover explicações sobre tabelas e provedores das telas operacionais quando não ajudarem a decidir.

Estados de carregamento, vazio, erro e falta de autorização devem ser distintos. Contadores não devem mostrar zero como resultado consolidado enquanto carregam. Exportação, caso aprovada, respeita autorização e os mesmos filtros, registra momento e critérios e identifica campos pendentes; não deve exportar somente a página visível como se fosse todo o resultado.

**Aceite:** usuário diferencia falha de consulta de zero resultados; navega e revisa por teclado; retorno do detalhe preserva filtros; relatório inclui unidade, período, natureza dos valores e cobertura.

## 6 Modelo de dados e contratos propostos

### 6.1 Entidades e invariantes

Os nomes abaixo são sugestões para orientar a implementação, não confirmação de tabelas existentes. Reutilizar as estruturas descritas em DOC02 quando a inspeção do código demonstrar compatibilidade.

| Entidade proposta | Relação | Conteúdo e restrição principal |
|---|---|---|
| Processo | Registro central | Segmento, origem e procedência; CNJ normalizado não presumido único. |
| Ré do processo | Processo 1:N rés | Empresa canônica, parte e evidência; não repetir a mesma empresa no mesmo processo. |
| Pessoa beneficiária | Processo N:N pessoas | Identidade mínima e sistema de origem; autor/representante são papéis distintos. |
| Inscrição assistencial | Pessoa 1:N inscrições | Carteirinha, identificador externo, operadora/contrato quando disponíveis e situação. CPF não é chave única da inscrição. |
| Contexto do beneficiário | Inscrição 1:N versões | Município/UF, vínculo, PJ e papel, vigência, fonte, consulta e referência temporal. Selecionar versão analítica explicitamente. |
| Catálogo regional | Regional 1:N municípios por versão | Mapeamento revisado com vigência; sobreposição depende de regra aprovada. |
| Item assistencial | Processo 1:N itens | Classe, detalhe controlado, fonte e predominância; no máximo um predominante quando aplicável. |
| Sentença ou decisão de referência | Processo 1:N versões | Tipo, data, estado do valor, montante, validade e fonte. Referência pertence ao mesmo processo. |
| Componente financeiro | Processo 1:N componentes | Fase pedido/sentença, natureza, grupo, valor, completude e cumulatividade; não duplicar por repetição documental. |
| Prestador do processo | Processo 1:N prestadores | Referência à identidade da parte, categoria e vínculo revisado. |
| Serviço prestado | Prestador no processo 1:N serviços | Tipo, descrição, período, precisão e fonte. |
| Alegação e resumo | Beneficiário no processo 1:N versões | Relatos estruturados, narrativa, cobertura, evidências e revisão. |
| Vínculo de evidência | Processo N:N fontes ou trechos | Papel da fonte, confirmação, posição e elegibilidade para origem/extrator. |
| Pendência de qualidade | Processo/campo 1:N pendências | Motivo, estado, responsável, criação, resolução e justificativa. |
| Trabalho de enriquecimento | Processo/fonte 1:N trabalhos | Tipo, versão, tentativas, prioridade, checkpoint, erro e chave idempotente. |

Valores monetários devem usar precisão decimal, não ponto flutuante; manter BRL explícito, nulo diferente de zero e valor não negativo para os componentes previstos. Datas com instante usam fuso; datas civis e competências mensais não devem ganhar horário fictício. Identificadores, documentos e carteirinhas são texto, preservando zeros iniciais.

Toda associação de parte, decisão, serviço ou evidência deve validar o mesmo processo e o escopo de acesso. Auditar origem e revisão. Um relatório não pode depender de JSON livre sem validação para os campos usados em filtros e somas.

**Decisão de modelagem recomendada:** persistir componentes financeiros e decisões como fonte de verdade; projetar o resumo do processo a partir deles. Não manter total editável no resumo e soma editável nos componentes sem reconciliação obrigatória. Havendo somente total global, registrá-lo como declarado e incompleto, sem inventar parcelas.

### 6.2 Consulta analítica comum

Criar serviço ou RPC compartilhada para lista e agregações. Entradas: segmento, rés, competência, localização, vínculo, empresa contratual, classe/detalhe, status por dimensão, arquivados, revisão, busca, ordenação e paginação. O cliente deve receber filtros normalizados, população, unidade de contagem e versão da regra.

O serviço seleciona os IDs autorizados, aplica filtros correlacionados e calcula contagens e valores antes da paginação. Relações de várias rés/serviços devem usar teste de existência ou pré-agregação, evitando multiplicação de linhas. Soma financeira ocorre sobre os componentes elegíveis uma única vez.

Retornar `items`, total de registros, CNJs distintos quando aprovado, quantidade sem CNJ, agregados por natureza financeira, cobertura por campo e instante de referência. Uma resposta lógica deve usar a mesma fotografia de consulta para lista/contagens; exportações demoradas precisam registrar o instante e a política de consistência.

Intervalos mensais devem incluir o início e excluir o início do mês seguinte no fuso de negócio. Ordenação paginada deve ser estável, com identificador como desempate. Não limitar contagem ao lote retornado pelo cliente Supabase.

### 6.3 Integração com o assistencial

O endereço na porta 3000 é uma aplicação visível, não um contrato de API. O fato de ambas as interfaces mencionarem Supabase não prova que compartilham banco, esquema, permissões ou chaves.

**Alternativa preferida:** adaptador autenticado no backend jurídico, usando API de leitura fornecida pelo assistencial, busca por identificador e candidatos paginados. **Alternativa intermediária:** importação controlada e versionada de conjunto mínimo aprovado, se não houver API e a defasagem for aceitável. **Alternativa condicionada:** acesso a view de leitura restrita, somente após contrato de dados e permissão específicos. Não usar coleta de tela como integração de produção.

Contrato mínimo: sistema de origem, identificador de inscrição, carteirinha, identificação mínima, município/UF, empresa original, situação e data de atualização. Contrato desejado: pessoa estável, contrato, operadora, modalidade, CNPJ e papel da PJ, vigências e histórico. Campos não fornecidos são declarados como indisponíveis.

Uma rota interna de consulta pode receber identificadores no corpo, evitando exposição em URL e logs. Credenciais ficam no servidor. Validar timeout, limites, cache com idade explícita, retentativas transitórias e conectividade a partir do servidor; acesso pelo navegador do operador não comprova essa conectividade.

### 6.4 Extração por IA

Reutilizar o pipeline atual, expandindo o esquema estruturado por tarefa. O fluxo recomendado é fonte vinculada → seleção documental → extração/OCR → validação de esquema → sugestão com evidência → revisão → aplicação transacional.

Tratar e-mails e documentos como conteúdo, nunca como comandos para mudar regras ou aplicar alterações. Proibir aplicação de valores sem natureza identificada; separar confiança do extrator, cobertura da leitura e estado de revisão. Retentativas precisam considerar hash da fonte, versão do extrator e identificador do item.

DOC02 relata limites de 12 páginas no parsing de PDF, 2 no OCR e limites de contexto no preenchimento retroativo. Esses parâmetros devem ser conferidos na versão implantada. Independentemente do número, a interface deve informar cobertura real e permitir solicitar processamento adicional controlado.

A classificação retroativa observada protege MANUAL e IA_CONFIRMADA e informa que não altera risco, status, valores ou prazos. Preservar esse contrato; criar tipos de enriquecimento específicos para os novos campos, sem retirar proteção de dados para reaproveitar o botão existente.

### 6.5 Impacto técnico a confirmar no repositório

| Camada | Ponto indicado em DOC02 | Evolução proposta |
|---|---|---|
| Tipos e serviços de processos | Tipos de banco, DTOs e `processesService` | Segmentos, origem, novos vínculos e contrato de pesquisa. |
| Lista e painel | `ProcessesPage`, `DashboardPage`, `DemandClassificationKpiPanel` | Recortes, filtros comuns, unidade de contagem e cobertura. |
| Cadastro e detalhe | `ProcessModal`, `ProcessDetailsModal` | Seções condicionais, dados revisáveis e contexto histórico. |
| Classificação e partes | Serviços de classificação/resolução | Catálogo único e papéis distintos de empresa/parte. |
| E-mails e anexos | `imapService`, aplicação de processos e extração | Procedência temporal, vínculo por evidência e cobertura documental. |
| IA e revisão | Intérprete, aplicação de IA e `HumanReviewModal` | Novos esquemas, sugestões, idempotência e conflitos. |
| Banco e autorização | Migrações e políticas Supabase descritas em DOC02 | Alterações aditivas, constraints, índices, auditoria e consultas autorizadas. |
| Integração | Novos módulos no backend | Adaptador assistencial com contrato versionado e leitura mínima. |

## 7 Perfis e requisitos não funcionais

### 7.1 Atribuições propostas

| Atividade | ADMIN | GESTOR | ANALISTA | CONSULTA |
|---|---|---|---|---|
| Consultar dados permitidos | Sim | Sim | Sim | Sim |
| Cadastrar e revisar dados operacionais | Conforme escopo | Sim | Sim | Não |
| Resolver divergências financeiras/contratuais | Conforme designação | Sim | Conforme designação | Não |
| Parametrizar integração e limites | Sim | Consulta | Não | Não |
| Aprovar catálogos e regionais | Executa configuração | Aprova regra de negócio | Propõe | Não |
| Exportar dados | Conforme permissão específica | Conforme permissão específica | Conforme permissão específica | Conforme permissão específica |

A matriz é proposta, não resultado de teste dos perfis. Validar contra a autorização atual e a segregação por empresa/equipe. Perfil técnico de administrador não implica automaticamente poder de homologar decisões jurídicas.

### 7.2 Requisitos verificáveis

| ID | Requisito e verificação |
|---|---|
| RNF01 Acesso | Verificar autorização no backend e nas consultas/tabelas; testar cada perfil, usuário inativo e acesso a processo fora do escopo. Chave de serviço não pode chegar ao cliente. |
| RNF02 Dados pessoais | Expor apenas dados necessários ao trabalho; mascarar identificadores conforme perfil; registrar consultas/exportações sem gravar documentos completos, CPF e conteúdo assistencial em logs comuns. Definir retenção e acesso às evidências. |
| RNF03 Auditoria | Dado confirmado, revisão e evento auditável devem ser consistentes; testar falha intermediária e tentativa de alterar histórico por perfil comum. |
| RNF04 Concorrência | Alteração exige versão esperada; revisão desatualizada retorna conflito e permite comparar versões, sem perda silenciosa. |
| RNF05 Idempotência | Repetir mensagem, job ou retentativa não duplica processo/vínculo/componente; testar recuperação após interrupção. |
| RNF06 Desempenho | Meta proposta: pesquisa jurídica paginada com totais em p95 até 2 s em carga equivalente ao uso aprovado. Ensaiar também cenário de 100 mil processos e 20 usuários concorrentes, como cenário futuro herdado de DOC02, não volume atual medido. |
| RNF07 Integração | Meta proposta: limite de 10 s por tentativa externa e até duas retentativas para falhas transitórias elegíveis, ajustados ao contrato. Testar indisponibilidade, rate limit, autenticação e resposta inválida. |
| RNF08 Escala cadastral | Testar busca seletiva com pelo menos o volume assistencial observado, 257.612 inscrições, incluindo CPF repetido, ausência de CPF e carteirinhas distintas. Não enviar a base completa ao navegador. |
| RNF09 Observabilidade | Medir latência, taxa de erro, idade e vazão de fila por tipo, pendências e custo conhecido/desconhecido; métricas não usam CPF/nome como rótulo. |
| RNF10 Acessibilidade | Validar teclado, foco em modais, rótulos, mensagens de erro e estados não dependentes só de cor. Datas e moedas em pt-BR. |
| RNF11 Recuperação | Ensaiar backup/restauração, desativação da funcionalidade e retomada de lotes. Reversão de aplicação preserva novos dados e auditoria. |
| RNF12 Qualidade da IA | Homologar com conjunto rotulado pelo jurídico, cobrindo exemplos positivos, ausência de dados, conflitos e texto adversarial. Reportar erros por campo e cobertura; limiar de liberação deve ser aprovado antes da aplicação automática. |

## 8 Regras dos indicadores

| Indicador | Cálculo proposto | Cuidados |
|---|---|---|
| Registros filtrados | IDs internos distintos autorizados e elegíveis | Não chamar de CNJs únicos. |
| Processos judiciais distintos | CNJs normalizados distintos no universo homologado | Mostrar registros sem CNJ separadamente e explicar duplicidades. |
| Competência conhecida | Registros com origem válida / registros do universo | Origem inferida e manual devem ser discrimináveis. |
| Rés confirmadas | Registros com ao menos uma ré confirmada / universo | Pluralidade pode sobrepor subtotais por ré. |
| Contexto assistencial completo | Casos assistenciais com os campos obrigatórios validados / casos aos quais se aplicam | Não exigir beneficiário de processo de prestador. |
| Perfil assistencial | Registros por atendimento predominante ou itens por classe, conforme modo | Título e denominador diferenciam os dois modos. |
| Pedido sem sentença | Soma de pedidos conhecidos e confirmados em casos sem sentença confirmada | Informar quantidade e pendências; não somar os pedidos substituídos no destaque. |
| Valor sentenciado | Soma da decisão de referência quantificada e confirmada por registro/caso definido | Não multiplicar por ré ou beneficiário; mostrar ilíquidas e desconhecidas à parte. |
| Dívida de serviços | Soma de componentes de dívida confirmados e elegíveis | Excluir danos e componentes alternativos/sobrepostos não resolvidos. |
| Danos materiais e morais | Somas separadas por natureza e fase do valor | Não misturar pedido com sentença. |
| Cobertura de risco | Registros com risco confirmado / universo | Risco não classificado não equivale a baixo. |
| Pendências de revisão | Pendências abertas e processos afetados, separadamente | Um processo pode ter várias pendências. |
| Fila de IA | Trabalhos por tipo/estado, idade e vazão | E-mails, processos e jobs são unidades distintas. |

Por padrão proposto, os valores monetários analíticos usam dados confirmados e apresentam contagem dos pendentes. Outros filtros podem incluir dados não confirmados, desde que o modo fique explícito e a cobertura seja exibida. A política final depende de D09.

## 9 Decisões de negócio e dependências

Decisões pendentes não impedem preparar modelos aditivos, protótipos e testes. Impedem somente concluir as regras dependentes como se estivessem aprovadas.

| ID | Decisão | Recomendação e efeito | Responsável proposto |
|---|---|---|---|
| D01 | Qual data representa o primeiro e-mail? | Escolher recebimento ou data declarada confiável; preservar importação e procedência. Bloqueia competência definitiva. | Jurídico e TI |
| D02 | Identidade de SB Saúde e San Miguel | Homologar CNPJs, razões sociais, aliases e pluralidade. Bloqueia classificação canônica das rés. | Jurídico |
| D03 | API e campos do assistencial | Confirmar contrato, autenticação, histórico, limites e conectividade servidor-servidor. Bloqueia integração real, não cadastro manual. | TI assistencial e jurídica |
| D04 | Significado de regional | Definir mapa operacional ou geográfico e vigências. Bloqueia regional derivada, não município/UF. | Gestão |
| D05 | Referência temporal e papel da PJ | Preferir vínculo vigente na referência acordada; distinguir atual sem histórico. Definir contratante/estipulante/administradora e demais papéis. | Gestão e cadastro |
| D06 | Catálogo e vários procedimentos | Aprovar Consulta, detalhes e itens múltiplos; iniciar predominante se necessário com limitação explícita. | Jurídico e assistencial |
| D07 | Prioridade após sentença | Preservar pedido; confirmar decisão de referência, zero, ilíquida, recursos e anulação. | Jurídico |
| D08 | PF não CLT e vínculo controvertido | Permitir PF confirmado; ambiguidade em revisão. | Jurídico |
| D09 | Aplicação automática e dados nos indicadores | Finanças e identidades ambíguas com revisão humana; definir quais demais campos podem automatizar e os limiares. | Gestão jurídica |
| D10 | Histórico, arquivados e exportação | Encerrados incluídos na análise histórica; arquivados por controle explícito; exportação com permissão. | Gestão |
| D11 | Por que há CNJ repetido? | Definir registro, caso judicial, incidente e eventual consolidação. Bloqueia publicação de total denominado processos únicos. | Jurídico e TI |
| D12 | De onde vêm modalidade e CNPJ? | API contratual, enriquecimento validado ou complemento manual; nunca inferência apenas pelo nome. | Cadastro e TI |
| D13 | Responsáveis e capacidade de saneamento | Designar dono por tipo de pendência e capacidade de revisão; priorizar urgência operacional e impacto no relatório. | Gestão jurídica |
| D14 | Prioridade e orçamento das novas extrações | Garantir reserva para comunicações operacionais e medir vazão antes de prometer prazo. | Gestão e TI |

## 10 Implantação e saneamento

### 10.1 Sequência recomendada

| Entrega | Conteúdo | Dependência | Critério de saída |
|---|---|---|---|
| E0 Contratos e diagnóstico | Fechar identidade, datas, unidade de contagem, catálogo e decisão financeira; verificar código implantado e API assistencial | D01, D02, D03, D06, D07, D11 | Dicionário e exemplos aprovados; lacunas externas localizadas. |
| E1 Fundação e cadastro | Modelos aditivos, ré, segmento, origem, revisão, pendências e cadastro manual | E0 nas regras aplicáveis | Persistência/auditoria e autorização aprovadas. |
| E2 Valores e prestadores | Pedido/sentença, componentes, prestadores, serviços e períodos | E1 | Cenários financeiros e de vínculo homologados. |
| E3 Beneficiários | Adaptador, pessoa/inscrição, contexto, modalidade/PJ, regional | E1 e D03 a D05/D12 | Múltiplas carteirinhas, histórico e falhas tratados. |
| E4 Filtros e indicadores | Consulta comum, lista, análise histórica e cobertura | E1; completar após E2/E3 | Totais reconciliados e unidade de contagem explícita. |
| E5 IA complementar | Esquemas, evidências, alegações, valores/serviços sugeridos e filas | E1 a E3 e D09/D14 | Revisão preservada, cobertura e idempotência aprovadas. |
| E6 Histórico e liberação | Simulação, lotes controlados, reconciliação, treinamento e monitoramento | Critérios anteriores | Amostra e testes completos aprovados; operação apta a tratar pendências. |

E4 pode começar com ré, segmento e competência enquanto a integração é definida. Atraso da API não deve impedir cadastro manual e validação da experiência. Não estimar prazo fechado antes de conhecer o repositório implantado, o contrato externo e a capacidade de revisão.

### 10.2 Migração segura

1. Registrar versão implantada, backup e ensaio de restauração. Medir duplicidades de CNJ, datas sem procedência, empresas ambíguas, status e campos confirmados.
2. Criar campos/tabelas opcionais e políticas de acesso de forma aditiva, sem reescrever histórico de migração já aplicado.
3. Homologar cadastro manual antes da carga automática. Ativar regras de validação no servidor, não apenas no formulário.
4. Simular o preenchimento histórico e emitir contagens por ação: seguro, pendente, conflito, não aplicável e erro. Não copiar valor da causa para pedido, empresa vinculada para ré ou comarca para residência.
5. Proteger dados confirmados; deduplicar comunicações e componentes pela identidade da fonte/item. Separar enriquecimento de reclassificação.
6. Executar piloto com casos de cada segmento, dados ausentes, múltiplas carteirinhas, múltiplos CNJs e sentenças. Rever amostra com o jurídico.
7. Ampliar por lotes identificados, com checkpoint, limites e relatório de divergências. Não gerar automaticamente milhares de revisões sem responsável designado.
8. Comparar relatórios novos e antigos explicando recortes diferentes. Ativar por configuração de funcionalidade; em falha, desativar a nova interface/processamento, preservando dados e trilha.

## 11 Plano de homologação

Os cenários abaixo são especificações para testes futuros, não testes executados nesta análise. Usar dados fictícios ou conjunto de teste aprovado e registrar evidência do resultado.

| ID | Cenário | Resultado esperado |
|---|---|---|
| H01 | Duas rés no mesmo processo | Encontrado por qualquer uma, sem duplicar total nem soma. |
| H02 | Empresa do contrato diferente da operadora ré | Papéis, filtros e exibição independentes. |
| H03 | E-mail antigo incorporado após cadastro | Competência recalculada com histórico e origem rastreável. |
| H04 | E-mail sem data e virada do mês em UTC | Sem origem comprovada por fallback; competência pelo fuso acordado. |
| H05 | Mensagem com vários CNJs e citação de jurisprudência | Só vínculos confirmados alimentam origem e extrações do caso. |
| H06 | Dois registros com mesmo CNJ e registros sem CNJ | Registros, CNJs distintos e sem CNJ separados conforme RF18. |
| H07 | CPF em várias carteirinhas, incluindo inativa | Seleção de inscrição/contexto correta; nenhuma escolha pelo primeiro resultado. |
| H08 | CPF ausente, homônimo e representante de menor | Busca por identificador alternativo e papéis separados; ambiguidade revisada. |
| H09 | Timeout, acesso negado, inexistente e múltiplos candidatos | Estados diferentes, preservando dados anteriores. |
| H10 | Município diferente da comarca e mudança de endereço | Uso do contexto do beneficiário e preservação histórica. |
| H11 | Empresa textual sem CNPJ/modalidade | Pendência ou complemento rastreado; sem inferência pelo nome. |
| H12 | Dois beneficiários com cidades e vínculos diferentes | Filtros correlacionados não combinam atributos de pessoas distintas. |
| H13 | Consulta/Endocrinologia e combinação inválida | Catálogo permite combinação válida e rejeita incompatível no backend. |
| H14 | Vários procedimentos em um processo | Contagem por processo e por item identificadas; predominância explícita. |
| H15 | Pedido 20 mil, sentença 8 mil, zero, ilíquida e desconhecida | Destaque e agregação seguem RF09, com histórico preservado. |
| H16 | Sentença substituída, anulada ou em revisão | Atualização da referência exige revisão e preserva versões. |
| H17 | Médico PJ, CLT, PF não CLT e vínculo controvertido | Inclusão/exclusão apenas no recorte correto e pendência quando necessário. |
| H18 | Serviços com mês/ano, período aberto e fim anterior | Precisão preservada, períodos distintos e validação de incoerência. |
| H19 | Dívida, dano material adicional, moral e pedidos alternativos | Sem sobreposição nem soma automática de pedidos não cumulativos. |
| H20 | Total global sem parcelas ou total divergente | Discriminação incompleta e aviso, sem repartição inventada. |
| H21 | Três contatos explícitos, expressão vaga e relato repetido | Quantidade fiel, deduplicação, evidência e prefixo obrigatório. |
| H22 | Documento parcial, contradição e instrução maliciosa no texto | Cobertura e conflito visíveis; conteúdo não altera regras do extrator. |
| H23 | Reprocessamento, falha transacional e revisão simultânea | Idempotência, rollback lógico e conflito sem sobrescrita silenciosa. |
| H24 | Perfis, inativo e processo fora do escopo | Acesso e escrita bloqueados de acordo com matriz homologada. |
| H25 | Filtros combinados e resultado maior que a página | Lista, total e agregados coincidem com consulta independente. |
| H26 | Carga de filas e consulta sobre volume assistencial | Vazão e latência medidas; paginação seletiva e prioridade preservadas. |
| H27 | Zero alto risco com muitos não classificados | Cobertura apresentada e ausência de falsa conclusão de baixo risco. |
| H28 | Saneamento, retomada de lote e reversão de funcionalidade | Dados confirmados preservados, pendências rastreadas e operação disponível. |

**Condição de conclusão:** critérios dos RF entregues aprovados; decisões aplicáveis registradas; consultas e somas reconciliadas; autorização, concorrência e idempotência verificadas; migração ensaiada; evidências de revisão disponíveis; responsáveis pelo saneamento definidos. Campos visíveis na tela, isoladamente, não caracterizam conclusão.

## 12 Resultado esperado para a gestão

Ao final, a gestão deve conseguir responder, com o mesmo recorte e fonte rastreável: quantos registros ou processos judiciais existem; qual empresa é ré; em que competência ingressaram; onde está o beneficiário e a qual vínculo pertence; qual atendimento foi solicitado; qual valor foi pedido e qual foi sentenciado; quem prestou o serviço, quando e por qual dívida; e quais dificuldades foram alegadas, com ressalva e evidência.

Os relatórios também devem mostrar o que permanece desconhecido, em revisão ou fora da cobertura documental. Essa transparência é necessária para que a melhoria do sistema produza informação utilizável, além de novos campos de cadastro.
