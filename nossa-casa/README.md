# Nossa Casa ❤️

Aplicativo Android para Eduardo e Jussara organizarem a casa, as crianças, as compras
e o tempo em família — com **divisão justa** (não 50/50 de tarefas), **sincronização em
tempo real** entre os dois celulares e funcionamento **sem internet**.

---

## Instalar nos dois celulares (passo a passo)

São 3 etapas. A primeira é feita uma única vez, no computador.

### 1. Criar o banco de dados gratuito (Supabase) — ~5 minutos

1. Entre em <https://supabase.com>, crie uma conta e clique em **New project**
   (qualquer nome, ex.: `nossa-casa`; região **South America (São Paulo)**).
2. Quando o projeto abrir, vá em **SQL Editor → New query**, cole **todo** o conteúdo do
   arquivo [`supabase/migrations/001_nossa_casa.sql`](supabase/migrations/001_nossa_casa.sql)
   e clique em **Run**. Deve aparecer “Success”.
3. Vá em **Authentication → Sign In / Providers → Email** e **desligue “Confirm email”**
   (assim ninguém precisa confirmar e-mail para entrar).
4. Vá em **Project Settings → API** e anote:
   - **Project URL** (ex.: `https://abcd1234.supabase.co`)
   - **anon / publishable key** (uma chave longa)

### 2. Baixar e instalar o APK — em cada celular

1. No celular Android, abra o link:
   **`https://github.com/dubosa2026/Dubosa/releases/download/nossa-casa-latest/NossaCasa.apk`**
   (ou a aba **Releases** do repositório → “Nossa Casa (Android)”).
2. Toque no arquivo baixado. Se o Android pedir, permita **“Instalar apps desta fonte”**.
3. Toque em **Instalar** e depois em **Abrir**.

### 3. Primeira abertura

**No celular do Eduardo** (ou de quem começar):
1. Cole a **Project URL** e a **anon key** → **Conectar**. O app confere na hora se o
   endereço, a chave e o banco estão certos. Se faltar algo, ele diz o quê (ex.: “o banco
   ainda não foi preparado: rode o 001_nossa_casa.sql”).
2. **Criar conta** com e-mail e senha.
3. Toque em **Sou Eduardo**. A casa é criada já com tudo cadastrado.
4. Revise os 7 passos (nomes, crianças, horários, dias de trabalho, preferências,
   tarefas, notificações). No último passo, toque em **📤 Enviar convite para o outro
   celular** e mande pelo WhatsApp para a Jussara. Depois toque em **Começar ❤️**.
   (O convite também fica em **Configurações → Acesso da família**.)

**No celular da Jussara:**
1. Pela mensagem recebida, instale o app (o link vem na mensagem).
2. Abra o app, **cole a mensagem inteira** em “Código de conexão” e toque em
   **Colar código de conexão**. Não precisa digitar URL nem chave.
3. **Criar conta** (e-mail dela) → a tela “Entrar na casa” já vem com o código
   preenchido → **Continuar** → **Sou Jussara**.

Pronto: o que um fizer aparece para o outro na hora. Quando os dois estão conectados,
o código de convite deixa de valer e **nenhum outro login consegue ver a casa**.

> Recomendado depois que os dois criarem a conta: no Supabase, **Authentication →
> Sign In / Providers → desligar “Allow new users to sign up”**. Mesmo sem isso, um
> estranho que crie conta não vê nada (regras de segurança do banco), mas fica mais fechado.

> Só quer experimentar? Na primeira tela toque em **Testar sem servidor**: funciona
> offline com todos os dados, mas não sincroniza entre celulares. Em Configurações dá
> para alternar entre Eduardo e Jussara para simular os dois.

---

## Visão geral da arquitetura

```
 Celular do Eduardo                                   Celular da Jussara
 ┌───────────────────────────┐                       ┌───────────────────────────┐
 │ App Expo / React Native   │                       │ App Expo / React Native   │
 │  Telas (expo-router)      │                       │  Telas (expo-router)      │
 │  Regras + divisão justa   │                       │  Regras + divisão justa   │
 │  (src/domain, TS puro)    │                       │  (src/domain, TS puro)    │
 │  Store offline-first      │                       │  Store offline-first      │
 │   ├ dados no aparelho     │                       │   ├ dados no aparelho     │
 │   └ fila de envio         │                       │   └ fila de envio         │
 │  Notificações locais      │                       │  Notificações locais      │
 └─────────────┬─────────────┘                       └─────────────┬─────────────┘
               │  HTTPS (login próprio, JWT)                        │
               ▼                                                    ▼
        ┌──────────────────────── Supabase ────────────────────────────┐
        │ Auth (e-mail/senha)   Postgres + RLS   Realtime   Edge Fn IA │
        │ households · members · task_templates · task_instances ·     │
        │ shopping_items · homework · family_events · activity_log     │
        └───────────────────────────────────────────────────────────────┘
```

- **Expo SDK 57 / React Native** — um código só, gera APK Android.
- **Supabase** — autenticação individual, Postgres com **Row Level Security** (cada
  linha só é visível para quem é adulto daquela casa), **Realtime** para as mudanças
  chegarem na hora, e uma **Edge Function** opcional para a IA.
- **Offline-first** — toda ação é aplicada no celular na hora e vai para uma fila. Sem
  internet o app funciona normalmente; quando a conexão volta a fila é enviada e o app
  busca o que o outro mudou. Cada alteração envia só os campos mudados, então duas
  pessoas mexendo na mesma tarefa não apagam o trabalho uma da outra.
- **Ocorrências determinísticas** — cada ocorrência de tarefa recorrente tem um id
  calculado (tarefa + período). Se os dois celulares gerarem a semana sem internet, o
  banco guarda uma só (índice único + `on conflict do nothing`).
- **Autoria confiável** — `created_by`/`updated_by` são carimbados **pelo servidor** a
  partir do login; o histórico só aceita registros em nome de quem está logado.

## Estrutura de pastas

```
nossa-casa/
├── app/                      Telas (cada arquivo é uma rota)
│   ├── (tabs)/               Navegação inferior: Hoje | Semana | Tarefas | Família | Configurações
│   ├── tarefa/[id].tsx       Detalhe: concluir, cronômetro, responsável, adiar, registro
│   ├── modelo/[id].tsx       Criar/editar tarefa recorrente ou missão
│   ├── nova.tsx              Tarefa rápida
│   ├── mercado.tsx           Lista de compras compartilhada
│   ├── criancas.tsx          Missões, ⭐ pontos, 🏆 conquistas, 🎯 metas
│   ├── licao.tsx             Lição de casa (atividade, matéria, prazo, observação)
│   ├── historico.tsx         Concluídas / atrasadas / transferidas / canceladas
│   ├── reorganizar.tsx       "REORGANIZAR MINHA SEMANA" com APLICAR / CANCELAR
│   ├── disponibilidade.tsx   Análise da carga horária + regras da divisão
│   ├── assistente.tsx        Nossa Casa IA
│   └── membro/[id].tsx       Nome, horários e preferências de cada pessoa
├── src/
│   ├── domain/               Regras de negócio (sem dependência de tela) — testadas
│   │   ├── planner.ts        Algoritmo de divisão justa
│   │   ├── rules.ts          Cozinha ↔ louça/fogão, louça ↔ sono
│   │   ├── recurrence.ts     Uma vez, diária, semanal, quinzenal, mensal, a cada X dias, personalizada
│   │   ├── balance.ts        "Equilíbrio da semana"
│   │   ├── insights.ts       Aprendizado: tarefas adiadas, tempo real vs estimado
│   │   ├── gamification.ts   Pontos/conquistas/metas das crianças
│   │   ├── notifyPlan.ts     Quais lembretes agendar
│   │   ├── assistant.ts      Respostas da IA local (offline)
│   │   └── seed.ts           Dados iniciais: pessoas, horários, preferências, ~130 tarefas
│   ├── data/                 Store offline, sincronização, Supabase, notificações, login
│   ├── screens/              Primeira abertura (servidor, login, casa, configuração)
│   └── ui/                   Componentes e tema
├── supabase/
│   ├── migrations/001_nossa_casa.sql   Tabelas, RLS, convite, Realtime
│   └── functions/assistant/index.ts    Nossa Casa IA (Claude) — opcional
└── tests/                    Testes (regras, sincronização entre 2 celulares, banco)
```

## Como a divisão justa funciona

**Análise da carga horária (padrão, editável em Configurações → Horários e divisão):**

| | Eduardo | Jussara |
|---|---|---|
| Seg, ter, qui, sex | em casa 06:00–07:00 e a partir das 20:00 | em casa 06:30–10:45 (café + escola das crianças) e a partir das 18:30 com as crianças |
| Quarta | fora o dia todo (dia leve) | fora o dia todo (dia leve) |
| Sáb e dom | livre (limite de tarefas extras) | livre (limite de tarefas extras) |

O planejador **não** assume “quem fica em casa faz mais” nem “quem trabalha fora não
faz”. Ele busca dividir a **carga doméstica total** — tarefas **e** cuidado com as
crianças (café/escola, rotina de sono, lição) — de acordo com a meta (padrão 50/50,
ajustável), respeitando **quando** cada um pode fazer:

1. **Peso × tempo**: cada tarefa tem minutos estimados e esforço (leve/médio/pesado);
   a carga é `minutos × fator de esforço`.
2. **Disponibilidade**: só atribui a quem está em casa no turno/horário da tarefa
   (ex.: “Pendurar roupas 09:30” nunca vai para quem saiu às 07:00).
3. **Regras fixas**: quem **cozinha** também **lava a louça** e **limpa o fogão**; quem
   **lava a louça não faz a rotina de sono** naquele dia. Em dia útil, quem está em casa
   no jantar cozinha e quem chega às 20:00 faz a rotina de sono.
4. **Cobertura das crianças**: tarefa longa (≥ 30 min) no fim de semana ou à noite gera,
   para o outro adulto, “🤝 Cobertura das crianças” **simultânea** — mesma janela, não
   conta como segunda obrigação.
5. **Preferências como peso**: Jussara tem peso maior em roupas, organização, plantas e
   sapatos — ela recebe a maior parte dessas, mas não só essas, e o equilíbrio geral vale mais.
6. **Sem sobrecarga**: cada dia tem capacidade para tarefas extras com **reserva de
   descanso**; quarta é dia leve (nada pesado); fim de semana tem limite; as tarefas
   quinzenais/mensais são espalhadas pelas semanas. Se não couber, prioriza 🔴 > 🟡 > 🟢
   e o que é menos urgente fica para outra semana.
7. **Reorganizar**: redistribui só o que está pendente e não foi travado à mão, traz
   atrasadas para os próximos dias, prefere manter o que já estava combinado e **só
   aplica depois do “APLICAR”**.
8. **Aprende com o uso**: tarefa adiada 3+ vezes gera a sugestão “Essa tarefa está sendo
   adiada frequentemente. Deseja aumentar o intervalo ou alterar o responsável?”; o
   cronômetro sugere corrigir estimativas. Nada muda sem autorização.

O **Equilíbrio da semana** mostra horas de cada um e diz “Distribuição equilibrada” ou
“Há uma diferença significativa na carga de tarefas. Considere redistribuir algumas
atividades.” — sem ranking, vencedor ou placar entre o casal.

## Notificações

Agendadas **no próprio celular** (não precisam de servidor de push): resumo do dia,
lembrete antes do horário da tarefa, pendências da noite, mercado, lição da Inaê,
roupas, passeio do fim de semana e tarefas recorrentes. Horários, antecedência, dias da
semana e cada tipo são configuráveis. Quando o outro conclui/transfere algo, chega um
aviso enquanto o app estiver ativo ou em segundo plano. (Avisos com o app totalmente
fechado exigiriam push via Firebase — não incluído para manter a instalação simples.)

## Nossa Casa IA

- **Sem configurar nada**: responde localmente, com os dados reais do celular, às
  perguntas do dia a dia (“Quem precisa fazer o quê hoje?”, “O que está atrasado?”,
  “O que precisamos comprar?”, “Organize minha semana.” …). Funciona offline.
- **IA completa (opcional)**: perguntas livres usando o Claude. Requer uma chave da
  Anthropic e a [Supabase CLI](https://supabase.com/docs/guides/cli):
  ```bash
  cd nossa-casa
  supabase link --project-ref SEU_PROJECT_REF
  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
  supabase functions deploy assistant
  ```
  Depois, em **Configurações → Nossa Casa IA**, ligue “Usar IA na nuvem”. A função
  consulta o banco com o login de quem perguntou (mesmas regras de segurança) e nunca
  altera dados. Usa o modelo `claude-opus-5` com fallback automático do servidor em caso
  de recusa (`fallbacks: "default"`).

## Gerar o APK

- **Automático (já configurado)**: o workflow
  [`.github/workflows/nossa-casa-apk.yml`](../.github/workflows/nossa-casa-apk.yml)
  roda os testes e compila o APK a cada mudança em `nossa-casa/`, e publica em
  *Releases → nossa-casa-latest*. Também dá para rodar pelo botão **Run workflow**.
  - Segredos opcionais do repositório: `EXPO_PUBLIC_SUPABASE_URL` e
    `EXPO_PUBLIC_SUPABASE_ANON_KEY` (o APK já vem conectado, sem colar nada no celular);
    e `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
    `ANDROID_KEY_PASSWORD` para uma assinatura fixa. Sem a assinatura fixa, cada APK novo
    tem outra chave e, para atualizar, é preciso desinstalar o antigo (os dados ficam no
    servidor; basta entrar de novo). Para criar a chave uma vez:
    ```bash
    keytool -genkeypair -v -keystore nossa-casa.keystore -alias nossacasa -keyalg RSA -keysize 2048 -validity 10000
    base64 -w0 nossa-casa.keystore   # cole o resultado em ANDROID_KEYSTORE_BASE64
    ```
- **Pelo EAS (nuvem da Expo)**: `npx eas-cli@latest build -p android --profile apk`
- **Localmente** (precisa de Android Studio/SDK e JDK 17): `npm ci && npm run apk` →
  `android/app/build/outputs/apk/release/app-release.apk`

## Desenvolvimento e testes

```bash
cd nossa-casa
npm ci
npm run typecheck      # TypeScript
npm test               # regras, divisão justa, sincronização entre 2 celulares
npm run test:db        # banco real: RLS, convite, autoria (precisa de um Postgres; ver abaixo)
# ponta a ponta com a API do Supabase (PostgREST): NC_REST_URL=... NC_JWT_SECRET=... npm test
npm run web            # abre o app no navegador (modo demonstração)
```

`npm run test:db` usa `NC_PG_URL` (padrão `postgres://postgres@localhost:5432/postgres`)
e **apaga o schema public** desse banco — use um Postgres descartável. No CI ele roda num
Postgres 16 temporário.

### O que os testes verificam

| Pedido | Onde é verificado |
|---|---|
| Eduardo e Jussara acessam (login próprio, mesmo nível) | `tests/db.test.ts` — criação da casa, convite, vínculo |
| Ninguém mais vê a família | `tests/db.test.ts` — estranho/anônimo não lê nem grava |
| Alterações sincronizam (tempo real, offline, conflitos) | `tests/sync.test.ts` — dois celulares simulados |
| Tudo junto de verdade: cliente Supabase + API (PostgREST) + banco | `tests/e2e-api.test.ts` — criar casa, convite, sincronizar, regras, offline, estranho bloqueado, checagem do servidor |
| Registro de quem criou/alterou/concluiu | `tests/db.test.ts`, `tests/sync.test.ts` |
| Tarefas recorrentes | `tests/domain.test.ts` — recorrência |
| Divisão justa / sem sobrecarga / fim de semana leve / quarta leve | `tests/domain.test.ts` — divisão justa |
| Regra da cozinha e da louça/sono | `tests/domain.test.ts` + troca manual em `sync.test.ts` |
| Cobertura das crianças | `tests/domain.test.ts` |
| Tarefas das crianças, pontos, lição, mercado | `tests/domain.test.ts` |
| Notificações | `tests/domain.test.ts` — o que é agendado para cada um |
| Reorganizar / aprender com adiamentos | `tests/domain.test.ts` |

Além disso, todas as telas foram exercitadas no navegador (Playwright) no modo
demonstração: concluir tarefas, trocar quem cozinha (a louça, o fogão e a rotina de sono
se ajustam sozinhos), reorganizar a semana, calendário, tarefas, família, mercado,
crianças, IA local e histórico.

## Personalização

Nada fica preso ao código: nomes, crianças (e idade), horários, dias de trabalho, tempo
disponível por dia, preferências, meta de divisão, reserva de descanso, dias leves,
limite do fim de semana, cobertura das crianças, tarefas (título, cômodo, categoria,
frequência, tempo, esforço, prioridade, turno, horário, quem faz), missões e pontos,
metas semanais e notificações são editáveis no app e sincronizados.
