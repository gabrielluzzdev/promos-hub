-- Testes de banco (pgTAP). Rodam com `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- Usuários de teste --------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@teste.local'),
  ('00000000-0000-0000-0000-00000000000c', 'curador@teste.local'),
  ('00000000-0000-0000-0000-00000000000e', 'estranho@teste.local');

insert into public.operator_profiles (user_id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin', 'admin'),
  ('00000000-0000-0000-0000-00000000000c', 'Curador', 'curator');

-- Seeds ------------------------------------------------------------------------
select is((select count(*) from public.categories)::int, 7, 'seed: 7 categorias');
select is((select daily_min_posts from public.categories where slug = 'geral'), 6, 'seed: geral com mínimo 6');
select is((select value from public.rule_config where key = 'min_discount_pct'), '15'::jsonb, 'seed: desconto mínimo 15');

-- RLS: curador sem MFA ----------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000c", "aal": "aal1", "role": "authenticated"}';

select is((select count(*) from public.categories)::int, 0, 'curador sem MFA não lê categorias');
select is((select count(*) from public.offers)::int, 0, 'curador sem MFA não lê ofertas');
select is((select count(*) from public.operator_profiles)::int, 1, 'curador sem MFA lê só o próprio perfil');

-- RLS: curador com MFA ----------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000c", "aal": "aal2", "role": "authenticated"}';

select is((select count(*) from public.categories)::int, 7, 'curador com MFA lê categorias');
select is((select count(*) from public.operator_profiles)::int, 2, 'curador com MFA lê os perfis');
with u as (update public.rule_config set value = '99' where key = 'min_discount_pct' returning 1)
select is((select count(*) from u)::int, 0, 'curador não altera rule_config');
with u as (update public.categories set daily_min_posts = 1 where slug = 'games' returning 1)
select is((select count(*) from u)::int, 0, 'curador não altera categorias');
select is((select count(*) from public.audit_log)::int, 0, 'curador não lê auditoria');
select is((select count(*) from public.preferences)::int, 0, 'curador não lê preferências dos assinantes');

-- RLS: admin --------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "aal": "aal1", "role": "authenticated"}';
with u as (update public.rule_config set value = '20' where key = 'min_discount_pct' returning 1)
select is((select count(*) from u)::int, 0, 'admin sem MFA não altera rule_config');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "aal": "aal2", "role": "authenticated"}';
with u as (update public.rule_config set value = '20' where key = 'min_discount_pct' returning 1)
select is((select count(*) from u)::int, 1, 'admin com MFA altera rule_config');

-- RLS: autenticado sem perfil e anônimo -----------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000e", "aal": "aal2", "role": "authenticated"}';
select is((select count(*) from public.categories)::int, 0, 'sem perfil de operador não lê nada');

reset role;
set local role anon;
select is((select count(*) from public.categories)::int, 0, 'anônimo não lê categorias');
reset role;

-- price_stats ---------------------------------------------------------------------
insert into public.products (id, store, canonical_key, name)
values ('00000000-0000-0000-0000-0000000000f1', 'amazon', 'B0TESTE001', 'Produto teste');

insert into public.prices (product_id, price_cents, seen_at, source) values
  ('00000000-0000-0000-0000-0000000000f1', 100000, '2026-01-01T12:00:00Z', 'manual'),  -- fora dos 90 dias
  ('00000000-0000-0000-0000-0000000000f1', 120000, '2026-09-20T12:00:00Z', 'manual'),
  ('00000000-0000-0000-0000-0000000000f1', 100000, '2026-10-10T12:00:00Z', 'manual'),
  ('00000000-0000-0000-0000-0000000000f1', 80000, '2026-11-02T12:00:00Z', 'manual');    -- depois do corte

select results_eq(
  $$ select min_90d, avg_90d, points, first_seen
     from public.price_stats('00000000-0000-0000-0000-0000000000f1', '2026-11-01T00:00:00Z') $$,
  $$ values (100000, 110000::numeric, 2, '2026-01-01T12:00:00Z'::timestamptz) $$,
  'price_stats: só 90 dias antes do corte, first_seen do histórico todo'
);

select is(
  (select points from public.price_stats('00000000-0000-0000-0000-000000000999', now())),
  0,
  'price_stats: produto sem histórico tem 0 pontos'
);

select throws_ok(
  $$ update public.prices set price_cents = 1 $$,
  'P0001',
  'prices é somente inserção',
  'prices não aceita update'
);

-- SAIR: apagar o assinante não deixa nada da pessoa --------------------------------
insert into public.users (id, phone_e164, wa_id) values
  ('00000000-0000-0000-0000-0000000000b1', '+5548999990000', '5548999990000');
insert into public.consents (user_id, consent_version, consent_text)
values ('00000000-0000-0000-0000-0000000000b1', 'v1', 'texto');
insert into public.preferences (user_id, category_id)
select '00000000-0000-0000-0000-0000000000b1', id from public.categories where slug = 'games';
insert into public.bot_sessions (user_id, state) values ('00000000-0000-0000-0000-0000000000b1', 'idle');
insert into public.inbox_messages (user_id, text) values ('00000000-0000-0000-0000-0000000000b1', 'oi');
insert into public.bot_message_log (user_id, direction, kind) values ('00000000-0000-0000-0000-0000000000b1', 'in', 'text');

delete from public.users where id = '00000000-0000-0000-0000-0000000000b1';

select is(
  (select count(*) from public.consents where user_id = '00000000-0000-0000-0000-0000000000b1')
  + (select count(*) from public.preferences where user_id = '00000000-0000-0000-0000-0000000000b1')
  + (select count(*) from public.bot_sessions where user_id = '00000000-0000-0000-0000-0000000000b1')
  + (select count(*) from public.inbox_messages where user_id = '00000000-0000-0000-0000-0000000000b1'),
  0::bigint,
  'apagar o assinante remove consentimento, preferências, sessão e caixa'
);
select is(
  (select count(*) from public.bot_message_log where user_id is null)::int,
  1,
  'log de mensagens fica sem vínculo com a pessoa'
);

-- Similaridade de produto -------------------------------------------------------
insert into public.products (store, canonical_key, name)
values ('amazon', 'samsung-galaxy-s24-128gb', 'Galaxy S24');
select is(
  (select name from public.products where id = public.find_similar_product('amazon', 'samsung-galaxy-s24-128-gb')),
  'Galaxy S24',
  'find_similar_product acha chave parecida na mesma loja'
);

select * from finish();
rollback;
