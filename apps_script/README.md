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
   - Isso cria duas abas na sua planilha: **"Vendedores"** (já com os 24
     nomes e UFs da sua foto) e **"Base BI"** (com o cabeçalho certo,
     esperando os dados).

7. **Habilite o serviço que envia o e-mail de convite** (uma vez só): no
   editor do Apps Script, no menu à esquerda clique no ícone **"+" ao lado
   de Serviços**, procure **"Drive API"** e clique em **Adicionar**.
   (Sem isso, o arquivo é criado e compartilhado normalmente, mas o
   vendedor não recebe o e-mail avisando.)

8. Na aba **"Vendedores"**, preencha a coluna **Email** com o e-mail (conta
   Google) de cada vendedor. É esse e-mail que vai receber o convite pro
   arquivo dele.

## Testar antes de cadastrar os vendedores de verdade

Antes de colocar o e-mail real de cada vendedor, teste com o seu próprio
e-mail (ou de um Gmail pessoal seu):

1. Na aba **"Vendedores"**, preencha a coluna **Email** de **um** vendedor
   qualquer com o seu próprio e-mail Google.
2. Rode **Assistente Comercial → "2) Distribuir agora"** (precisa já ter
   dados na aba "Base BI" — se já rodou antes, pode rodar de novo).
3. Confira sua caixa de entrada: deve chegar um e-mail do Google Drive tipo
   "fulano compartilhou uma planilha com você", com o nome do vendedor.
4. Se não chegar nada, confira se o passo 7 acima (habilitar "Drive API")
   foi feito — sem isso o convite não é enviado.
5. Depois do teste, apague esse e-mail de teste e coloque o e-mail
   verdadeiro do vendedor.

## Uso (toda vez que exportar uma base nova do BI)

1. Rode sua macro normalmente e abra o arquivo exportado no Excel (ou no
   próprio Google Sheets, se preferir).
2. Na planilha painel, clique em **Assistente Comercial → "2) Limpar Base
   BI (antes de colar nova base)"**. **Isso é importante**: se você só colar
   por cima sem limpar, e a base nova tiver menos linhas que a anterior,
   sobra lixo da base antiga nas linhas de baixo e o script conta esse lixo
   como se fosse cliente da rodada atual.
3. **Selecione todos os dados** da base exportada (incluindo o cabeçalho) e
   copie (Ctrl+C).
4. Na aba **"Base BI"**, clique na célula **A1** e cole (Ctrl+V).
5. Clique em **Assistente Comercial → "3) Distribuir agora"**.
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

## Se algo der errado

- **"A aba Base BI está vazia"**: você ainda não colou os dados exportados,
  ou colou fora da célula A1.
- **Vendedor aparece na mensagem final como "sem e-mail cadastrado"**: o
  arquivo dele foi criado normalmente na pasta, só não foi compartilhado —
  preencha o e-mail na aba "Vendedores" e rode de novo.
- Quer atualizar a lista de vendedores/UFs depois (alguém saiu, mudou de
  estado)? Edite direto na aba **"Vendedores"** — não precisa rodar a
  "Configuração inicial" de novo, só a distribuição.
