# Touchline duel-analysis worker

This worker samples up to eight video frames with FFmpeg, calls a vision model, and posts a coach-reviewable suggested duel back to Supabase. It can run in Cloud Run later or privately on the coach's own computer now.

It is deliberately conservative: a player is only selected when the model can match a visible shirt number or name to the supplied roster. A low-confidence suggestion must still be reviewed by a coach.

## Free local mode (recommended for the MVP)

1. Install Ollama for Windows and run `ollama pull gemma3` once.
2. Copy `.env.example` to `.env`. Keep `ANALYSIS_PROVIDER=ollama` and enter the three Supabase values locally; never commit this file.
3. Use Docker Desktop to build and run the listener: `docker build -t touchline-duel-worker .` then `docker run --rm --env-file .env --add-host=host.docker.internal:host-gateway touchline-duel-worker python local_poller.py`.
4. Leave that terminal open while you want queued clips analyzed.

The listener makes only outbound HTTPS connections to Supabase. It does not expose your laptop to the internet and does not need Cloudflare Tunnel.

## Scan a full match locally

`batch_scan.py` is for building a review set from a full match file. It scans the complete game in overlapping windows and saves only **likely** one-on-one duels to a local folder. It does not upload the match, extracted clips, or results to Hudl or Supabase.

The local Ollama model is a candidate finder, not an official stat source: it saves only a specific, timed ball contest for coach review before using it as training data or a match event. A 2.5-hour match creates roughly 900 model windows at the default coverage settings, so let the Legion run it overnight with Docker and Ollama open.

When `OLLAMA_MODEL=qwen2.5vl:7b`, Touchline automatically sends three reduced-size chronological frames. This is intentional: it fits the model in Ollama's default local context while preserving enough time information for a short contest review.

From this folder, build the image and run the scan. Replace the two Windows paths with your source file and destination folder:

```powershell
docker build -t touchline-duel-worker .
docker run --rm --env-file .env --add-host=host.docker.internal:host-gateway -v "C:\path\to\match.mp4:/input/match.mp4:ro" -v "C:\path\to\Touchline Duel Clips:/output" touchline-duel-worker python batch_scan.py /input/match.mp4 --output /output
```

The output folder contains `duel-*.mp4` candidate clips and `duel-candidates.jsonl`, which records the estimated timestamp, type, confidence, and model note for every scanned window. The default threshold is 50; the scanner also rejects a model answer without a specific moment inside the window, so generic repeated answers cannot create hundreds of clips.

## Deploy to Cloud Run

From this folder, after authenticating with the Google Cloud CLI:

```powershell
gcloud run deploy touchline-duel-analysis --source . --region us-east1 --allow-unauthenticated --set-env-vars OPENAI_MODEL=gpt-4.1-mini
```

Set `OPENAI_API_KEY` and `DUEL_ANALYSIS_WORKER_SECRET` as Cloud Run secrets or environment variables in the Google Cloud console. Although the endpoint is reachable, it rejects every request without the shared `X-Worker-Secret` header.

Copy the deployed `/analyze` URL into Supabase as `DUEL_ANALYSIS_WORKER_URL`, and use the same value for `DUEL_ANALYSIS_WORKER_SECRET` on both sides. Deploy the two Supabase Edge Functions afterward.

Never commit video clips, `.env`, or API keys.
