-- Match-specific kit information gives the vision worker an explicit team
-- identity instead of asking it to infer colors from wide camera footage.
alter table public.matches
  add column if not exists team_kit_color text not null default 'blue',
  add column if not exists opponent_kit_color text not null default 'white',
  add column if not exists team_goalkeeper_kit_color text not null default 'yellow',
  add column if not exists opponent_goalkeeper_kit_color text not null default 'green';

alter table public.matches
  drop constraint if exists matches_team_kit_color_length,
  drop constraint if exists matches_opponent_kit_color_length,
  drop constraint if exists matches_team_goalkeeper_kit_color_length,
  drop constraint if exists matches_opponent_goalkeeper_kit_color_length;

alter table public.matches
  add constraint matches_team_kit_color_length check (char_length(team_kit_color) between 2 and 40),
  add constraint matches_opponent_kit_color_length check (char_length(opponent_kit_color) between 2 and 40),
  add constraint matches_team_goalkeeper_kit_color_length check (char_length(team_goalkeeper_kit_color) between 2 and 40),
  add constraint matches_opponent_goalkeeper_kit_color_length check (char_length(opponent_goalkeeper_kit_color) between 2 and 40);
