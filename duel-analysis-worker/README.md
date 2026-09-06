# Touchline duel-analysis worker

This worker samples up to eight video frames with FFmpeg, calls a vision model, and posts a coach-reviewable suggested duel back to Supabase. It can run in Cloud Run later or privately on the coach's own computer now.

It is deliberately conservative: a player is only selected when the model can match a visible shirt number or name to the supplied roster. A low-confidence suggestion must still be reviewed by a coach.

## Free local mode (recommended for the MVP)

1. Install Ollama for Windows and run `ollama pull gemma3` once.
2. Copy `.env.example` to `.env`. Keep `ANALYSIS_PROVIDER=ollama` and enter the three Supabase values locally; never commit this file.
3. Use Docker Desktop to build and run the listener: `docker build -t touchline-duel-worker .` then `docker run --rm --env-file .env --add-host=host.docker.internal:host-gateway touchline-duel-worker python local_poller.py`.
4. Leave that terminal open while you want queued clips analyzed.

The listener makes only outbound HTTPS connections to Supabase. It does not expose your laptop to the internet and does not need Cloudflare Tunnel.

## Deploy to Cloud Run

From this folder, after authenticating with the Google Cloud CLI:

```powershell
gcloud run deploy touchline-duel-analysis --source . --region us-east1 --allow-unauthenticated --set-env-vars OPENAI_MODEL=gpt-4.1-mini
```

Set `OPENAI_API_KEY` and `DUEL_ANALYSIS_WORKER_SECRET` as Cloud Run secrets or environment variables in the Google Cloud console. Although the endpoint is reachable, it rejects every request without the shared `X-Worker-Secret` header.

Copy the deployed `/analyze` URL into Supabase as `DUEL_ANALYSIS_WORKER_URL`, and use the same value for `DUEL_ANALYSIS_WORKER_SECRET` on both sides. Deploy the two Supabase Edge Functions afterward.

Never commit video clips, `.env`, or API keys.
