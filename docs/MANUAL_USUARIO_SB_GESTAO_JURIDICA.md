# SB Gestão Jurídica — Manual do Usuário

**Versão da Aplicação:** Operação Jurídica Integrada  
**Público-Alvo:** Colaboradores do Setor Jurídico (Operadores, Analistas, Gestores e Consultores)  
**Segmento:** Operadora de Saúde Suplementar  

---

## Sumário

1. [Apresentação e Boas-Vindas](#1-apresentação-e-boas-vindas)
2. [Acesso ao Sistema e Níveis de Permissão](#2-acesso-ao-sistema-e-níveis-de-permissão)
   - [Como Fazer Login](#como-fazer-login)
   - [Perfis de Acesso e o que Cada um Pode Fazer](#perfis-de-acesso-e-o-que-cada-um-pode-fazer)
   - [Acesso Pendente ou Não Autorizado](#acesso-pendente-ou-não-autorizado)
   - [Como Sair do Sistema (Logout)](#como-sair-do-sistema-logout)
3. [Estrutura da Interface e Navegação](#3-estrutura-da-interface-e-navegação)
   - [Menu Lateral de Navegação](#menu-lateral-de-navegação)
   - [Badges de Alerta e Contadores em Tempo Real](#badges-de-alerta-e-contadores-em-tempo-real)
   - [Cabeçalho Superior](#cabeçalho-superior)
   - [Dicas de Usabilidade e Navegação Rápida](#dicas-de-usabilidade-e-navegação-rápida)
4. [Painel Executivo (Dashboard)](#4-painel-executivo-dashboard)
   - [Objetivo da Tela](#objetivo-da-tela)
   - [Indicadores Principais (KPIs do Topo)](#indicadores-principais-kpis-do-topo)
   - [Saúde Operacional e Alertas de Atenção](#saúde-operacional-e-alertas-de-atenção)
   - [Visão de Risco e Exposição Financeira](#visão-de-risco-e-exposição-financeira)
   - [Perfil das Demandas (Classificação Material e Subclassificação)](#perfil-das-demandas-classificação-material-e-subclassificação)
   - [Como Filtrar, Imprimir em PDF ou Exportar Imagem PNG](#como-filtrar-imprimir-em-pdf-ou-exportar-imagem-png)
5. [Gestão de Processos Judiciais](#5-gestão-de-processos-judiciais)
   - [Objetivo da Tela](#objetivo-da-tela-1)
   - [Como Pesquisar e Filtrar Processos](#como-pesquisar-e-filtrar-processos)
   - [Significado de Cada Coluna da Tabela](#significado-de-cada-coluna-da-tabela)
   - [Passo a Passo: Como Cadastrar um Novo Processo](#passo-a-passo-como-cadastrar-um-novo-processo)
   - [Passo a Passo: Como Visualizar os Detalhes de um Processo](#passo-a-passo-como-visualizar-os-detalhes-de-um-processo)
   - [Entendendo as Abas de Detalhes do Processo](#entendendo-as-abas-de-detalhes-do-processo)
   - [Passo a Passo: Como Editar os Dados de um Processo](#passo-a-passo-como-editar-os-dados-de-um-processo)
   - [Passo a Passo: Como Alterar o Status Operacional](#passo-a-passo-como-alterar-o-status-operacional)
   - [O que Significa "Cadastro Incompleto" e Como Sanear](#o-que-significa-cadastro-incompleto-e-como-sanear)
   - [Passo a Passo: Como Arquivar ou Desarquivar um Processo](#passo-a-passo-como-arquivar-ou-desarquivar-um-processo)
   - [Passo a Passo: Como Excluir ou Cancelar um Processo](#passo-a-passo-como-excluir-ou-cancelar-um-processo)
   - [Como Vincular ou Cadastrar uma Empresa pelo Processo](#como-vincular-ou-cadastrar-uma-empresa-pelo-processo)
6. [Controle de Prazos e Obrigações](#6-controle-de-prazos-e-obrigações)
   - [Objetivo da Tela](#objetivo-da-tela-2)
   - [Os 4 Cartões de Status de Prazos](#os-4-cartões-de-status-de-prazos)
   - [Como Filtrar e Localizar Prazos](#como-filtrar-e-localizar-prazos)
   - [Passo a Passo: Como Cadastrar uma Nova Obrigação ou Prazo](#passo-a-passo-como-cadastrar-uma-nova-obrigação-ou-prazo)
   - [Passo a Passo: Como Editar uma Obrigação](#passo-a-passo-como-editar-uma-obrigação)
   - [Passo a Passo: Como Concluir (Dar Baixa em) um Prazo](#passo-a-passo-como-concluir-dar-baixa-em-um-prazo)
   - [Passo a Passo: Como Cancelar uma Obrigação](#passo-a-passo-como-cancelar-uma-obrigação)
7. [Central de Interpretação Jurídica (Caixa de E-mails)](#7-central-de-interpretação-jurídica-caixa-de-e-mails)
   - [Objetivo da Central de Interpretação](#objetivo-da-central-de-interpretação)
   - [As Abas "Em tratamento" e "Histórico"](#as-abas-em-tratamento-e-histórico)
   - [Significado dos Status das Comunicações](#significado-dos-status-das-comunicações)
   - [Passo a Passo: Como Processar Novas Comunicações](#passo-a-passo-como-processar-novas-comunicações)
   - [Passo a Passo: Como Visualizar o Conteúdo Completo do E-mail](#passo-a-passo-como-visualizar-o-conteúdo-completo-do-e-mail)
   - [Passo a Passo: Como Vincular Manualmente um E-mail a um Processo](#passo-a-passo-como-vincular-manualmente-um-e-mail-a-um-processo)
   - [Passo a Passo: Como Reanalisar uma Comunicação com IA](#passo-a-passo-como-reanalisar-uma-comunicação-com-ia)
8. [Tratamento de Exceções e Revisão Humana](#8-tratamento-de-exceções-e-revisão-humana)
   - [O que é uma Exceção Jurídica?](#o-que-é-uma-exceção-jurídica)
   - [Principais Tipos de Exceção](#principais-tipos-de-exceção)
   - [Passo a Passo: Como Fazer a Revisão Humana de uma Exceção](#passo-a-passo-como-fazer-a-revisão-humana-de-uma-exceção)
   - [Decisões Possíveis na Revisão Humana](#decisões-possíveis-na-revisão-humana)
9. [Cadastro de Empresas Vinculadas](#9-cadastro-de-empresas-vinculadas)
   - [Objetivo da Tela](#objetivo-da-tela-3)
   - [Passo a Passo: Como Cadastrar uma Nova Empresa](#passo-a-passo-como-cadastrar-uma-nova-empresa)
   - [Passo a Passo: Como Editar uma Empresa](#passo-a-passo-como-editar-uma-empresa)
   - [Passo a Passo: Como Ativar ou Inativar uma Empresa](#passo-a-passo-como-ativar-ou-inativar-uma-empresa)
   - [Resolução de Vínculos Pendentes](#resolução-de-vínculos-pendentes)
10. [Guia de Situações do Dia a Dia (Passo a Passo Rápido)](#10-guia-de-situações-do-dia-a-dia-passo-a-passo-rápido)
11. [Glossário de Termos e Status do Sistema](#11-glossário-de-termos-e-status-do-sistema)

---

## 1. Apresentação e Boas-Vindas

O **SB Gestão Jurídica** é o sistema corporativo desenvolvido para centralizar, organizar e acelerar a rotina jurídica da nossa Operadora de Saúde Suplementar.

Na operação diária de uma operadora de saúde, chegam diariamente dezenas de intimações, citações, liminares, decisões de urgência, cobranças e notificações de múltiplos tribunais. O SB Gestão Jurídica atua como um hub inteligente que:

- **Recebe e interpreta as mensagens:** lê e classifica automaticamente comunicações recebidas, identificando o assunto da demanda (cirurgia, exame, medicamento, internação, home care, cancelamento, etc.) e a urgência jurídica.
- **Evita perda de prazos:** reúne todos os compromissos judiciais, audiências e cumprimento de liminares em uma visão clara com alertas visuais por proximidade de vencimento.
- **Mantém a rastreabilidade total:** cada processo possui histórico completo de andamentos, documentos, apontamentos de responsabilidade (se a ação depende da operadora, do escritório conveniado ou do juízo) e valor financeiro de risco.
- **Garante integridade com intervenção humana controlada:** quando uma intimação traz números dúbios ou incompletos, o sistema nunca "chuta" nem inventa informações: ele encaminha o caso com segurança para a **Fila de Exceções** para que você, operador jurídico, revise e tome a decisão correta.

---

## 2. Acesso ao Sistema e Níveis de Permissão

### Como Fazer Login

1. Abra seu navegador de internet corporativo e acesse o endereço da aplicação SB Gestão Jurídica.
2. Na tela inicial de autenticação, clique no botão **"Entrar com Google"**.
3. Selecione ou informe seu e-mail corporativo institucional.
4. Conclua a autenticação de dois fatores da sua conta de e-mail, se solicitada.
5. O sistema validará automaticamente seu cadastro e abrirá a tela principal (**Painel Executivo**).

### Perfis de Acesso e o que Cada um Pode Fazer

O acesso aos recursos do sistema é controlado por 4 perfis de permissão:

| Perfil | Quem utiliza | O que pode fazer | O que NÃO pode fazer |
| :--- | :--- | :--- | :--- |
| **ADMIN** (Administrador) | Gestores de TI e Administradores Jurídicos | Acesso irrestrito a todas as telas, cadastros, edição, exclusão, gestão de usuários, regras e parametrizações. | — |
| **GESTOR** | Coordenadores e Gerentes Jurídicos | Cadastrar, editar e excluir processos e empresas; gerenciar prazos; revisar exceções; reprocessar e-mails; extrair relatórios executivos. | Não altera regras internas de sistema exclusivas de TI. |
| **ANALISTA** | Analistas, Advogados Internos e Assistentes | Editar processos judiciais; atualizar status operacionais; criar e dar baixa em prazos; realizar revisão humana de exceções e e-mails. | Não pode excluir processos com dependências nem gerenciar contas de usuários. |
| **CONSULTA** | Auditores, Consultores e Diretoria | Consulta e visualização de painéis, relatórios, processos, prazos e histórico em modo somente leitura. | Não pode criar, alterar, concluir, arquivar nem excluir nenhum registro. |

### Acesso Pendente ou Não Autorizado

Se após efetuar o login com o Google você visualizar a mensagem:
> *"Acesso não autorizado ou perfil inativo"*

Isso significa que seu e-mail já foi autenticado, mas seu cadastro corporativo ainda precisa ser ativado por um **ADMIN** do sistema ou você precisa receber o convite da sua equipe. Entre em contato com o coordenador do setor Jurídico ou com o administrador do sistema para que seu perfil seja ativado.

### Como Sair do Sistema (Logout)

Para encerrar sua sessão com total segurança em computadores compartilhados ou ao final do expediente:
1. No canto superior direito da tela, clique sobre o seu nome ou avatar.
2. No menu suspenso que se abrirá, clique em **"Sair"**.
3. Sua sessão será finalizada imediatamente e a tela de login será exibida.

---

## 3. Estrutura da Interface e Navegação

A interface do SB Gestão Jurídica foi desenhada para ser limpa, rápida e sem poluição visual. Ela é dividida em três partes principais:

### Menu Lateral de Navegação

Localizado à esquerda da tela, reúne todos os módulos de trabalho divididos em seções:

* **OPERAÇÃO**
  - **Painel:** Visão executiva com indicadores consolidados, saúde da esteira e gráfico de perfil de demandas.
  - **Processos:** Listagem de todos os processos da carteira, busca avançada e cadastro de novas ações judiciais.
  - **Prazos:** Agenda centralizada de cumprimento de liminares, audiências, providências e obrigações de fazer.
  - **Central de Interpretação:** Caixa de entrada de intimações e e-mails recebidos para triagem e aplicação ao acervo.
* **CADASTROS**
  - **Empresas:** Cadastro e controle das operadoras e empresas do grupo econômico clientes dos processos.
* **GESTÃO & AUDITORIA** *(visível para perfis autorizados)*
  - **Fila de Exceções:** Itens que demandam conferência humana antes de entrar na carteira.
  - **Usuários:** Gestão de membros da equipe jurídica e níveis de permissão.
  - **Regras de E-mail:** Parâmetros de identificação de palavras-chave e remetentes confiáveis.
  - **Consumo de IA:** Acompanhamento de cotas e utilização da inteligência artificial.

### Badges de Alerta e Contadores em Tempo Real

No menu lateral, você notará pequenos selos coloridos ao lado de algumas opções:

* **Selo ao lado de "Prazos":**
  - Número em destaque vermelho ou âmbar indicando a quantidade de **prazos urgentes** (que vencem nas próximas 48 horas ou já estão vencidos).
* **Selo ao lado de "Fila de Exceções":**
  - Número em destaque indicando a quantidade de **exceções abertas** aguardando análise da equipe.

### Cabeçalho Superior

Exibido no topo da página:
- Mostra o título da página onde você está no momento.
- Exibe o seu nome de usuário e a sua função atual (ex.: *GESTOR*, *ANALISTA*).
- Apresenta o botão de atualizar dados ou atalhos contextuais da tela.

### Dicas de Usabilidade e Navegação Rápida

- **Clique em qualquer linha da tabela:** Ao clicar em uma linha na listagem de processos ou prazos, a janela de detalhes é aberta instantaneamente.
- **Navegação pelo Teclado:** Você pode usar a tecla `Tab` para navegar entre os itens e pressionar `Enter` ou `Barra de Espaço` para abrir qualquer processo ou botão.
- **Fechar Janelas (Modais):** Pressione a tecla `Esc` ou clique no botão **"✕"** no canto superior direito do diálogo.

---

## 4. Painel Executivo (Dashboard)

### Objetivo da Tela

O **Painel Executivo** é a primeira tela que você vê ao entrar no sistema. Ele oferece um panorama estratégico instantâneo da situação jurídica da operadora, respondendo rapidamente a três perguntas fundamentais:
1. *Quantos processos temos e qual o volume de demandas ativas?*
2. *Existem prazos em risco imediato de perda ou descumprimento de liminar?*
3. *Qual é o perfil material predominante dos processos (cirurgias, medicamentos, exames, cancelamentos)?*

### Indicadores Principais (KPIs do Topo)

No topo do painel, você encontra 4 cartões com números consolidados:

1. **Total de Processos:** Volume total de processos cadastrados no acervo da operadora.
2. **Processos Ativos:** Quantidade de processos que estão atualmente tramitando (exclui processos concluídos, cancelados ou arquivados).
3. **Prazos Urgentes:** Total de compromissos judiciais que vencem hoje ou nas próximas 48 horas. Requer atenção prioritária da equipe.
4. **Eficiência Operacional:** Percentual de cumprimento pontual dos deveres jurídicos e ausência de pendências críticas.

### Saúde Operacional e Alertas de Atenção

Abaixo dos indicadores principais, o painel exibe cartões com a **Saúde da Operação**:
- **Obrigações Vencidas:** Alerta em vermelho se houver algum prazo judicial expirado que ainda não recebeu baixa no sistema.
- **Exceções Pendentes de Revisão:** Quantidade de intimações que não puderam ser vinculadas automaticamente e esperam avaliação na Fila de Exceções.
- **Processos com Cadastro Incompleto:** Quantidade de processos que foram abertos com alguma informação pendente de saneamento (como número CNJ a conferir, autor sem documento ou comarca não identificada).

### Visão de Risco e Exposição Financeira

Neste bloco, você acompanha o risco financeiro da carteira:
- **Exposição Estimada:** A soma dos valores financeiros em risco da operadora em ações com pedidos de indenização, danos materiais ou astreintes (multas diárias).
- **Valores Provisionados:** Montante já reservado contabilmente para contingências jurídicas.
- **Semáforo Operacional:**
  - 🟢 **Verde:** Operação em dia, prazos controlados e riscos mapeados.
  - 🟡 **Âmbar:** Atenção recomendada devido a prazos próximos ou aumento de exceções.
  - 🔴 **Vermelho:** Ação imediata necessária (presença de obrigações vencidas ou liminares críticas pendentes de cumprimento).

### Perfil das Demandas (Classificação Material e Subclassificação)

Este bloco analisa a essência do que está sendo discutido nos processos contra a operadora. Ele respeita a **Regra de Prioridade Assistencial da Saúde Suplementar**:

> **Atenção:** Quando uma ação discute cancelamento ou reajuste contratual com o objetivo de obter uma cirurgia, internação ou medicamento, a categoria principal do processo é sempre **ASSISTENCIAL**.

No gráfico, você visualiza duas colunas integradas:
- **Coluna da Esquerda (Classificações Principais):**
  - `ASSISTENCIAL`: Processos envolvendo cobertura de tratamentos de saúde.
  - `COBRANÇA`: Ações de cobrança de mensalidades, coparticipações ou ressarcimento ao SUS.
  - `INDENIZATÓRIA`: Demandas com pedido exclusivo ou predominante de indenização por danos morais/materiais.
  - `CONTRATUAL`: Discussões puramente contratuais (reajuste de faixa etária, cancelamento imotivado, carências) sem pedido de procedimento médico imediato.
  - `REGULATÓRIO`: Notificações de Intermediação Preliminar (NIP) da ANS, autuações e processos administrativos.
- **Coluna da Direita (Subclassificações Detalhadas):**
  - Ao clicar em uma categoria da esquerda (por exemplo, `ASSISTENCIAL`), a coluna da direita se ajusta instantaneamente para exibir o detalhamento:
    * *CIRURGIA* (inclui procedimentos com órteses, próteses e materiais especiais - OPME);
    * *EXAME* (exames de alta complexidade, ressonâncias, biópsias);
    * *MEDICAMENTO* (medicamentos oncológicos, imunobiológicos ou fora do rol);
    * *INTERNAÇÃO* (leitos de UTI, transferência hospitalar);
    * *HOME_CARE* (internação domiciliar e assistência multidisciplinar);
    * *TERAPIA* (sessões com psicólogo, fonoaudiólogo, fisioterapia motora).

### Como Filtrar, Imprimir em PDF ou Exportar Imagem PNG

Na barra de ferramentas do bloco **Perfil das Demandas**, você pode:
1. **Filtrar por Período:** Escolha entre *Todo o histórico*, *Últimos 30 dias*, *Últimos 90 dias* ou *Ano atual*.
2. **Filtrar por Status:** Selecione apenas processos em determinado status operacional (ex.: *EM_TRATAMENTO*).
3. **Filtrar por Empresa Vinculada:** Se sua operadora administra mais de um CNPJ ou carteira, selecione a empresa desejada para ver somente os dados dela.
4. **Exportar Imagem (Botão "PNG do perfil"):** Clique no botão com ícone de download para baixar automaticamente uma imagem nítida com os gráficos para colar em apresentações ou relatórios de diretoria.
5. **Imprimir Relatório (Botão "PDF / Imprimir"):** Clique para abrir a janela de impressão do seu navegador já formatada para folha A4 com cabeçalho limpo e data de emissão.

---

## 5. Gestão de Processos Judiciais

### Objetivo da Tela

A tela **Gestão de Processos** (`/processos`) é o arquivo central de todos os processos da operadora. Nela você consulta, cadastra, edita e acompanha o ciclo de vida completo de cada demanda judicial.

### Como Pesquisar e Filtrar Processos

Na parte superior da tela há uma barra completa de busca:
1. **Campo de Busca Textual:** Digite o número do processo (com ou sem pontos), o nome do autor, o protocolo externo, o nome da comarca ou palavras-chave do resumo do pedido. O filtro busca em tempo real.
2. **Seletor "Todos os Status":** Filtre por fase operacional:
   - *Nova Demanda* (`NOVA`)
   - *Em Triagem* (`TRIAGEM`)
   - *Em Análise* (`EM_ANALISE`)
   - *Em Tratamento* (`EM_TRATAMENTO`)
   - *Aguardando Terceiro* (`AGUARDANDO_TERCEIRO`)
   - *Aguardando Decisão* (`AGUARDANDO_DECISAO`)
   - *Concluída* (`CONCLUIDA`)
   - *Cancelada* (`CANCELADA`)
3. **Seletor "Todas as empresas vinculadas":** Restrinja a listagem à empresa cliente responsável.
4. **Filtro de "Prioridade":** Filtre apenas os casos com prioridade *Urgente*, *Alta*, *Média* ou *Baixa*.
5. **Opção "Incluir arquivados":** Por padrão, processos arquivados ficam ocultos para não poluir sua mesa de trabalho. Marque esta caixa quando precisar consultar processos antigos já arquivados.
6. **Botão "Limpar filtros":** Aparece sempre que houver algum filtro ativo. Um clique restaura a visualização padrão.

### Significado de Cada Coluna da Tabela

| Coluna | O que informa |
| :--- | :--- |
| **Processo / Demanda** | Número do CNJ formatado, selo de prioridade, assunto principal da demanda e protocolo de origem. Se houver pendências de preenchimento, exibe o aviso em âmbar `Cadastro incompleto`. |
| **Autor** | Nome do paciente ou titular da ação e seu documento (CPF/RG). Se houver mais de um autor no polo ativo, exibe `+1 autor`. |
| **Empresa vinculada** | Nome e CNPJ da operadora ré no processo. Se não houver empresa associada, exibe o botão `Cadastrar / Vincular`. |
| **Fase / Tutela** | Fase processual atual (Inicial, Instrução, Decisão, Recurso) e situação da liminar (Deferida, Indeferida, Sem Tutela). |
| **Próximo Prazo** | Data e contagem regressiva da próxima obrigação pendente (ex.: *Vence em 2 dias* ou *Vencido há 1 dia*). |
| **Obrigação** | Descrição suscinta do dever que deve ser cumprido (ex.: *Autorizar cirurgia com fornecimento de prótese*). |
| **Criticidade** | Nível de urgência da providência (Alta, Média, Baixa). |
| **Responsável** | Nome do colaborador ou departamento encarregado da providência. |
| **Status** | Status operacional atual do processo com cor representativa. |

---

### Passo a Passo: Como Cadastrar um Novo Processo

*(Disponível para perfis ADMIN e GESTOR)*

1. No canto superior direito da tela de processos, clique no botão vermelho **"+ Novo Processo"**.
2. Uma janela suspensa será aberta com os campos estruturados:
   - **Número do Processo (CNJ):** Digite os 20 dígitos numéricos do processo. O sistema formata automaticamente no padrão do CNJ (`NNNNNNN-DD.AAAA.J.TR.OOOO`). O sistema valida o dígito verificador na hora.
   - **Empresa Vinculada:** Selecione qual das empresas da operadora é a parte requerida no processo.
   - **Autor Principal:** Digite o nome completo do autor da ação (paciente ou titular do plano) e o número do CPF.
   - **Comarca e UF:** Informe a cidade e o Estado de tramitação do fórum ou vara.
   - **Vara / Foro:** Ex.: *2ª Vara Cível da Comarca da Capital*.
   - **Valor da Causa:** Digite o valor em Reais atribuído à ação.
   - **Prioridade:** Escolha entre *Baixa*, *Média*, *Alta* ou *Urgente* (ações com pedido de liminar médica com risco à vida devem ser cadastradas como *Urgente*).
   - **Categoria da Demanda:** Escolha o assunto material principal:
     * *Assistencial* (se envolver procedimentos, internações ou medicamentos);
     * *Contratual* (se for reajuste ou cancelamento sem pedido médico);
     * *Cobrança* (se for discussão de dívida ou inadimplência);
     * *Indenizatória* (se o pedido for exclusivamente indenização moral/material);
     * *Regulatório* (se for processo na ANS ou Procon).
   - **Subcategoria da Demanda:** Selecione a subcategoria adequada (ex.: *Cirurgia*, *Medicamento*, *Exame*, *Internação*, *Home Care*, *Reajuste*, *Cancelamento*).
   - **Natureza Jurídica:** Selecione o tipo de tutela requerida (ex.: *Obrigação de Fazer*, *Indenizatória*, *Declaratória*). Pode-se selecionar mais de uma se houver pedido cumulado (ex.: Obrigação de Fazer + Indenizatória).
   - **Tutela de Urgência:** Informe se há pedido de liminar (*Sem Tutela*, *Aguardando Apreciação*, *Deferida*, *Indeferida*).
   - **Objeto da Demanda:** Descreva em linguagem objetiva e clara o que a parte requer (ex.: *"Pedido de autorização e cobertura integral de cirurgia ortopédica com implante de prótese de quadril negada sob alegação de carência contratual."*).
3. Revise as informações e clique em **"Salvar Processo"**.
4. Uma notificação verde confirmará o cadastro e o processo passará a constar na lista imediatamente.

---

### Passo a Passo: Como Visualizar os Detalhes de um Processo

1. Na tabela de processos, dê um clique sobre qualquer parte da linha do processo desejado.
2. A janela ampliada de **Detalhes do Processo** será aberta em tela cheia.
3. No cabeçalho da janela você visualiza:
   - Número do CNJ formatado.
   - Status operacional atual.
   - Selo de prioridade e indicação de arquivamento.
   - Autor, empresa vinculada, comarca e protocolo.
   - Botões de ação rápida: **Status**, **Editar**, **Arquivar** e **Fechar**.

### Entendendo as Abas de Detalhes do Processo

A janela de detalhes possui 8 abas especializadas:

#### Aba 1: Visão Geral
Apresenta um resumo completo da demanda:
- **Dados da Causa:** Valor da causa, categoria e subcategoria, naturezas jurídicas presentes, fase processual e situação da tutela de urgência.
- **Objeto da Demanda:** Texto descritivo dos pedidos do autor.
- **Quadro de Partes e Vínculo:** Detalhes do autor principal, polo passivo (empresa vinculada) e origem da intimação.

#### Aba 2: Gestão Operacional
Esta aba é o coração do acompanhamento tático do processo:
- **Semáforo Operacional:** Mostra a cor de saúde do processo (Verde, Âmbar ou Vermelho).
- **Responsabilidade Atual:** Define claramente de quem é a bola no momento:
  * `OPERADORA`: Depende de área interna da operadora (ex.: auditoria médica autorizar procedimento, financeiro pagar guia, etc.).
  * `ESCRITORIO`: Depende do escritório de advocacia terceirizado (ex.: redigir contestação, interpor agravo de instrumento).
  * `JUDICIARIO`: Caso concluso aguardando decisão, sentença ou despacho do juiz.
  * `TERCEIRO`: Depende de resposta de clínica, hospital ou perito.
- **Próxima Ação e Prazo:** Campo para registrar o próximo passo necessário e a data limite de cumprimento.
- **Nível de Risco e Exposição Estimada:** Permite indicar o risco processual (*Baixo*, *Médio*, *Alto*, *Crítico*) e o valor em risco calculado pela equipe.
- **Resumo Executivo e Nota Executiva:** Anotações sintéticas para consultas rápidas da gerência jurídica.
- **Sugestões da IA:** Recomendações geradas a partir da interpretação automática dos últimos documentos e movimentações recebidas.

#### Aba 3: Andamentos & Timeline
Linha do tempo cronológica de todos os eventos que ocorreram no processo:
- Intimações recebidas por e-mail com data e hora.
- Documentos anexados.
- Despachos judiciais registrados.
- Histórico de reclassificações ou intervenções feitas pelos operadores.

#### Aba 4: Obrigações e Prazos
Tabela detalhada de todos os prazos vinculados especificamente a este processo:
- Lista as providências ativas, a data limite de vencimento, a criticidade e quem é o responsável designado.
- Permite que você crie uma nova obrigação diretamente para este processo sem precisar ir à tela de prazos.

#### Aba 5: Pendências
Exibe a lista de pendências cadastrais ou materiais que ainda precisam ser resolvidas neste processo (ex.: *Informar número de CPF do autor*, *Confirmar comarca*, *Anexar cópia da petição inicial*).

#### Aba 6: Escritório Jurídico
Controle da atuação do escritório conveniado que patrocina a causa:
- Nome do escritório ou advogado responsável externo.
- Status de SLA (tempo de resposta do escritório para envio de minutas ou cumprimento de ordens).
- Histórico de follow-up (cobranças e alinhamentos feitos com o escritório).

#### Aba 7: Documentos
Repositório centralizado de peças do processo: petições iniciais, termos de intimação, decisões interlocutórias, laudos periciais e comprovantes de cumprimento de ordem judicial.

#### Aba 8: Histórico & Auditoria
Trilha de auditoria permanente exigida pelas normas de compliance. Registra cada alteração feita no processo: quem alterou (nome e e-mail do usuário), a data e hora exatas, o campo modificado, o valor anterior e o novo valor.

---

### Passo a Passo: Como Editar os Dados de um Processo

*(Disponível para perfis ADMIN, GESTOR e ANALISTA)*

1. Abra os detalhes do processo desejado.
2. No cabeçalho da janela, clique no botão azul **"Editar"** (ícone de lápis).
3. O formulário será aberto com todas as informações atuais preenchidas.
4. Faça as alterações necessárias nos campos permitidos (ex.: alterar o valor da causa, ajustar comarca, atualizar o autor ou a prioridade).
5. Clique em **"Salvar Alterações"**.
6. O sistema validará as alterações e atualizará os dados imediatamente na tela e no histórico de auditoria.

---

### Passo a Passo: Como Alterar o Status Operacional

*(Disponível para perfis ADMIN, GESTOR e ANALISTA)*

1. Abra os detalhes do processo (ou clique no botão de status diretamente na listagem).
2. No cabeçalho, clique no botão **"Status"** (ícone de relógio).
3. A janela **"Alterar Status do Processo"** será exibida.
4. Escolha o novo status entre as opções disponíveis:
   - **NOVA:** Processo recém-chegado, ainda não iniciado.
   - **TRIAGEM:** Em validação preliminar de documentos e partes.
   - **EM_ANALISE:** Sendo avaliado juridicamente pelo advogado ou analista.
   - **EM_TRATAMENTO:** Providências ativas sendo executadas (ex.: cumprimento de liminar).
   - **AGUARDANDO_TERCEIRO:** Aguardando manifestação do hospital, médico assistente ou perito.
   - **AGUARDANDO_DECISAO:** Caso aguardando julgamento ou decisão do magistrado.
   - **CONCLUIDA:** Demanda transitada em julgado, com deveres cumpridos e baixa final.
   - **CANCELADA:** Ação duplicada ou cancelada por acordo/desistência.
5. Digite uma justificativa no campo de observação se solicitado.
6. Clique em **"Confirmar Alteração"**.
7. O selo de status será atualizado imediatamente na tabela.

---

### O que Significa "Cadastro Incompleto" e Como Sanear

Quando um processo é criado a partir de uma intimação que não continha todos os dados obrigatórios, ou quando foi registrado às pressas com pendências, o sistema adiciona o selo âmbar **"Cadastro incompleto"** na tabela.

**Como sanear as pendências:**
1. Abra os detalhes do processo.
2. Na aba **"Visão Geral"**, localize a caixa de aviso amarela no topo: ela lista exatamente os pontos faltantes (ex.: *Identificar documento do autor*, *Cadastrar comarca e vara*).
3. Clique em **"Editar"**.
4. Preencha os campos que estavam em branco.
5. Clique em **"Salvar Alterações"**.
6. Assim que todos os dados essenciais estiverem devidamente preenchidos, o selo de pendência desaparecerá automaticamente.

---

### Passo a Passo: Como Arquivar ou Desarquivar um Processo

*(Disponível para perfis ADMIN, GESTOR e ANALISTA)*

- **Para arquivar um processo concluído:**
  1. Abra os detalhes do processo.
  2. No cabeçalho, clique no botão **"Arquivar"** (ícone de caixa).
  3. Confirme a ação no diálogo. O processo receberá a marcação `ARQ` e deixará de aparecer na lista padrão de processos ativos.
- **Para desarquivar um processo que voltou a tramitar:**
  1. Na tela de processos, marque a opção **"Incluir arquivados"** na barra de filtros.
  2. Localize o processo e abra seus detalhes.
  3. No cabeçalho, o botão agora estará como **"Desarquivar"**. Clique nele.
  4. O processo retornará imediatamente ao acervo de processos ativos.

---

### Passo a Passo: Como Excluir ou Cancelar um Processo

*(Disponível exclusivamente para perfis ADMIN e GESTOR)*

Para proteger a segurança das informações jurídicas da operadora, o sistema adota regras estritas de integridade:
- **Processos com obrigações, prazos pendentes ou e-mails vinculados NÃO podem ser simplesmente apagados.**
- Se você tentar excluir um processo que possui histórico, o sistema abrirá a janela de proteção explicando o motivo e sugerindo:
  * **Opção recomendada 1:** Alterar o status do processo para **CANCELADA**; ou
  * **Opção recomendada 2:** **Arquivar** o processo.

Se o processo tiver sido cadastrado por engano e não possuir nenhuma movimentação ou vínculo:
1. Abra os detalhes do processo.
2. Clique no ícone de **lixeira** (Excluir).
3. Digite a confirmação na janela de segurança e confirme. O registro será removido.

---

### Como Vincular ou Cadastrar uma Empresa pelo Processo

Se um processo estiver sem empresa vinculada (exibindo o selo `Sem empresa vinculada` na tabela):
1. Na própria linha da tabela ou na aba de detalhes, clique no botão **"Cadastrar / Vincular"**.
2. Uma janela se abrirá permitindo:
   - Escolher uma das empresas já cadastradas na operadora; ou
   - Cadastrar na hora uma nova empresa do grupo (informando Razão Social e CNPJ).
3. Ao salvar, a empresa selecionada é imediatamente atrelada ao processo judicial.

---

## 6. Controle de Prazos e Obrigações

### Objetivo da Tela

A tela **Controle de Prazos e Obrigações** (`/prazos`) é a ferramenta de prevenção de risco mais crítica do sistema. Seu papel é assegurar que **nenhum prazo processual ou determinação liminar seja perdido**.

Em planos de saúde, uma liminar não cumprida a tempo pode gerar:
- Agravamento do quadro de saúde do paciente;
- Multas diárias judiciais elevadas (*astreintes*);
- Risco de mandado de prisão de administradores por desobediência;
- Notificações graves junto à Agência Nacional de Saúde Suplementar (ANS).

### Os 4 Cartões de Status de Prazos

No topo da página, quatro cartões funcionam como filtros instantâneos. Um clique sobre qualquer um deles filtra a lista automaticamente:

1. **Prazos Pendentes:** Exibe todas as obrigações que estão em aberto e ainda precisam ser executadas.
2. **Vencendo em 48h (Urgentes):** Exibe apenas as obrigações que vencem hoje ou amanhã. É o primeiro filtro que todo operador jurídico deve verificar ao iniciar o dia de trabalho.
3. **Prazos Vencidos:** Exibe compromissos cuja data limite já passou e ainda não foram dados como cumpridos. Requer saneamento imediato!
4. **Cumpridos:** Exibe as obrigações que já foram executadas e registradas com sucesso.

### Como Filtrar e Localizar Prazos

Na barra de filtros da tela:
- **Busca por texto:** Procure pelo número do processo (CNJ), descrição da providência ou nome da comarca.
- **Filtro por Empresa:** Veja apenas os prazos de uma das empresas do grupo.
- **Filtro por Criticidade:** Filtre por *Alta*, *Média* ou *Baixa*.
- **Filtro por Responsável:** Selecione o seu próprio nome para visualizar somente as suas tarefas pendentes.

---

### Passo a Passo: Como Cadastrar uma Nova Obrigação ou Prazo

*(Disponível para perfis ADMIN, GESTOR e ANALISTA)*

1. Você pode cadastrar um prazo pela própria tela de **Prazos** ou dentro da aba **"Obrigações e Prazos"** do processo.
2. Clique no botão **"Nova Obrigação"**.
3. Preencha os campos da janela:
   - **Processo:** Selecione o processo judicial ao qual este compromisso pertence.
   - **Tipo de Obrigação:** Escolha a natureza do compromisso:
     * *Cumprimento de Tutela de Urgência / Liminar*;
     * *Apresentação de Contestação / Defesa*;
     * *Interposição ou Resposta de Recurso*;
     * *Depósito / Pagamento Judicial de Condenação*;
     * *Comparecimento a Audiência*;
     * *Manifestação sobre Laudo Pericial ou Documento*;
     * *Providência Administrativa Interna*.
   - **Descrição Detalhada:** Explique exatamente a determinação judicial (ex.: *"Emitir guia de autorização para cirurgia bariátrica no Hospital Central e intimar o paciente via telefone."*).
   - **Data e Hora Limite (Prazo Fatal):** Selecione a data e o horário exatos para o cumprimento.
   - **Criticidade:** Defina como *Alta* (liminares sob pena de multa ou crime de desobediência), *Média* (manifestações em prazos regulares de lei) ou *Baixa* (providências sem cominação imediata).
   - **Responsável Designado:** Escolha o colaborador que responderá pela execução da tarefa.
   - **Multa Diária Prevista (se houver):** Se o juiz fixou astreintes, informe o valor diário em Reais e o teto máximo fixado.
4. Clique em **"Salvar Obrigação"**.
5. O prazo entra imediatamente na esteira e os contadores de alerta do menu lateral são atualizados.

---

### Passo a Passo: Como Editar uma Obrigação

1. Na lista de prazos, localize o compromisso e clique no ícone de **Editar** (ou clique na linha e abra a janela de ação).
2. Atualize o prazo fatal (caso o juízo tenha prorrogado o prazo), mude o responsável designado ou acrescente orientações no texto descritivo.
3. Clique em **"Salvar"**.

---

### Passo a Passo: Como Concluir (Dar Baixa em) um Prazo

*(Disponível para perfis ADMIN, GESTOR e ANALISTA)*

Quando a providência foi integralmente cumprida (ex.: o hospital foi notificado e o procedimento foi autorizado, ou a contestação foi protocolada):

1. Na linha do prazo desejado, clique no botão verde com ícone de visto (**"Cumprir"** / **"Concluir"**).
2. Uma janela de confirmação de conclusão será exibida:
   - **Data do Cumprimento:** O sistema preenche com o dia e hora atuais, mas você pode ajustar caso o protocolo tenha ocorrido em horário anterior.
   - **Observações de Cumprimento:** Digite um breve resumo da execução (ex.: *"Autorização emitida sob senha nº 88921 e petição de comprovação juntada aos autos pelo escritório conveniado."*).
3. Clique em **"Confirmar Cumprimento"**.
4. O prazo passará imediatamente para o status **Cumprido**, retirando o alerta vermelho do sistema.

---

### Passo a Passo: Como Cancelar uma Obrigação

Se um prazo foi cadastrado em duplicidade ou perdeu o objeto por decisão judicial posterior que revogou a liminar:
1. Abra a janela de ações do prazo e clique em **"Cancelar Obrigação"**.
2. O sistema exigirá obrigatoriamente uma **Justificativa do Cancelamento** (ex.: *"Liminar revogada pelo Tribunal em sede de efeito suspensivo em Agravo de Instrumento nº ..."*).
3. Clique em **"Confirmar Cancelamento"**. A obrigação será cancelada e o motivo ficará registrado para auditoria.

---

## 7. Central de Interpretação Jurídica (Caixa de E-mails)

### Objetivo da Central de Interpretação

A **Central de Interpretação Jurídica** (`/caixa-juridica`) é o ponto de entrada de todas as comunicações eletrônicas enviadas por tribunais, sistemas judiciais (PJe, e-Saj, Projudi, Epoc), escritórios e órgãos reguladores.

Em vez de o operador jurídico precisar abrir centenas de e-mails manualmente, o sistema:
1. Faz a leitura automática dos e-mails recebidos na caixa jurídica da operadora.
2. Identifica automaticamente se a mensagem trata de matéria jurídica relevante ou se é apenas propaganda/spam.
3. Extrai com Inteligência Artificial:
   - O número CNJ do processo;
   - Os nomes das partes envolvidas (paciente, autor, advogados);
   - O tipo de evento (se é uma nova citação, se é uma liminar urgente, se é uma sentença);
   - Os valores monetários cobrados;
   - Os prazos fixados pelo juiz.
4. Vincula a comunicação diretamente ao processo correspondente na carteira, criando a obrigação de prazo automaticamente quando detectada!

### As Abas "Em tratamento" e "Histórico"

Na parte superior da tela há duas abas fundamentais:

* **Aba "Em tratamento":**
  Reúne apenas as comunicações que ainda necessitam de alguma ação da equipe. É a sua lista de trabalho pendente. Aqui ficam:
  - Comunicações com status `PENDENTE_IA` (aguardando leitura inteligente);
  - Comunicações com status `EXCECAO` (que precisam da sua conferência humana);
  - Comunicações `PROCESSADO` que ainda não foram vinculadas a um processo da carteira.
* **Aba "Histórico":**
  Reúne todas as comunicações que já foram totalmente concluídas, arquivadas ou classificadas como irrelevantes no passado. Serve para consultas de auditoria.

### Significado dos Status das Comunicações

| Selo de Status | Cor | O que significa na rotina do usuário |
| :--- | :--- | :--- |
| `PENDENTE_IA` | Roxo / Índigo | Mensagem recebida que está na fila para processamento da Inteligência Artificial. |
| `EXCECAO` | Vermelho / Âmbar | A mensagem possui alguma ambiguidade que a máquina não pôde resolver sozinha (ex.: dois processos com o mesmo número ou falta de dados). Requer que você clique em **"Revisar"**. |
| `PROCESSADO` | Verde | Comunicação perfeitamente lida, compreendida e já aplicada ou vinculada ao processo na carteira. |
| `IRRELEVANTE` | Cinza | Mensagem analisada e classificada como fora da esteira jurídica (ex.: mensagens de felicitações, newsletters, e-mails comerciais). |
| `RECEBIDO` | Azul | E-mail baixado pelo sistema, pronto para entrar no fluxo de classificação. |

---

### Passo a Passo: Como Processar Novas Comunicações

*(Disponível para perfis ADMIN e GESTOR)*

O sistema efetua varreduras automáticas, mas caso você esteja aguardando uma liminar urgente que acabou de ser encaminhada para a caixa de e-mails da operadora:

1. No canto superior direito da Central de Interpretação, clique no botão escuro **"Processar comunicações"** (ícone de recarregar).
2. O botão ficará em estado de processamento por alguns segundos.
3. Uma caixa verde de resultado será exibida no topo, informando:
   - Quantas mensagens novas foram encontradas;
   - Quantas foram interpretadas por IA;
   - Quantos processos foram localizados ou vinculados;
   - Quantas obrigações de prazo foram criadas automaticamente.
4. A lista de e-mails se atualizará automaticamente na tela.

*(Dica: O botão vizinho **"Testar origem IMAP"** serve apenas para testar se a conexão com a caixa de e-mails do servidor está respondendo normalmente sem importar dados novos).*

---

### Passo a Passo: Como Visualizar o Conteúdo Completo do E-mail

1. Na lista de comunicações, clique sobre a linha da mensagem que deseja inspecionar.
2. Uma janela rápida de opções se abrirá. Clique no botão **"Detalhes"**.
3. A tela **"Detalhes da Comunicação"** será aberta exibindo:
   - Assunto original do e-mail e endereço do remetente;
   - Data e hora exatas em que a mensagem foi recebida;
   - Corpo do texto original da mensagem;
   - Lista de anexos recebidos (petições em PDF, despachos, certidões);
   - Resumo da interpretação realizada pela Inteligência Artificial.

---

### Passo a Passo: Como Vincular Manualmente um E-mail a um Processo

Se uma comunicação foi processada, mas o número do processo não estava explícito no texto e ela não se vinculou automaticamente:

1. Clique na linha da comunicação desejada.
2. Na janela de ação rápida, clique em **"Vincular ao processo"**.
3. Uma janela de busca será exibida:
   - Digite o número do CNJ ou o nome do autor do processo existente.
   - O sistema listará os processos encontrados na carteira.
4. Selecione o processo correto.
5. Clique em **"Confirmar Vínculo"**.
6. A comunicação será anexada imediatamente à linha do tempo daquele processo e passará para o status de processada.

---

### Passo a Passo: Como Reanalisar uma Comunicação com IA

*(Disponível para perfis ADMIN e GESTOR)*

Se uma mensagem antiga tiver sido interpretada incorretamente ou se você quiser forçar uma nova leitura da IA com instruções aprimoradas:

1. Clique sobre a comunicação desejada.
2. Clique no botão **"Reanalisar IA"**.
3. Uma janela de confirmação explicará que:
   - Uma nova chamada à IA será efetuada;
   - Os dados já salvos manualmente por operadores não serão apagados silenciosamente;
   - A reanálise ficará registrada na trilha de auditoria.
4. Clique em **"Confirmar Reanálise"**.
5. Em poucos segundos a IA refará a interpretação do texto e atualizará os dados da esteira.

---

## 8. Tratamento de Exceções e Revisão Humana

### O que é uma Exceção Jurídica?

Uma **Exceção** ocorre sempre que o motor automático de inteligência identifica um risco de inconsistência e, respeitando as regras de governança, decide **não adivinhar**.

Por exemplo: se uma intimação cita dois números de processo diferentes e o sistema não tem certeza se é uma petição em segredo de justiça ou processo apenso, ele gera uma **Exceção** e notifica a equipe para que um ser humano tome a decisão final.

### Principais Tipos de Exceção

| Código da Exceção | O que aconteceu na prática? | O que o operador deve fazer? |
| :--- | :--- | :--- |
| `CNJ_MULTIPLO_AMBIGUO` | O e-mail menciona dois ou mais números de processo e o sistema não sabe a qual deles a ordem se aplica. | Abrir a mensagem, ler o despacho e escolher a qual processo a ordem pertence (ou distribuir entre ambos). |
| `PROCESS_NOT_FOUND` | O número do CNJ foi citado, mas o processo ainda não está cadastrado na base da operadora. | Verificar se é um processo novo (e cadastrá-lo) ou vincular a um processo correlato. |
| `IA_BAIXA_CONFIANCA` | O texto do e-mail é truncado, imagem digitalizada ruim ou incompleta, não permitindo certeza do pedido. | Ler os anexos em PDF manualmente e registrar a classificação correta. |
| `CNJ_DV_PENDENTE_VALIDACAO` | O número do processo digitado na intimação veio com erro de digitação no dígito verificador. | Corrigir a numeração do CNJ na tela de revisão. |
| `MISSING_DATA` | Faltam informações básicas para gerar o processo (como identificação do tribunal ou da comarca). | Preencher os dados faltantes e aprovar. |

---

### Passo a Passo: Como Fazer a Revisão Humana de uma Exceção

1. Acesse no menu lateral a opção **"Fila de Exceções"** (ou clique no botão **"Revisar"** diretamente na Central de Interpretação).
2. Localize o caso pendente e clique no botão laranja **"Revisar"**.
3. A tela **"Revisão e Decisão Humana"** será aberta:
   - **Quadro Amarelo no Topo:** Explica claramente o motivo do alerta (ex.: *"CNJ ambíguo: foram encontrados os números 0012345-... e 0098765-... no corpo da intimação"*).
   - **Quadro de Evidências:** Exibe o assunto original, remetente, data e trechos destacados do e-mail.
   - **Localização do Processo:** Utilize o campo de busca integrado para pesquisar e selecionar o processo da carteira que deve receber esta comunicação.
   - **Campos Estruturados Editáveis:** Ajuste se necessário o CNJ, tipo de demanda, comarca, valor da causa e tutela de urgência.
   - **Campo "Nota de Resolução":** Digite uma breve justificativa da sua decisão (ex.: *"Conferido teor da liminar; refere-se exclusivamente ao processo do autor João da Silva, referente à cirurgia bariátrica."*).

### Decisões Possíveis na Revisão Humana

No rodapé da tela de revisão, você seleciona a decisão a tomar:

1. **"Aplicar ao Processo" (Opção padrão e recomendada):** Vincula a intimação ao processo selecionado, atualiza eventuais dados cadastrais e resolve a pendência.
2. **"Desconsiderar (Irrelevante)":** Se a intimação tiver sido enviada por engano à operadora ou for propaganda, clique nesta opção para arquivar o item sem alterar nenhum processo.
3. **"Manter em Exceção":** Se você precisar de mais tempo ou aguardar orientações da coordenação jurídica antes de tomar a decisão final.

Clique em **"Concluir Revisão"**. O item sumirá da fila de pendências e todo o seu apontamento ficará registrado no histórico permanente do processo.

---

## 9. Cadastro de Empresas Vinculadas

### Objetivo da Tela

A tela **Empresas** (`/empresas`) gerencia as empresas do grupo econômico da operadora de saúde (matriz, filiais, operadoras coligadas e administradoras de benefícios).

É fundamental que cada processo judicial esteja devidamente atrelado à sua respectiva **Empresa Vinculada**, pois isso permite:
- Emissão de relatórios gerenciais por CNPJ;
- Controle de contingências financeiras por pessoa jurídica;
- Direcionamento correto das intimações recebidas.

### Passo a Passo: Como Cadastrar uma Nova Empresa

*(Disponível para perfis ADMIN e GESTOR)*

1. Acesse o menu **"Empresas"** na barra lateral.
2. No canto superior direito, clique em **"+ Nova Empresa"**.
3. Preencha os campos obrigatórios:
   - **Razão Social / Nome da Empresa:** Nome oficial da operadora (ex.: *SB Saúde Assistência Médica Ltda.*).
   - **CNPJ:** Digite os 14 dígitos numéricos (a pontuação é inserida automaticamente). O sistema valida a validade matemática do CNPJ.
   - **Status:** Mantenha marcado como **Ativo**.
4. Clique em **"Salvar Empresa"**.

### Passo a Passo: Como Editar uma Empresa

1. Na lista de empresas, localize a empresa desejada.
2. Clique no botão com ícone de **lápis** (Editar).
3. Faça os ajustes necessários no nome ou no status.
4. Clique em **"Salvar Alterações"**.

### Passo a Passo: Como Ativar ou Inativar uma Empresa

Se uma empresa do grupo foi incorporada ou não deve mais receber novos processos:
1. Abra a edição da empresa.
2. Desmarque a opção **"Ativa"**.
3. Salve. A empresa passará para a lista de inativas e não aparecerá como opção padrão para novos processos, mas todos os processos antigos continuarão vinculados a ela com total integridade.

### Resolução de Vínculos Pendentes

Na tela de Empresas, caso existam processos que foram importados de sistemas legados ou intimações antigas sem empresa definida, o sistema exibe uma seção chamada **"Candidatos a Resolução de Vínculo"**.
Nesta seção, você pode revisar em lote processos sem empresa e associá-los à empresa correta com apenas um clique.

---

## 10. Guia de Situações do Dia a Dia (Passo a Passo Rápido)

### Situação 1: "Chegou uma liminar com prazo de 24 horas no e-mail: o que devo fazer?"
1. Acesse a **Central de Interpretação** (`/caixa-juridica`).
2. Clique em **"Processar comunicações"** para puxar o e-mail imediatamente.
3. Se o e-mail foi vinculado automaticamente, abra o processo na **Gestão de Processos** (`/processos`).
4. Se o e-mail caiu na **Fila de Exceções**, clique em **"Revisar"**, confirme o vínculo ao processo e aplique.
5. Acesse a aba **"Obrigações e Prazos"** do processo:
   - Verifique se a obrigação foi criada com o prazo fatal de 24h e criticidade **Alta**.
   - Se ainda não tiver sido criada, clique em **"Nova Obrigação"**, digite o teor da ordem liminar e defina o responsável interno.
6. Na aba **"Gestão Operacional"**, certifique-se de que a **Responsabilidade Atual** está como `OPERADORA`.
7. Acione a área técnica responsável (ex.: regulação médica / auditoria) para o cumprimento da liminar.
8. Assim que o hospital ou paciente confirmar o agendamento/autorização, acesse a tela **Prazos** (`/prazos`) e clique em **"Cumprir"**, registrando o comprovante.

---

### Situação 2: "O sistema acusou 'Cadastro Incompleto' em um processo: como regularizar?"
1. Vá para a tela **Processos** (`/processos`).
2. Localize o processo que tem a etiqueta âmbar **"Cadastro incompleto"** e clique sobre ele.
3. Na aba **Visão Geral**, veja quais são os dados faltantes indicados no quadro de aviso amarelo.
4. Clique em **"Editar"** no canto superior direito do diálogo.
5. Preencha os campos ausentes (por exemplo, número do CPF do autor ou Vara Judicial).
6. Clique em **"Salvar Alterações"**. A tarja de cadastro incompleto desaparecerá.

---

### Situação 3: "O juiz concedeu mais 5 dias para cumprimento: como atualizar o prazo?"
1. Vá até a tela **Prazos** (`/prazos`).
2. Localize a obrigação correspondente ao processo.
3. Clique em **"Editar"** (ícone de lápis).
4. No campo **Data e Hora Limite**, escolha a nova data final deferida pelo magistrado.
5. No campo de observações, registre: *"Prazo prorrogado conforme despacho de fls. XX"*.
6. Salve. O sistema recalculará a contagem regressiva automaticamente.

---

### Situação 4: "O escritório terceirizado enviou o comprovante de protocolo: como dar baixa?"
1. Acesse a tela **Prazos** (`/prazos`).
2. Localize o prazo e clique no botão verde **"Cumprir"**.
3. Informe a data e hora do protocolo e descreva sucintamente (ex.: *"Contestação protocolada sob nº de recibo 2026.00192."*).
4. Confirme. O prazo sairá da lista de pendentes e entrará na aba de **Cumpridos**.

---

### Situação 5: "Recebi um e-mail de propaganda ou spam na Central de Interpretação: como descartar?"
1. Na **Central de Interpretação**, localize a linha do e-mail.
2. Clique nele e escolha **"Revisar"** ou abra os detalhes.
3. Escolha a opção **"Desconsiderar (Irrelevante)"**.
4. A mensagem sairá da sua fila de trabalho e ficará guardada apenas no histórico sem gerar pendências ou processos.

---

## 11. Glossário de Termos e Status do Sistema

Para garantir que toda a equipe jurídica utilize uma linguagem comum e padronizada, consulte as definições abaixo:

### Status Operacionais do Processo
* **NOVA:** Demanda recém-cadastrada no acervo, aguardando início do trabalho da equipe.
* **TRIAGEM:** Fase preliminar de checagem de documentos, conferência de partes e análise de admissibilidade.
* **EM_ANALISE:** Fase de estudo jurídico pelo advogado responsável para definição de tese defensiva.
* **EM_TRATAMENTO:** Fase de execução de providências ativas (solicitação de relatórios médicos, cotação de OPME, cumprimento de ordens).
* **AGUARDANDO_TERCEIRO:** Quando o andamento depende de uma resposta externa (hospital credenciado, médico assistente, perito ou prestador).
* **AGUARDANDO_DECISAO:** Quando as manifestações foram protocoladas e o processo aguarda decisão judicial.
* **CONCLUIDA:** Demanda com sentença definitiva, cumprimento de todas as obrigações e trânsito em julgado.
* **CANCELADA:** Processo descontinuado por acordo, desistência homologada ou erro de duplicidade.

### Categorias de Demanda (Assunto Material)
* **ASSISTENCIAL:** Processos cujo objeto central diz respeito à cobertura de cuidados de saúde (cirurgias, internações, medicamentos, exames, home care, terapias multidisciplinares).
* **COBRANÇA:** Ações que visam à cobrança ou execução de dívidas de mensalidades, coparticipações não pagas ou ressarcimento ao SUS.
* **INDENIZATÓRIA:** Ações cujo pedido principal e predominante é a condenação da operadora ao pagamento de indenizações por danos morais ou estéticos.
* **CONTRATUAL:** Ações sobre regras da apólice (reajuste financeiro, cancelamento por inadimplência, alteração de rede credenciada) onde **não** há pedido concomitante de tratamento de saúde imediato.
* **REGULATÓRIO:** Procedimentos junto a órgãos regulatórios (ANS, Procon, Ministério Público).

### Naturezas Jurídicas
* **OBRIGAÇÃO DE FAZER (`OBRIGACAO_FAZER`):** Ação judicial em que o autor exige que a operadora pratique um ato concreto (ex.: emitir autorização de internação, fornecer prótese).
* **INDENIZATÓRIA (`INDENIZATORIA`):** Pedido de reparação monetária em virtude de suposto dano suportado.
* **CONDENATÓRIA (`CONDENATORIA`):** Pedido de pagamento de quantia certa.
* **DECLARATÓRIA (`DECLARATORIA`):** Pedido para que o juiz declare a nulidade de uma cláusula ou a existência/inexistência de uma relação jurídica.

### Responsabilidade Atual do Caso
* **OPERADORA:** Providência de competência direta da equipe interna da operadora de saúde.
* **ESCRITÓRIO:** Providência a cargo do escritório de advocacia terceirizado contratado.
* **JUDICIÁRIO:** Caso aguardando movimentação interna do cartório judicial ou despacho do magistrado.
* **TERCEIRO:** Providência dependendo de hospital, clínica credenciada ou perito nomeado.

---

**SB Gestão Jurídica** — *Eficiência, Rastreabilidade e Segurança Jurídica para a Saúde Suplementar.*  
Em caso de dúvidas operacionais ou sugestões de melhoria, contate o Administrador Jurídico do seu setor.
