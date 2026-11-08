-- RLS (SPEC seções 4, 8 e 11).
-- Operador = linha em operator_profiles + sessão com MFA (aal2).
-- Bot e redirecionador escrevem só com a service role, no servidor.

grant usage on schema app_private to authenticated, service_role;

create function app_private.current_operator_role() returns public.operator_role
language sql stable security definer set search_path = '' as $$
  select op.role
  from public.operator_profiles op
  where op.user_id = (select auth.uid())
    and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

create function app_private.is_operator() returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.current_operator_role() is not null;
$$;

create function app_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app_private.current_operator_role() = 'admin', false);
$$;

revoke execute on function app_private.current_operator_role() from public, anon;
revoke execute on function app_private.is_operator() from public, anon;
revoke execute on function app_private.is_admin() from public, anon;
grant execute on function app_private.current_operator_role() to authenticated, service_role;
grant execute on function app_private.is_operator() to authenticated, service_role;
grant execute on function app_private.is_admin() to authenticated, service_role;

-- RLS em tudo -----------------------------------------------------------------

alter table public.categories enable row level security;
alter table public.rule_config enable row level security;
alter table public.operator_profiles enable row level security;
alter table public.users enable row level security;
alter table public.consents enable row level security;
alter table public.preferences enable row level security;
alter table public.bot_sessions enable row level security;
alter table public.processed_wa_messages enable row level security;
alter table public.bot_message_log enable row level security;
alter table public.optout_log enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.products enable row level security;
alter table public.prices enable row level security;
alter table public.raw_inputs enable row level security;
alter table public.offers enable row level security;
alter table public.links enable row level security;
alter table public.clicks enable row level security;
alter table public.posts enable row level security;
alter table public.audit_log enable row level security;
alter table public.daily_summaries enable row level security;

-- Tabelas só do bot (consents, preferences, bot_sessions, processed_wa_messages,
-- bot_message_log, optout_log): nenhuma política = nenhum acesso fora da service role.

-- Categorias e configuração: operadores leem, admin altera.
create policy categories_select on public.categories
  for select to authenticated using ((select app_private.is_operator()));
create policy categories_admin_insert on public.categories
  for insert to authenticated with check ((select app_private.is_admin()));
create policy categories_admin_update on public.categories
  for update to authenticated using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

create policy rule_config_select on public.rule_config
  for select to authenticated using ((select app_private.is_operator()));
create policy rule_config_admin_insert on public.rule_config
  for insert to authenticated with check ((select app_private.is_admin()));
create policy rule_config_admin_update on public.rule_config
  for update to authenticated using ((select app_private.is_admin())) with check ((select app_private.is_admin()));

-- Perfis: cada um lê o próprio (antes do MFA, para o proxy decidir), operadores leem todos, admin gerencia.
create policy operator_profiles_select_self on public.operator_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy operator_profiles_select_operators on public.operator_profiles
  for select to authenticated using ((select app_private.is_operator()));
create policy operator_profiles_admin_insert on public.operator_profiles
  for insert to authenticated with check ((select app_private.is_admin()));
create policy operator_profiles_admin_update on public.operator_profiles
  for update to authenticated using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
create policy operator_profiles_admin_delete on public.operator_profiles
  for delete to authenticated using ((select app_private.is_admin()));

-- Assinantes: operadores leem (caixa de entrada precisa da janela de 24 h).
create policy users_select on public.users
  for select to authenticated using ((select app_private.is_operator()));

-- Caixa de entrada.
create policy inbox_select on public.inbox_messages
  for select to authenticated using ((select app_private.is_operator()));
create policy inbox_update on public.inbox_messages
  for update to authenticated using ((select app_private.is_operator())) with check ((select app_private.is_operator()));

-- Produtos e preços.
create policy products_select on public.products
  for select to authenticated using ((select app_private.is_operator()));
create policy products_insert on public.products
  for insert to authenticated with check ((select app_private.is_operator()));
create policy products_update on public.products
  for update to authenticated using ((select app_private.is_operator())) with check ((select app_private.is_operator()));

create policy prices_select on public.prices
  for select to authenticated using ((select app_private.is_operator()));
create policy prices_insert on public.prices
  for insert to authenticated with check ((select app_private.is_operator()));

-- Entrada e ofertas.
create policy raw_inputs_select on public.raw_inputs
  for select to authenticated using ((select app_private.is_operator()));
create policy raw_inputs_insert on public.raw_inputs
  for insert to authenticated with check ((select app_private.is_operator()));
create policy raw_inputs_update on public.raw_inputs
  for update to authenticated using ((select app_private.is_operator())) with check ((select app_private.is_operator()));

create policy offers_select on public.offers
  for select to authenticated using ((select app_private.is_operator()));
create policy offers_insert on public.offers
  for insert to authenticated with check ((select app_private.is_operator()));
create policy offers_update on public.offers
  for update to authenticated using ((select app_private.is_operator())) with check ((select app_private.is_operator()));

-- Links, cliques e posts.
create policy links_select on public.links
  for select to authenticated using ((select app_private.is_operator()));
create policy links_insert on public.links
  for insert to authenticated with check ((select app_private.is_operator()));

create policy clicks_select on public.clicks
  for select to authenticated using ((select app_private.is_operator()));

create policy posts_select on public.posts
  for select to authenticated using ((select app_private.is_operator()));
create policy posts_insert on public.posts
  for insert to authenticated with check ((select app_private.is_operator()));

-- Auditoria: operador registra as próprias ações, admin lê.
create policy audit_insert on public.audit_log
  for insert to authenticated with check ((select app_private.is_operator()) and actor_id = (select auth.uid()));
create policy audit_select on public.audit_log
  for select to authenticated using ((select app_private.is_admin()));

create policy daily_summaries_select on public.daily_summaries
  for select to authenticated using ((select app_private.is_operator()));
