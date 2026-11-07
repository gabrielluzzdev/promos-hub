-- Dados iniciais (como migration, para valer também em produção).
-- channel_url fica vazio: o admin preenche em /painel/config.

insert into public.categories (slug, name, daily_min_posts, sort_order) values
  ('geral', 'Geral', 6, 0),
  ('tecnologia', 'Tecnologia e PCs', 12, 1),
  ('games', 'Games', 12, 2),
  ('casa', 'Casa e Decoração', 12, 3),
  ('moda', 'Moda e Calçados', 12, 4),
  ('livros_papelaria', 'Livros e Papelaria', 12, 5),
  ('beleza', 'Beleza e Cuidados', 12, 6)
on conflict (slug) do nothing;

insert into public.rule_config (key, value) values
  ('min_discount_pct', '15'),
  ('dup_block_days', '7'),
  ('allowed_stores', '["amazon", "mercadolivre", "shopee", "magalu", "kabum", "casasbahia", "americanas"]'),
  ('silence', '{"start": "23:00", "end": "08:00"}'),
  ('offer_ttl_hours', '24'),
  ('badge_min_history_days', '30'),
  ('badge_min_price_points', '5')
on conflict (key) do nothing;
