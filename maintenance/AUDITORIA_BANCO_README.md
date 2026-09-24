# Auditoria read-only do banco

Arquivo principal: `maintenance/AUDITORIA_BANCO_READONLY.sql`.

## O que ele faz

Audita estrutura, colunas críticas, RPCs, RLS, policies, grants, índices, constraints, integridade lógica, duplicidades, timeline, runs, locks, configuração IMAP, filas de IA e perfis de usuário.

## Segurança

O arquivo contém apenas `SELECT`. Ele não cria, altera ou apaga objetos nem dados.

## Como executar

1. Abra o **SQL Editor** do Supabase do projeto correto.
2. Cole primeiro as seções 0 a 5 e execute.
3. Se algum objeto `CRITICO` aparecer como `AUSENTE`, interrompa a auditoria de dados e registre o resultado.
4. Se a estrutura estiver íntegra, execute as seções 6 a 12.
5. Exporte ou copie os resultados para análise.

## Como interpretar rapidamente

- `AUSENTE` em objeto/coluna `CRITICO`: incompatibilidade entre aplicação e banco.
- `problems > 0` na Seção 7: dado órfão ou relação inconsistente.
- `runs_running_mais_30min > 0`: execuções provavelmente abandonadas.
- `REVISAR_POSSIVEL_ORFAO` em locks: investigar antes de liberar manualmente.
- filas `PENDING`: podem ser normais; avaliar idade, volume e capacidade do Gemini.
- `processos_sem_timeline > 0`: legado sem evento histórico inicial.

A auditoria não corrige nada automaticamente. Correções devem ser produzidas separadamente, por categoria, após análise do resultado.
