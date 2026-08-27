# Circuito — treino funcional de bolso

Você diz quanto tempo tem e o que tem em casa. Ele monta o circuito, mostra
o que vai fazer antes de começar e conduz o treino com cronômetro, apito e
as dicas de execução na tela — do aquecimento ao alongamento.

Não pede cadastro, não manda nada para lugar nenhum e funciona sem
internet.

## Como abrir

`circuito.html` é o app inteiro em um arquivo. Baixe, abra com dois cliques
(ou mande por mensagem para o seu celular) e pronto.

`dist/` é a mesma coisa com o manifesto e o service worker do lado, para
publicar num endereço e instalar na tela de início do celular: aberto pelo
ícone, ele ocupa a tela toda, sem barra de navegador, e abre offline.

## O que ele faz

**Monta o treino no tempo que você tem.** 10, 15, 20, 30, 45 ou 60 minutos
— e o que sai cabe mesmo nesse tempo, contando aquecimento, descanso entre
as rodadas e volta à calma. Essa é a promessa que o
[`testes_montagem.py`](testes_montagem.py) mais persegue.

**Só prescreve o que você tem.** Sem halter marcado nos Ajustes, nenhum
exercício com halter aparece. Quem mora em apartamento liga *sem pulo, sem
barulho* e nenhum polichinelo, burpee ou salto entra no treino — nem no
aquecimento.

**Não repete o padrão do movimento.** Agachamento e afundo têm nomes
diferentes e cansam a mesma perna. O circuito nunca põe dois movimentos do
mesmo padrão em estações vizinhas — incluindo a volta, da última estação
para a primeira da rodada seguinte.

**Conduz o treino.** Tela cheia, cronômetro que se lê de longe, cor por
fase, apito nos 3 segundos finais, aviso de troca de lado nos exercícios
unilaterais e as dicas de execução do exercício da vez. Pausar, pular e
voltar funcionam a qualquer momento.

**Guarda o que você fez.** Sequência de dias, meta da semana, gráfico dos
últimos 14 dias e a lista de sessões. Parar no meio também conta: quem
aqueceu e fez um bloco treinou.

**E avisa quando o navegador não guarda.** Tudo fica no aparelho, no
armazenamento do navegador — e há três situações em que ele apaga: aba
anônima, arquivo aberto direto do anexo no iPhone e prévia de
visualizador. O app confere isso ao abrir e mostra uma faixa dizendo o que
aconteceu e como resolver, com um botão de exportar. Ele não consegue
impedir a perda (quem apaga é o navegador), mas a pessoa não fica achando
que o app está quebrado.

## Os módulos, em ordem de dependência

Os fontes ficam em `src/` e viram um arquivo só pelo `build_app.py`:

```bash
python3 treino/build_app.py
```

Não edite `circuito.html` nem `dist/index.html` — são gerados.

| arquivo | do que cuida |
|---|---|
| `formato.js` | cronômetro escrito, durações, datas e plural |
| `exercicios.js` | o catálogo: 62 movimentos, com padrão, equipamento, nível e dicas |
| `montador.js` | monta o circuito dentro do tempo pedido e o transforma em passos |
| `relogio.js` | onde o treino está no instante X: passo, tempo restante, apitos |
| `progresso.js` | histórico, sequência, semana e o recado da tela inicial |
| `ui.js` | as quatro abas e a tela de execução |

Só o `ui.js` conhece o DOM. Os outros cinco são JavaScript puro e rodam no
node, que é como os testes conferem a matemática sem subir navegador.

No build cada módulo entra dentro da própria função anônima. Sem isso o
`const F` do progresso e o `const F` da interface colidiriam no escopo
global e o navegador recusaria o arquivo inteiro.

## Por que arquivo único

O app precisa abrir na garagem, no parque e no fim do corredor do prédio,
onde o sinal não chega. Nada de CDN, nada de pacote, nada de rede: as
fontes entram embutidas em base64 e o HTML inteiro tem uns 260 KB — menos
que uma foto.

## Os testes

```bash
python3 treino/testes_montagem.py     # a matemática, no node
python3 treino/testes_app.py          # o app inteiro num navegador de celular
python3 treino/testes_instalacao.py   # o que o build promete
```

O `testes_app.py` precisa do Playwright (`pip install playwright` e
`playwright install chromium`). Ele adianta o relógio do navegador para
treinar vinte minutos em poucos segundos — dá para fazer isso porque o app
lê a hora do sistema de propósito, que é o que faz o cronômetro voltar no
passo certo quando o celular dorme no meio do treino.

## Os ícones

```bash
python3 treino/gerar_icones.py
```

Desenha os PNGs em `src/icones/` sem depender do Pillow: três círculos e um
retângulo arredondado não justificam uma dependência binária que pode
faltar no dia do build.

## Isto não é um professor

O app monta circuito e conta tempo. Ele não conhece sua lesão no ombro, não
vê sua execução e não sabe que você dormiu quatro horas. Dor não é esforço:
pare, e procure um profissional antes de subir de nível.
