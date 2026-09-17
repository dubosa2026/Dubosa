# Copiloto Gerencial IA

Aplicativo web gerencial para equipes comerciais B2B: transforma dados de
vendas em diagnóstico, alertas, oportunidades e ações — não é uma planilha,
é um software real com frontend, backend, banco de dados, autenticação,
permissões e um motor de IA que só fala com base em dados reais.

Este diretório implementa o **MVP** descrito na seção 30 do briefing
original (módulos 1 a 10). As seções 11 a 22 (prospecção, pricing,
coaching, análise de ligações, WhatsApp etc.) ficam documentadas como
roadmap no final deste arquivo — a arquitetura já foi pensada para
comportá-las sem reescrita.

## Arquitetura

```
webapp/
  backend/     Node.js + Express + TypeScript + Prisma (API REST)
  frontend/    React + Vite + TypeScript + Tailwind CSS (SPA responsiva)
```

- **Banco de dados**: relacional via Prisma. Em desenvolvimento usa SQLite
  (zero configuração); o schema (`backend/prisma/schema.prisma`) usa apenas
  tipos e relações suportados por Postgres/MySQL, então migrar é só trocar
  o `provider` do datasource e rodar `prisma migrate`.
- **Autenticação**: login com e-mail/senha (bcrypt) + JWT. Papéis
  `ADMIN`, `GERENTE`, `SUPERVISOR`, `VENDEDOR`.
- **Permissões**: `src/middleware/scope.ts` resolve, para cada usuário
  autenticado, a lista de vendedores que ele pode enxergar. Todo endpoint
  de dados usa esse escopo — um vendedor nunca recebe dados de outro.
- **Motor de IA**: dividido em duas camadas, seguindo a regra 28 do
  briefing ("nunca inventar dados"):
  - **Determinística** (`services/insightsEngine.ts`,
    `services/healthScore.ts`, `services/clientAnalytics.ts`,
    `services/vendorAnalysis.ts`): calcula alertas, Customer Health Score,
    prioridades de reativação e a análise "Analise este vendedor" — tudo
    a partir de agregações reais sobre o banco. Nenhum texto é gerado por
    LLM aqui.
  - **Conversacional** (`services/aiChat.ts` + `services/llmClient.ts`):
    a Central "Pergunte à IA" interpreta a pergunta, busca a resposta nos
    mesmos serviços determinísticos e, opcionalmente, usa a API da
    Anthropic (`ANTHROPIC_API_KEY`) só para reescrever o texto em
    linguagem mais natural — nunca para adicionar números novos. Sem a
    chave configurada, a resposta estruturada é devolvida como está.
- **Camada de integração**: `routes/import.ts` recebe hoje pedidos via
  CSV colado no corpo da requisição. É o ponto de entrada único de dados
  de pedidos — trocar por um conector de ERP/CRM no futuro não muda nada
  do resto do sistema (dashboard, radar, health score continuam iguais).
- **Auditoria**: `AuditLog` registra mudanças sensíveis (classificação de
  cliente, criação de usuário, importações). `ClientHistory` registra
  troca de vendedor.

## Módulos do MVP (mapeados ao briefing)

| Módulo | Seção do briefing | Onde está |
|---|---|---|
| 1. Login e usuários | 2, 3, 25 | `routes/auth.ts`, `routes/users.ts`, `pages/Login.tsx` |
| 2. Dashboard gerencial | 4 | `routes/dashboard.ts`, `pages/Dashboard.tsx` |
| 3. Equipe/vendedores | 7 | `routes/vendors.ts`, `pages/Equipe.tsx`, `pages/VendedorDetalhe.tsx` |
| 4. Clientes | 8, 9 | `routes/clients.ts`, `pages/Clientes.tsx`, `pages/ClienteDetalhe.tsx` |
| 5. Metas | 14 | `routes/goals.ts`, `pages/Metas.tsx` |
| 6. Radar IA | 5 | `services/insightsEngine.ts`, `routes/radar.ts`, `pages/RadarIA.tsx` |
| 7. Pergunte à IA | 18 | `services/aiChat.ts`, `routes/aiChat.ts`, `pages/CentralIA.tsx` |
| 8. Reativação | 10 | `services/clientAnalytics.ts`, `routes/reactivation.ts`, `pages/Reativacao.tsx` |
| 9. Tarefas | 15 | `routes/tasks.ts`, `pages/Tarefas.tsx` |
| 10. Importação de dados | 22, 23 | `routes/import.ts` |
| Bônus: Meu Dia | 19 | `routes/meuDia.ts`, `pages/MeuDia.tsx` |
| Bônus: Análise por queda de vendas | 6 | Coberto parcialmente pelo Radar IA (fatores por vendedor/estado/cliente); aprofundamento por produto/margem fica no roadmap |

## Como rodar localmente

### Backend

```bash
cd webapp/backend
cp .env.example .env       # ajuste JWT_SECRET em produção
npm install
npx prisma migrate dev     # cria o SQLite e as tabelas
npx tsx prisma/seed.ts     # popula dados DEMO (claramente marcados isDemo=true)
npm run dev                # http://localhost:4000
```

Login de exemplo (senha `demo1234` para todos):
- `admin@copiloto.demo` — Administrador
- `gerente@copiloto.demo` — Gerente (vê a equipe "Norte")
- `rafael@copiloto.demo`, `joao@copiloto.demo`, `marina@copiloto.demo`,
  `camila@copiloto.demo`, `bruno@copiloto.demo` — Vendedores (cada um só
  vê a própria carteira)

### Frontend

```bash
cd webapp/frontend
npm install
npm run dev                # http://localhost:5173, com proxy /api -> :4000
```

### Build de pré-visualização (link estático, sem backend)

Para publicar um link navegável do produto (apresentação, validação com o
time) sem subir servidor nem banco:

```bash
cd webapp/backend && npx tsx src/index.ts          # precisa estar no ar
cd webapp/frontend
node scripts/gerar-snapshot-demo.mjs               # congela as respostas da API
VITE_DEMO=1 npx vite build --base ./ --outDir dist-demo
```

O resultado em `dist-demo/` é um site estático: mesmo código de interface,
respondendo a partir do snapshot em vez da API. A tela exibe um aviso de
que é pré-visualização e que alterações não são salvas. A condição
`VITE_DEMO` é resolvida em tempo de build, então o build normal
(`npm run build`) não carrega nada do snapshot.

### Testando a Central "Pergunte à IA" com respostas em linguagem natural

Por padrão a IA responde com texto estruturado (sem depender de nenhuma
API externa). Para habilitar a reescrita em linguagem natural via Claude,
defina `ANTHROPIC_API_KEY` no `.env` do backend antes de rodar `npm run dev`.

## Dados de demonstração

Todo dado fictício é marcado com `isDemo: true` no banco (vendedores,
clientes, pedidos e metas gerados pelo `prisma/seed.ts`). Ao conectar
dados reais via `routes/import.ts` ou uma futura integração de ERP, os
registros novos são criados com `isDemo: false`, o que permite no futuro
filtrar ou remover a base de demonstração sem afetar dados reais.

## Roadmap (seções 11–22 do briefing, ainda não implementadas)

A arquitetura modular (rotas + serviços independentes por domínio,
escopo de permissão centralizado, camada de importação desacoplada) foi
pensada para que cada item abaixo seja um módulo novo, não uma reforma:

- **Prospecção IA** (seção 11): nova entidade `Lead` + scoring, reusando
  o mesmo padrão de `services/insightsEngine.ts`.
- **Price Intelligence** (seção 12): novo serviço lendo `Order`/`OrderItem`
  (preço, desconto, margem já existem no schema) para orientar (não
  autorizar) condições comerciais.
- **Simulador comercial** (seção 13): serviço de cenários "e se" sobre as
  mesmas agregações do dashboard, sempre com premissas explícitas.
- **Coaching de vendas e simulador de negociação** (seção 16): usa
  `AIAnalysis` como já está modelado; a simulação de negociação pede um
  LLM conversacional completo (não só reescrita), então usa
  `services/llmClient.ts` como base.
- **Análise de ligações / 3CX** (seção 17): a tabela `Interaction` já
  comporta um campo de transcrição; falta o conector de telefonia.
- **Notificações inteligentes** (seção 20) e **Relatórios exportáveis**
  (seção 21): a tabela `Alert` e os endpoints de agregação já existem;
  falta a camada de entrega (push/e-mail) e exportação (PDF/CSV).
- **WhatsApp/E-mail** (seção 22): mesma ideia da camada de importação —
  webhook novo, resto do sistema inalterado.

## Segurança (seção 25)

Implementado no MVP: senhas com bcrypt, sessão via JWT com expiração,
escopo de dados por papel em toda rota, validação de entrada com Zod em
todos os endpoints de escrita, trilha de auditoria para ações sensíveis.
Pendente antes de produção: rate limiting, rotação de `JWT_SECRET`,
HTTPS obrigatório na borda, política de recuperação de senha por e-mail.
