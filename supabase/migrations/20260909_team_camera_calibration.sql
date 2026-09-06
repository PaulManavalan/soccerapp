-- One reusable calibration per team for a fixed midfield camera position.
create table if not exists public.team_camera_calibrations (
  team_id uuid primary key references public.teams(id) on delete cascade,
  attack_direction text not null check (attack_direction in ('top', 'bottom')),
  frame_corners jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.team_camera_calibrations enable row level security;
grant select, insert, update on public.team_camera_calibrations to authenticated;

drop policy if exists "Coaches can view camera calibration" on public.team_camera_calibrations;
create policy "Coaches can view camera calibration" on public.team_camera_calibrations
  for select to authenticated using (public.can_access_team(team_id));
drop policy if exists "Coaches can add camera calibration" on public.team_camera_calibrations;
create policy "Coaches can add camera calibration" on public.team_camera_calibrations
  for insert to authenticated with check (public.can_access_team(team_id));
drop policy if exists "Coaches can update camera calibration" on public.team_camera_calibrations;
create policy "Coaches can update camera calibration" on public.team_camera_calibrations
  for update to authenticated using (public.can_access_team(team_id)) with check (public.can_access_team(team_id));
