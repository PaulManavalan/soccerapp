-- Some teams use #0 for a goalkeeper. Keep numbers unique within each team.

alter table public.players drop constraint if exists players_shirt_number_check;
alter table public.players add constraint players_shirt_number_check check (shirt_number between 0 and 99);
