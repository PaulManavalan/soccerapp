-- Touchline initial schema
-- Run this once in Supabase Dashboard → SQL Editor.

create extension if not exists pgcrypto;

create type public.duel_type as enum ('ground', 'aerial');
create type public.duel_outcome as enum ('won', 'lost');
create type public.duel_review_status as enum ('suggested', 'confirmed', 'corrected');
create type public.team_role as enum ('coach', 'assistant_coach');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.team_role not null default 'coach',
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  shirt_number smallint not null check (shirt_number between 1 and 99),
  position text,
  created_at timestamptz not null default now(),
  unique (team_id, shirt_number)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  opponent_name text not null,
  started_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'final')),
  created_at timestamptz not null default now()
);

create table public.duels (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  occurred_at_seconds integer not null check (occurred_at_seconds >= 0),
  pitch_x numeric(5,2) not null check (pitch_x between 0 and 100),
  pitch_y numeric(5,2) not null check (pitch_y between 0 and 100),
  duel_type public.duel_type not null,
  outcome public.duel_outcome not null,
  suggested_outcome public.duel_outcome,
  confidence smallint check (confidence between 0 and 100),
  review_status public.duel_review_status not null default 'suggested',
  clip_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index players_team_id_idx on public.players(team_id);
create index matches_team_id_idx on public.matches(team_id);
create index duels_match_id_idx on public.duels(match_id);
create index duels_player_id_idx on public.duels(player_id);

-- RLS is enabled before the app is connected. No browser client can read or
-- modify these tables until the next migration adds authenticated coach policies.
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.duels enable row level security;

revoke all on public.teams, public.team_members, public.players, public.matches, public.duels from anon;
revoke all on public.teams, public.team_members, public.players, public.matches, public.duels from authenticated;
