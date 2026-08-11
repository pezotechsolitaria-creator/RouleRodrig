-- M52 — The starting food taxonomy.
--
-- NOT the generic delivery-app list (Pizza, Burgers, Sushi, Chinese). That list
-- describes an American suburb and would leave the actual menu of this island
-- filed under "Other". Rodrigues food is octopus, grilled fish, Creole curries
-- and rougaille, boulettes, achards, and a handful of imported fast-food items
-- — so the taxonomy names those first and keeps the borrowed categories at the
-- bottom where they belong.
--
-- `ourite` gets its own category rather than living inside `seafood`. On this
-- island octopus is not a kind of seafood, it is THE dish — it has its own
-- season, its own closure period, and it is what a visitor arrives having heard
-- about. A category the customer already has a word for is worth a row.
--
-- ON CONFLICT DO NOTHING, deliberately: this seeds a NEW database and must never
-- overwrite a name, emoji or ordering the owner has since edited in /admin.
-- Re-running it is a no-op, which is what makes it safe to leave in the chain.

insert into food_categories (slug, name, name_fr, name_cr, emoji, position) values
  ('local',     'Rodriguan classics', 'Cuisine rodriguaise', 'Manzé rodrigé',   '🍛', 10),
  ('ourite',    'Octopus',            'Ourite',              'Ourit',           '🐙', 20),
  ('seafood',   'Fish & seafood',     'Poisson & fruits de mer', 'Pwason ek frwi de mer', '🐟', 30),
  ('grill',     'Grilled',            'Grillades',           'Grilé',           '🔥', 40),
  ('curry',     'Curry & rougaille',  'Cari & rougaille',    'Kari ek rougay',  '🥘', 50),
  ('snacks',    'Snacks & bites',     'En-cas',              'Ti manzé',        '🥟', 60),
  ('breakfast', 'Breakfast',          'Petit-déjeuner',      'Manzé gramatin',  '🥐', 70),
  ('veg',       'Vegetarian',         'Végétarien',          'Vezetaryin',      '🥗', 80),
  ('sharing',   'Family & sharing',   'À partager',          'Pou partazé',     '🍱', 90),
  ('desserts',  'Desserts',           'Desserts',            'Deser',           '🍮', 100),
  ('drinks',    'Drinks',             'Boissons',            'Bwason',          '🥤', 110)
on conflict (slug) do nothing;
