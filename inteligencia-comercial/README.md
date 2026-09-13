# Motor de Inteligência Comercial — Belenergy

Pega a base de clientes (a mesma que já sai do BI) e devolve, por cliente,
quem ele é, qual o potencial dele, qual o risco de perdê-lo e o que o
vendedor deve fazer agora — e, para a carteira inteira, um ranking de quem
atacar hoje, quem está em risco, quem tem mais potencial e quem vale
reativar.

Um único arquivo HTML, sem instalação: abra `index.html` com dois cliques
no navegador. Arraste a planilha, confira o mapeamento de colunas e o
painel aparece. Não envia nada para lugar nenhum — a leitura, os cálculos e
os gráficos rodam inteiramente na memória do seu navegador.

## Como usar

1. **Carregar a base** — arraste o `.xlsx`/`.csv` (ou cole os dados de uma
   planilha já aberta). Também dá para clicar em **"Usar carteira de
   exemplo"** para ver o app funcionando com 14 clientes fictícios
   (`exemplo-carteira.csv`, mesmo arquivo que acompanha este diretório).
2. **Conferir as colunas** — o motor tenta reconhecer sozinho cada coluna
   (faturamento, datas, categorias etc.) pelo nome do cabeçalho. Revise e
   corrija o que estiver errado: é esse mapeamento que decide se um dado
   entra no cálculo ou vira **"Dados insuficientes"**.
3. **Painel** — alertas automáticos, os rankings (Ataque hoje, Em risco,
   Maior potencial, Reativação, Todos os clientes) e, ao clicar em
   qualquer cliente, o resumo executivo completo: scores, oportunidade,
   risco, mix de produtos, estratégia de abordagem e a orientação para o
   vendedor.

## O que este motor É e o que ele NÃO É

Isto **não** é uma IA conversando com os dados: é um **motor de regras**,
determinístico, que implementa em código a lógica de análise comercial
(RFM, tendência de faturamento, mix, risco). Duas consequências práticas:

- **Auditável e reprodutível** — a mesma base sempre gera o mesmo
  resultado, e cada número tem uma fórmula rastreável em `motor.js`
  (todos os pesos e limiares estão reunidos no topo do arquivo, comentados,
  para o time revisar e ajustar).
- **Rápido, grátis e offline** — não depende de chave de API nem de
  internet; roda em milissegundos mesmo com milhares de linhas.

O texto que originou este motor (o "prompt" da Belenergy) descreve **o que
considerar** em cada score — não uma fórmula matemática exata, porque não
existe uma única "certa". A interpretação usada aqui está toda documentada
em `motor.js`; é o ponto de partida para o time calibrar com o tempo.

## Dados de entrada

Uma linha por cliente. Nenhuma coluna é obrigatória — o que faltar vira
"Dados insuficientes" naquele campo, em vez de um número inventado. Quanto
mais completa a base, mais preciso o motor fica:

| Campo | Para que serve |
|---|---|
| Código do cliente / Nome / Estado / Cidade / Vendedor | Identificação |
| Data de cadastro / 1ª compra / última compra | Tempo de relacionamento e recência |
| Quantidade de pedidos / meses comprando | Frequência e recorrência |
| Faturamento total / 30 / 90 / 180 dias | Volume e tendência (crescendo, estável, em queda) |
| Ticket médio | Tamanho médio do pedido |
| Categorias e produtos comprados / Qtd. de SKUs | Mix e oportunidades de cross-sell |
| Status do cliente / Informações de concorrência | Sinal direto de risco de perda |
| Histórico de reativação | Ajuda a diferenciar "inativo" de "em reativação" |
| Descontos concedidos (%) | Sensibilidade a preço (nunca decidida só por ter pedido desconto) |

Os nomes das colunas na sua planilha podem ser diferentes — o passo de
mapeamento existe justamente para isso.

## Como os scores são calculados (resumo)

Cada cliente recebe três notas de 0 a 100, cada uma combinando vários
sinais (nunca um único campo isolado):

- **Score Comercial** — prioridade geral: recência, frequência,
  faturamento, ticket, recorrência, mix, momento (crescendo/estável/em
  queda) e um desconto pelo risco.
- **Score de Oportunidade** — quanto espaço existe para crescer:
  crescimento recente, mix ainda não explorado, potencial de reativação,
  espaço para aumentar participação e categorias que o cliente ainda não
  compra (comparado ao que a própria carteira já vende).
- **Score de Risco** — chance de perda: aumento do intervalo entre
  compras, queda de faturamento, mix encolhendo, inatividade e sinais
  diretos (status de cancelamento, menção a concorrência).

Um detalhe importante: os componentes de oportunidade ligados a "pouco
mix"/"ticket baixo" só pesam de verdade quando o cliente já tem alguma
substância na relação (pedidos ou faturamento relevantes). Sem essa
trava, um cliente minúsculo e ocasional pontuaria "alto potencial" só por
ainda não ter comprado quase nada — o oposto do que a Belenergy pediu
(pouco volume só justifica prioridade alta quando há sinal de
**crescimento**, não apenas ausência de histórico).

A partir dos três scores, o motor deriva: classificação (VIP, em risco,
inativo...), sensibilidade a preço, a **principal** oportunidade e o
**principal** risco (nunca uma lista genérica), a prioridade P1–P5 e uma
única próxima ação recomendada.

## Privacidade

Igual ao [Assistente de Distribuição](../app/): nenhum dado sai do
navegador. A leitura do arquivo, os cálculos e a exportação da tabela
acontecem inteiramente na memória local — não há upload, não há backend,
não há conexão de rede.

## Arquivos

- `index.html` — o app.
- `motor.js` — o motor de pontuação (sem DOM; roda também sob Node, o que
  permite testar a lógica isoladamente).
- `leitor.js` — leitura de `.xlsx` (zip) e de texto delimitado
  (CSV/TSV/colar), só usado pela página.
- `exemplo-carteira.csv` — carteira fictícia para testar o app (mesmos
  dados do botão "Usar carteira de exemplo").
