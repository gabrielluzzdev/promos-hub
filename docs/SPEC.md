# SPEC — Deals hub internal system (Phase 1)

## 1. Context
A Brazilian deals service on WhatsApp. People talk once to an entry bot (official WhatsApp Cloud API), pick categories and receive links to WhatsApp Channels: one General channel + 6 category channels. Deals reach people only through the channels (zero cost per message). This system decides what gets published: offers come in, pass automatic rules, are approved by a human, and are posted. Every published link goes through our redirector, which counts the click before sending the user to the affiliate URL.

The product promise is "only real deals": a discount is real only when measured against our own price history, never against the store's "de / era" price.

Three people operate it on shifts (~1 h/day each). The review queue must allow approve / edit / reject in about 10 seconds per offer.

## 2. Scope
**Phase 1 (build now):** bot webhook, offer intake + AI parser, rules engine, review queue, assisted publisher (copy and paste into the channel), redirector + click tracking, price history recording, operator inbox, daily dashboard, scheduled jobs.

**Out of scope now, but the schema must not block it:** automatic intake from affiliate feeds/APIs, automatic publisher via third-party gateway, Telegram mirror, premium (subscriptions, price alerts), full reports. Keep `source` and `mode` columns ready for these.

## 3. Architecture
One Next.js app on Vercel, one Supabase project. No microservices.

- `/api/whatsapp/webhook` — Cloud API webhook (GET verify, POST events)
- `/r/[code]` — redirector
- `/painel/*` — operator panel (auth + MFA required)
- `/api/jobs/*` — scheduled jobs, called by Supabase Cron through `pg_net` with header `x-cron-secret` (Vercel Hobby cron is too infrequent for this)
- `src/lib/rules/` — pure business rules
- `src/lib/whatsapp/` — thin client over the Graph API using `fetch` (the official Node SDK is archived; do not add a third-party WhatsApp library)
- `src/lib/parser/` — offer parser; system prompt loaded from `prompts/offer-parser.md`

Long work after a request returns uses `after()` from `next/server`.

## 4. Data model
All tables: `id uuid pk default gen_random_uuid()` unless noted, `created_at timestamptz default now()`, RLS on. Money in cents (`int`).

| Table | Columns | Notes |
|---|---|---|
| `categories` | slug unique, name, channel_url, daily_min_posts int, sort_order, active bool | Seed: geral (min 6), tecnologia, games, casa, moda, livros_papelaria, beleza (min 12) |
| `users` | phone_e164 unique, wa_id unique, status enum(active, paused), source enum(link, ad, referral, unknown), ctwa_clid null, last_contact_at | Bot subscribers, not operators |
| `consents` | user_id fk on delete cascade, consent_version, consent_text, accepted_at | Text exactly as shown to the user |
| `preferences` | user_id, category_id, pk(user_id, category_id), on delete cascade | |
| `bot_sessions` | user_id pk, state, data jsonb, updated_at | Flow state |
| `processed_wa_messages` | wa_message_id pk, processed_at | Idempotency: Meta retries webhooks |
| `bot_message_log` | user_id null, direction enum(in, out), kind text, billable bool, created_at | No message content. Used for "bot messages per signup" metric |
| `optout_log` | left_at, source | Anonymous count of exits, no phone |
| `inbox_messages` | user_id, wa_message_id, text, received_at, answered_by null, answered_at null, answer_text null | Free text the bot doesn't understand |
| `products` | store enum, canonical_key, name, brand, model, canonical_url, unique(store, canonical_key) | Trigram index on canonical_key (`pg_trgm`) |
| `prices` | product_id, price_cents, seen_at, source enum(manual, parser, feed, monitor) | Insert-only. Every price we see. Never insert the store's claimed "de" price |
| `raw_inputs` | source enum(manual_text, manual_form, feed), raw_text, submitted_by, status enum(pending, parsed, failed), parser_output jsonb, error, attempts int | |
| `offers` | raw_input_id, product_id, category_id, price_cents null, claimed_before_cents null, coupon, conditions, post_title, post_condition, source_url, affiliate_url null, flags text[], rule_results jsonb, badge enum(lowest_90d, below_avg, none), discount_vs_avg_pct numeric null, status enum (see 7), reject_reason, reviewed_by, reviewed_at, published_at, expires_at | |
| `links` | code text pk (6 chars base62), offer_id, destination_url | |
| `clicks` | link_code, category_id, clicked_at, device enum(mobile, desktop, unknown), user_agent, is_bot bool | No IP |
| `posts` | offer_id, category_id, text, mode enum(assisted, auto), posted_by, posted_at | One row per channel the offer went to |
| `rule_config` | key pk, value jsonb, updated_by, updated_at | See 7 |
| `operator_profiles` | user_id pk → auth.users, display_name, role enum(admin, curator) | |
| `audit_log` | actor_id, action, entity, entity_id, payload jsonb, at | Approve, reject, edit, config change, inbox reply |

## 5. Bot (entry flow)
Entry link: `wa.me/<number>?text=quero`. Every inbound message opens or extends the 24 h customer service window; replies are only sent inside it. The flow has a hard budget of 3–5 outbound messages per signup.

**Webhook requirements**
- GET: answer `hub.challenge` when `hub.verify_token` matches `WA_VERIFY_TOKEN`.
- POST: validate `X-Hub-Signature-256` with `WA_APP_SECRET` against the raw body. Reject when invalid.
- Return 200 fast and process in `after()`.
- Skip any `wa_message_id` already in `processed_wa_messages`.
- Ignore status callbacks except for logging.
- Record `source = ad` and `ctwa_clid` when the message carries a Click-to-WhatsApp referral.

**Flow** (copy is a first draft; keep it in one file `src/lib/whatsapp/copy.ts` so the team can edit it):
1. Inbound "quero" or any first message from an unknown number → **msg 1**: interactive list. Body: one line of greeting + consent line ("Ao escolher, você aceita receber ofertas. Para sair, mande SAIR.") + "Pode responder com os números, ex.: 1, 3, 5". Rows: the 6 categories + "Todas" (row title ≤ 24 chars). Create the user and the consent record only when they choose (choosing = consent).
2. User picks one row, or types numbers like "1,3,5" (parse leniently: spaces, commas, "e"), or "todas" → save preferences → **msg 2**: one text with the General channel link + one line per chosen channel link + "Abra cada canal e toque no sino 🔔 no topo para receber na hora." Reply buttons: "Adicionar categoria", "Pronto".
3. "Adicionar categoria" → **msg 3**: the list again without the categories already chosen → back to step 2 (msg 2 lists only the new links).
4. "Pronto" → **msg 4**: short summary of categories + commands: CATEGORIAS, PAUSAR, SAIR, AJUDA.

**Commands** (case and accent insensitive, any time):
- `CATEGORIAS` → list with current choices marked; picking toggles.
- `PAUSAR` → status paused + one message explaining how to mute a channel.
- `SAIR` → hard delete the user (cascade preferences, consents, session), insert one `optout_log` row, send a confirmation. Nothing about the person remains.
- `AJUDA` → one message with the commands.
- Anything else from a registered user → save to `inbox_messages`, **no automatic reply** (a human answers from the panel within the window).

**Tests**: scripted conversations against a fake WhatsApp client, asserting the exact sequence and count of outbound messages for: happy path with one tap, with "1,3,5", with "Adicionar categoria" twice, SAIR, unknown text, duplicate webhook delivery.

## 6. Offer intake and parser
Two entry modes on `/painel/entrada`:
- **Paste**: raw text (from deal groups) → `raw_inputs` → parser.
- **Form**: URL + price + category + optional coupon → skips the parser, same pipeline after it.

**Parser**
- System prompt: `prompts/offer-parser.md`. User message: `source: <source>\n<<<RAW\n<text>\nRAW>>>`.
- Call `generateText` with `output: Output.object({ schema })` (AI SDK 7; `generateObject` is deprecated). Temperature 0. Schema in `src/lib/parser/schema.ts`.
- On error: retry once. Then set `failed` and show the raw text in the queue for manual entry.
- One raw input can produce up to 10 offers.
- For each parsed offer: upsert the product by `(store, canonical_key)`. If no exact match but a trigram match ≥ 0.8 exists in the same store, do not merge automatically: attach `possible_duplicate_of` to the offer for the reviewer.
- Insert the `price_current` into `prices` (source parser/manual). Never insert `price_claimed_before`.
- Affiliate URL: `src/lib/affiliate/` exposes one builder per store. Amazon: append the tag from `AMAZON_ASSOCIATE_TAG`. Other stores: no builder yet, so the reviewer pastes the affiliate link in the queue (required to approve).

## 7. Rules engine
Pure function `evaluateOffer(offer, product, priceStats, config, now) → { status, results[] }`. Each result: `{ rule, outcome: pass | fail | warn, reason_ptbr }`.

`rule_config` seed:
`min_discount_pct: 15`, `dup_block_days: 7`, `allowed_stores: [amazon, mercadolivre, shopee, magalu, kabum, casasbahia, americanas]`, `silence: {start: "23:00", end: "08:00"}`, `offer_ttl_hours: 24`, `badge_min_history_days: 30`, `badge_min_price_points: 5`.

| Rule | Fail → | Detail |
|---|---|---|
| Store allowed | `rejected_auto` | `store` not in `allowed_stores` or `other` |
| Possible scam flag | `rejected_auto` | Parser flag `possible_scam` |
| Price present | `pending_review` + warn | Reviewer must fill the price |
| Duplicate | `rejected_auto` | Same product, same store, an offer approved or published within `dup_block_days` |
| History sufficient | warn only | Fewer than `badge_min_price_points` prices or under `badge_min_history_days` of history → `badge = none` and warn "conferir preço no Zoom/Buscapé" |
| Real discount | `rejected_auto` | Only when history is sufficient: price below the 90-day average by less than `min_discount_pct` |
| Badge | — | `lowest_90d` if price ≤ 90-day minimum (history sufficient); else `below_avg` if discount ≥ min; else `none` |

Statuses: `pending_rules → rejected_auto | pending_review → approved | rejected → published → expired`. Silence hours never reject; they hold publishing. `expires_at = approved_at + offer_ttl_hours`.

Price stats come from one SQL function `price_stats(product_id)` returning min_90d, avg_90d, points, first_seen.

Unit tests: table-driven, covering every row above, the boundaries (exactly 15%, exactly 7 days) and the silence window crossing midnight.

## 8. Operator panel
Login with Supabase Auth. MFA (TOTP) is mandatory: middleware requires `aal2` for `/painel/*`. Roles: `admin` (everything), `curator` (everything except config and operators).

| Page | What it does |
|---|---|
| `/painel/fila` | Review queue, oldest first. Each card shows: product, store, price, 90-day min and average, badge preview, rule results, flags, possible duplicate, final post preview, affiliate link field. Keyboard: `A` approve, `E` edit, `R` reject (reason required, quick-pick list), `J/K` move. Target: one decision in ~10 s. |
| `/painel/entrada` | Paste and form modes (section 6) |
| `/painel/publicar` | Approved offers grouped by channel. "Copiar" copies the final text; "Marcar como postado" creates the `posts` row and sets `published`. During silence hours, a banner and the actions are disabled. An offer can go to its category channel and, if picked, to Geral. |
| `/painel/hoje` | Posts today per channel vs `daily_min_posts`, clicks per channel, the 10 offers with most clicks today with "Enviar ao Geral" (pick the 3 best of the day at 20h) |
| `/painel/caixa` | Inbox. Reply box sends a text through the API only while the 24 h window is open; otherwise shows "janela fechada". |
| `/painel/config` | Admin only: rule_config, categories (channel links, minimums), operators |

**Post text** (`src/lib/post/format.ts`, unit tested):
```
<post_title>
R$ 899 · menor preço em 90 dias        ← badge lowest_90d
R$ 899 (−28% vs média de 90 dias)      ← badge below_avg
R$ 899                                  ← badge none (no discount claim)
<post_condition, line omitted if null>
https://<DOMAIN>/r/<code>
```
The store's claimed "de" price never appears in the post, because we did not verify it.

## 9. Redirector `/r/[code]`
- 302 to `destination_url`, `Cache-Control: no-store`. Unknown code → simple pt-BR page with a link to the General channel.
- Log the click in `after()`, never blocking the redirect.
- `is_bot = true` for link-preview crawlers (user agent containing `WhatsApp`, `facebookexternalhit`, `TelegramBot`, `Twitterbot`, `Slackbot`, generic `bot|crawler|spider`). WhatsApp fetches the link to build the preview, so without this the click count is inflated. Metrics exclude `is_bot`.
- The destination must stay the store's real affiliate URL (affiliate programs forbid hiding the destination).

## 10. Scheduled jobs (Supabase Cron → pg_net → `/api/jobs/*`, header `x-cron-secret`)
- `parser-retry` every 5 min: `raw_inputs` pending or failed with attempts < 2.
- `expire-offers` every 15 min: approved or published with `expires_at < now()` → `expired`; list them on `/painel/publicar` under "remover do canal".
- `daily-summary` 20:00 São Paulo: precompute the top offers for `/painel/hoje`.

## 11. Security and LGPD
- Consent stored with version, exact text and timestamp. `SAIR` hard deletes (section 5).
- No phone numbers in logs, analytics or URLs. Clicks store no IP.
- Never share or export individual numbers. Only aggregates leave the system.
- RLS: panel tables readable/writable by authenticated operators according to role; bot and redirector write with the service role on the server only.
- Webhook signature validation, `x-cron-secret` on jobs, rate limit on the webhook route.
- Nightly backup: a GitHub Action running `pg_dump` to private storage (Supabase Free has no downloadable daily backup).

## 12. Environment variables
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN`, `WA_GRAPH_VERSION`, `AI_MODEL`, the AI provider key, `AMAZON_ASSOCIATE_TAG`, `CRON_SECRET`, `PUBLIC_DOMAIN`.

## 13. Milestones
Each one ends green on typecheck, lint and tests, with a short summary, then stops for review.

| # | Deliverable | Accepted when |
|---|---|---|
| M0 | Repo, Supabase local, CI (typecheck, lint, test), `.env.example` | CI runs on a PR |
| M1 | All migrations, RLS, seeds, auth + MFA + roles, empty panel shell | A curator without MFA cannot reach `/painel`; an admin sees `/painel/config` and a curator does not |
| M2 | Bot webhook + flow + commands + inbox storage | All scripted conversation tests in section 5 pass; signature and idempotency tested |
| M3 | Intake (paste + form), parser, products, prices, affiliate builders | A real deal text produces the right offers in the DB; a failed parse shows up for manual entry |
| M4 | Rules engine + `price_stats` + review queue UI with shortcuts | Rule tests pass; one offer can be approved by keyboard only |
| M5 | Post formatter, assisted publisher, redirector, clicks | Copied text matches the format; a bot user agent is logged as `is_bot`; silence hours block publishing |
| M6 | Jobs, `/painel/hoje`, inbox replies, config page, backup action | Expired offers appear under "remover do canal"; a reply outside the window is blocked |
