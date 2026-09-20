# FOCO — Gestão do Tempo Comercial

> «Cada minuto do vendedor deve estar o mais próximo possível de uma atividade
> que gere venda.»

O FOCO não é um CRM. É uma camada de proteção do tempo comercial: antes de uma
tarefa consumir tempo do vendedor, o sistema pergunta **"isso realmente
precisa ser feito por ele?"** — e direciona para o integrador (autonomia),
para a área interna responsável (operação) ou mantém com o vendedor
(comercial de verdade: prospecção, negociação, fechamento).

Esta é a **V1**: dois aplicativos desktop (vendedor e gerente), rodando
localmente no Windows, com todo o núcleo de regras de negócio isolado e
testado — pronto para, na V2, trocar o armazenamento local por uma API
central sem reescrever a lógica.

## Sumário

- [Arquitetura](#arquitetura)
- [O que a V1 entrega](#o-que-a-v1-entrega)
- [Como rodar em desenvolvimento](#como-rodar-em-desenvolvimento)
- [Como gerar o instalador Windows](#como-gerar-o-instalador-windows)
- [Contas de demonstração](#contas-de-demonstração)
- [Roadmap V2](#roadmap-v2--central-multiusuário-e-integrado)
- [Estrutura de pastas](#estrutura-de-pastas)

## Arquitetura

```
foco/
├── packages/core        → regras de negócio + persistência (TypeScript puro, testado)
├── apps/vendedor         → FOCO.exe (Electron + React)
└── apps/gerente          → FOCO_Gerenciador.exe (Electron + React)
```

### `packages/core` — o núcleo

Todo o comportamento que importa mora aqui, sem nenhuma dependência de
Electron ou UI, para poder ser testado isoladamente e reaproveitado por uma
futura API central:

- **`focoIndex.ts`** — cálculo do Índice de Foco Comercial (tempo em
  atividades comerciais ÷ tempo total registrado).
- **`classifier.ts`** — classificação de problemas (categoria, prioridade,
  área responsável). A V1 usa um classificador por regras/palavras-chave
  (100% offline, determinístico, testável). A mesma interface
  `ProblemClassifier` já tem uma implementação `AnthropicProblemClassifier`
  pronta para ligar (basta configurar `ANTHROPIC_API_KEY`) — se a chamada à
  IA falhar por qualquer motivo, cai de volta para as regras automaticamente,
  então o vendedor nunca fica bloqueado.
- **`autonomy.ts`** — autonomia do integrador: percentual geral, por cliente
  (identifica clientes com baixa autonomia digital e sugere a abordagem ao
  vendedor) e evolução semana a semana.
- **`operationalTime.ts`** — Tempo Operacional Evitável e o Mapa de Consumo
  do Tempo por área (Financeiro, Logística, Crédito...).
- **`alerts.ts`** — alertas gerenciais (vendedores presos, área concentrando
  tempo operacional, horas recuperáveis etc.), sem qualquer função de
  vigilância — o objetivo é apontar processos internos, não fiscalizar
  pessoas.
- **`db/`** — schema SQLite embutido, repositórios (`UserRepository`,
  `TimeEntryRepository`, `ProblemRepository`, `IntegratorActionRepository`) e
  um seed de demonstração. Os repositórios são a única porta de entrada para
  dados: na V2, a mesma assinatura pode ser implementada por um cliente HTTP
  falando com uma API central em vez de abrir o SQLite local.

Rodar os testes:

```bash
npm install
npm test               # roda os testes do @foco/core (vitest)
```

### `apps/vendedor` e `apps/gerente`

Cada um é um app Electron independente (processo principal em Node, UI em
React), comunicando-se por IPC com um contrato tipado em `shared/ipc.ts`. O
processo principal é o único lugar que toca o banco (via `@foco/core`); o
renderer nunca importa lógica de negócio diretamente — só os tipos, então o
pacote nativo do SQLite nunca é empacotado no bundle do Chromium.

V1 é **local por máquina**: cada instalação abre seu próprio arquivo SQLite
em `%APPDATA%/FOCO`. Para o app do gerente enxergar a mesma base do vendedor
num posto de demonstração (ou numa futura ponte local), o caminho pode ser
apontado explicitamente pela variável `FOCO_DB_PATH`.

## O que a V1 entrega

**Vendedor**
- [x] Login
- [x] Tela principal com tempo de hoje por categoria e Índice de Foco Comercial
- [x] ▶ Iniciar / ■ Parar Prospecção
- [x] Registro de problema com classificação automática (categoria,
      prioridade, área responsável)
- [x] Geração de protocolo (`#2841`) e mensagem de encaminhamento
- [x] Histórico de chamados
- [x] Registrar cotação/pedido feito pelo integrador (autonomia)
- [x] 🆘 Estou preso neste problema
- [x] Painel de autonomia dos próprios clientes, com sugestão de abordagem
      para clientes de baixa autonomia digital

**Gerente**
- [x] Login
- [x] Painel: equipe em prospecção, foco comercial, chamados operacionais,
      tempo operacional, horas potencialmente recuperáveis/mês
- [x] Equipe: status em tempo real de cada vendedor (prospecção, atividade
      comercial, problema, operacional, precisa de ajuda)
- [x] Mapa de consumo do tempo por área responsável
- [x] Autonomia dos integradores (evolução semanal + clientes de baixa
      autonomia)
- [x] Alertas gerenciais
- [x] Histórico de chamados da equipe

## Como rodar em desenvolvimento

Pré-requisitos: Node.js 20+ e npm. Em Windows, também as ferramentas de
build nativas do Node (`npm install -g windows-build-tools` ou Visual
Studio Build Tools) — necessárias apenas para compilar o `better-sqlite3`.

```bash
cd foco
npm install          # instala as três "packages" do workspace
npm run build:core   # compila @foco/core (os apps dependem do dist/)

npm run dev:vendedor   # abre o FOCO.exe em modo desenvolvimento
npm run dev:gerente    # abre o FOCO_Gerenciador.exe em modo desenvolvimento
```

Cada `dev:*` builda o processo principal, sobe o Vite (hot reload do React) e
abre a janela do Electron apontando para o servidor de desenvolvimento.

> **Nota sobre o ambiente onde este projeto foi criado**: o `better-sqlite3`
> é um módulo nativo — ele precisa ser compilado contra a versão exata do
> Node embutida no Electron (ABI diferente do Node "puro" usado pelos
> testes). O sandbox usado para desenvolver esta V1 não tinha acesso de rede
> para baixar os headers do Electron, então a recompilação nativa não pôde
> ser validada ali; toda a lógica foi validada via os testes automatizados
> do `@foco/core` e a compilação TypeScript de ambos os apps. Numa máquina
> Windows normal (ou num runner de CI com acesso à internet), `npm install`
> seguido de `npm run dist:vendedor` resolve isso automaticamente — é o
> fluxo padrão de qualquer app Electron com dependências nativas.

## Como gerar o instalador Windows

```bash
npm run dist:vendedor   # gera release/FOCO Setup <versão>.exe
npm run dist:gerente    # gera release/FOCO Gerenciador Setup <versão>.exe
```

O `electron-builder` recompila os módulos nativos para o Electron
automaticamente antes de empacotar (via `install-app-deps`) e gera um
instalador NSIS (com opção de escolher a pasta de instalação). Rodar isso
requer acesso à internet (para baixar os headers do Electron na primeira
vez) — funciona normalmente em qualquer máquina de desenvolvimento ou
pipeline de CI padrão.

## Contas de demonstração

O primeiro start popula o banco com uma equipe fictícia (10 vendedores + 1
gerente), senha `foco123` para todos:

- Vendedor: `vendedor1@foco.local` … `vendedor10@foco.local`
- Gerente: `gerente@foco.local`

## Roadmap V2 — central, multiusuário e integrado

A V1 foi desenhada de propósito para que esta evolução não exija reescrever
regra de negócio nenhuma — só trocar a camada de dados:

1. **API central** (Node/Fastify ou similar) expondo os mesmos contratos que
   hoje os repositórios do `@foco/core` implementam localmente.
2. **PostgreSQL** substituindo o SQLite por máquina — mesmo schema
   relacional, mesmos tipos (o `schema.ts` atual já foi escrito pensando
   nisso: IDs em texto, timestamps ISO 8601).
3. **Autenticação real** (SSO/AD da empresa) no lugar do login local.
4. **IA de verdade** para classificação: a interface `ProblemClassifier` já
   está pronta para o `AnthropicProblemClassifier`; falta só configurar a
   chave em produção e, opcionalmente, treinar prompts com o histórico real
   de chamados.
5. **Integrações**: e-commerce (para os dados de autonomia do integrador
   virem automaticamente, sem o vendedor precisar registrar manualmente),
   ERP (pedidos/cotações), financeiro, logística e crédito (para os
   protocolos de problema fecharem o ciclo sozinhos e avisarem o vendedor).
6. **Notificações em tempo real** (o vendedor é avisado quando o protocolo
   é resolvido, sem precisar cobrar a área responsável).
7. **BI**: os mesmos dados que hoje alimentam o painel do gerente viram base
   para dashboards históricos e comparativos entre squads/regiões.

Nenhum desses itens é pré-requisito para a V1 funcionar — é exatamente o
ponto: primeiro o núcleo do FOCO, depois a integração.

## Estrutura de pastas

```
foco/
├── package.json                 (workspace raiz)
├── tsconfig.base.json
├── packages/core/
│   ├── src/
│   │   ├── types.ts             tipos do domínio
│   │   ├── focoIndex.ts         Índice de Foco Comercial
│   │   ├── classifier.ts        classificação de problemas (regras + IA opcional)
│   │   ├── autonomy.ts          autonomia do integrador
│   │   ├── operationalTime.ts   tempo operacional evitável + mapa de consumo
│   │   ├── alerts.ts            alertas gerenciais
│   │   ├── protocol.ts          geração de protocolo
│   │   ├── auth.ts              hash/verificação de senha
│   │   └── db/                  schema, database.ts, repositórios, seed
│   └── tests/                   35 testes (vitest)
├── apps/vendedor/
│   ├── electron/                main.ts, preload.ts (processo principal)
│   ├── shared/ipc.ts             contrato tipado main ↔ renderer
│   └── src/                      React: Login, Home, modais, histórico, autonomia
└── apps/gerente/
    ├── electron/
    ├── shared/ipc.ts
    └── src/                      React: Login, Dashboard (painel, equipe, mapa, autonomia, histórico)
```
