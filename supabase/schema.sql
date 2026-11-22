-- Execute este script no SQL Editor do seu projeto Supabase.
-- Ele cria a tabela de refeições por usuário com segurança estrita (RLS).

create table if not exists public.user_meal_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  meals jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint meals_is_array check (jsonb_typeof(meals) = 'array')
);

alter table public.user_meal_plans enable row level security;
alter table public.user_meal_plans force row level security;

-- Garante que visitantes não autenticados não tenham nenhum acesso à tabela
revoke all on table public.user_meal_plans from anon;
revoke all on table public.user_meal_plans from public;
grant select, insert, update, delete on table public.user_meal_plans to authenticated;

-- Políticas estritas: cada usuário só acessa/edita os próprios dados
drop policy if exists "Users can view own meal plan" on public.user_meal_plans;
create policy "Users can view own meal plan"
  on public.user_meal_plans
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own meal plan" on public.user_meal_plans;
create policy "Users can insert own meal plan"
  on public.user_meal_plans
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own meal plan" on public.user_meal_plans;
create policy "Users can update own meal plan"
  on public.user_meal_plans
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own meal plan" on public.user_meal_plans;
create policy "Users can delete own meal plan"
  on public.user_meal_plans
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Atualiza automaticamente updated_at a cada gravação
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_meal_plans_updated_at on public.user_meal_plans;
create trigger trg_user_meal_plans_updated_at
  before update on public.user_meal_plans
  for each row
  execute function public.set_updated_at();

-- Habilita Realtime apenas para alterações dessa tabela (opcional, melhora sync ao vivo)
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_meal_plans'
  ) then
    alter publication supabase_realtime add table public.user_meal_plans;
  end if;
end $$;
