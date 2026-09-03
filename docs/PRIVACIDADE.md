# Privacidade

> O vendedor precisa sentir que está competindo contra todo mundo.
> Ele nunca pode ver quanto cada colega fez.

Esta é uma regra estrutural, implementada no código e nas permissões — não uma
recomendação de interface.

## O que o vendedor vê

- os próprios pedidos e o próprio faturamento do dia;
- a própria posição (`7º de 22`);
- a própria evolução, projeção, ritmo e comparação com o dia anterior;
- as próprias conquistas e o próprio nível;
- **magnitudes anônimas**: *"faltam R$ 8.500 para avançar"*, *"estão a R$ 4.000
  de você"*;
- o **total agregado da equipe** — apenas somas e médias.

## O que o vendedor não vê, em nenhuma hipótese

- ranking nominal;
- posição de qualquer outra pessoa;
- faturamento ou pedidos de qualquer outra pessoa;
- qualquer comparação que identifique o desempenho de um colega.

Não existe tela, rota, parâmetro de URL ou chave de configuração que libere
isso. As capacidades correspondentes estão fixadas em `false` para o perfil de
vendedor em `src/core/access.js`.

## As três barreiras

**1ª — a fonte de dados.** `DataSource.fetchDay(date, scope)` recebe o escopo de
quem pediu. Um adaptador com servidor deve filtrar **no servidor**. Esta é a
única barreira que impede o dado de sair do backend.

**2ª — a montagem do painel.** `buildSellerView()` constrói o painel do vendedor
**por composição**, campo a campo, a partir apenas dos dados dele. Não existe um
objeto grande do qual se removem campos — os registros dos colegas nunca são
copiados para dentro do painel, nem em forma reduzida. O resultado é congelado
em profundidade.

**3ª — a varredura.** O objeto pronto é percorrido em busca de identificação de
terceiros. Se encontrar, **a tela não é renderizada** — aparece um aviso de
painel bloqueado.

A varredura procura só o que de fato identifica alguém: o nome completo de um
colega, o id dele, ou um termo exclusivo dele. Sobrenome compartilhado não conta:
numa equipe com *Leonardo Costa Oliveira* e *Erica Oliveira*, bloquear o painel
do primeiro porque a palavra "Oliveira" aparece no próprio nome dele seria um
alarme falso — e um alarme falso que derruba a tela é tão ruim quanto um
vazamento.

A mesma regra vale para as frases motivacionais: cada mensagem gerada é varrida
antes de ir para a tela.

## Agregado da equipe

O vendedor vê o total da equipe — nunca uma linha individual. Duas travas:

- some quando há menos de `privacy.minTeamSizeForAggregate` vendedores ativos
  (padrão 3): num grupo pequeno, uma soma revelaria o número individual de
  alguém;
- pode ser desligado por inteiro na configuração.

## Selagem da memória

Quando a fonte não sabe calcular o ranking, o dia inteiro precisa chegar ao
navegador para que a posição exista. Assim que o painel é montado, **os dados
brutos da equipe são descartados da memória** e só o view model permanece. A cada
atualização o ciclo se repete.

## O limite honesto desta versão

Enquanto não houver servidor:

1. **O link é a credencial.** Quem tiver o link do colega abre o painel do
   colega. O código pessoal fica no fragmento da URL (depois do `#`), que nunca é
   enviado ao servidor, e o arquivo público guarda apenas o hash — ninguém
   consegue montar o link de outra pessoa lendo o arquivo. Mas um link repassado
   é um acesso repassado.

2. **A resposta da rede trafega completa.** Se a origem entregar o dia inteiro,
   esses bytes chegaram ao navegador do vendedor antes de qualquer filtro. Nada
   disso aparece na tela e nada fica na memória depois da montagem — mas
   trafegou.

**Como isso se resolve:** o adaptador definitivo declara
`capabilities.scopedRanking = true` e implementa `fetchCompetitiveContext()`,
devolvendo ao vendedor apenas os próprios números mais a posição e as distâncias
já calculadas. Aí os números dos colegas nunca saem do servidor, e as barreiras 2
e 3 passam a ser redundância, não a defesa principal.

Ver [INTEGRACAO-DADOS.md](INTEGRACAO-DADOS.md).

## Testes que protegem estas regras

`node tests/run.js` falha se qualquer uma destas garantias quebrar:

- o painel do vendedor não contém nome nem faturamento de colega;
- a varredura derruba um painel contaminado;
- sobrenome compartilhado não gera alarme falso;
- o vendedor não recebe as capacidades restritas;
- o agregado some com equipe pequena;
- as mensagens nunca citam terceiros;
- o painel do vendedor é imutável.
