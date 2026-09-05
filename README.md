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
8. Then run `supabase/migrations/20260904_allow_creator_membership_retry.sql` to make interrupted team setup safe to retry.
9. Then run `supabase/migrations/20260905_team_creator_access.sql` so the coach who creates a team can use it immediately; adding a roster is handled later in Settings.
10. Then run `supabase/migrations/20260906_duel_clip_queue.sql` to create the private video bucket and the clip-analysis queue. It supports uploads; a vision worker is configured separately.
11. In **Project Settings → API Keys**, copy the Project URL and **Publishable key** (not the secret/service-role key).
12. Copy `supabase.config.example.js` to `supabase.config.js`, add the two values. Only the publishable key belongs in browser code.
13. In **Authentication → Providers → Email**, keep Email enabled. For password sign-up without needing a confirmation email during testing, turn off **Confirm email**. Turn it back on and configure a reliable custom SMTP sender before inviting a real coaching staff.

## Duel clip automation handoff

The clip uploader writes a private file and a `duel_clip_jobs` queue row. The included Edge Functions then hand a 15-minute signed clip URL to a separate vision worker and accept its result:

- `supabase/functions/start-duel-analysis/index.ts` is invoked by the signed-in coach after upload. Deploy it with JWT verification enabled.
- `supabase/functions/complete-duel-analysis/index.ts` is called only by the worker. Deploy it with JWT verification disabled and protect it with `DUEL_ANALYSIS_WORKER_SECRET`.

Set these two Edge Function secrets before deploying: `DUEL_ANALYSIS_WORKER_URL` (the worker's HTTPS endpoint) and `DUEL_ANALYSIS_WORKER_SECRET` (a long random value shared only with the worker). The worker receives `jobId`, `teamId`, `matchId`, a temporary `clipUrl`, and a `callbackUrl`. It must POST this shape to the callback with the `X-Worker-Secret` header:

`supabase/config.toml` is included so `start-duel-analysis` requires a signed-in coach while `complete-duel-analysis` accepts only the separately authenticated worker callback. Do not make the callback function public without its shared secret.

```json
{
  "jobId": "uuid",
  "status": "complete",
  "playerId": "uuid or null",
  "duelType": "ground",
  "outcome": "won",
  "confidence": 78,
  "occurredAtSeconds": 14,
  "pitchX": 50,
  "pitchY": 50,
  "note": "Optional short explanation"
}
```

Use `{ "jobId": "uuid", "status": "failed", "note": "reason" }` if analysis cannot finish. The callback saves a suggested, coach-reviewable duel automatically.

## Initial rating model

Players start at 6.0 when they play. The initial model adds value for goals (+1.25), shots on target (+0.15), completed passes (+0.02), tackles won (+0.18), interceptions (+0.14), clearances (+0.07), possession wins (+0.10), and duels won (+0.12). It deducts for incomplete passes (-0.025), tackles lost (-0.12), possession losses (-0.08), duels lost (-0.10), fouls committed (-0.08), yellow cards (-0.30), and red cards (-1.50). Ratings are capped from 1.0 to 10.0.

The app now uses an email-and-password sign-in flow. New coaches choose **Create an account** on the sign-in screen; passwords must be at least eight characters.

The secret/service-role key must never be placed in browser code or committed to Git.

## Free hosting fallback

This repository includes `.github/workflows/deploy-pages.yml` for GitHub Pages. In the GitHub repository, open **Settings → Pages**, set the source to **GitHub Actions**, and the next push to `main` will publish the site to the Pages URL shown in the workflow run. This works as a no-cost static-hosting alternative to Netlify.

## Coach invitations

The invitation UI calls the secure Edge Function in `supabase/functions/invite-coach/index.ts`. Deploy it once with `supabase functions deploy invite-coach` while linked to this Supabase project. In **Authentication → URL Configuration**, add your deployed app URL as an allowed redirect URL. Invitations use Supabase Auth email delivery, so configure a custom SMTP provider before inviting a real staff group.

## Duels MVP

The first Duels workflow is designed for coach review:

1. View ground and aerial duels on a pitch map.
2. Filter by player, outcome, and match period.
3. Review a suggested outcome and its confidence score.
4. Confirm or correct the event before it contributes to team metrics.

Automated, camera-based duel detection is a later phase. Match footage, clips, and API keys must not be committed to this repository.
