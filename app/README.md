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
   rodada: normal, ataque a um estado ou mutirão. O botão **"Copiar equipe"**
   exporta a lista no formato da versão Google Sheets.
3. **Distribuição** — a carteira de cada vendedor, com quantidade e valor.
   Baixe tudo de uma vez em `.xlsx`, ou copie a carteira de um vendedor
   específico para colar no WhatsApp/e-mail.
4. **Desempenho** — o funil de aproveitamento e as análises do dia.

## Regras de distribuição

1. Cliente com `Categoria = "Ativo 30 dias"` não entra: já comprou faz pouco
   tempo, não é alvo de prospecção.
2. **Só a Região Norte é distribuída** — AC, AM, AP, PA, RO, RR e TO.
   Cliente de qualquer outro estado nunca é redistribuído: continua com o
   vendedor que já o atende na base. A regra é fixa; não depende de quem
   está cadastrado na etapa 2.
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

A etapa 4 mostra:

- taxa de aproveitamento geral, quantos clientes voltaram a comprar e quanto
  isso representa em faturamento;
- ranking por vendedor: reativados / carteira anterior, taxa e valor;
- o mesmo recorte por estado, para comparar regiões.

Na primeira vez que você usa o app não há com o que comparar — a etapa 4
avisa isso e guarda a rodada como referência. O funil aparece a partir da
segunda base carregada.

O ponto de comparação é sempre a última rodada distribuída. Se você
distribuir duas vezes a mesma base, o funil acusa zero conversões (correto:
nada mudou entre uma leitura e outra).

Rodada normal e mutirão saem de bases diferentes, com categorias diferentes.
Comparar uma com a outra daria um número sem significado, então nesse caso o
funil não é calculado e a etapa 4 explica o motivo — a rodada vira a nova
referência e o aproveitamento volta quando você repetir o mesmo tipo.

## Análises do dia

Abaixo do funil, o app lê os próprios números e escreve o que está
acontecendo e o que fazer a respeito: quem se destacou, quem está com
carteira cheia e nenhuma conversão, qual estado converte melhor, onde está o
dinheiro parado, se a carga entre UFs ficou desigual, qual estado vale
atacar e o que precisa ser corrigido na origem dos dados.

Cada análise vem com uma ação sugerida. O botão **Copiar para a equipe**
joga tudo em texto, pronto para colar no grupo.

As análises são recalculadas a cada rodada — carregue a base atualizada e a
leitura do dia vem junto.

## Sem compras no mês (mutirão)

A terceira modalidade da etapa 2, para a base mensal — a que usa
"Sem Compras este Mês", "Comprador neste Mês" e "Comprador Habitual" em vez
de "Ativo 30 dias" / "Inativo".

Ela junta num bolo só os clientes parados dos estados escolhidos e reparte
entre a **equipe inteira**, ignorando a UF de cada vendedor: um cliente do
Pará pode cair para alguém de Rondônia. É essa a intenção — quando um estado
acumula clientes parados, a equipe toda ajuda a limpar a fila, não só quem
mora naquele estado.

Dois filtros aparecem quando você escolhe essa modalidade, ambos montados a
partir da base que você carregou (com a contagem de cada item):

- **Estados** — marque os que entram na rodada. Só o Norte é oferecido.
- **Categorias** — vem marcado quem ainda não comprou. Quem já comprou fica
  de fora automaticamente: nesta base, "Comprador neste Mês" e "Comprador
  Habitual".

O filtro de categorias é montado a partir dos rótulos que existem na base,
não de uma lista fixa. Se o BI mudar o nome de uma categoria, ela aparece
aqui do mesmo jeito e você decide se entra ou não.

Na etapa 3, a coluna UF é a **do vendedor**, não a do cliente — os clientes
da rodada são todos dos estados que você marcou.

## Modo ataque

Na etapa 2, escolha **Ataque a um estado** e selecione a UF. A rodada
inteira foca ali:

- só os clientes daquele estado são distribuídos;
- com **envolver a equipe toda** marcado, todos os vendedores recebem uma
  fatia — 22 pessoas ligando para o mesmo estado, cada uma com uma lista
  curta o suficiente para vencer em poucos dias;
- as outras UFs do Norte ficam retidas e voltam na próxima rodada normal.

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

## Editar o app

O arquivo publicado é gerado a partir de `src/`:

```
src/app_shell.html   estrutura e estilos
src/app_core.js      leitura de arquivos, regras, funil, análises
src/app_ui.js        ligação com a tela
src/fonts/           fontes embutidas no build
```

Depois de mexer em qualquer um deles:

```bash
python3 app/build_app.py
```

Isso regenera `belenergy-distribuicao.html` com tudo embutido.
