# Touchline

Coach-first soccer analysis dashboard for live match tracking, post-game analysis, squad management, and duel review.

## Current prototype

Open `index.html` in a browser to view the frontend prototype.

## Supabase setup

1. In the Supabase project dashboard, open **SQL Editor** and run `supabase/migrations/20260823_initial_schema.sql`.
2. Then run `supabase/migrations/20260829_coach_access.sql` to add coach-scoped access and first-team onboarding.
3. Then run `supabase/migrations/20260830_match_lineups.sql` to store each matchday lineup.
4. Then run `supabase/migrations/20260831_match_events.sql` to enable manual in-game event tracking and player stats.
5. In **Project Settings → API Keys**, copy the Project URL and **Publishable key** (not the secret/service-role key).
6. Copy `supabase.config.example.js` to `supabase.config.js`, add the two values. Only the publishable key belongs in browser code.
7. In **Authentication → Providers → Email**, keep Email enabled. For password sign-up without needing a confirmation email during testing, turn off **Confirm email**. Turn it back on and configure a reliable custom SMTP sender before inviting a real coaching staff.

The app now uses an email-and-password sign-in flow. New coaches choose **Create an account** on the sign-in screen; passwords must be at least eight characters.

The secret/service-role key must never be placed in browser code or committed to Git.

## Duels MVP

The first Duels workflow is designed for coach review:

1. View ground and aerial duels on a pitch map.
2. Filter by player, outcome, and match period.
3. Review a suggested outcome and its confidence score.
4. Confirm or correct the event before it contributes to team metrics.

Automated, camera-based duel detection is a later phase. Match footage, clips, and API keys must not be committed to this repository.
