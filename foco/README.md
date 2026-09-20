# FOCO — Gestão do Tempo Comercial

> «O FOCO não existe para vigiar o vendedor. Existe para identificar o que está
> tirando tempo dele e permitir que o gestor elimine esses obstáculos.»

O FOCO é uma **camada gerencial de gestão do tempo, das interrupções e dos
problemas da equipe**. Não é CRM. Não gerencia pedidos, cotações, prospecção,
metas, ranking ou vendas — esses sistemas continuam existindo separadamente.

As perguntas que ele existe para responder:

- Onde o tempo da equipe está sendo gasto?
- Quanto tempo está sendo consumido por problemas operacionais?
- Quais áreas internas estão gerando mais interrupções?
- Quais vendedores estão sendo mais impactados?
- Quais problemas estão se repetindo?
- Quanto tempo poderia ser recuperado?
- **Onde o gerente precisa atuar hoje?**

## A regra que governa todo o sistema

Nenhum número aparece sem dizer de onde veio. O FOCO separa três origens e
**nunca as mistura**:

| Origem | O que é | Exemplo |
|---|---|---|
| **DECLARADO** | Autodeclaração do vendedor pelo cronômetro | `4h declaradas como Comercial` |
| **IDENTIFICADO** | Evento capturado por integração autorizada | `7 e-mails relacionados a Financeiro` |
| **ESTIMADO** | Inferência do sistema, com método explícito | `58 min potencialmente recuperáveis` |

Um cronômetro que ficou quatro horas em "Comercial" produz *«4h declaradas
como Comercial»*, nunca *«4h comprovadamente produtivas»*. Essa distinção é o
que separa uma ferramenta de gestão de uma ferramenta de vigilância — e é o
que faz o painel ser confiável.

Isso não é convenção de interface: está no tipo. Toda função do núcleo que
produz um número devolve uma `Medida`, que carrega `origem` e `base`. Tentar
somar tempo declarado com estimativa **lança um erro** (`somarMesmaOrigem`),
e há teste garantindo isso.

## Arquitetura

```
foco/
├── packages/core        → regras de negócio + persistência (TypeScript, 68 testes)
├── apps/vendedor         → FOCO.exe — cronômetro e registro de problemas
└── apps/gerente          → FOCO_Gerenciador.exe — painel, equipe, visão individual
```

### `packages/core` — o núcleo

- **`provenance.ts`** — o modelo de origem descrito acima. É a espinha do sistema.
- **`timeTracking.ts`** — tempo declarado por categoria, percentual e contagem de
  **interrupções** (trocas de comercial para operacional). `PAUSA` fica fora da
  base do percentual de propósito: o FOCO não cobra pausa de ninguém.
- **`problems.ts`** — ciclo de vida completo (máquina de estados validada),
  tempo de resolução, impacto no vendedor e **agrupamento de recorrentes**.
- **`evidence.ts`** — o **Motor de Evidências**: consolida tempo declarado,
  eventos identificados e problemas registrados numa visão única em que cada
  bloco continua sabendo de onde veio. Ele deliberadamente **não converte
  evento em tempo**.
- **`classifier.ts`** — classificação de problemas e **triagem de relevância**
  de eventos (newsletter é descartada; cópia sem ação é rebaixada). Regras por
  padrão; modelo de linguagem quando houver chave, com fallback automático.
- **`alerts.ts`** — alertas 🔴🟠🟢 com limiares configuráveis. Cada alerta
  carrega origem e evidência.
- **`insights.ts`** — leitura gerencial: área que mais interrompe, padrões
  recorrentes, quem está absorvendo operação acima da média, subnotificação.
  Todo insight vem com as evidências que o sustentam.
- **`integrations/`** — portas para e-mail e WhatsApp (ver abaixo).
- **`db/`** — schema, repositórios e seed de demonstração.

### Categorias do cronômetro

`Comercial` · `Atendimento a cliente` · `Problema operacional` · `Reunião` ·
`Administrativo` · `Pausa`

O vendedor inicia, troca e para quando quiser. Toda alteração de categoria fica
registrada para auditoria — um histórico que pode ser editado sem deixar
rastro não serve para gestão nenhuma.

### Ciclo de vida do problema

`Novo` → `Em análise` → `Encaminhado` → `Aguardando área` / `Aguardando
vendedor` → `Resolvido` · `Cancelado`

Transições inválidas são recusadas pelo domínio. Um problema resolvido pode
voltar para análise: na prática problemas operacionais reabrem, e esconder
isso falsearia o indicador de recorrência.

## Integrações

O FOCO precisa funcionar mesmo sem registro manual — mas a V1 também precisa
funcionar **sem nenhuma integração conectada**. Por isso elas entram como
portas (`FonteEventos`), e o núcleo conhece apenas a interface.

### E-mail corporativo (Thunderbird / POP)

A empresa usa POP, não IMAP. Isso tem uma consequência que não dá para
contornar: as mensagens são baixadas para o notebook e apagadas do servidor,
então **não existe caixa central para a API consultar**. Qualquer desenho que
assuma "o servidor lê a caixa de todo mundo" está errado neste ambiente.

Por isso a leitura acontece num **Agente FOCO local**, instalado no notebook,
que lê o índice do perfil do Thunderbird, extrai **somente metadados** (data,
remetente, assunto), classifica a relevância localmente e envia à API central
apenas o evento já reduzido. O corpo da mensagem nunca sai da máquina.

### WhatsApp corporativo

Somente por **API oficial** (WhatsApp Business Platform) ou pela plataforma de
atendimento que a empresa já use. O FOCO não automatiza o WhatsApp Web, não lê
banco de aplicativo e não instala nada em celular — além de violar os termos
da plataforma, seria vigilância. Nunca entra número pessoal nem conteúdo de
conversa: só que houve contato, sobre que assunto, com que relevância.

## Privacidade — o que o sistema nunca faz

Sem captura de tela, sem keylogger, sem monitoramento oculto, sem WhatsApp
pessoal, sem gravação não autorizada. O FOCO mede **atividades do processo
comercial dentro do próprio aplicativo** e eventos de canais corporativos
autorizados. Nada mais.

## Como rodar

Pré-requisitos: Node.js 20+ e npm. Em Windows, também as ferramentas de build
nativas do Node (necessárias apenas para compilar o `better-sqlite3`).

```bash
cd foco
npm install
npm run build:core     # os apps dependem do dist/
npm test               # 68 testes do núcleo

npm run dev:vendedor   # FOCO.exe em modo desenvolvimento
npm run dev:gerente    # FOCO_Gerenciador.exe em modo desenvolvimento
```

Contas de demonstração (senha `foco123`): `vendedor1@foco.local` …
`vendedor10@foco.local` e `gerente@foco.local`.

Para os dois apps enxergarem a mesma base num posto de demonstração, aponte
`FOCO_DB_PATH` para o mesmo arquivo.

## Instalador Windows

```bash
npm run dist:vendedor   # release/FOCO Setup <versão>.exe
npm run dist:gerente    # release/FOCO Gerenciador Setup <versão>.exe
```

O `electron-builder` recompila os módulos nativos para o Electron antes de
empacotar. Isso exige acesso à internet na primeira vez (para baixar os
headers do Electron) — funciona normalmente em qualquer máquina de
desenvolvimento ou runner de CI.

## Próximos passos

1. **PWA + API central** — o gerente precisa abrir no celular. O núcleo já
   está isolado da UI e da persistência, então o caminho é publicar os
   repositórios atrás de uma API e servir o renderer como PWA instalável,
   mantendo o Electron como host no notebook do vendedor.
2. **PostgreSQL** no lugar do SQLite por máquina — mesmo schema relacional,
   mesmos tipos (IDs em texto, timestamps ISO 8601).
3. **Agente local do Thunderbird** — implementar `LeitorCaixaLocal` lendo o
   perfil real e enviando eventos reduzidos à API.
4. **WhatsApp oficial** — implementar `ProvedorWhatsApp` sobre a API contratada.
5. **IA em produção** — `ClassificadorIA` já está pronto atrás da interface;
   falta configurar a chave e calibrar os prompts com histórico real.
6. **Notificações** ao gerente fora do painel, respeitando a configuração de
   alertas.
