create extension if not exists pgcrypto;

create type public.user_status as enum ('active', 'suspended', 'pending_deletion', 'deleted');
create type public.app_role as enum ('player', 'moderator', 'admin');
create type public.match_status as enum ('waiting', 'playing', 'finished', 'abandoned');
create type public.match_result as enum ('won', 'lost', 'escaped', 'abandoned');
create type public.request_kind as enum ('profile_change', 'account_recovery', 'data_export', 'account_deletion', 'suspension_appeal', 'privacy', 'other');
create type public.request_status as enum ('open', 'in_review', 'resolved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  avatar_url text,
  status public.user_status not null default 'active',
  suspended_reason text,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role public.app_role not null default 'player',
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now()
);

create table public.rooms (
  code text primary key check (code ~ '^[A-Z2-9]{6}$'),
  host_user_id uuid references public.profiles(id),
  version bigint not null default 1,
  dealer integer not null default 0,
  snapshot jsonb not null,
  state public.match_status not null default 'waiting',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_events (
  id bigint generated always as identity primary key,
  room_code text not null references public.rooms(code) on delete cascade,
  version bigint not null,
  command_id uuid,
  actor_user_id uuid references public.profiles(id),
  action text not null,
  created_at timestamptz not null default now(),
  unique(room_code, version),
  unique(room_code, command_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  rules_version smallint not null default 1,
  status public.match_status not null default 'playing',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  loser_user_id uuid references public.profiles(id),
  final_snapshot jsonb
);

create table public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid references public.profiles(id),
  display_name text not null,
  seat smallint not null,
  is_bot boolean not null default false,
  result public.match_result,
  escaped boolean not null default false,
  final_card_count integer,
  primary key(match_id, seat),
  check ((is_bot and user_id is null) or (not is_bot and user_id is not null))
);

create table public.player_stat_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id),
  match_id uuid references public.matches(id),
  wins_delta integer not null default 0,
  losses_delta integer not null default 0,
  matches_delta integer not null default 0,
  bot_matches_delta integer not null default 0,
  reason text not null,
  actor_user_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (wins_delta >= 0 and losses_delta >= 0 and matches_delta >= 0 and bot_matches_delta >= 0)
);

create table public.player_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  matches integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  bot_matches integer not null default 0,
  last_played_at timestamptz,
  updated_at timestamptz not null default now(),
  check (wins + losses <= matches)
);
create unique index player_match_result_once on public.player_stat_ledger(match_id,user_id) where match_id is not null;

create table public.account_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  kind public.request_kind not null,
  subject text not null check (char_length(subject) between 1 and 120),
  details text not null check (char_length(details) between 1 and 4000),
  status public.request_status not null default 'open',
  admin_response text,
  assigned_to uuid references public.profiles(id),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references public.profiles(id),
  target_user_id uuid references public.profiles(id),
  request_id uuid references public.account_requests(id),
  action text not null,
  reason text not null check (char_length(reason) between 3 and 1000),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.new_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, coalesce(nullif(left(new.raw_user_meta_data ->> 'full_name', 24), ''), 'Player'), new.raw_user_meta_data ->> 'avatar_url');
  insert into public.user_roles (user_id) values (new.id);
  insert into public.player_stats (user_id) values (new.id);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.new_profile();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_events enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.player_stat_ledger enable row level security;
alter table public.player_stats enable row level security;
alter table public.account_requests enable row level security;
alter table public.admin_audit_log enable row level security;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.user_roles where user_id = auth.uid() and role in ('admin', 'moderator'));
$$;
create policy "profiles own or admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles own update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and status = (select status from public.profiles where id = auth.uid()));
create policy "stats own or admin" on public.player_stats for select using (user_id = auth.uid() or public.is_admin());
create policy "requests own or admin" on public.account_requests for select using (user_id = auth.uid() or public.is_admin());
create policy "requests own create" on public.account_requests for insert with check (user_id = auth.uid());
create policy "audit admins" on public.admin_audit_log for select using (public.is_admin());

create index room_events_room_created on public.room_events(room_code, created_at desc);
create index match_players_user on public.match_players(user_id, match_id desc) where user_id is not null;
create index account_requests_queue on public.account_requests(status, created_at);
