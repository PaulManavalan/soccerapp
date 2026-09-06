"""Private, no-tunnel local queue listener for the Touchline duel worker."""

import asyncio
import os
import tempfile
from pathlib import Path
from urllib.parse import quote

import httpx

from main import (
    AnalysisRequest,
    RosterPlayer,
    assess_frames,
    download_clip,
    extract_frames,
    report_failure,
    send_callback,
)


def settings() -> tuple[str, str, str]:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    callback = os.environ.get("SUPABASE_CALLBACK_URL", f"{url}/functions/v1/complete-duel-analysis")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for local polling")
    return url, key, callback


def headers(key: str) -> dict[str, str]:
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


async def claim_job(client: httpx.AsyncClient, url: str, key: str) -> dict | None:
    queued = await client.get(
        f"{url}/rest/v1/duel_clip_jobs",
        params={"select": "id,team_id,match_id,storage_path", "status": "eq.queued", "order": "created_at.asc", "limit": "1"},
        headers=headers(key),
    )
    queued.raise_for_status()
    jobs = queued.json()
    if not jobs:
        return None
    job = jobs[0]
    claimed = await client.patch(
        f"{url}/rest/v1/duel_clip_jobs",
        params={"id": f"eq.{job['id']}", "status": "eq.queued"},
        json={"status": "analyzing"},
        headers={**headers(key), "Prefer": "return=representation"},
    )
    claimed.raise_for_status()
    return job if claimed.json() else None


async def signed_clip_url(client: httpx.AsyncClient, url: str, key: str, path: str) -> str:
    signed = await client.post(
        f"{url}/storage/v1/object/sign/duel-clips/{quote(path, safe='/')}",
        json={"expiresIn": 900}, headers=headers(key),
    )
    signed.raise_for_status()
    value = signed.json().get("signedURL") or signed.json().get("signedUrl")
    if not value:
        raise RuntimeError("Supabase did not return a signed clip URL")
    return value if value.startswith("http") else f"{url}/storage/v1{value}"


async def roster_for_team(client: httpx.AsyncClient, url: str, key: str, team_id: str) -> list[RosterPlayer]:
    response = await client.get(
        f"{url}/rest/v1/players", params={"select": "id,name,shirt_number,position", "team_id": f"eq.{team_id}", "order": "shirt_number"}, headers=headers(key)
    )
    response.raise_for_status()
    return [RosterPlayer(id=item["id"], name=item["name"], shirtNumber=item.get("shirt_number"), position=item.get("position")) for item in response.json()]

async def calibration_for_team(client: httpx.AsyncClient, url: str, key: str, team_id: str) -> dict | None:
    response = await client.get(f"{url}/rest/v1/team_camera_calibrations", params={"select": "attack_direction,frame_corners", "team_id": f"eq.{team_id}"}, headers=headers(key))
    if not response.is_success: return None
    rows = response.json()
    return rows[0] if rows else None


async def process_job(client: httpx.AsyncClient, url: str, key: str, callback: str, job: dict) -> None:
    request = AnalysisRequest(
        jobId=job["id"], teamId=job["team_id"], matchId=job["match_id"],
        clipUrl=await signed_clip_url(client, url, key, job["storage_path"]), callbackUrl=callback,
        roster=await roster_for_team(client, url, key, job["team_id"]), calibration=await calibration_for_team(client, url, key, job["team_id"]),
    )
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            video_path = temp / "clip.mp4"
            frames_dir = temp / "frames"
            frames_dir.mkdir()
            await download_clip(str(request.clipUrl), video_path)
            frames = await asyncio.to_thread(extract_frames, video_path, frames_dir)
            result = await asyncio.to_thread(assess_frames, frames, request.roster)
            await send_callback(request, result)
    except Exception as error:
        await report_failure(request, str(error))


async def main() -> None:
    url, key, callback = settings()
    interval = max(3, int(os.environ.get("POLL_INTERVAL_SECONDS", "8")))
    print(f"Touchline local duel worker is listening every {interval} seconds.")
    async with httpx.AsyncClient(timeout=40.0) as client:
        while True:
            try:
                job = await claim_job(client, url, key)
                if job:
                    print(f"Analyzing queued clip {job['id']}…")
                    await process_job(client, url, key, callback, job)
            except Exception as error:
                print(f"Queue listener error: {error}")
            await asyncio.sleep(interval)


if __name__ == "__main__":
    asyncio.run(main())
