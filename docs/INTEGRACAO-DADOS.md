# Conectar a base de dados

O aplicativo sai da caixa em **Modo de Espera** e já traz tudo o que é preciso
para conectar o sistema de pedidos da direção — sem programar.

---

## Caminho zero: colar a lista (funciona hoje)

Não precisa de endereço de dados, senha, CORS nem servidor.

1. no sistema de pedidos, selecione a lista de vendedores e copie (Ctrl+C);
2. no seu painel: **Configuração → Lançar**;
3. cole no campo e clique em **Ler o texto colado**;
4. confira a tabela — ela mostra a equipe inteira, com quem foi reconhecido
   destacado e os demais zerados — e clique em **Registrar produção de agora**.

A leitura se ancora no cadastro da equipe, então funciona com o texto bagunçado
que sai de uma cópia de tela: nome e números na mesma linha ou em linhas
separadas, com marcadores, em caixa alta, com `R$ 370 mil` ou `R$ 370.332`.
Nome que não está no cadastro aparece avisado, nunca entra escondido.

Cada lançamento é carimbado com o horário. Lançar duas ou três vezes ao dia já
dá curva suficiente para ritmo, projeção e comparação com o mesmo horário de
ontem.

**Limite:** o que é lançado fica no navegador de quem lançou. Para a equipe
inteira enxergar, a produção precisa vir de origem compartilhada — os caminhos A
e B abaixo.

---

## Caminho rápido: descobrir o formato (5 minutos)

O sistema de pedidos responde alguma coisa quando você clica no seu nome. O
aplicativo precisa saber onde e em que formato.

1. abra o sistema de pedidos e entre normalmente;
2. tecle **F12** e vá na aba **Rede** (ou *Network*);
3. clique no seu nome, como você já faz;
4. na lista que aparecer, procure a linha cujo **Tipo** é `xhr` ou `fetch`;
5. clique nela, abra **Resposta** (*Response*) e copie tudo;
6. no seu painel de gestor: **Configuração → Base de dados → Analisar resposta**.

O aplicativo diz, passo a passo, se encontrou a lista de vendedores, quais
colunas reconheceu e como leu as primeiras linhas — **sem nenhuma chamada de
rede**. Se algum campo não for reconhecido, os seletores logo abaixo ligam cada
coluna da origem ao campo correspondente.

Copie também o **endereço** da chamada (aba *Cabeçalhos*, campo *URL da
requisição*) — é ele que vai no campo "Endereço dos dados".

---

## Caminho A — ler direto do navegador

Preencha o endereço, a autenticação e clique em **Testar conexão**. Serve para
você validar tudo rapidamente.

Duas limitações, ditas com todas as letras:

- **CORS.** O navegador só lê uma resposta de outro endereço se aquele servidor
  autorizar. Se o sistema de pedidos não autorizar, o diagnóstico avisa
  exatamente isso — não é erro de configuração sua.
- **A senha fica só no seu navegador.** O aplicativo é publicado como arquivo
  público; se a senha entrasse na configuração do repositório, ela seria
  publicada junto. Por isso a conexão não é exportável — e, enquanto ela viver só
  aí, **o painel dos vendedores continua sem dados**.

Para a equipe inteira, use o caminho B.

---

## Caminho B — função de servidor (recomendado)

`netlify/functions/producao.mjs` já está pronto e testado
(`node tests/funcao-producao.js`). Ele:

- guarda a senha em **variável de ambiente**, fora do repositório;
- busca o sistema de pedidos a partir do servidor, onde CORS não existe;
- **calcula o ranking no servidor** e devolve ao vendedor apenas os próprios
  números mais a posição e as distâncias — nenhum nome, nenhum valor de colega
  atravessa a função;
- recusa com 403 qualquer código de acesso desconhecido.

**Publicar:**

1. no Netlify, *Add new site → Import an existing project*, apontando para este
   repositório e esta branch;
2. em **Site settings → Environment variables**, defina:

   | variável | conteúdo |
   |----------|----------|
   | `PEDIDOS_URL` | o endereço descoberto no passo acima, com `{data}` no lugar da data |
   | `PEDIDOS_SENHA` | a senha do sistema de pedidos |
   | `PEDIDOS_AUTH` | `query`, `header`, `body` ou `none` |
   | `PEDIDOS_CAMPO` | nome do campo da senha (padrão `senha`) |
   | `PEDIDOS_LISTA` | caminho até a lista, se ela estiver aninhada |
   | `ORIGEM_PERMITIDA` | endereço do aplicativo, se ele estiver hospedado fora do Netlify |

3. em **Configuração → Base de dados**, escolha a origem `liga-api`.

Se a resposta do sistema de pedidos tiver um formato que o normalizador não
cobre, o único ponto a ajustar é a função `buscarProducao()` — o resto (acesso,
escopo, ranking, agregado) já está pronto e coberto por testes.

---

## Modo de Espera

Enquanto nenhuma origem estiver conectada, nada é assumido a respeito da base.
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

## Quando a origem não tem histórico

O sistema de pedidos diz **como está agora** — não a curva do dia. Sem linha do
tempo não existe ritmo, projeção nem comparação com o mesmo horário de ontem.

Com `Horário = "A origem só diz como está agora"`, o aplicativo guarda cada
leitura e monta a curva conforme o dia passa. **Esse acúmulo é por navegador**: a
curva existe enquanto alguém mantém o aplicativo aberto, e cada máquina monta a
sua.

Para uma curva confiável e igual para todos, a coleta precisa acontecer no
servidor em intervalo fixo — uma função agendada gravando cada leitura. A função
do caminho B é o lugar natural para isso.

## Modo demonstração

Existe para validar telas e cálculos antes de a base existir. É desligado por
padrão, só o gestor liga, e toda resposta carrega `isDemo: true`, o que obriga a
tarja permanente. **Não é a camada de importação** e não serve de base para o
adaptador definitivo.
