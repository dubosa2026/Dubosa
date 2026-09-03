# Conectar a base de dados

O aplicativo está em **Modo de Espera**: a fonte da base ainda não foi definida,
e nada foi assumido a respeito dela — nem Excel, nem CSV, nem Google Sheets, nem
API, nem banco.

Tudo o mais funciona: navegação, permissões, ranking, cálculos, projeções,
gamificação. As telas que dependem de produção real mostram estado de espera em
vez de números inventados.

## O que a base precisa fornecer

| campo | formatos aceitos |
|-------|------------------|
| Nome | texto (caixa alta ou não — o cadastro da equipe normaliza) |
| Data | `YYYY-MM-DD`, `DD/MM/AAAA` ou `Date` |
| Horário | `14:00`, `14h00`, `14:00:00` ou fração de dia de planilha |
| Número de pedidos | número ou texto |
| Faturamento | `98000`, `R$ 98.000,00`, `98,000.00` |

`src/data/types.js` já converte todos esses formatos e reporta linha a linha o
que não conseguiu ler.

## Como conectar, quando a fonte for definida

**1. Escreva o adaptador** em `src/data/sources/MinhaFonte.js`:

```js
import { DataSource } from '../DataSource.js';

export class MinhaFonte extends DataSource {
  static id = 'minha-fonte';
  static label = 'Nome que aparece no painel do gestor';

  get isConnected() { return true; }

  // 'cumulative' = cada registro é o acumulado do dia até aquele horário
  // 'incremental' = cada registro é um pedido isolado
  get semantics() { return 'cumulative'; }

  async fetchDay(date, scope) {
    const linhas = await /* ... buscar na sua origem ... */;
    const { records, errors } = toRecords(linhas);
    return {
      status: 'ready',
      records,
      semantics: this.semantics,
      date,
      fetchedAt: new Date().toISOString(),
      message: null,
      meta: { errors },
    };
  }
}
```

**2. Registre** em `src/data/sources/registry.js`:

```js
import { MinhaFonte } from './MinhaFonte.js';
registerSource(MinhaFonte);
```

**3. Aponte** `dataSource.adapter` em `config/app.config.json` para `"minha-fonte"`.

Nenhuma tela, cálculo ou regra de permissão precisa ser alterada.

## O ponto que decide a privacidade de verdade

`fetchDay` recebe um **escopo**:

```js
{ role: 'seller' | 'manager', sellerId: string | null, include: 'own' | 'team' }
```

Há dois níveis de adaptador, e a diferença é grande:

### Adaptador simples — `scopedRanking: false` (padrão)

Devolve o dia inteiro. O ranking é calculado no navegador. A privacidade fica
garantida por `core/access.js`, que monta o painel sem nenhum dado de terceiro —
mas os dados **trafegaram** até o navegador do vendedor.

Aceitável para uma base pública ou de baixo risco. Não é o alvo.

### Adaptador com servidor — `scopedRanking: true` (recomendado)

O servidor calcula a posição e devolve ao vendedor apenas o que é dele:

```js
get capabilities() { return { scopedRanking: true }; }

async fetchCompetitiveContext(date, scope) {
  // calculado NO SERVIDOR, a partir do dia inteiro
  return {
    position: 7,
    total: 22,
    toNext:     { revenue: 8500, orders: 2 },   // magnitude, nunca identidade
    toPrevious: { revenue: 3100, orders: 0 },
  };
}
```

Com isso, `include` vira `'own'` e o navegador do vendedor **nunca recebe** os
números de ninguém. É o único desenho em que a privacidade é garantida no
transporte, e não só na exibição.

Uma função serverless gratuita (Netlify Functions, Cloudflare Workers) já
resolve. O restante do aplicativo continua estático.

## Cadastro da equipe é separado da base

O sistema de pedidos lista apenas quem já produziu no dia. Por isso a equipe vive
em `config/vendedores.json`, mantido pelo gestor na aba **Equipe**:

- é ele que define **quem aparece** no ranking;
- a base fornece só **os números**;
- quem está zerado aparece nas últimas posições, marcado como *sem produção*;
- quem vier na base sem estar no cadastro é assinalado ao gestor.

Nomes são casados por forma normalizada (sem acento, sem caixa), com uma segunda
tentativa por primeiro + último nome. Combinação ambígua é recusada: é melhor
assinalar do que atribuir a produção de um vendedor ao nome de outro.

## Modo demonstração

Existe para validar telas e cálculos antes de a base existir. É desligado por
padrão, só o gestor liga, e toda resposta carrega `isDemo: true`, o que obriga a
tarja permanente. **Não é a camada de importação** e não serve de base para o
adaptador definitivo.
