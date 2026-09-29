# Levantamento de requisitos — Responsividade da tela de Processos

**Sistema:** SB Gestão Jurídica  
**Tela:** Gestão de Processos (`/processos`)  
**Data da análise:** 29/09/2026  
**Objetivo:** eliminar a rolagem horizontal na tela de processos sem ocultar informações essenciais nem prejudicar filtros e ações.

## 1. Contexto observado

A tela reúne cabeçalho e navegação lateral, controles de busca e filtros, e uma listagem extensa. A grade apresenta sete campos: **Processo / Demanda, Autor, Empresa Vinculada, Próximo Prazo, Criticidade, Responsável e Status**. A inspeção visual mostra que a tabela reserva bastante largura para várias colunas simultaneamente; textos extensos (nomes, empresas e prazos) ocupam múltiplas linhas ou aparecem truncados. A barra lateral fixa também reduz a largura disponível ao conteúdo.

Na faixa de filtros existem controles para status, empresa, réu, competência (ano/mês), região/UF, procedimento/classe, segmento, prioridade e ordenação, além de busca, inclusão de arquivados e ação Novo Processo. A quantidade e largura desses controles pode contribuir para overflow em larguras menores.

**Limite da análise:** foi possível inspecionar a interface em execução, mas não havia código-fonte do sistema neste workspace. As causas técnicas abaixo são hipóteses a validar durante a implementação, não diagnóstico do CSS/DOM.

## 2. Problema e impacto

Em viewports menores que a largura efetivamente exigida pelo conteúdo, a tela requer deslocamento horizontal para alcançar informações ou ações. Isso aumenta o esforço de leitura, dificulta comparar um processo com seus dados associados e prejudica o uso em notebook estreito, tablet e celular. A correção não deve apenas esconder o overflow: os dados e ações necessários precisam continuar acessíveis e compreensíveis.

## 3. Objetivo de produto

A tela de Processos deve caber na largura disponível do viewport em todos os breakpoints suportados. O usuário deve conseguir consultar registros, usar filtros, identificar prazo/criticidade/status e abrir um processo sem rolagem horizontal da página ou de um contêiner da listagem.

## 4. Requisitos funcionais

### RF-01 — Conteúdo sem overflow horizontal

O conteúdo principal, cabeçalho, área de filtros, listagem e paginação devem ajustar-se à largura disponível. Nenhum elemento pode ampliar a largura do documento ou exigir rolagem horizontal.

### RF-02 — Navegação adaptável

A navegação lateral deve reduzir sua ocupação conforme o breakpoint: pode recolher-se em menu acionável ou converter-se em navegação compacta. O estado recolhido deve continuar oferecendo acesso identificável às seções e preservar acesso por teclado e leitor de tela.

### RF-03 — Filtros reorganizados

Os filtros devem se reorganizar em linhas/colunas responsivas, ocupar a largura disponível e manter rótulos/valores legíveis. Em telas estreitas, filtros secundários podem ser agrupados em painel expansível “Filtros”, mantendo busca, filtros principais, indicação de filtros ativos e ação para limpar filtros fáceis de localizar.

### RF-04 — Listagem apropriada ao dispositivo

Em desktop, manter a leitura tabular com as colunas relevantes, dimensionando-as de forma flexível. Em tablet/celular, apresentar cada registro em cartão ou linha empilhada, com nome do campo associado ao valor. Não reduzir a tabela a ponto de tornar conteúdo ilegível nem depender de scroll horizontal.

### RF-05 — Priorização e acesso aos dados

Na apresentação compacta, destacar número do processo/demanda, status, próximo prazo e criticidade. Autor, empresa vinculada e responsável também devem continuar acessíveis sem abrir outro processo; podem aparecer em seções secundárias do cartão ou em expansão acessível. A ação de abrir deve permanecer evidente.

### RF-06 — Textos longos e valores

Números processuais e textos longos devem quebrar linha de modo previsível ou ser limitados visualmente com acesso ao texto integral por mecanismo acessível (por exemplo, expansão/tooltip que também funcione por foco e toque). Dados não podem sobrepor outras colunas/cartões. Datas, badges e nomes de status devem manter significado completo.

### RF-07 — Controles de ação

Novo Processo, busca, atualização, ordenação, filtros, inclusão de arquivados, abertura de registro, paginação e demais ações devem continuar disponíveis e operáveis nas larguras suportadas. Controles não devem ficar cortados ou exigir alvo de toque inadequadamente pequeno.

### RF-08 — Estados e dados variáveis

A responsividade deve ser preservada com rótulos longos, nomes de empresa extensos, autor não identificado, dados ausentes, vários autores, textos de prazo vencido/sem prazo e combinações de filtros. Estado sem resultados, carregamento e erro também devem caber no viewport.

## 5. Requisitos não funcionais e acessibilidade

- **RNF-01:** nenhuma rolagem horizontal da página ou de contêiner interno da listagem nos viewports de aceite abaixo.
- **RNF-02:** zoom do navegador em 200% não deve cortar ações ou conteúdo essencial; o layout pode refluír verticalmente.
- **RNF-03:** foco de teclado visível e ordem de tabulação lógica; filtros agrupados e navegação recolhida com nomes acessíveis.
- **RNF-04:** contraste e distinção de criticidade/status não podem depender somente de cor.
- **RNF-05:** preservar conteúdo, ordenação, filtros, ação de abrir registro e demais comportamentos existentes.
- **RNF-06:** evitar mudanças bruscas de layout ao carregar dados e manter desempenho aceitável na listagem atual (centenas de registros).

## 6. Breakpoints e cobertura mínima proposta

Validar ao menos as larguras CSS: **1920, 1440, 1280, 1024, 768, 390 e 320 px**, em orientação retrato e paisagem onde aplicável. A implementação pode escolher breakpoints diferentes se a composição demonstrar comportamento adequado. Incluir escala de zoom de 200% em desktop e mobile viewport com densidade padrão.

## 7. Critérios de aceite

1. Em cada largura proposta, `document.documentElement.scrollWidth` não excede `clientWidth` por overflow de layout; nenhum contêiner da tela requer scroll horizontal para visualizar a lista ou filtros.
2. Cabeçalho, navegação, filtros e ações não se sobrepõem, não ficam cortados e podem ser alcançados por teclado/toque.
3. Em desktop, os sete campos da listagem permanecem identificáveis e os dados de cada linha se alinham à coluna correta.
4. Em tablet/celular, registros adotam uma apresentação responsiva sem scroll horizontal; número do processo, prazo, criticidade e status são localizáveis, e os demais campos ficam acessíveis no mesmo registro.
5. Um registro com número longo, nome de autor longo, nome de empresa longo, ausência de valor e prazo vencido não causa overflow nem oculta informação essencial.
6. Busca, filtros, ordenação, inclusão de arquivados, atualização, Novo Processo, abrir registro e navegação funcionam como antes.
7. Filtros ativos continuam visíveis/identificáveis quando o painel de filtros estiver recolhido e podem ser removidos individualmente ou limpos.
8. A 200% de zoom, não há corte horizontal de ações essenciais; o conteúdo reflui e pode crescer verticalmente.
9. Estados de carregamento, erro e lista vazia não causam overflow horizontal.

## 8. Hipóteses técnicas para investigação

Validar no código e no DOM, sem presumir que sejam a causa definitiva:

- largura mínima fixa, `min-width` ou `width` maior que o contêiner na tabela, cards, filtros ou conteúdo principal;
- tabela com colunas não flexíveis ou conteúdo com `white-space: nowrap`/strings longas sem quebra;
- itens de flex/grid sem `min-width: 0`, causando expansão pelo tamanho intrínseco;
- sidebar fixa sem ajuste do espaço reservado no conteúdo principal;
- filtros em linha sem wrapping ou grid com colunas fixas;
- padding/gap acumulado que excede a largura disponível;
- overflow criado em modal, cabeçalho ou elementos de status/badges.

Evitar tratar o sintoma com `overflow-x: hidden` global antes de localizar o elemento causador, pois isso pode cortar conteúdo e controles.

## 9. Fora de escopo

- Redesenho visual completo ou alteração de identidade visual.
- Alteração de regras de negócio, dados, filtros ou permissões.
- Redução permanente das colunas disponíveis no desktop sem aprovação do produto.
- Modificações em outras telas, exceto ajustes compartilhados estritamente necessários ao layout base.

## 10. Definição de pronto

Requisitos implementados e critérios de aceite verificados nos breakpoints e estados variáveis acima; nenhum scroll horizontal permanece em processos; acessibilidade básica e funcionalidades preservadas; evidências da validação registradas na revisão técnica.
