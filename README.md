# Promos Hub

Sistema interno do hub de promoções no WhatsApp: bot de entrada, curadoria de ofertas, publicação nos canais e rastreio de cliques. Escopo e regras em [`docs/SPEC.md`](docs/SPEC.md).

## Como funciona

1. A pessoa manda "quero" para o bot (`/api/whatsapp/webhook`), escolhe categorias e recebe os links dos canais.
2. O operador cola ofertas em **Entrada**. O parser (IA) separa as ofertas, grava produto e preço e roda as regras.
3. Na **Fila**, cada oferta é aprovada (`A`), editada (`E`) ou rejeitada (`R`) em segundos.
4. Em **Publicar**, o texto pronto é copiado e colado no canal. Todo link passa por `/r/<código>`, que conta o clique.
5. Jobs agendados expiram ofertas, repetem o parser e fecham o resumo das 20h.

## Stack

Next.js 16 (App Router) na Vercel + Supabase (Postgres, Auth com MFA, Cron, pg_net, Vault). Parser com AI SDK 7.

## Rodando localmente

Pré-requisitos: Node 22+, Docker e o [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

```bash
npm install
cp .env.example .env.local   # preencha com o que o db:start mostrar
npm run db:start             # Postgres local com migrations e seeds
npm run dev                  # http://localhost:3000
```

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Testes (Vitest) |
| `npm run build` | Build de produção |
| `npm run db:reset` | Recria o banco local |
| `supabase test db` | Testes de banco (pgTAP: RLS, price_stats, SAIR) |

O CI roda tudo isso em cada push. Se o `package.json` mudar sem o lockfile, o CI regenera e commita o `package-lock.json`.

## Colocando em produção (uma vez)

1. **Supabase:** crie o projeto, rode `supabase link` e `supabase db push`. As categorias e regras entram pelas migrations.
2. **Vercel:** importe o repositório e cadastre as variáveis do `.env.example`.
3. **Primeiro admin:** crie o usuário em Supabase → Authentication → Users e rode no SQL Editor:
   ```sql
   insert into public.operator_profiles (user_id, display_name, role)
   select id, 'Seu nome', 'admin' from auth.users where email = 'voce@exemplo.com';
   ```
   No primeiro login, o painel pede o cadastro do MFA. Os outros operadores são criados em **Configuração**.
4. **Canais:** em **Configuração**, cole o link de cada canal do WhatsApp.
5. **WhatsApp (Meta):** no app da Meta, configure o webhook para `https://SEU-DOMINIO/api/whatsapp/webhook`, com o mesmo `WA_VERIFY_TOKEN`, e assine o campo `messages`.
6. **Jobs:** no SQL Editor do Supabase, rode:
   ```sql
   select app_private.configure_jobs('https://SEU-DOMINIO', 'mesmo valor de CRON_SECRET');
   ```
7. **Backup:** no GitHub, em Settings → Secrets → Actions, crie `SUPABASE_DB_URL` (connection string) e `BACKUP_PASSPHRASE`. O workflow **Backup do banco** roda todo dia às 03:30.

## Estrutura

```
src/app/api/whatsapp/webhook   webhook do bot
src/app/api/jobs/*             jobs (parser-retry, expire-offers, daily-summary)
src/app/r/[code]               redirecionador com contagem de cliques
src/app/painel/*               fila, entrada, publicar, hoje, caixa, configuração
src/proxy.ts                   login + MFA (aal2) + papel em /painel
src/lib/bot                    fluxo do bot (puro, testado com WhatsApp falso)
src/lib/whatsapp               cliente da Graph API, assinatura, payload, textos (copy.ts)
src/lib/parser                 parser de ofertas (prompt em prompts/offer-parser.md)
src/lib/intake                 pipeline: produto, preço, oferta, regras
src/lib/rules                  regras puras (evaluateOffer, silêncio)
src/lib/post                   texto do post
supabase/migrations            schema, RLS, seeds, jobs
supabase/tests                 testes pgTAP
```

## Marcos

| # | Entrega | Status |
| --- | --- | --- |
| M0 | Repo, Supabase local, CI, `.env.example` | feito |
| M1 | Migrations, RLS, seeds, auth + MFA + papéis, casca do painel | feito |
| M2 | Webhook do bot, fluxo, comandos, caixa de entrada | feito |
| M3 | Entrada de ofertas, parser, produtos, preços, afiliados | feito |
| M4 | Motor de regras, `price_stats`, fila de revisão | feito |
| M5 | Formato do post, publicador assistido, redirecionador, cliques | feito |
| M6 | Jobs, `/painel/hoje`, respostas da caixa, config, backup | feito |
