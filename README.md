# Rotina de Gestão Comercial — 3 Camadas

Aplicação web de arquivo único que transforma a planilha `Rotina_Gestao_Comercial_3_Camadas.xlsx`
em um programa com cara de sistema, mantendo integralmente o método original e acrescentando
uma camada de análise assistida.

**Como usar:** baixe `index.html` e dê dois cliques. Abre em qualquer navegador, funciona
offline, não precisa instalar nada.

---

## O que veio da planilha (preservado 1:1)

| Aba original | Onde está agora |
|---|---|
| Como Usar | Painel de controle — bloco de abertura + "as 4 regras" |
| Manual | Método (manual) — os 3 passos, o limite de 3 iniciativas, a regra final e o "o que compartilhar com a equipe" |
| 1. Estratégia | Camada 1 — os 5 blocos (SWOT, SWOT cruzada, priorização, OKR, 5W2H) |
| 2. Diário Semanal | Camada 2 — ciclo PDCA com mês/ano/% calculados |
| 3. Report Mensal | Camada 3 — farol automático, Manter/Parar/Começar, resumo executivo |
| Listas | Embutido nos campos de seleção |

Todas as fórmulas foram reimplementadas: índice (impacto ÷ esforço), prioridade sugerida,
% atingido, contagem de semanas por status e acumulado de meta × realizado por frente.
As iniciativas do 5W2H continuam alimentando as frentes do diário e as linhas do farol.

## O que foi acrescentado

- **Painel de controle** com KPIs do trimestre, farol consolidado e a agenda "o que fazer agora"
  (muda conforme o dia da semana e o que está preenchido).
- **Analista virtual** em duas camadas:
  - *Diagnóstico automático* — ~25 regras determinísticas que leem as três camadas e apontam
    inconsistências com o porquê e a ação recomendada. Funciona offline, sem chave de API.
  - *Análise com IA* — monta um dossiê completo da operação. Copie e cole em qualquer assistente,
    ou conecte uma chave da API Anthropic para receber a leitura dentro do próprio programa.
- **Equipe & carteira** — espelha a planilha de metas mensais: um vendedor por linha com os
  **5 indicadores** (Pedidos, Faturamento, Integradores/positivação, Integrador novo e BelCred),
  cada um com meta, realizado e % calculado, mais a coluna **Observação / risco** e uma linha de
  TOTAIS recalculada. KPIs por indicador, ranking com seletor de indicador e cobertura por UF do Norte.
  Aceita **importação de base CSV**: reconhece os títulos da planilha original (incluindo variações
  como `RELIZADO PEDIDO` e `META INTEGRADOR NOVO`), ignora as colunas de `%` (recalcula) e a linha
  de `TOTAIS`, detecta o separador (`;`, `,` ou tabulação), entende número no formato brasileiro e
  mostra uma prévia com o mapeamento antes de gravar. Três modos: atualizar pelos nomes, substituir
  ou acrescentar — e em todos eles a **Observação / risco já escrita é preservada** por nome.
  Exportação em CSV no mesmo layout (números em pt-BR) e modelo de planilha para baixar.
- **Biblioteca do setor fotovoltaico** — sugestões prontas de SWOT, KRs e iniciativas específicas
  de distribuição B2B para integradores (giro de estoque, prazo de entrega, crédito do canal,
  venda direta do fabricante, parecer de acesso, positivação, share of wallet).
- **Gerador de cruzamento** — combina um item interno com um externo e monta o rascunho da
  estratégia no quadrante certo.
- **Fechamento do PDCA em um clique** — o botão ↻ cria a semana seguinte já com a ação corretiva
  como meta.
- Gráficos de ritmo semanal e ranking da equipe, tema claro/escuro, layout responsivo,
  impressão/PDF, exportação em JSON e CSV, e um exemplo preenchido de distribuidora fotovoltaica.

## Onde os dados ficam

No armazenamento local do navegador, naquele computador. Nada é enviado para a internet —
a única exceção é o dossiê, se você optar por conectar a chave de API.
**Exporte o backup `.json` toda sexta** (aba Dados & backup) e guarde na nuvem da empresa:
limpar os dados do navegador ou trocar de máquina apaga o histórico.

## Limitações conhecidas

- Sem sincronização entre usuários ou máquinas — a troca é via arquivo de backup.
- Sem integração direta com Power BI / ERP; os números são digitados ou colados.
- A chave de API, se salva, fica no navegador daquele computador (não viaja dentro do HTML).
