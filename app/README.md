# App de Distribuição — arquivo único, abre no navegador

`belenergy-distribuicao.html` é o app inteiro em um arquivo só. Baixe, dê
dois cliques e ele abre no navegador. Não instala nada, não pede login e
**nenhum dado sai do seu computador** — a planilha é lida na memória do
navegador e os arquivos são gerados ali mesmo.

Funciona offline. Dá para mandar por WhatsApp, e-mail ou colocar numa pasta
do Drive para o time todo usar.

## Como usar

1. **Base do BI** — arraste o `.xlsx` que a macro exporta (ou cole os dados
   direto de uma planilha aberta). O app mostra quantas linhas leu e quais
   colunas encontrou.
2. **Equipe** — a lista dos 22 vendedores já vem preenchida. Dá para editar,
   adicionar, remover e informar e-mail; as mudanças ficam salvas no
   navegador para a próxima vez. É aqui também que se escolhe o tipo da
   rodada: normal, ataque a um estado ou sem compras no mês. O botão
   **"Copiar equipe"** exporta a lista no formato da versão Google Sheets.
3. **Distribuição** — a lista de cada vendedor, com quantidade e valor.
   Baixe tudo de uma vez em `.xlsx`, ou copie a lista de um vendedor
   específico para colar no WhatsApp ou no e-mail.
4. **Desempenho** — o funil de aproveitamento e as análises do dia.

## Regras de distribuição

1. Cliente com `Categoria = "Ativo 30 dias"` não entra: já comprou faz pouco
   tempo, não é alvo de prospecção.
2. **Só a Região Norte é distribuída** — AC, AM, AP, PA, RO, RR e TO.
   Cliente de qualquer outro estado nunca é redistribuído: continua com o
   vendedor que já o atende na base. A regra é fixa; não depende de quem
   está cadastrado na etapa 2. Ela vale para as rodadas Normal e Ataque; a
   modalidade "Sem compras no mês" atende o Brasil inteiro e só move o
   cliente quando ele está com vendedor de fora da equipe.
3. Dentro de cada UF, os clientes são divididos igualmente entre os
   vendedores daquele estado (diferença máxima de 1 cliente). A ordem é
   determinística: rodar duas vezes na mesma base dá o mesmo resultado.
4. UF com um único vendedor entrega a carteira inteira daquele estado a ele.
5. Linha sem UF preenchida não é distribuída — fica separada para correção
   na origem.
6. Cliente de outra gerência (campo configurável na etapa 2, por padrão
   `EDUARDO LUIZ DOS SANTOS`) não é tocado.
7. O rodapé da exportação — a linha de totais e o texto "Filtros
   aplicados:" que o BI escreve no fim do arquivo — é descartado. Um cliente
   de verdade a quem falta a UF continua aparecendo como "sem UF", que é
   problema de cadastro para corrigir na origem.

A regra 1 vale nas duas exportações: "Ativo 30 dias" na base por atividade,
"Comprador neste Mês" e "Comprador Habitual" na base mensal.

Tudo que não foi distribuído aparece na etapa 3, em listas separadas por
motivo, com opção de baixar.

## Funil de aproveitamento

O app guarda no navegador uma fotografia de cada rodada: quem ficou com cada
cliente e em que situação ele estava.

Quando você carrega a **base seguinte**, ele compara. Cliente que estava
parado com o vendedor X e agora aparece como `Ativo 30 dias` conta como
**reativação de X** — porque foi ele quem trabalhou aquele cliente no
período.

### A referência é por estado

Cada estado tem sua própria linha do tempo, e cada tipo de rodada também.
Isso importa porque a operação costuma ser estado a estado: você carrega a
base do PA, distribui, e depois carrega a do TO.

- A rodada do **TO** é comparada com a **última rodada do TO**, não com a
  última base que passou pelo app.
- Rodar o TO **não apaga** a referência do PA. Cada estado espera a própria
  próxima rodada.
- Uma base com os sete estados do Norte compara e atualiza os sete de uma
  vez; uma base só do PA mexe apenas no PA.

Quando um estado aparece pela primeira vez, ele não tem com o que ser
comparado: entra como referência e começa a contar na rodada seguinte. A
etapa 4 diz, em cada rodada, quais estados entraram na conta e quais ficaram
de fora — e por quê.

A etapa 4 mostra:

- taxa de aproveitamento geral, quantos clientes voltaram a comprar e quanto
  isso representa em faturamento;
- ranking por vendedor: reativados / carteira anterior, taxa e valor;
- o mesmo recorte por estado, para comparar regiões.

### Quando o funil se recusa a dar um número

Cada cliente da rodada anterior tem um de três destinos: **converteu**,
**segue em aberto**, ou **saiu da base**. Os três somados dão a carteira, e é
esse terceiro que decide se a conta faz sentido.

Essa checagem é feita **estado a estado**, e um estado que não passa fica de
fora sem derrubar os outros:

- **Mais de um terço da carteira daquele estado saiu da base** → as duas
  exportações não falam dos mesmos clientes. Sem isso, o app dividia 0 por
  573 e mostrava "0% de aproveitamento", como se a equipe tivesse falhado.
- **Mesma base carregada duas vezes** → entre duas leituras do mesmo arquivo
  não houve período nenhum. O app reconhece pela impressão digital dos
  clientes e categorias daquele estado.
- **Estado sem referência ainda** → primeira vez que ele aparece naquele tipo
  de rodada.

Se nenhum estado passa, não há aproveitamento a mostrar e a rodada **não
entra no histórico**, para não sujar a série com zeros falsos. Em todos os
casos a fotografia é guardada, e a medição começa na rodada seguinte.

## Histórico de conversão por estado

Toda rodada com comparação válida vira uma linha do histórico, guardada no
navegador. Na etapa 4, escolha o estado e veja a série ao longo do tempo:

- **Equipe toda** ou qualquer estado do Norte que já tenha rodada registrada.
- Quatro números: taxa da última rodada, acumulado do período, total de
  clientes reativados e a melhor rodada até hoje.
- Um gráfico com uma barra por rodada, colorida pela faixa da taxa (verde
  ≥12%, amarelo ≥6%, vermelho abaixo), e a tabela completa embaixo.
- A **tendência**: a última rodada comparada com a média das anteriores, para
  separar melhora real de oscilação.

É esse recorte que mostra o resultado do trabalho. Uma taxa solta não diz
nada; PA saindo de 4,9% para 20,0% em três rodadas, sim.

O botão **Copiar histórico** exporta a série do estado escolhido para colar
numa planilha. **Limpar** apaga tudo e pede confirmação, porque não tem
como voltar.

Duas limitações que valem saber: o histórico fica **no navegador** onde você
usa o app — não é compartilhado entre computadores, e limpar os dados do
navegador apaga a série. E ele guarda as **60 rodadas mais recentes**.

## Análises do dia

Abaixo do funil, o app lê os próprios números e escreve o que está
acontecendo e o que fazer a respeito: quem se destacou, quem está com
carteira cheia e nenhuma conversão, qual estado converte melhor, onde está o
dinheiro parado, se a carga entre UFs ficou desigual, qual estado vale
atacar e o que precisa ser corrigido na origem dos dados.

Três regras evitam análise incoerente:

- **Destaque exige conversão de verdade** — pelo menos um cliente reativado e
  taxa acima da média da equipe. Antes, com todos em 0%, o primeiro da fila
  virava "destaque" sem ter convertido ninguém.
- **Quem zerou fica fora do destaque e do "abaixo da média"** — sem isso o
  mesmo vendedor aparecia elogiado num cartão e cobrado no seguinte.
- **Valores em dinheiro só aparecem quando existem** — base sem coluna de
  faturamento não gera frases com "R$ 0".

Cada análise vem com uma ação sugerida. O botão **Copiar para a equipe**
joga tudo em texto, pronto para colar no grupo.

As análises são recalculadas a cada rodada — carregue a base atualizada e a
leitura do dia vem junto.

## Sem compras no mês

A terceira modalidade da etapa 2, para a base mensal — a que usa
"Sem Compras este Mês", "Comprador neste Mês" e "Comprador Habitual" em vez
de "Ativo 30 dias" e "Inativo".

O destino de cada cliente segue **duas regras, nesta ordem**, olhando a
coluna `Vendedor` da própria base:

**1. O cliente já é de um vendedor da equipe → fica com ele.** Nada é
redistribuído. A lista existe para você avisar o vendedor de que há um
cliente dele parado no mês: se um cliente de Rondônia está com o Diego, ele
continua com o Diego, e o Diego é quem recebe o aviso.

**2. O cliente está com vendedor de fora da equipe → passa para a equipe.**
Ninguém que não está na etapa 2 entra na publicação nem recebe link. Esses
clientes são divididos por rodízio entre os vendedores da equipe **daquele
estado**, com diferença máxima de 1 cliente, e a linha publicada passa a
trazer o nome do novo responsável — o nome do vendedor de outra equipe não
vai junto na lista.

Na tela, quem recebeu clientes pela regra 2 ganha uma etiqueta `+N de fora`
ao lado do nome, e o resumo diz quantos clientes mudaram de mão.

Se o cliente está com alguém de fora **e** você não tem vendedor cadastrado
naquele estado, não há para quem repassar: ele fica de fora e aparece no
relatório em "Estado sem ninguém da sua equipe". Cadastre alguém para o
estado e rode de novo, ou deixe como está — ele segue com quem já o atende.

Esta modalidade **atende o Brasil inteiro**, não só a Região Norte.

Nome com grafia diferente conta como da equipe: "CRISTIANE LUIS" e
"CRISTIANE LUIZ" são tratados como a mesma pessoa, e o cliente não sai da
mão dela por causa de uma letra. Toda dupla reconhecida assim aparece num
aviso acima do resultado, para você conferir se o palpite está certo.

Dois filtros aparecem quando você escolhe essa modalidade, ambos montados a
partir da base carregada, com a contagem de cada item:

- **Estados** — todos os que existem na base, com os do Norte primeiro.
- **Categorias** — já vem marcado quem ainda não comprou. Quem comprou fica
  de fora: nesta base, "Comprador neste Mês" e "Comprador Habitual".

O filtro de categorias sai dos rótulos que existem na base, não de uma lista
fixa. Se o BI mudar o nome de uma categoria, ela aparece aqui do mesmo jeito
e você decide se entra.

A coluna UF do resultado mostra o estado onde estão os clientes pendentes
daquele vendedor, não o estado em que ele é cadastrado. Quando há clientes em
mais de um estado, aparece o principal com um `+N` ao lado.

Linhas com a coluna `Vendedor` vazia não são repassadas: aparecem no
relatório em "Sem vendedor na base", para você corrigir na origem.

## Modo ataque

Na etapa 2, escolha **Ataque a um estado** e selecione a UF. A rodada
inteira foca ali:

- só os clientes daquele estado são distribuídos;
- com **envolver a equipe toda** marcado, todos os vendedores recebem uma
  fatia — 22 pessoas ligando para o mesmo estado, cada uma com uma lista
  curta o suficiente para vencer em poucos dias;
- os demais estados do Norte ficam de fora e voltam na próxima rodada
  normal.

Quando uma análise sugere um estado, o botão **Preparar ataque em XX** já
deixa a etapa 2 configurada.

## Enviar as carteiras por e-mail

Este app não envia e-mail — ele é um arquivo local no seu navegador, sem
servidor por trás, então não tem como disparar mensagem nenhuma. Quem faz
isso é a versão [`apps_script/`](../apps_script/), que roda dentro da sua
conta Google e tem acesso ao Gmail e ao Drive: lá, um botão distribui a base
e manda para cada vendedor o link da própria planilha.

Para não redigitar a equipe toda lá, use o botão **"Copiar equipe"** na
etapa 2: ele copia nome, UF e e-mail no formato da aba "Vendedores" do
Google Sheets. É só colar na célula A1 de lá.

## Publicar online e dar um link para cada vendedor (Netlify)

O site tem duas partes:

- **`/`** — o app do gestor, que você já conhece. Continua lendo a planilha
  dentro do navegador.
- **`/c/#…`** — a página do vendedor. Cada um recebe um endereço próprio,
  com um código secreto no fim, e vê **apenas a carteira dele**.

### Instalar (uma vez)

1. Em [netlify.com](https://netlify.com), **Add new site → Import an
   existing project** e conecte este repositório do GitHub.
2. Escolha a branch. O `netlify.toml` da raiz já define build, pasta
   publicada e funções — não precisa preencher nada.
3. Em **Site settings → Environment variables**, crie a variável
   **`ADMIN_TOKEN`** com uma senha forte, de sua escolha. É ela que autoriza
   publicar; sem ela ninguém consegue gravar carteira no site.
4. **Deploy**. Sai uma URL, que dá para trocar por um nome próprio em
   Site settings → Domain.

A partir daí, todo push na branch republica o site sozinho.

### Usar (toda rodada)

1. Abra a URL do site, carregue a base e rode a distribuição como sempre.
2. Na etapa 3, no painel **Links para a equipe**, digite a senha de
   publicação (fica guardada nesse navegador) e clique em **Publicar links**.
3. O app envia a lista de cada vendedor e devolve o link de cada um. Use
   **Copiar todos os links** para levar a lista inteira ao WhatsApp, ao
   e-mail ou a uma planilha.

O link de cada vendedor é **fixo**: nas rodadas seguintes continua o mesmo
endereço. Você manda uma vez e pronto.

### O link acumula uma lista de cada tipo

Cada link guarda até três listas vivas ao mesmo tempo:

| Tipo de rodada | Como aparece para o vendedor |
|---|---|
| Normal | Distribuição de carteira |
| Ataque a um estado | Ataque a PA (ou o estado escolhido) |
| Sem compras no mês | Sem compras no mês |

**Publicar substitui apenas a lista do mesmo tipo.** Se o vendedor recebeu
uma Distribuição em 17/08 e você publica um aviso de Sem compras em 20/08,
ele passa a ver as duas — a Distribuição continua ali, intacta. Só uma nova
Distribuição troca a Distribuição.

A lista mais recente aparece no topo, cada uma com sua data, sua contagem e
seus próprios botões de copiar e baixar. Quando o mesmo cliente cai em mais
de uma lista, ele leva uma etiqueta **"também em ..."** nas duas, e o topo da
página avisa quantos se repetem — assim o vendedor não liga duas vezes
achando que são casos diferentes.

### Você escolhe quem recebe, e nada é apagado sozinho

Antes de publicar, a etapa 3 mostra a lista de vendedores com caixas de
seleção. Já vêm marcados os que têm cliente na rodada; desmarque quem não
deve receber agora.

**Quem não está marcado não é tocado.** O link dele fica exatamente como
estava — mesma lista, mesma data. Isso importa porque a operação é estado a
estado: publicar a rodada do Tocantins não pode encostar no que os
vendedores do Pará já receberam.

Publicar **nunca remove** nada. Se um vendedor ficou sem cliente na base
nova, a lista antiga dele permanece; ele só deixa de ver aquela lista quando
você mandar apagar. A remoção acontece apenas pelo painel **Situação dos
links**.

### Situação dos links

Um painel na etapa 3 consulta o site e mostra o que **cada vendedor está
vendo agora**: quais listas tem, de que data e com quantos clientes. Sem
isso, a única forma de saber seria abrir os links um a um.

De lá saem as três ações:

- **Copiar link** do vendedor, para reenviar.
- **Apagar** uma lista específica — some só ela, as outras continuam.
- **Limpar tudo** — o vendedor passa a ver "nenhuma lista ativa". O link
  continua válido, então a próxima publicação volta a preenchê-lo.

As duas remoções pedem confirmação e não têm como desfazer.

### O que o vendedor vê

Nome dele, quantos clientes tem, a data da lista e a tabela com os dados de
contato. Telefone e e-mail são clicáveis, e há botões para copiar a lista ou
baixá-la em CSV (que abre no Excel). O link não pede senha nem cadastro:
abre direto.

### Segurança — o que esse desenho garante e o que não garante

**Garante:** cada código é sorteado com 192 bits de aleatoriedade, o que
torna a adivinhação inviável. A carteira fica guardada sob o código, não sob
o nome do vendedor, e não existe endereço no site que liste vendedores ou
carteiras — um código só alcança a própria lista. O código fica depois do
`#`, parte do endereço que o navegador nunca envia ao servidor, então ele
não aparece em log de acesso. Publicar exige a senha, comparada em tempo
constante.

**Não garante:** quem repassar o link dá acesso junto. É a natureza do link
secreto — foi a opção escolhida no lugar do login com senha. Se um link
vazar, dá para trocar o código daquele vendedor (veja abaixo).

**Uma mudança importante em relação a antes:** enquanto o app rodava só no
seu computador, nenhum dado de cliente saía dali. Ao publicar os links, a
lista de cada vendedor — com nome, telefone e e-mail dos integradores —
passa a ficar guardada no servidor do Netlify. Vale conferir se isso atende
à política da empresa antes de usar com a base real.

### Se um link vazar

Publique de novo com o campo `rotacionar` ligado para aquele vendedor: sai
um código novo e o antigo para de funcionar na hora. Hoje isso é feito pela
API (`POST /api/publicar` com `"rotacionar": true`); se virar rotina, vale
um botão na tela.

## Roteiro de ligação

Na página do vendedor, ao lado da lista, há um painel com o que falar ao
telefone. A lista fica à esquerda com rolagem própria; o roteiro fica numa
coluna à direita que acompanha a rolagem. Em tela estreita os dois empilham,
com o roteiro em cima.

O painel tem duas abas:

- **Como abrir** — seis aberturas de ligação, em dois conjuntos: prospecção
  (Distribuição e Ataque) e Sem compras no mês.
- **Se ele disser que…** — dezessete objeções agrupadas por tema, fechadas em
  sanfona, com um campo de busca. Digitar "frete", "concorrente" ou "margem"
  filtra na hora — é o que torna o painel utilizável durante uma ligação.

**Clicar num cliente da lista preenche a fala com os dados dele.** A abertura
passa a dizer a data da última compra, há quanto tempo está parado, a cidade
e o histórico de pedidos daquele integrador. Clicar no telefone também
seleciona, porque quem toca no número é justamente quem vai ligar.

O conjunto de aberturas segue o cliente: escolher alguém da lista de
Sem compras troca para as aberturas daquela modalidade.

Onde a base não tem o dado, aparece um rótulo cinza no lugar — "a data da
última compra", "o valor". **Nada é inventado**: um número errado dito ao
cliente custa mais caro que uma frase incompleta. Os trechos que dependem de
informação comercial que o programa não conhece (prazo de entrega por estado,
nome e ano do prêmio, condição do mês) também aparecem assim, para o vendedor
completar com o que for verdade.

## Editar o app

O arquivo publicado é gerado a partir de `src/`:

```
src/app_shell.html     estrutura e estilos (o vendedor reaproveita o <style>)
src/app_core.js        leitura de arquivos, regras, funil, análises
src/app_ui.js          ligação com a tela do gestor
src/carteira_body.html estrutura da página do vendedor
src/carteira.js        página do vendedor: lê o token e monta as listas
src/roteiro.js         conteúdo e comportamento do roteiro de ligação
src/fonts/             fontes embutidas no build
```

O build gera dois arquivos com o mesmo conteúdo:
`belenergy-distribuicao.html` (para baixar e abrir com dois cliques) e
`dist/index.html` (o que o Netlify publica).

Depois de mexer em qualquer um deles:

```bash
python3 app/build_app.py
```

`app/testes_por_estado.py` cobre o cenário real: base do PA, base do TO,
segunda rodada de cada uma — conferindo que cada estado é comparado com a
própria rodada anterior e que rodar um não afeta o outro.

`app/testes_historico.py` (precisa de Playwright) percorre o funil e o
histórico pelo navegador: gera bases com taxa de conversão conhecida, roda
várias rodadas em sequência e confere que a série por estado bate com o
que foi injetado, que a mesma base repetida é recusada e que bases sem
cliente em comum não produzem número nem entram no histórico.

Isso regenera `belenergy-distribuicao.html` com tudo embutido.
