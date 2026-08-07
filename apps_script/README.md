# Assistente Comercial — versão Google Apps Script (sem instalar nada)

Feita para quem não pode baixar/instalar programas no computador da empresa.
Tudo roda dentro do navegador, usando o Google Sheets que você já tem acesso.
Não precisa de Python, Git, PowerShell nem Terminal.

## Passo a passo (primeira vez)

1. **Crie uma planilha nova no Google Sheets** — essa vai ser sua "planilha
   painel", onde você administra tudo. Em [sheets.google.com](https://sheets.google.com),
   clique em **Planilha em branco**. Dê um nome como "Painel Comercial".

2. **Abra o editor de scripts**: no menu da planilha, vá em
   **Extensões → Apps Script**. Vai abrir uma aba nova no navegador (ainda é
   Google, nada é baixado no seu PC).

3. **Apague o código de exemplo** que já vem lá (tudo que estiver escrito) e
   **cole o conteúdo do arquivo [`Codigo.gs`](Codigo.gs)** deste projeto no
   lugar. (Se você não tiver acesso a este repositório pelo navegador, peça
   que eu te mande o código direto na conversa para copiar e colar.)

4. Clique no ícone de **disquete (Salvar)** no topo do editor.

5. **Volte para a aba da planilha** (Google Sheets) e **atualize a página**
   (F5). Vai aparecer um novo menu no topo chamado **"Assistente Comercial"**.

6. Clique em **Assistente Comercial → "1) Configurar planilha (rodar uma
   vez)"**.
   - Na primeira vez, o Google vai pedir autorização (é o Google confirmando
     que é você mesmo permitindo o script mexer na sua própria planilha e
     Drive — clique em **Revisar permissões**, escolha sua conta, e depois
     **Avançado → Acessar [nome do projeto] (não seguro)** — isso aparece
     porque o script não foi publicado na loja do Google, mas ele só acessa
     a *sua própria* conta, com a *sua* autorização, nada é enviado pra
     fora). Clique em **Permitir**.
   - Isso cria duas abas na sua planilha: **"Vendedores"** (já com os 22
     nomes e UFs do time) e **"Base BI"** (com o cabeçalho certo, esperando
     os dados).

7. Na aba **"Vendedores"**, preencha a coluna **Email** com o e-mail (conta
   Google) de cada vendedor. É esse e-mail que recebe a planilha.

   Se você já cadastrou a equipe no app HTML (`app/`), não precisa
   redigitar: lá na etapa 2 existe o botão **"Copiar equipe"**. Clique nele,
   volte aqui, clique na célula **A1** da aba "Vendedores" e cole — nome, UF
   e e-mail entram já nas colunas certas.

## Testar antes de mandar para a equipe

Antes de colocar o e-mail real de cada vendedor, faça um ensaio com o seu
próprio e-mail:

1. Na aba **"Vendedores"**, apague os e-mails de todos e deixe **só um**
   vendedor preenchido, com o **seu** e-mail.
2. Cole uma base na aba "Base BI" e rode **Assistente Comercial → "4)
   Distribuir e enviar por e-mail"**.
3. A confirmação vai dizer "Enviar 1 e-mail?" e listar quem ficou de fora.
   Confirme.
4. Confira sua caixa de entrada: deve chegar "Sua carteira de prospecção",
   com a quantidade de clientes e um botão que abre a planilha.
5. Gostou do resultado? Preencha os e-mails verdadeiros e rode de novo.

Enquanto a coluna Email estiver vazia, ninguém recebe nada — o script avisa
quem ficou sem e-mail e segue em frente.

## Uso (toda vez que exportar uma base nova do BI)

1. Rode sua macro normalmente e abra o arquivo exportado no Excel (ou no
   próprio Google Sheets, se preferir).
2. Na planilha painel, clique em **Assistente Comercial → "2) Limpar Base
   BI (antes de colar nova base)"**. **Isso é importante e sempre
   obrigatório**: esse passo apaga a aba inteira, cabeçalho incluso. Sem
   isso, ou sobra lixo de linhas antigas (se a base nova tiver menos linhas
   que a anterior), ou o cabeçalho antigo fica desencontrado das colunas da
   base nova (se o número/ordem de colunas mudar) — as duas coisas fazem os
   dados saírem errados ou fora de ordem.
3. **Selecione todos os dados** da base exportada, **incluindo a linha de
   cabeçalho**, e copie (Ctrl+C).
4. Na aba **"Base BI"**, clique na célula **A1** e cole (Ctrl+V) — o
   cabeçalho da sua exportação vai para a linha 1.
5. Clique em **Assistente Comercial → "4) Distribuir e enviar por
   e-mail"** — é o botão que faz tudo: distribui, atualiza a planilha de
   cada vendedor no Drive e manda o link para o e-mail cadastrado. (Se
   quiser só distribuir e conferir antes de enviar, use "3) Distribuir agora
   (sem enviar)".)
6. Pronto. Uma mensagem mostra quantos clientes foram distribuídos, quantos
   ficaram sem UF, fora de escopo, ou excluídos por "Ativo 30 dias". Os
   detalhes ficam nas abas **Resumo**, **Distribuído**, **Sem UF**, **Fora
   de Escopo** e **Excluídos (Ativo 30 dias)**, dentro da própria planilha
   painel — essas abas sempre mostram só a **última** rodada (são
   substituídas a cada execução).

O script também cria, dentro do seu Google Drive, uma pasta chamada
**"Distribuição Comercial - Vendedores"**, com uma subpasta por UF (AC, AM,
AP, PA, RO, RR, TO) e, dentro de cada uma, uma planilha por vendedor — essa
é a planilha que fica compartilhada com o e-mail dele. Nas próximas rodadas,
o mesmo arquivo é **atualizado** (não recriado), então o vendedor não
precisa aceitar convite de novo — só abre o link que já tem.

## Envio por e-mail

**"4) Distribuir e enviar por e-mail"** faz a rodada inteira num clique:
distribui a base, atualiza a planilha de cada vendedor no Drive e envia para
o e-mail cadastrado na aba "Vendedores" uma mensagem com a quantidade de
clientes, o valor de histórico da carteira e um botão que abre a planilha.

Antes de disparar, aparece uma confirmação dizendo quantos e-mails serão
enviados e **quem vai ficar de fora, com o motivo** — sem e-mail cadastrado,
e-mail inválido ou nenhum cliente naquela rodada. Nada é enviado até você
confirmar. E-mail enviado não volta atrás, então vale ler essa tela.

**"5) Reenviar e-mails da última distribuição"** manda de novo sem
redistribuir nada — útil quando alguém apagou a mensagem, quando você
corrigiu um e-mail errado na aba "Vendedores", ou quando quer avisar a
equipe outra vez sem mexer nas carteiras.

Cada envio fica registrado na aba **"Envios"** (data/hora, vendedor,
e-mail, quantidade, valor, link e status). Essa aba nunca é apagada: é o
comprovante de o que foi mandado, para quem e quando — inclusive as falhas,
com o motivo.

Dois limites que valem conhecer:

- **Cota do Gmail.** Uma conta comum envia cerca de 100 e-mails por dia; uma
  conta Workspace, bem mais. Com 22 vendedores isso não chega perto do
  limite, mas se você reenviar muitas vezes no mesmo dia o script avisa
  antes e não envia pela metade.
- **Acesso à planilha.** O vendedor recebe acesso de edição ao arquivo dele
  automaticamente na primeira rodada. Se ele não conseguir abrir, confira se
  o e-mail cadastrado é mesmo uma conta Google.

## Histórico (comparar rodadas ao longo do tempo)

Diferente das abas acima, a aba **"Histórico"** nunca é apagada: a cada vez
que você roda "3) Distribuir agora", uma linha é acrescentada por vendedor
(Data/Hora, Vendedor, UF, Qtde. Clientes, Valor Faturado Total). Com isso dá
pra ver a evolução — por exemplo, filtrando ou montando uma tabela dinâmica
por vendedor para acompanhar se a carteira dele está crescendo/diminuindo ao
longo das exportações.

## Controle de quem acessou

Isso já é nativo do Google Drive/Sheets, sem precisar de nada extra:
- Clique nos **três pontinhos do arquivo → Gerenciar acesso** para ver quem
  tem acesso.
- Clique no ícone **"i" (Detalhes) → aba Atividade** para ver quando cada
  pessoa abriu/editou.

## Sobre as colunas da Base BI

O script **não** presume quais colunas existem — ele lê a linha 1 da aba
"Base BI" exatamente como ela estiver (mesmo nome, mesma ordem, maiúsculas
ou minúsculas tanto faz) e usa isso para montar as abas de resultado e os
arquivos dos vendedores. Então funciona com qualquer conjunto de colunas
que seu BI exportar (incluindo colunas extras como CNPJ), desde que exista:
- Uma coluna com o estado do cliente chamada **"UF"** (maiúsc./minúsc. não
  importa).
- Uma coluna com a categoria de atividade chamada **"Categoria"**
  (maiúsc./minúsc. não importa — é nela que o filtro "Ativo 30 dias"
  procura).

Se nenhuma coluna com esses nomes for encontrada, a distribuição para
com um aviso de erro dizendo quais colunas foram identificadas, em vez de
rodar com o filtro quebrado silenciosamente.

## Se algo der errado

- **"A aba Base BI está vazia"**: você ainda não colou os dados exportados
  (com cabeçalho) a partir da célula A1.
- **Vendedor aparece como "sem e-mail cadastrado"**: o arquivo dele foi
  criado normalmente na pasta, só não foi compartilhado nem enviado —
  preencha o e-mail na aba "Vendedores" e use "5) Reenviar e-mails da última
  distribuição".
- **"Planilha não encontrada no Drive"** no resultado do envio: alguém
  apagou ou renomeou o arquivo daquele vendedor. Rode "4) Distribuir e
  enviar por e-mail" — o arquivo é recriado e o envio segue.
- **O vendedor diz que não recebeu**: confira a aba "Envios" (mostra data,
  hora e status de cada tentativa) e peça para ele olhar o spam. Se o status
  estiver "Enviado", o Gmail aceitou a mensagem.
- **Os dados saem faltando coluna ou fora de ordem**: confira se colou a
  base a partir da célula **A1** (incluindo a linha de cabeçalho) — o
  script usa esse cabeçalho para saber onde está cada coluna.
- Quer atualizar a lista de vendedores/UFs depois (alguém saiu, mudou de
  estado)? Edite direto na aba **"Vendedores"** — não precisa rodar a
  "Configuração inicial" de novo, só a distribuição.
