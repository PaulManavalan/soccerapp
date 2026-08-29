# Touchline

Coach-first soccer analysis dashboard for live match tracking, post-game analysis, squad management, and duel review.

## Current prototype

Open `index.html` in a browser to view the frontend prototype.

## Supabase setup

1. In the Supabase project dashboard, open **SQL Editor** and run `supabase/migrations/20260823_initial_schema.sql`.
2. Then run `supabase/migrations/20260829_coach_access.sql` to add coach-scoped access and first-team onboarding.
3. Then run `supabase/migrations/20260830_match_lineups.sql` to store each matchday lineup.
4. In **Project Settings → API Keys**, copy the Project URL and **Publishable key** (not the secret/service-role key).
5. Copy `supabase.config.example.js` to `supabase.config.js`, add the two values. Only the publishable key belongs in browser code.
6. In **Authentication → URL Configuration**, add `https://touchlinecoach.netlify.app` as the Site URL and an allowed redirect URL before using magic-link sign-in.

The secret/service-role key must never be placed in browser code or committed to Git.

## Duels MVP

The first Duels workflow is designed for coach review:

1. View ground and aerial duels on a pitch map.
2. Filter by player, outcome, and match period.
3. Review a suggested outcome and its confidence score.
4. Confirm or correct the event before it contributes to team metrics.

Automated, camera-based duel detection is a later phase. Match footage, clips, and API keys must not be committed to this repository.
