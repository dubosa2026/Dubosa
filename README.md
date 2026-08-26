# Bússola — assessor financeiro de bolso

Um aplicativo de celular em que você **fala** o que gastou e ele responde
quanto ainda pode gastar hoje, para onde o mês vai dar e o que fazer para
sobrar (ou para sair do vermelho).

O microfone **só funciona com a tela desbloqueada e o app na frente** — e
essa regra está escrita no código, não só nesta frase. Veja
[A regra do microfone](#a-regra-do-microfone).

Tudo fica no aparelho. Não tem cadastro, não tem senha de banco, não tem
servidor com os seus lançamentos.

---

## Como colocar no celular

Há dois caminhos. O primeiro não depende de nada nem de ninguém; o segundo
deixa o app com cara de aplicativo instalado.

### 1. Arquivo único (o mais simples)

`app/bussola.html` é o app inteiro em um arquivo só — telas, fontes e
contas. Mande para o seu celular (WhatsApp, e-mail, Drive) e abra. Funciona
offline e sem instalar nada.

Limitação: o reconhecimento de voz costuma exigir uma página servida por
`https://`. Aberto direto do arquivo, o microfone pode não ligar em alguns
navegadores — nesse caso use o caminho 2, ou lance digitando.

### 2. Publicado, com ícone na tela de início (recomendado)

O repositório já vem pronto para o [Netlify](https://netlify.com):

1. Crie um site novo apontando para este repositório.
   O `netlify.toml` já traz o build (`python3 app/build_app.py`) e a pasta
   publicada (`app/dist`).
2. Abra o endereço do site no celular.
3. No Android (Chrome): menu → **Adicionar à tela inicial**.
   No iPhone (Safari): compartilhar → **Adicionar à Tela de Início**.

Depois disso ele abre em tela cheia, sem barra de navegador, e continua
funcionando sem internet — o service worker guarda a página no aparelho.

Como o endereço é público, vale definir um **PIN** em Ajustes.

---

## Como se usa

Toque no microfone (o botão redondo no meio da barra de baixo) e fale
normalmente. Alguns exemplos que ele entende:

| Você fala | O que acontece |
|---|---|
| "gastei 45 no mercado" | lança R$ 45,00 em Mercado, hoje |
| "paguei cento e vinte de luz" | lança R$ 120,00 em Contas de casa |
| "uber 18 reais ontem" | lança em Transporte, com a data de ontem |
| "recebi 3000 de salário" | lança como entrada |
| "aluguel 1800 todo dia 10" | cria uma **conta fixa** mensal |
| "meu saldo é 2450" | atualiza o saldo da conta |
| "quanto posso gastar hoje?" | responde na tela e em voz alta |
| "quanto vou ter no fim do mês?" | responde com a projeção |
| "quanto gastei com mercado esse mês?" | soma a categoria |
| "me dá um conselho" | abre os conselhos |
| "apaga o último" | desfaz o que acabou de lançar |

Números por extenso funcionam ("quarenta e cinco reais e noventa
centavos"), porque é assim que o celular transcreve boa parte das vezes.

Nada obriga a usar voz: dá para digitar em **Lançar agora**, na primeira
aba.

---

## A regra do microfone

O pedido que originou este app era exato: reconhecer a voz **apenas com a
tela desbloqueada**. Isso é tratado como regra da casa, e mora concentrado
em [`app/src/voz.js`](app/src/voz.js).

1. **Nunca liga sozinho.** Não há escuta automática ao abrir, nem palavra de
   despertar. Sem o seu toque, o microfone não abre.
2. **A tela apagou, ele morre.** O evento `visibilitychange` desliga na hora
   — e ele cobre tela bloqueada, celular no bolso, troca de aplicativo e
   troca de aba.
3. **As outras portas também estão fechadas:** `pagehide`, `freeze` e
   `blur`, que são os outros jeitos de a página sair da frente.
4. **Ao voltar, ele não volta a ouvir.** A tela avisa "parei porque a tela
   apagou" e espera outro toque. Religar sozinho abriria a janela em que o
   microfone volta com o celular já no bolso — que é exatamente o que não
   pode acontecer.
5. **Silêncio prolongado desliga.** Microfone aberto e esquecido gasta
   bateria e ninguém lembra dele.

O reconhecimento é o do próprio celular (Web Speech API). O áudio não passa
por este app, não é gravado e não é enviado a lugar nenhum: o que chega aqui
é texto, e o texto vira lançamento no aparelho.

Isso é verificado nos testes: `app/testes_voz.py` simula a tela apagando e
confere que o microfone cai, que nem toque o religa nesse estado, e que ele
não volta sozinho; `app/testes_app.py` repete a cena no navegador de
verdade, com o app inteiro rodando.

### O que ele não faz

**O navegador não sabe de quem é a voz.** Ele transcreve quem estiver perto
do aparelho desbloqueado — não existe, na web, reconhecimento biométrico de
locutor que dê para confiar. Se a preocupação é que só você use o app, o que
resolve é o bloqueio de tela do próprio celular mais o **PIN** em Ajustes
(que segura olhar curioso, não perito).

---

## As contas

Duas ideias sustentam tudo, e as duas aparecem escritas na tela:

- **O que é fixo é calendário.** Aluguel, salário e assinatura caem em dia
  certo. Tratar isso como média borraria o único pedaço do futuro que se
  conhece com certeza.
- **O que é variável é média** — e a média diz de quantos dias ela veio. Com
  três dias de uso, o app avisa que ainda é chute; com trinta, ele diz que a
  média está firme.

### Quanto posso gastar hoje

```
(saldo + o que ainda entra − contas fixas que faltam − reserva)
────────────────────────────────────────────────────────────────
              dias até a próxima entrada
```

O divisor **não** é "dias que faltam no mês". Fosse assim, no dia 28 o app
mandaria torrar tudo em quatro dias e no dia 2 você estaria no vermelho
esperando o salário do dia 5. O horizonte é o mais longo entre o fim do mês
e a véspera da próxima entrada prevista.

### Dia, semana, mês e ano

A aba **Futuro** caminha dia a dia até o horizonte escolhido, somando as
contas fixas nas datas delas e descontando a média diária. O gráfico mostra
o caminho, não só o destino: importa mais **quando** o saldo fura o chão do
que o número do último dia.

---

## Conselhos

A aba **Conselhos** tem duas camadas.

**A que sempre funciona** ([`app/src/conselhos.js`](app/src/conselhos.js))
roda no aparelho, sem internet e sem chave nenhuma. Cada conselho vem da sua
própria conta e mostra o cálculo:

- o dia em que o saldo zera, e **de onde tirar** o que falta — categoria a
  categoria, com teto de corte por categoria (até 40% no que é escolha, até
  20% em mercado e transporte, porque mandar cortar 40% da comida da casa
  não é conselho);
- peso das contas fixas sobre o que entra, com as três maiores nomeadas
  (acima de 60%, cortar cafezinho não resolve — o que resolve é renegociar);
- categoria que fugiu do seu próprio normal, comparada com o seu histórico e
  não com médias de revista;
- dívidas em ordem de juro (método avalanche), com o quanto de juro corre
  por mês e em quantos meses zera;
- reserva de emergência antes de investimento, sempre nessa ordem;
- simulação de rendimento **com a taxa que você informar**.

O app **não inventa taxa de mercado**. Se você não disser quanto a sua
aplicação rende, ele não simula rendimento nenhum e pede o número. Taxa
chutada em tela de dinheiro vira decisão errada na vida real. Pelo mesmo
motivo ele não recomenda banco, corretora, fundo nem produto.

**A camada opcional** é o botão *Pedir análise à IA*, que existe só na
versão publicada. Ele manda um retrato **só de números** — saldo, totais por
categoria, contas fixas, dívidas, projeções — e traz uma leitura em cima
disso. Não vai descrição de lançamento (é texto livre, onde acabam entrando
nomes de pessoas), não vai data de gasto nenhuma, não vai nada que
identifique quem perguntou. Isso está verificado em
`netlify/testes/testes_conselho.mjs`.

Para ligar, no Netlify: `ANTHROPIC_API_KEY`, `IA_LIGADA=1` e — importante,
se o endereço for público — `SENHA_IA`, que você repete no app em Ajustes.
A chave fica no servidor; o celular nunca a vê.

---

## Seus dados

Ficam em `localStorage`, neste navegador, neste aparelho. O app não tem
conta de usuário, não sincroniza e não faz backup por conta própria.

A consequência prática: **trocou de celular ou limpou os dados do navegador,
acabou.** Em Ajustes existe *Baixar cópia* (um `.json`) e *Restaurar cópia*.
Vale fazer isso de vez em quando.

---

## Estrutura

```
app/
  bussola.html              o app inteiro, arquivo único, offline
  build_app.py              junta src/ e gera bussola.html e dist/
  dist/                     o que o Netlify publica (+ manifesto e sw)
  src/
    formato.js              dinheiro, datas e números falados em pt-BR
    nucleo.js               lançamentos, contas fixas, projeções
    voz.js                  a trava da tela + o que ele entende
    conselhos.js            o assessor que roda no aparelho
    ui.js                   as quatro telas
    app_shell.html          marcação e estilo
  testes_nucleo.py          a matemática, conferida contra Python
  testes_voz.py             frases faladas + a trava da tela
  testes_app.py             o app inteiro no navegador de celular
netlify/
  functions/conselho.mjs    a análise por IA (a chave fica aqui, no servidor)
  testes/testes_conselho.mjs
```

## Rodar os testes

```bash
python3 app/build_app.py        # gera o app a partir de src/
python3 app/testes_nucleo.py    # as contas
python3 app/testes_voz.py       # a voz e a trava da tela
python3 app/testes_app.py       # o app no navegador (precisa do playwright)
node netlify/testes/testes_conselho.mjs   # a função da IA (precisa de npm install)
```

Os três primeiros não abrem navegador nem usam rede. O de navegador usa
Playwright com um motor de voz falso — reconhecimento de fala de verdade não
existe em navegador de teste, e é justamente o motor falso que permite
simular a tela apagando com o microfone ligado.
