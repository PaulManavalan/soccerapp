# Touchline duel-analysis worker

This Cloud Run-ready worker receives a short, private Supabase clip URL, samples up to eight video frames with FFmpeg, calls a vision model, and posts a coach-reviewable suggested duel back to Supabase.

It is deliberately conservative: a player is only selected when the model can match a visible shirt number or name to the supplied roster. A low-confidence suggestion must still be reviewed by a coach.

## Local run

1. Copy `.env.example` to `.env` and fill in the two secrets.
2. Install dependencies: `python -m pip install -r requirements.txt`.
3. Run: `uvicorn main:app --reload --port 8080`.
4. Check `http://localhost:8080/health`.

## Deploy to Cloud Run

From this folder, after authenticating with the Google Cloud CLI:

```powershell
gcloud run deploy touchline-duel-analysis --source . --region us-east1 --allow-unauthenticated --set-env-vars OPENAI_MODEL=gpt-4.1-mini
```

Set `OPENAI_API_KEY` and `DUEL_ANALYSIS_WORKER_SECRET` as Cloud Run secrets or environment variables in the Google Cloud console. Although the endpoint is reachable, it rejects every request without the shared `X-Worker-Secret` header.

Copy the deployed `/analyze` URL into Supabase as `DUEL_ANALYSIS_WORKER_URL`, and use the same value for `DUEL_ANALYSIS_WORKER_SECRET` on both sides. Deploy the two Supabase Edge Functions afterward.

Never commit video clips, `.env`, or API keys.
