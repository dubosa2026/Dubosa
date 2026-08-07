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
   rodada (normal ou ataque). O botão **"Copiar equipe"** exporta a lista no
   formato da versão Google Sheets.
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
