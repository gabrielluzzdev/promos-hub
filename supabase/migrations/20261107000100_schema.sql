-- Fase 1: schema completo (SPEC seção 4).
-- Dinheiro em centavos (int). RLS ligado em todas as tabelas (políticas em 20261107000200_rls.sql).

create extension if not exists pg_trgm with schema extensions;

create schema if not exists app_private;

-- Tipos -----------------------------------------------------------------------

create type public.user_status as enum ('active', 'paused');
create type public.user_source as enum ('link', 'ad', 'referral', 'unknown');
create type public.msg_direction as enum ('in', 'out');
create type public.store as enum ('amazon', 'mercadolivre', 'shopee', 'magalu', 'kabum', 'casasbahia', 'americanas', 'other');
create type public.price_source as enum ('manual', 'parser', 'feed', 'monitor');
create type public.raw_source as enum ('manual_text', 'manual_form', 'feed');
create type public.raw_status as enum ('pending', 'parsed', 'failed');
create type public.offer_status as enum (
  'pending_rules', 'rejected_auto', 'pending_review', 'approved', 'rejected', 'published', 'expired'
);
create type public.badge as enum ('lowest_90d', 'below_avg', 'none');
create type public.click_device as enum ('mobile', 'desktop', 'unknown');
create type public.post_mode as enum ('assisted', 'auto');
create type public.operator_role as enum ('admin', 'curator');

-- Categorias e configuração ---------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  channel_url text,
  daily_min_posts int not null default 12 check (daily_min_posts >= 0),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.rule_config (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.operator_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role public.operator_role not null default 'curator',
  created_at timestamptz not null default now()
);

-- Bot (assinantes) ------------------------------------------------------------

create table public.users (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null unique,
  wa_id text not null unique,
  status public.user_status not null default 'active',
  source public.user_source not null default 'unknown',
  ctwa_clid text,
  last_contact_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  consent_version text not null,
  consent_text text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index consents_user_id_idx on public.consents (user_id);

create table public.preferences (
  user_id uuid not null references public.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, category_id)
);

create table public.bot_sessions (
  user_id uuid primary key references public.users (id) on delete cascade,
  state text not null default 'idle',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Idempotência: a Meta reenvia webhooks.
create table public.processed_wa_messages (
  wa_message_id text primary key,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Sem conteúdo de mensagem. Usado na métrica "mensagens do bot por cadastro".
create table public.bot_message_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  direction public.msg_direction not null,
  kind text not null,
  billable boolean not null default false,
  created_at timestamptz not null default now()
);
create index bot_message_log_created_idx on public.bot_message_log (created_at);

-- Contagem anônima de saídas, sem telefone.
create table public.optout_log (
  id uuid primary key default gen_random_uuid(),
  left_at timestamptz not null default now(),
  source text,
  created_at timestamptz not null default now()
);

create table public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  wa_message_id text unique,
  text text not null,
  received_at timestamptz not null default now(),
  answered_by uuid references auth.users (id) on delete set null,
  answered_at timestamptz,
  answer_text text,
  created_at timestamptz not null default now()
);
create index inbox_messages_open_idx on public.inbox_messages (answered_at, received_at);

-- Produtos, preços e ofertas --------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store public.store not null,
  canonical_key text not null,
  name text not null,
  brand text,
  model text,
  canonical_url text,
  created_at timestamptz not null default now(),
  unique (store, canonical_key)
);
create index products_canonical_key_trgm on public.products using gin (canonical_key extensions.gin_trgm_ops);

-- Somente inserção. Nunca guardar o preço "de" anunciado pela loja.
create table public.prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  price_cents int not null check (price_cents > 0),
  seen_at timestamptz not null default now(),
  source public.price_source not null,
  created_at timestamptz not null default now()
);
create index prices_product_seen_idx on public.prices (product_id, seen_at desc);

create table public.raw_inputs (
  id uuid primary key default gen_random_uuid(),
  source public.raw_source not null,
  raw_text text,
  submitted_by uuid references auth.users (id) on delete set null,
  status public.raw_status not null default 'pending',
  parser_output jsonb,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
create index raw_inputs_status_idx on public.raw_inputs (status, created_at);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  raw_input_id uuid references public.raw_inputs (id) on delete set null,
  product_id uuid not null references public.products (id),
  category_id uuid references public.categories (id),
  price_cents int check (price_cents > 0),
  claimed_before_cents int check (claimed_before_cents > 0),
  coupon text,
  conditions text,
  post_title text not null,
  post_condition text,
  source_url text,
  affiliate_url text,
  flags text[] not null default '{}',
  rule_results jsonb not null default '[]'::jsonb,
  badge public.badge not null default 'none',
  discount_vs_avg_pct numeric(5, 1),
  possible_duplicate_of uuid references public.products (id) on delete set null,
  send_to_general boolean not null default false,
  status public.offer_status not null default 'pending_rules',
  reject_reason text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  removed_from_channels_at timestamptz,
  created_at timestamptz not null default now()
);
create index offers_status_created_idx on public.offers (status, created_at);
create index offers_product_approved_idx on public.offers (product_id, approved_at);

-- Um código por oferta e canal, para saber de que canal veio o clique.
create table public.links (
  code text primary key check (code ~ '^[0-9A-Za-z]{6}$'),
  offer_id uuid not null references public.offers (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  destination_url text not null,
  created_at timestamptz not null default now(),
  unique (offer_id, category_id)
);

-- Sem IP.
create table public.clicks (
  id uuid primary key default gen_random_uuid(),
  link_code text not null references public.links (code) on delete cascade,
  category_id uuid references public.categories (id),
  clicked_at timestamptz not null default now(),
  device public.click_device not null default 'unknown',
  user_agent text,
  is_bot boolean not null default false,
  created_at timestamptz not null default now()
);
create index clicks_clicked_at_idx on public.clicks (clicked_at);
create index clicks_link_code_idx on public.clicks (link_code);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  text text not null,
  mode public.post_mode not null default 'assisted',
  posted_by uuid references auth.users (id) on delete set null,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (offer_id, category_id)
);
create index posts_posted_at_idx on public.posts (posted_at);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index audit_log_at_idx on public.audit_log (at desc);

-- Resumo diário pré-calculado pelo job daily-summary.
create table public.daily_summaries (
  day date primary key,
  top jsonb not null,
  created_at timestamptz not null default now()
);

-- prices é somente inserção.
create function app_private.prices_insert_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'prices é somente inserção';
end;
$$;

create trigger prices_insert_only
  before update on public.prices
  for each row execute function app_private.prices_insert_only();

-- Funções de leitura ----------------------------------------------------------

-- Estatística de preço dos 90 dias anteriores a p_before (exclui o próprio preço da oferta).
create function public.price_stats(p_product_id uuid, p_before timestamptz default now())
returns table (min_90d int, avg_90d numeric, points int, first_seen timestamptz)
language sql stable set search_path = '' as $$
  select
    min(p.price_cents) filter (where p.seen_at >= p_before - interval '90 days')::int,
    avg(p.price_cents) filter (where p.seen_at >= p_before - interval '90 days'),
    (count(*) filter (where p.seen_at >= p_before - interval '90 days'))::int,
    min(p.seen_at)
  from public.prices p
  where p.product_id = p_product_id
    and p.seen_at < p_before;
$$;

-- Produto parecido na mesma loja (trigram >= 0.8), para o revisor decidir.
create function public.find_similar_product(p_store public.store, p_key text)
returns uuid
language sql stable set search_path = '' as $$
  select p.id
  from public.products p
  where p.store = p_store
    and p.canonical_key <> p_key
    and extensions.similarity(p.canonical_key, p_key) >= 0.8
  order by extensions.similarity(p.canonical_key, p_key) desc
  limit 1;
$$;

-- Última aprovação de outra oferta do mesmo produto (regra de duplicata).
create function public.last_approved_at(p_product_id uuid, p_exclude_offer uuid)
returns timestamptz
language sql stable set search_path = '' as $$
  select max(o.approved_at)
  from public.offers o
  where o.product_id = p_product_id
    and o.id <> p_exclude_offer
    and o.approved_at is not null;
$$;
