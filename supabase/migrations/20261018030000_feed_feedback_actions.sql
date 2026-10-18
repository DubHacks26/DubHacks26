alter table public.product_interactions
  drop constraint if exists product_interactions_action_check;

alter table public.product_interactions
  add constraint product_interactions_action_check
  check (action in (
    'like',
    'unlike',
    'save',
    'unsave',
    'skip',
    'show_less',
    'too_expensive',
    'less_category'
  ));
