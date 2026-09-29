# Levantamento de requisitos — saneamento e classificação de processos

**Sistema:** SB Gestão Jurídica  
**Tela analisada:** Gestão de Processos (`/processos`) e detalhe de processo  
**Data do levantamento:** 29/09/2026  
**Objetivo:** especificar a correção dos filtros por UF e o preenchimento assistido por IA do polo passivo (rés) e da competência de origem.

## 1. Resumo executivo

A listagem apresenta 758 processos, mas o filtro de UF oferece somente 12 opções: SP, RJ, MG, BA, DF, PR, RS, GO, PE, ES, SC e CE. O detalhe do processo mostra UFs ausentes desse filtro. No caso **0802191-66.2026.8.15.7701**, a jurisdição é PB, embora PB não esteja entre as opções. Para **0800883-19.2025.8.10.0151**, o detalhe informa Santa Inês–MA, e MA também não está entre as opções. A falha impede filtrar e segmentar toda a carteira por estado.

No detalhe do primeiro caso, a seção **RÉS (separado da empresa do contrato)** informa “Nenhuma ré cadastrada”, embora a timeline tenha interpretações da IA registrando ação contra Saúde Brasil e Hub Health. O sistema já tem eventos de comunicação interpretada e origem atribuída a `GEMINI_AUTOMATICO`, mas essa extração não está refletida no cadastro estruturado de rés. A seção **COMPETÊNCIA DE ORIGEM** informa “Origem pendente — Nenhuma comunicação elegível vinculada ao processo”, apesar de haver comunicações recebidas e interpretadas na timeline. Isso sugere uma lacuna entre triagem/interpretação e critérios de elegibilidade/vínculo usados para atualizar os campos estruturados.

## 2. Evidências observadas

| Item | Evidência na aplicação | Consequência |
|---|---|---|
| Cobertura de UF incompleta | Filtro oferece 12 UFs; processo `0802191-66.2026.8.15.7701` mostra UF PB | Processos da PB não podem ser filtrados diretamente por UF |
| Outra UF ausente | `0800883-19.2025.8.10.0151` mostra Santa Inês–MA | Processos do MA também ficam fora da lista de opções |
| Rés sem cadastro estruturado | No processo PB, seção própria de rés está vazia e separa explicitamente rés da empresa do contrato | Filtros/relatórios por ré não refletem o que a IA já encontrou na timeline |
| Evidência textual de rés | IA descreve ação “em face de Saúde Brasil e Hub Health” em mais de um evento | Há insumo para extração, mas com múltiplas rés e necessidade de preservar cada uma |
| Competência pendente | Campo declara que nenhuma comunicação elegível está vinculada | A competência não é derivada ou a elegibilidade/vinculação falha apesar dos e-mails interpretados |
| Conteúdo de partes contaminado | A listagem mostra “Não identificado” e, em outros casos, fragmentos como “Aguardamos”, “Decisão” ou trechos de texto no lugar do nome do autor | A extração genérica de partes pode estar capturando texto do corpo; a classificação do réu precisa usar contexto processual |
| Contagem inconsistente | Cabeçalho mostra 758; tabela anuncia “0–500 of 759 items” | Exibir/filtrar carteiras exige uma única fonte e regra consistente de contagem/paginação |

## 3. Objetivos do produto

1. Permitir filtrar os processos por qualquer UF brasileira presente na carteira.
2. Classificar cada ré em categorias operacionais **SB Saúde**, **San Miguel** ou **Outros**, preservando o nome jurídico encontrado e as demais rés do processo.
3. Preencher competência de origem com valor rastreável, usando regra de negócio aprovada e evidência de origem.
4. Integrar as saídas da IA ao registro estruturado de processo sem substituir silenciosamente dados confirmados por humanos.
5. Tornar resultado, confiança, evidência e situação de revisão visíveis para operação jurídica.
6. Permitir execução retroativa sobre a carteira existente, com prévia, auditoria e reprocessamento idempotente.

## 4. Escopo funcional

### 4.1 Filtro de UF

- Carregar o conjunto de UFs a partir dos processos disponíveis ou de uma lista nacional de 27 UFs (26 estados + DF), em vez de uma lista manual incompleta.
- Normalizar UF para sigla oficial em maiúsculas, removendo espaços e aceitando nomes completos somente na entrada.
- Incluir processos com UF ausente/inválida em opção explícita **“Não informado”**; não os misturar com estado conhecido.
- Definir se UFs sem resultados continuam visíveis. Recomendação: lista completa e estável de 27 UFs, com contagem zero, e “Não informado” quando aplicável.
- Filtrar de forma consistente na listagem, contagem total, paginação e exportações/relatórios que compartilhem esse filtro.
- Garantir que o filtro use a UF processual do foro/jurisdição, não UF do endereço de parte ou da empresa vinculada.
- Se a UF estiver em branco mas número CNJ confiável existir, permitir inferência pelo segmento de tribunal da numeração somente como regra determinística validada; registrar origem e confiança. Não inferir pela cidade ou empresa.

### 4.2 Extração e classificação de rés

- Usar IA embarcada para ler fontes disponíveis e vinculadas ao processo: partes estruturadas existentes, petição inicial/documentos, comunicações elegíveis vinculadas, metadados e interpretações prévias. Evitar usar texto da timeline sem relação com o processo ou conteúdo truncado.
- Extrair **todas** as partes do polo passivo, com nome original, identificador fiscal se encontrado, papel processual (ré principal, solidária, subsidiária, não identificada ou outra), trecho de evidência e documento/fonte de origem.
- Separar rés de autor(es), representantes, advogados, prestadores, operadoras mencionadas apenas como contexto, empresa contratante e empresa vinculada ao contrato.
- Classificar individualmente cada ré em `SB_SAUDE`, `SAN_MIGUEL`, `OUTROS` ou `INDETERMINADO`, com nome jurídico canônico e aliases reconhecidos, segundo catálogo mantido por administradores.
- Não supor que empresa vinculada = ré. A própria tela informa que “Rés” é separado da empresa do contrato.
- Preservar co-rés: caso a ação seja contra Saúde Brasil **e** Hub Health, armazenar ambas, classificar Saúde Brasil como SB Saúde se o catálogo confirmar, e Hub Health separadamente como Outro ou categoria adicional, sem descartar a segunda.
- Suportar nomes com variação de acento, caixa, pontuação, abreviações, nome fantasia e razão social. CNPJ/CPF normalizado e validado tem precedência sobre similaridade textual.
- Se o texto mencionar “Saúde Brasil” sem razão social/CNPJ ou em contexto ambíguo, retornar sugestão com confiança e evidência; abaixo do limiar aprovado, exigir revisão humana.
- Não classificar como San Miguel por aproximação de texto sem alias/identificador confirmado. A lista canônica de razões sociais, CNPJs e aliases de SB Saúde e San Miguel deve ser fornecida e aprovada pelo negócio.
- Permitir correção manual, associação/desassociação, inclusão e remoção de ré conforme permissões; correções humanas passam a ser fonte autoritativa e devem gerar trilha de auditoria.
- Oferecer estado operacional: `pendente`, `sugerido`, `confirmado_automaticamente`, `confirmado_humano`, `revisão_necessária`, `falha`.

### 4.3 Competência de origem

- Definir competência como período de origem (`AAAA-MM`) e armazenar separadamente a data exata da evidência e o tipo de data usado.
- Criar política de precedência configurável. Alternativas que o negócio precisa decidir:
  1. competência/período explicitamente escrito no documento;
  2. data de distribuição/ajuizamento;
  3. primeira comunicação jurídica elegível recebida;
  4. data de abertura/cadastro do processo.
- Recomendação inicial: usar competência explicitamente informada em fonte processual; se ausente, usar data de distribuição/ajuizamento documentada. Usar primeiro recebimento de comunicação apenas se a definição operacional de “competência de origem” for competência de entrada da carteira, e nunca confundir com data de atualização, evento ou prazo citado no texto.
- Cada valor deve guardar `competencia_ano_mes`, data-base, regra aplicada, origem (tipo e identificador da comunicação/documento), trecho de evidência, confiança, data de processamento e versão do modelo/regra.
- Não selecionar automaticamente datas soltas do corpo (audiência, prazo, vigência, citação de evento ou histórico) como competência.
- Se fontes divergirem, o modelo deve retornar candidatos e evidências e solicitar revisão; uma data de cadastro não pode substituir competência jurídica confirmada sem regra definida.
- A elegibilidade e vínculo da comunicação devem ser verificáveis: processo/numeração associada, tipo de comunicação aceito, data válida, conteúdo não duplicado e não irrelevante. A tela deve explicar pendência com motivo acionável.
- “Sem competência” precisa ser um estado nulo explícito, distinto de erro de extração e de processamento pendente.

### 4.4 IA e fluxo de processamento

- Acionar extração ao criar processo, anexar documento ou vincular comunicação elegível; reprocessar quando uma dessas fontes mudar.
- Permitir reprocessamento manual por processo e em lote, com seleção/estimativa de impacto antes da execução retroativa.
- Tornar o processo idempotente: repetir uma execução com mesmas fontes não cria rés duplicadas nem eventos repetidos.
- Persistir resultado estruturado e metadados de execução. Falhas devem ser retentáveis e não apagar último resultado confirmado.
- Usar a IA já embarcada/configurada no sistema; não enviar documentos ou dados jurídicos a serviço externo novo como parte desta correção.
- Definir limites de confiança por campo e critérios diferentes para correspondência de CNPJ, razão social, nome fantasia e evidência textual.
- Retornar JSON/schema validado, rejeitar nomes vazios, categorias fora do enum e competência em formato inválido.
- Tratar fonte sem conteúdo, documento ilegível, OCR com baixa qualidade, processo com múltiplas partes e textos contraditórios.

## 5. Requisitos de dados e integração

Confirmar esquema atual antes de implementar. O produto indica `public.processes` como fonte da listagem e mostra seção própria de rés, mas a tela não permite identificar a tabela/campos persistidos. Levantar:

- campo atual de UF, comarca e município; valores legados e constraints;
- tabelas de documentos, comunicações, eventos de timeline, interpretações de IA e relação comunicação–processo;
- tabela/estrutura de rés, enums, chaves, unicidade e políticas RLS;
- campo atual de competência e condição de “comunicação elegível”;
- origem, logs, fila de exceções, retries e limites de uso da IA;
- APIs/consultas da listagem, contagem, filtro e paginação;
- permissões para revisão/edição e auditoria.

Dados recomendados por ré: `process_id`, `nome_original`, `nome_canonico`, `documento_normalizado`, `classificacao_grupo`, `papel_processual`, `status_classificacao`, `confianca`, `evidencia_texto`, `source_type`, `source_id`, `model_version`, `reviewed_by`, `reviewed_at`, `created_at`, `updated_at`.

Dados recomendados de competência: `process_id`, `competencia_ano_mes`, `data_base`, `regra_aplicada`, `status`, `confianca`, `evidencia_texto`, `source_type`, `source_id`, `model_version`, `reviewed_by`, `reviewed_at`, timestamps.

Requisitos técnicos do banco: migração compatível com dados legados; índices em `uf`, competência e classificação/grupo de ré; chave idempotente por processo + parte/documento; RLS de leitura/escrita de acordo com perfil; histórico de alterações sem armazenar cópias desnecessárias de documentos; atualização da listagem evitando N+1.

## 6. Regras de negócio e prioridades

| Prioridade | Requisito | Justificativa |
|---|---|---|
| P0 | Exibir e filtrar as UFs faltantes PB e MA e cobrir todas as UFs válidas | Corrige defeito observável na tela |
| P0 | Persistir categoria por ré separada da empresa vinculada | Evita classificação jurídica incorreta |
| P0 | Definir catálogo oficial de SB Saúde e San Miguel | Sem identidade canônica, classificação confiável é impossível |
| P0 | Definir evento/data que constitui “competência de origem” | O estado atual de pendência não esclarece a regra pretendida |
| P1 | Extrair múltiplas rés com trecho e fonte | Há exemplos com Saúde Brasil e Hub Health |
| P1 | Limite de confiança e fila/revisão humana | Evita preencher processo jurídico ambíguo como fato |
| P1 | Reprocessamento retroativo auditável e idempotente | Necessário para corrigir carteira existente |
| P2 | Contagens, exportação e painéis consistentes | Evita divergência entre filtro e indicadores |

## 7. Requisitos de interface

- Exibir a UF normalizada e, quando necessário, um indicador “UF inferida” com fonte e possibilidade de correção.
- Atualizar filtro de UF com estados completos, contagens e “Não informado”.
- Na listagem, acrescentar/permitir filtrar por classificação de ré sem confundir com empresa vinculada; manter opção “Todos”, SB Saúde, San Miguel, Outros, Não identificado e, se houver múltiplas rés, sinalizar isso.
- No detalhe, para cada ré, exibir nome canônico, classificação, papel, documento mascarado conforme perfil, confiança, trecho de evidência, fonte e situação da revisão.
- Na competência, exibir mês/ano, regra aplicada, data-base, origem e estado. Em pendência, explicar o motivo (por exemplo: “sem documento elegível vinculado” ou “duas datas candidatas divergentes”).
- Disponibilizar ações claras de confirmar, corrigir, adicionar/remover e solicitar reprocessamento, com confirmação da alteração antes de sobrescrever valor humano confirmado.
- Diferenciar resultado IA de resultado confirmado por pessoa; não apresentar sugestão como dado validado.

## 8. Requisitos não funcionais

- **Precisão e segurança jurídica:** resultado automático só pode ser gravado segundo limiar acordado e evidência verificável; baixa confiança vai para revisão.
- **Rastreabilidade:** auditar valor anterior/novo, usuário ou processo IA, fonte, regra/modelo e horário.
- **Segurança:** aplicar RLS e permissões atuais; minimizar acesso e exposição de documentos, CPF/CNPJ e dados sensíveis.
- **Desempenho:** filtros e contagens não devem requerer uma chamada de IA por linha nem varredura integral em cada interação.
- **Resiliência:** timeout, indisponibilidade ou erro de IA não pode bloquear abertura/listagem do processo nem limpar valores existentes.
- **Observabilidade:** métricas de volume processado, acerto/revisão, falhas, tempo e custo/uso da IA, por versão e lote.
- **Reprodutibilidade:** registrar versões de prompt, modelo e regras de normalização para explicar resultados históricos.
- **Compatibilidade:** não quebrar dados e integrações existentes nem alterar o significado da empresa vinculada.

## 9. Critérios de aceite

1. O filtro inclui PB e MA e qualquer outra UF presente; todas as UFs brasileiras suportadas podem ser selecionadas.
2. A filtragem por UF coincide com a UF de jurisdição do detalhe e a contagem/paginação exibem o mesmo conjunto.
3. UF nula/inválida aparece em “Não informado” e nunca é classificada silenciosamente por empresa/endereço.
4. Dada evidência inequívoca com razão social ou identificador pertencente ao catálogo, a IA cria/atualiza a ré e classifica no grupo correspondente, mantendo nome e fonte.
5. Uma ação contra duas ou mais rés preserva todas as partes e papéis; a empresa vinculada ao contrato não é automaticamente adicionada como ré.
6. Menção ambígua, conflitante, truncada ou abaixo do limiar não é confirmada automaticamente e fica em revisão com evidências/candidatos.
7. Reexecução com as mesmas fontes não duplica rés, competência nem auditoria de criação; correção humana não é sobrescrita por reprocessamento ordinário.
8. A competência segue a regra aprovada, guarda mês/ano, data-base e fonte, e não captura data de audiência/prazo por engano.
9. Sem fonte elegível ou com fontes conflitantes, o registro permanece sem competência ou pendente com motivo claro; a falha é distinguível de “sem competência”.
10. A execução retroativa oferece prévia, total de afetados, estimativa operacional, erros e resultados revisáveis sem aplicar mudanças ocultas.
11. Alterações manuais registram responsável, instante, valor anterior e novo; acesso segue as permissões existentes.
12. Problemas de IA deixam processo e listagem acessíveis e preservam último valor confirmado.

## 10. Cenários de validação

- Processos com UFs PB, MA, AC, AM, AP, AL, TO, MS, MT, RN, RO, RR, SE, PI e outras atualmente não listadas.
- UF em minúscula, com espaços, nome do estado, nula, inválida e divergente entre CNJ e jurisdição cadastrada.
- Ré com CNPJ válido, CNPJ formatado, razão social completa, acentos divergentes, nome fantasia, alias e erro de digitação.
- SB Saúde junto com Hub Health; San Miguel junto com outro réu; várias empresas do mesmo grupo; empresa vinculada sem participação no polo passivo.
- Nome da empresa aparece em narrativa, assinatura de e-mail, remetente, contrato ou parte autora, mas não como ré.
- Termos “em face de”, “contra”, “requerida”, “ré”, “ré solidária/subsidiária” e textos contraditórios.
- E-mail citado em mais de um processo, comunicação duplicada, documento OCR ilegível ou número de processo inconsistente.
- Datas de ajuizamento, distribuição, recebimento, competência explícita, audiência, prazo e data de captura; mais de uma candidata.
- Reprocessamento antes/depois de validação humana, alteração de documento, falha de IA, fila, retry e concorrência entre duas revisões.

## 11. Plano de entrega recomendado

1. **Diagnóstico técnico:** conferir esquema Supabase, consultas, origem de `UF`, entidades de comunicação/documento e o código que compõe a lista de UFs e a seção de competência/rés.
2. **Decisões de negócio:** aprovar catálogo de entidades, regra de competência, limiar de confiança, política de confirmação e escopo/horário de execução retroativa.
3. **Correção de UF:** normalização e filtro completo, com cobertura de todas as UFs e “Não informado”.
4. **Modelo persistido e auditoria:** completar/ajustar estruturas de rés e competência, índices, RLS e histórico.
5. **Pipeline de IA:** extração com saída estruturada, evidências, confiança, deduplicação, estado de revisão, retries e respeito a dados humanos confirmados.
6. **Interface operacional:** expor filtros, evidências, estado e revisão humana no detalhe e na listagem.
7. **Retroativo:** gerar prévia por lote, validar amostra jurídica, executar em lotes idempotentes e disponibilizar relatório de pendências/erros.
8. **Aceite operacional:** revisar amostra balanceada por UF, grupo de ré, pluralidade de partes e qualidade da fonte; liberar gradualmente e acompanhar métricas.

## 12. Decisões ainda necessárias

1. **Catálogo canônico:** informar razões sociais/CNPJs e aliases válidos de SB Saúde e San Miguel. A tela também cita Hub Health; confirmar se entra como categoria própria, “Outros” ou futura categoria de filtro.
2. **Definição de competência:** confirmar se competência significa período expresso na peça, mês da distribuição/ajuizamento, primeira entrada de comunicação ou outra regra. O detalhe atual chama o campo de “Competência de origem” e depende de comunicação elegível, mas ainda marca pendência apesar de eventos na timeline.
3. **Automação e confirmação:** aprovar limiar mínimo para gravação automática e quem revisa casos ambíguos. Recomendação: associação por identificador validado pode ser automática; correspondência somente textual fica condicionada à confiança e evidência, caso contrário vai para revisão.
4. **Retroativo:** definir se a carteira completa deve ser reprocessada, em qual janela e com que prioridade operacional. A tela mostra 758 processos e a fila administrativa indica 536 exceções aguardando análise; volume e concorrência precisam ser considerados.
5. **Escopo do filtro de ré:** decidir se filtro representa qualquer ré do processo, ré principal ou agrupamento por entidades. Recomendação: processo aparece no filtro do grupo se ao menos uma ré pertencer ao grupo, mantendo sinalização de múltiplas rés.

## 13. Fora do escopo deste levantamento

Este documento especifica requisitos a partir da tela e dos dados visíveis. Não confirma o esquema atual do banco, a disponibilidade de documentos originais, os prompts/modelos configurados, nem altera registros da carteira. Esses pontos devem ser verificados na etapa de diagnóstico antes de dimensionar a implementação.
