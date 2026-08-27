-- Dayman — Supabase SQL Schema
-- Run this in the Supabase SQL Editor to set up your database.

-- 1. Profiles table (extends auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

-- 2. User data table (all app state)
create table if not exists user_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- 3. Push subscriptions table (for background notifications)
create table if not exists push_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  endpoint text not null,
  keys jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. Active sessions table (for scheduling background notifications)
create table if not exists active_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  blocks jsonb not null default '[]',
  scheduled_at timestamptz default now()
);

-- 5. Weekly leaderboard scores (computed server-side from user_data history)
create table if not exists weekly_scores (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  xp int not null default 0,
  tasks_completed int not null default 0,
  focus_minutes int not null default 0,
  active_days int not null default 0,
  display_name text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create index if not exists idx_weekly_scores_week on weekly_scores (week_start, xp desc);

-- 5. RLS policies (row-level security) — idempotent
alter table profiles enable row level security;
alter table user_data enable row level security;
alter table push_subscriptions enable row level security;
alter table weekly_scores enable row level security;

-- Profiles: drop old policies, then recreate
drop policy if exists "Users can view own profile" on profiles;
drop policy if exists "Users can update own profile" on profiles;
drop policy if exists "Users can insert own profile" on profiles;
drop policy if exists "Users can delete own profile" on profiles;

create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Users can delete own profile"
  on profiles for delete
  using (auth.uid() = id);

-- User data: drop old policies, then recreate
drop policy if exists "Users can view own data" on user_data;
drop policy if exists "Users can update own data" on user_data;
drop policy if exists "Users can insert own data" on user_data;
drop policy if exists "Users can delete own data" on user_data;

create policy "Users can view own data"
  on user_data for select
  using (auth.uid() = user_id);

create policy "Users can update own data"
  on user_data for update
  using (auth.uid() = user_id);

create policy "Users can insert own data"
  on user_data for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own data"
  on user_data for delete
  using (auth.uid() = user_id);

-- Push subscriptions: drop old policies, then recreate
drop policy if exists "Users can view own push subscription" on push_subscriptions;
drop policy if exists "Users can upsert own push subscription" on push_subscriptions;
drop policy if exists "Users can update own push subscription" on push_subscriptions;
drop policy if exists "Users can delete own push subscription" on push_subscriptions;

create policy "Users can view own push subscription"
  on push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can upsert own push subscription"
  on push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own push subscription"
  on push_subscriptions for update
  using (auth.uid() = user_id);

create policy "Users can delete own push subscription"
  on push_subscriptions for delete
  using (auth.uid() = user_id);

-- Weekly scores: authenticated users can read all scores (public leaderboard)
-- No INSERT/UPDATE/DELETE policies — only the Edge Function (service_role) writes
drop policy if exists "Authenticated can read weekly scores" on weekly_scores;

create policy "Authenticated can read weekly scores"
  on weekly_scores for select
  using (auth.role() = 'authenticated');

-- 4. Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
