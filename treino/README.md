# Circuito — treino funcional de bolso

Você diz quanto tempo tem e o que tem em casa. Ele monta o circuito, mostra
o que vai fazer antes de começar e conduz o treino com cronômetro, apito e
as dicas de execução na tela — do aquecimento ao alongamento.

Não pede cadastro, não manda nada para lugar nenhum e funciona sem
internet.

## Como abrir

`circuito.html` é o app inteiro em um arquivo. Baixe, abra com dois cliques
(ou mande por mensagem para o seu celular) e pronto.

`dist/` e `docs/` são a mesma coisa com o manifesto e o service worker do
lado, para publicar num endereço e **instalar na tela de início**. Aberto
pelo ícone, o app ocupa a tela toda, sem barra de navegador, e abre sem
internet.

### Onde ele está publicado

**https://dubosa2026.github.io/Dubosa/treino/**

O GitHub Pages deste repositório publica **uma** pasta: a `docs/` da branch
da Bússola. Por isso o Circuito mora numa subpasta dela — `docs/treino/` —,
e os dois convivem sem que nenhum arquivo de um encoste no outro:

| endereço | app |
|---|---|
| `.../Dubosa/` | Bússola |
| `.../Dubosa/treino/` | Circuito |

Cada um tem o seu service worker. O da Bússola tem escopo `/Dubosa/` e
cobriria a subpasta, mas escopo mais específico ganha: `/Dubosa/treino/` é
controlado pelo service worker do Circuito. Offline, cada endereço abre o
seu app.

Ao mexer em `treino/src/`, rode o build e copie `docs/` para `docs/treino/`
na branch publicada — é de lá que o site sai.

### Instalar no Android

1. Abra **https://dubosa2026.github.io/Dubosa/treino/** no Chrome do Android.
2. Vá em **Ajustes** dentro do app: o botão **Instalar o app** está lá.

Não adianta procurar esse botão no arquivo `circuito.html` baixado: instalar
exige HTTPS, manifesto e service worker, e service worker não existe fora de
um endereço. É regra do navegador, não limite do app — e o app diz isso na
tela quando percebe que foi aberto como arquivo.

No iPhone não existe esse botão — a instalação é manual, por
**Compartilhar → Adicionar à Tela de Início**, e o app ensina o caminho na
mesma tela. Nos dois casos o resultado é igual: ícone próprio, tela cheia,
funciona offline.

A página publicada também traz o botão **Baixar o arquivo**, que entrega o
`circuito.html` inteiro para guardar ou passar adiante.

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

**Escolhe pelo lugar.** Apartamento, casa, academia ou ar livre. Cada lugar
guarda o **seu** equipamento e a **sua** regra de barulho: apartamento já
nasce sem nada que saia do chão — nem no aquecimento —, a academia já vem
com os pesos, e no parque só entra o que cabe na mochila. O halter de casa
não vira halter do parque.

**Mostra o movimento.** Cada um dos 62 exercícios tem um boneco animado,
desenhado em SVG e animado entre poses. Ele aparece na lista, na ficha e —
grande, na cor da fase — na tela de execução.

**Guarda o que você fez.** Sequência de dias, meta da semana, gráfico dos
últimos 14 dias e a lista de sessões. Parar no meio também conta: quem
aqueceu e fez um bloco treinou.

**Mostra para onde você está indo.** Carga das últimas 8 semanas, tendência
(a semana atual contra a média do mês) e a projeção do mês no ritmo de
hoje.

**Acompanha o corpo.** Peso, cintura e quadril, com IMC, faixa de
referência e gráfico da evolução.

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
| `bonecos.js` | o desenho animado de cada movimento |
| `montador.js` | monta o circuito dentro do tempo pedido e o transforma em passos |
| `relogio.js` | onde o treino está no instante X: passo, tempo restante, apitos |
| `progresso.js` | histórico, sequência, lugares, carga, tendência e projeção |
| `corpo.js` | peso, cintura, quadril e IMC |
| `ui.js` | as quatro abas e a tela de execução |

Só o `ui.js` conhece o DOM. Os outros sete são JavaScript puro e rodam no
node, que é como os testes conferem a matemática sem subir navegador.

## Por que boneco e não vídeo

O app tem que abrir sem internet. Dez segundos de vídeo por exercício,
vezes 62, seriam dezenas de megabytes — e um app que não abre no elevador.
Figura parada resolveria o tamanho e perderia o principal: exercício é
movimento, e o que a pessoa precisa ver é o caminho entre as duas posições.

O boneco custa uns 20 KB no total, funciona offline, aumenta sem borrar e
pega a cor da fase. A pose é escrita em ângulos, que são legíveis ("joelho
a 55 graus") — menos onde o corpo encosta no chão: ali a pose diz o
**ponto** em que a mão e o pé apoiam, e a cinemática inversa acha os
ângulos. Sem isso o braço atravessa o piso.

## Sobre a tendência e as projeções

O app não tem sensor de batimento e não finge ter. O que ele mede com
honestidade é **volume**: tempo de esforço vezes o peso do nível. Com isso
responde as duas perguntas que fazem alguém largar ou se machucar — "estou
treinando menos do que treinava?" e "estou aumentando rápido demais?" — 
comparando os últimos 7 dias com a média semanal do último mês. Perto de 1
é onde se progride sem susto. Com menos de três semanas de histórico ele
diz que ainda é cedo, em vez de inventar diagnóstico.

O IMC aparece sempre com a ressalva: ele divide peso por altura e não sabe
o que é músculo. Quem começa a treinar às vezes ganha peso e "piora" no IMC
enquanto melhora de verdade.

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
