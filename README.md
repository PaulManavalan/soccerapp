# Touchline

Coach-first soccer analysis dashboard for live match tracking, post-game analysis, squad management, and duel review.

## Current prototype

Open `index.html` in a browser to view the frontend prototype.

## Supabase setup

1. In the Supabase project dashboard, open **SQL Editor** and run `supabase/migrations/20260823_initial_schema.sql`.
2. Then run `supabase/migrations/20260829_coach_access.sql` to add coach-scoped access and first-team onboarding.
3. Then run `supabase/migrations/20260830_match_lineups.sql` to store each matchday lineup.
4. Then run `supabase/migrations/20260831_match_events.sql` to enable manual in-game event tracking and player stats.
5. Then run `supabase/migrations/20260901_player_match_stats.sql` to store calculated player match stat lines and ratings.
6. Then run `supabase/migrations/20260902_match_operations.sql` to enable match clocks, substitutions, and exact player minutes.
7. Then run `supabase/migrations/20260903_coach_profiles.sql` to enable editable coach display profiles.
8. In **Project Settings → API Keys**, copy the Project URL and **Publishable key** (not the secret/service-role key).
9. Copy `supabase.config.example.js` to `supabase.config.js`, add the two values. Only the publishable key belongs in browser code.
10. In **Authentication → Providers → Email**, keep Email enabled. For password sign-up without needing a confirmation email during testing, turn off **Confirm email**. Turn it back on and configure a reliable custom SMTP sender before inviting a real coaching staff.

## Initial rating model

Players start at 6.0 when they play. The initial model adds value for goals (+1.25), shots on target (+0.15), completed passes (+0.02), tackles won (+0.18), interceptions (+0.14), clearances (+0.07), possession wins (+0.10), and duels won (+0.12). It deducts for incomplete passes (-0.025), tackles lost (-0.12), possession losses (-0.08), duels lost (-0.10), fouls committed (-0.08), yellow cards (-0.30), and red cards (-1.50). Ratings are capped from 1.0 to 10.0.

The app now uses an email-and-password sign-in flow. New coaches choose **Create an account** on the sign-in screen; passwords must be at least eight characters.

The secret/service-role key must never be placed in browser code or committed to Git.

## Free hosting fallback

This repository includes `.github/workflows/deploy-pages.yml` for GitHub Pages. In the GitHub repository, open **Settings → Pages**, set the source to **GitHub Actions**, and the next push to `main` will publish the site to the Pages URL shown in the workflow run. This works as a no-cost static-hosting alternative to Netlify.

## Duels MVP

The first Duels workflow is designed for coach review:

1. View ground and aerial duels on a pitch map.
2. Filter by player, outcome, and match period.
3. Review a suggested outcome and its confidence score.
4. Confirm or correct the event before it contributes to team metrics.

Automated, camera-based duel detection is a later phase. Match footage, clips, and API keys must not be committed to this repository.
