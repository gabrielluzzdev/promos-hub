# Promos Hub

Sistema interno do hub de promoções no WhatsApp: bot de entrada, curadoria de ofertas, publicação nos canais e rastreio de cliques. O escopo e as regras estão em [`docs/SPEC.md`](docs/SPEC.md).

## Stack

Next.js (App Router) na Vercel + um projeto Supabase. Sem microsserviços.

## Rodando localmente

Pré-requisitos: Node 22+, Docker (para o Supabase local).

```bash
npm install                 # gera o package-lock.json na primeira vez; commite ele
cp .env.example .env.local  # preencha as chaves
npm run db:start            # sobe o Supabase local e mostra URL e chaves
npm run dev                 # http://localhost:3000
```

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run typecheck` | TypeScript sem emitir |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run db:reset` | Recria o banco local com migrations e seeds |
| `npm run db:types` | Gera os tipos do banco em `src/lib/db/types.ts` |

O CI (`.github/workflows/ci.yml`) roda typecheck, lint e testes em todo PR. Ele usa `npm ci`, então o `package-lock.json` precisa estar commitado.

## Estrutura

```
src/app/                 rotas (webhook, /r/[code], /painel, /api/jobs)
src/lib/rules/           regras de negócio puras
src/lib/whatsapp/        cliente fino da Graph API (fetch) e textos do bot
src/lib/parser/          parser de ofertas com IA
src/lib/affiliate/       montadores de link de afiliado por loja
src/lib/post/            formatação do texto do post
prompts/                 prompts do sistema
supabase/                config local, migrations e seeds
tests/                   testes
```

## Marcos

| # | Entrega | Status |
| --- | --- | --- |
| M0 | Repo, Supabase local, CI, `.env.example` | feito, aguardando revisão |
| M1 | Migrations, RLS, seeds, auth + MFA + papéis, casca do painel | — |
| M2 | Webhook do bot, fluxo, comandos, caixa de entrada | — |
| M3 | Entrada de ofertas, parser, produtos, preços, afiliados | — |
| M4 | Motor de regras, `price_stats`, fila de revisão | — |
| M5 | Formatação do post, publicador assistido, redirecionador, cliques | — |
| M6 | Jobs, `/painel/hoje`, respostas da caixa, config, backup | — |
