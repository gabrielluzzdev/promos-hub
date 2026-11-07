-- Estatísticas do painel (/painel/hoje) e agendamento dos jobs (SPEC seção 10).
-- "Hoje" é o dia de São Paulo.

create function public.sp_day_bounds(p_day date)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql immutable set search_path = '' as $$
  select (p_day::timestamp at time zone 'America/Sao_Paulo'),
         ((p_day + 1)::timestamp at time zone 'America/Sao_Paulo');
$$;

create function public.sp_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Posts e cliques (sem robôs) por canal no dia. security invoker: respeita a RLS de quem chama.
create function public.channel_stats(p_day date default public.sp_today())
returns table (
  category_id uuid, slug text, name text, daily_min_posts int, posts_count int, clicks_count int
)
language sql stable security invoker set search_path = '' as $$
  with b as (select * from public.sp_day_bounds(p_day))
  select c.id, c.slug, c.name, c.daily_min_posts,
    (select count(*) from public.posts p
      where p.category_id = c.id and p.posted_at >= b.starts_at and p.posted_at < b.ends_at)::int,
    (select count(*) from public.clicks k
      where k.category_id = c.id and not k.is_bot and k.clicked_at >= b.starts_at and k.clicked_at < b.ends_at)::int
  from public.categories c, b
  where c.active
  order by c.sort_order;
$$;

-- Ofertas com mais cliques (sem robôs) no dia.
create function public.top_offers(p_day date default public.sp_today(), p_limit int default 10)
returns table (
  offer_id uuid, post_title text, category_id uuid, status public.offer_status,
  send_to_general boolean, clicks_count int
)
language sql stable security invoker set search_path = '' as $$
  with b as (select * from public.sp_day_bounds(p_day))
  select o.id, o.post_title, o.category_id, o.status, o.send_to_general, count(k.id)::int
  from public.clicks k
  join public.links l on l.code = k.link_code
  join public.offers o on o.id = l.offer_id
  cross join b
  where not k.is_bot and k.clicked_at >= b.starts_at and k.clicked_at < b.ends_at
  group by o.id
  order by count(k.id) desc, o.id
  limit p_limit;
$$;

-- Agendamento: Supabase Cron -> pg_net -> /api/jobs/*, com o header x-cron-secret.
-- Rodar uma vez em produção (SQL editor, como postgres):
--   select app_private.configure_jobs('https://SEU-DOMINIO', 'mesmo valor de CRON_SECRET');

create extension if not exists pg_net;
create extension if not exists pg_cron;

create function app_private.configure_jobs(p_base_url text, p_cron_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_job record;
begin
  delete from vault.secrets where name in ('app_base_url', 'cron_secret');
  perform vault.create_secret(rtrim(p_base_url, '/'), 'app_base_url', 'URL base do app para os jobs');
  perform vault.create_secret(p_cron_secret, 'cron_secret', 'Segredo enviado em x-cron-secret');

  for v_job in
    select * from (values
      ('parser-retry', '*/5 * * * *'),
      ('expire-offers', '*/15 * * * *'),
      ('daily-summary', '0 23 * * *')  -- 20:00 em São Paulo (UTC-3, sem horário de verão)
    ) as j (name, schedule)
  loop
    perform cron.schedule(
      v_job.name,
      v_job.schedule,
      format(
        $cmd$select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/jobs/%s',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 30000
        )$cmd$,
        v_job.name
      )
    );
  end loop;
end;
$$;

revoke execute on function app_private.configure_jobs(text, text) from public, anon, authenticated;
