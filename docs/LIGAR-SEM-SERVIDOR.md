# Ligar de graça, sem servidor

O aplicativo lê o sistema de pedidos sozinho usando **só o GitHub** — sem conta
nova, sem Netlify, sem custo.

## Como funciona

Uma rotina do GitHub roda a cada 10 minutos, entra no sistema de pedidos com o
PIN, lê os números e grava o arquivo do dia no próprio repositório. O aplicativo
de cada vendedor lê esse arquivo.

A coleta acontece **uma vez por rodada, não uma vez por vendedor**: vinte e dois
aplicativos abertos o dia inteiro leem o mesmo arquivo pronto e não geram
chamada nenhuma. Por isso não há limite a estourar nem conta a pagar.

## Ligar — dois passos

### 1. Guardar o PIN

No repositório: **Settings → Secrets and variables → Actions →
New repository secret**

| campo | valor |
|-------|-------|
| Name | `PEDIDOS_PIN` |
| Secret | o PIN de acesso ao sistema de pedidos |

O PIN fica guardado pelo GitHub. Ele não aparece no código, no histórico nem no
registro de execução.

### 2. Publicar o aplicativo

**Settings → Pages → Source: Deploy from a branch → branch
`claude/sales-competition-app-t0sv4b` → pasta `/ (root)` → Save.**

Pronto. A primeira coleta acontece na rodada seguinte; para não esperar, vá em
**Actions → Coletar produção → Run workflow**.

## O que isto expõe

O arquivo do dia fica dentro do repositório. **Se o repositório for público,
quem souber o endereço lê os nomes e as quantidades da equipe.**

A privacidade que o aplicativo garante — um vendedor não ver o outro — continua
valendo dentro dele: o painel do vendedor não monta o ranking nominal em
hipótese nenhuma. Mas o arquivo bruto é outra coisa.

Se o número não pode sair da empresa, a leitura precisa acontecer atrás de um
servidor. Aí valem os caminhos de [INTEGRACAO-DADOS.md](INTEGRACAO-DADOS.md):
Netlify (a empresa já usa — o próprio sistema de pedidos está lá) ou Cloudflare
Workers, ambos com plano gratuito.

## Quando alguma coisa não funcionar

**Actions → Coletar produção** mostra cada execução e o motivo da falha:

| mensagem | o que fazer |
|----------|-------------|
| `PEDIDOS_PIN não configurado` | falta o passo 1 |
| `PIN recusado pelo sistema de pedidos` | o PIN mudou |
| `O sistema de pedidos respondeu 404` | ainda não houve leitura no dia |
| `Nenhum vendedor na resposta` | ninguém produziu ainda |

A rotina nunca apaga o que já foi coletado: se uma rodada falha, o placar segue
mostrando a última leitura boa em vez de esvaziar.
