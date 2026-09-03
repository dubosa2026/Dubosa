# Arquitetura

## Em uma frase

Um aplicativo estático, sem servidor e sem custo, em que **todo dado que chega à
tela do vendedor passa antes por uma única função que o monta a partir apenas
dos dados dele**.

## As camadas

```
   config/            app.config.json    regras (horário, metas, níveis, privacidade)
                      vendedores.json    QUEM é a equipe
                      equipe.json        QUEM tem acesso (hash do código)
                            │
   data/              DataSource ◄───────┤ contrato único com a origem dos dados
                        ├── PendingSource   (ativo: Modo de Espera)
                        ├── DemoSource      (validação, sempre marcado)
                        └── ...futuro       (a fonte real entra aqui)
                            │
                      types.js          normalização (nome, data, hora, pedidos, faturamento)
                      store.js          linha do tempo acumulada por vendedor
                                        + fusão com o cadastro da equipe
                            │
   core/              clock.js          minuto comercial (desconta intervalo e feriado)
                      metrics.js        ritmo, projeção, comparação com ontem
                      ranking.js        posição e distâncias
                      gamification.js   níveis e conquistas
                      messages.js       frases competitivas
                            │
                      access.js  ◄──────  NÚCLEO DE PRIVACIDADE
                            │             monta o painel de cada perfil
                            │
   ui/                seller.js   manager.js   admin.js   login.js
```

Nenhuma tela importa `store.js` ou `ranking.js` diretamente. Todas recebem um
*view model* pronto, vindo de `access.js`.

## Modelo de dados

Um único formato canônico, em `src/data/types.js`:

| campo        | tipo     | exemplo        |
|--------------|----------|----------------|
| `sellerId`   | string   | `erica-oliveira` |
| `sellerName` | string   | `Erica Oliveira` |
| `date`       | `YYYY-MM-DD` | `2026-09-03` |
| `time`       | `HH:mm`  | `14:00`        |
| `orders`     | número   | `12`           |
| `revenue`    | número   | `98000`        |

A fonte declara a semântica dos registros:

- **`cumulative`** — cada registro é o acumulado do dia até aquele horário
  (*"às 14h, 12 pedidos e R$ 98.000"*);
- **`incremental`** — cada registro é um pedido isolado que soma ao dia.

`store.js` converte as duas formas na mesma linha do tempo acumulada. Todo o
resto do sistema lê só isso.

O acumulado é lido como **função em degraus**: o valor só muda onde existe
medição. Interpolar entre dois pontos inventaria produção que não aconteceu.

## Quem aparece no ranking

O sistema de pedidos da empresa lista **apenas quem já produziu no dia** — quem
está zerado não vem na resposta.

Por isso a equipe é um cadastro próprio (`config/vendedores.json`), e não uma
consequência da base:

- a lista de vendedores define **quem aparece**;
- a base fornece só **os números**;
- quem está no cadastro e não veio na base entra com produção zero, nas últimas
  posições, marcado como *sem produção* — **nunca some da disputa**;
- quem veio na base e não está no cadastro aparece assinalado para o gestor,
  nunca é descartado em silêncio.

## Regras de ranking

1. **Faturamento do dia**, decrescente — critério principal.
2. **Pedidos do dia**, decrescente — primeiro desempate.
3. **Quem chegou primeiro** ao próprio patamar de faturamento — premia quem
   produziu cedo em vez de quem produziu no fim.
4. **Ordem alfabética** — desempate final, para que a mesma produção gere sempre
   a mesma tabela.

Quem não produziu continua ranqueado, nas últimas posições. Sumir do ranking é
pior que aparecer em último.

## Ritmo e projeção

Todo cálculo usa **minuto comercial** — expediente menos intervalos — e não
minuto de relógio. Sem isso, o horário de almoço diluiria o ritmo de todo mundo.

Três modelos de projeção, configuráveis:

| modelo   | conta                                              |
|----------|----------------------------------------------------|
| `linear` | `atual + ritmo × horas restantes`                  |
| `curve`  | `atual ÷ fração do dia que ontem já tinha nesta hora` |
| `blend`  | média ponderada dos dois (padrão: 60% curva)       |

Travas obrigatórias:

- **nada é projetado** antes de `projection.minElapsedMinutes` de expediente —
  extrapolar os primeiros minutos é extrapolar ruído;
- a projeção **nunca fica abaixo** do já realizado;
- a projeção **nunca passa** de `maxMultiplier` vezes o realizado, para que um
  pedido às 8h05 não vire uma projeção fantasiosa;
- sem dia anterior comparável, `blend` e `curve` caem para `linear` — e a tela
  diz qual modelo foi usado.

Variação percentual sobre base zero devolve `null`, exibido como `—`. Não é
"infinito" nem "100%": não existe.

## Sistema de permissões

`src/core/access.js` concentra a matriz. Capacidades marcadas `false` para o
vendedor **não têm chave de configuração** — são definição de produto.

| capacidade                  | vendedor | gestor |
|-----------------------------|----------|--------|
| ver os próprios dados       | ✅ | ✅ |
| ver a própria posição       | ✅ | ✅ |
| distância para as vizinhas  | ✅ (magnitude anônima, configurável) | ✅ |
| total agregado da equipe    | ✅ (só somas, e só com equipe grande) | ✅ |
| **ranking nominal**         | ❌ | ✅ |
| **dados de outro vendedor** | ❌ | ✅ |
| **comparar vendedores**     | ❌ | ✅ |
| **exportar relatório**      | ❌ | ✅ |
| **configurar o aplicativo** | ❌ | ✅ |
| **gerenciar acessos**       | ❌ | ✅ |

Detalhes e limites em [PRIVACIDADE.md](PRIVACIDADE.md).

## Telas

**Vendedor** — posição em destaque, pedidos e faturamento do dia, mensagens
competitivas, a disputa (distâncias anônimas), comparação com ontem no mesmo
horário, projeção, ritmo, curva do dia, nível, conquistas e o total da equipe.
Mais o **modo compacto**: uma janela mínima com posição, pedidos, faturamento e
a distância para a próxima posição.

**Gestor** — resultado da equipe, ranking nominal completo com todas as
análises, painel individual por vendedor, comparação entre dois vendedores e
exportação em CSV/JSON.

**Configuração** (só gestor) — equipe, acessos, estado da base, regras e
instalação.

## Decisões que valem registro

- **Sem framework e sem build.** O aplicativo é servido como está. Hospedagem
  gratuita em qualquer lugar, e o gestor consegue abrir um arquivo e entender.
- **Sem servidor.** Enquanto a base não for definida, não há o que servir. Isso
  tem um custo em privacidade, descrito em PRIVACIDADE.md.
- **Falhar fechado.** Se a barreira de privacidade acusa qualquer coisa, a tela
  do vendedor **não é renderizada**. Um painel degradado que vaza é pior que um
  painel que não abre.
