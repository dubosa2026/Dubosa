# Assistente Comercial — Distribuição de Clientes por UF

Pega a planilha que sua macro já exporta do BI, filtra os clientes ativos há
30 dias (não entram na distribuição) e divide o restante entre os vendedores
de acordo com o estado (UF) de cada um, o mais justo possível. Gera uma
planilha por vendedor, prontas para o Google Drive.

Existem três versões, com a mesma lógica de distribuição:

- **[`app/`](app/) — recomendada.** Um único arquivo HTML que você abre com
  dois cliques no navegador. Arrasta a planilha, confere a equipe e baixa as
  carteiras. Não instala nada, não envia nada para lugar nenhum: tudo roda
  dentro do seu navegador. É a única versão que traz o **funil de
  aproveitamento entre rodadas**, as **análises diárias** e o **modo
  ataque**. Veja [`app/README.md`](app/README.md).
- **[`apps_script/`](apps_script/)** — roda dentro do Google Sheets. É a
  única versão que **envia a carteira por e-mail**: um botão distribui a
  base, atualiza a planilha de cada vendedor no Drive e manda o link para o
  e-mail cadastrado. Use esta se o time recebe o trabalho por e-mail.
- **Este diretório (Python)** — linha de comando, para automatizar com
  agendador de tarefas e sincronizar com o Google Drive.

## Regras aplicadas

1. **Filtro de atividade**: linhas com `Categoria == "Ativo 30 dias"` são
   removidas antes de tudo. Só clientes inativos/dormentes (e demais
   categorias) entram na distribuição.
2. **UF mapeada com 2+ vendedores**: divisão o mais justa possível — por
   padrão, mesma **quantidade** de clientes para cada um (diferença máxima
   de 1 quando a conta não fecha certinho). Dá para balancear por **valor
   faturado** em vez de quantidade com `--metodo valor`.
3. **UF mapeada com apenas 1 vendedor**: todos os clientes daquela UF vão
   para ele (é o mesmo mecanismo do item 2, só que com uma lista de um).
4. **Sem UF preenchida na linha**: não é distribuído (fica numa aba separada
   para auditoria).
5. **UF "todas de uma vez"** (célula com `TODAS`, `NACIONAL`, `BR`, ou todas
   as UFs do mapeamento juntas, ex. `AC/AM/AP/PA/RO/RR/TO`): esse cliente é
   dividido **uma única vez** entre todos os vendedores, sem repetir por UF.
6. **Só a Região Norte é distribuída** (AC, AM, AP, PA, RO, RR, TO). Cliente
   de qualquer outro estado — SP, BA, MG, o que for — **nunca** é
   redistribuído: permanece com o vendedor que já o atende, conforme a
   coluna `Vendedor` da própria base. A regra é fixa no código: mesmo que
   alguém cadastre um vendedor para SP no CSV, aquele cliente continua fora
   da distribuição. Essas linhas ficam numa aba separada, para auditoria.

O mapeamento vendedor → UF está em [`config/vendedores.csv`](config/vendedores.csv),
já preenchido com os 22 vendedores do time. Se algum vendedor mudar de UF ou
entrar/sair do time, edite esse CSV — o resto do processo se ajusta sozinho.

## Instalação

```bash
pip install -r requirements.txt
```

## Uso local (sem Google Drive)

```bash
python -m sales_assistant.cli distribute \
  --input caminho/para/export_do_bi.xlsx \
  --output output/
```

Gera:
- `output/resumo_admin.xlsx` — visão do administrador: resumo por vendedor
  (quantidade e valor faturado) + abas de auditoria (distribuídos, sem UF,
  fora de escopo, excluídos por "Ativo 30 dias").
- `output/vendedores/<UF>/<Nome do Vendedor>.xlsx` — um arquivo por
  vendedor, já filtrado e pronto pra entregar.

Flags úteis:
- `--vendor-map` para usar outro CSV de mapeamento (padrão: `config/vendedores.csv`)
- `--metodo quantidade|valor` (padrão `quantidade`)
- `--active-label` se o texto da categoria mudar no BI (padrão `"Ativo 30 dias"`)

## Configurar o Google Drive (ambiente online)

A ideia: você (admin) fica dono de uma pasta no Drive; o script publica ali
um arquivo por vendedor, já convertido em Google Sheets nativo, e convida
cada vendedor por e-mail automaticamente — sem gastar armazenamento seu,
porque Google Sheets não conta na cota do Drive.

### Passo a passo (uma vez só)

1. **Criar um projeto no Google Cloud**: acesse
   [console.cloud.google.com](https://console.cloud.google.com), crie um
   projeto (pode ser gratuito, não precisa de cartão para isso).
2. **Ativar as APIs**: no projeto, ative "Google Drive API".
3. **Criar uma conta de serviço** (service account): *IAM e administrador →
   Contas de serviço → Criar conta de serviço*. Não precisa dar nenhum papel
   especial no projeto. Depois, na aba "Chaves", crie uma chave nova tipo
   **JSON** e baixe o arquivo (ex: `service_account.json`). Guarde esse
   arquivo num lugar seguro — **nunca** suba ele pro GitHub (o `.gitignore`
   deste projeto já bloqueia isso).
4. **Criar a pasta raiz no seu Google Drive** (a que você vai administrar) e
   compartilhá-la com o e-mail da conta de serviço (algo como
   `nome@projeto.iam.gserviceaccount.com`, está no JSON) com permissão de
   **Editor**. É assim que o script consegue criar/atualizar arquivos ali
   dentro usando SEU armazenamento gratuito, com você continuando como
   dono/administrador.
5. **Pegar o ID da pasta**: abra a pasta no navegador, copie o trecho da URL
   depois de `folders/` — é o `--drive-folder-id`.
6. **Preencher os e-mails** dos vendedores na coluna `Email` de
   `config/vendedores.csv` (o Google precisa do e-mail/conta Google de cada
   um pra convidar).

### Rodando

```bash
python -m sales_assistant.cli sync \
  --input caminho/para/export_do_bi.xlsx \
  --output output/ \
  --credentials service_account.json \
  --drive-folder-id ID_DA_PASTA_RAIZ
```

Isso gera os arquivos localmente (igual ao `distribute`) e depois:
- cria uma subpasta por UF dentro da pasta raiz (`AC/`, `AM/`, `AP/`, `PA/`,
  `RO/`, `RR/`, `TO/`);
- sobe (ou **atualiza**, se já existir) a planilha de cada vendedor como
  Google Sheets nativo;
- compartilha o arquivo com o e-mail do vendedor, mandando o convite por
  e-mail automaticamente (só na primeira vez — se ele já tem acesso, não
  reenvia convite);
- grava `output/log_sincronizacao_drive.csv` com o status de cada envio
  (convite enviado, já tinha acesso, ou sem e-mail cadastrado).

Como o arquivo é **atualizado** (não recriado) a cada rodada, o link que o
vendedor recebeu continua o mesmo sempre — ele não precisa aceitar convite
de novo nas próximas exportações, só abre o mesmo Google Sheets e os dados
já estão atualizados.

### Controle visual de quem acessou

Isso já vem pronto no próprio Google Drive, não precisa construir nada
extra:
- Em cada pasta/arquivo, clique nos **três pontinhos → Gerenciar acesso**
  para ver quem tem acesso e o papel de cada um.
- Clique em **"i" (Detalhes) → aba Atividade** para ver quando cada pessoa
  abriu/editou o arquivo.
- Enquanto alguém está com o arquivo aberto, o avatar dela aparece no canto
  superior direito em tempo real.

Como admin (dono da pasta), você vê tudo isso de qualquer arquivo dentro
dela.

### Repetindo o processo (nova exportação do BI)

Toda vez que você exportar uma base nova com a macro, é só rodar o mesmo
comando `sync` de novo apontando pro novo arquivo — ele refaz a divisão do
zero (contando com a base mais recente) e atualiza os Google Sheets de cada
vendedor automaticamente. Para automatizar isso sem precisar digitar o
comando toda vez, dá pra agendar (ex. Agendador de Tarefas do Windows, cron
no Linux/Mac, ou um gatilho de tempo no Google Apps Script) — me avise se
quiser que eu monte isso.

## Estrutura do projeto

```
config/vendedores.csv       mapeamento vendedor -> UF -> e-mail (editável)
sales_assistant/
  distribute.py              regras de negócio (filtro + divisão justa)
  io_utils.py                gera planilha do admin + uma por vendedor
  drive_sync.py               publica/atualiza/compartilha no Google Drive
  cli.py                       comandos `distribute` e `sync`
tests/test_distribute.py     testes automatizados das regras de divisão
```

## Rodando os testes

```bash
pip install pytest
python -m pytest tests/ -q
```

## Observações / pontos para você validar

- A base que você mandou como exemplo (`data_2.xlsx`) tem clientes de todo
  o Brasil, mas a foto só cobre as 7 UFs da região Norte (AC, AM, AP, PA,
  RO, RR, TO). O script só redistribui essas 7 UFs; as demais (SP, BA, MG…)
  ficam de fora, intocadas, na aba "Fora do escopo" do resumo do admin —
  confirme se é isso mesmo que você quer, ou se outras UFs/vendedores também
  devem entrar no mapeamento.
- A divisão "mais justa possível" hoje equilibra **quantidade de clientes**
  por padrão. Se preferir equilibrar por faturamento, use
  `--metodo valor` (ou eu troco o padrão, é só falar).
- Reexecutar com uma base nova recalcula a divisão do zero — um cliente pode
  trocar de vendedor entre uma exportação e outra se isso deixar a divisão
  mais equilibrada. Se você preferir manter o mesmo vendedor pra um cliente
  que ele já vem atendendo (só rebalanceando os clientes novos), dá pra
  adicionar essa regra depois — hoje não está implementada.

---

## Também neste repositório

**[`treino/`](treino/) — Circuito, treino funcional de bolso.** Nada a ver
com distribuição de carteira: é outro app de arquivo único, no mesmo
formato desta pasta `app/`. Você diz quanto tempo tem e o que tem em casa,
ele monta o circuito e conduz o treino com cronômetro. Veja
[`treino/README.md`](treino/README.md).
