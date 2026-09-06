"""Review-first duel analysis worker for short soccer clips.

It samples frames locally with FFmpeg, asks a vision model for a cautious JSON
assessment, then posts a suggestion to Touchline's protected Supabase callback.
It never confirms a duel on behalf of a coach.
"""

import asyncio
import base64
import hmac
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, Header, HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field, HttpUrl

app = FastAPI(title="Touchline Duel Analysis Worker")
MAX_CLIP_BYTES = 60 * 1024 * 1024
MAX_FRAMES = 8


class RosterPlayer(BaseModel):
    id: str
    name: str
    shirtNumber: int | None = None
    position: str | None = None


class AnalysisRequest(BaseModel):
    jobId: str
    teamId: str
    matchId: str
    clipUrl: HttpUrl
    callbackUrl: HttpUrl
    roster: list[RosterPlayer] = Field(default_factory=list)


def secret_is_valid(supplied: str | None) -> bool:
    expected = os.environ.get("DUEL_ANALYSIS_WORKER_SECRET", "")
    return bool(expected and supplied and hmac.compare_digest(expected, supplied))


def run(command: list[str]) -> str:
    return subprocess.check_output(command, stderr=subprocess.STDOUT, text=True).strip()


def clip_duration_seconds(video_path: Path) -> float:
    raw = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(video_path)])
    return max(1.0, min(float(raw), 60.0))


def extract_frames(video_path: Path, frames_dir: Path) -> list[Path]:
    duration = clip_duration_seconds(video_path)
    fps = max(0.15, min(2.0, MAX_FRAMES / duration))
    output_pattern = frames_dir / "frame-%02d.jpg"
    run([
        "ffmpeg", "-y", "-i", str(video_path), "-vf", f"fps={fps},scale=768:-2",
        "-frames:v", str(MAX_FRAMES), "-q:v", "4", str(output_pattern),
    ])
    frames = sorted(frames_dir.glob("frame-*.jpg"))
    if not frames:
        raise RuntimeError("No readable video frames were found")
    return frames


async def download_clip(url: str, destination: Path) -> None:
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            content_length = int(response.headers.get("content-length", "0") or 0)
            if content_length > MAX_CLIP_BYTES:
                raise RuntimeError("Clip exceeds the worker's 60 MB safety limit")
            total = 0
            with destination.open("wb") as file:
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
                    if total > MAX_CLIP_BYTES:
                        raise RuntimeError("Clip exceeds the worker's 60 MB safety limit")
                    file.write(chunk)


def frame_base64(frame: Path) -> str:
    encoded = base64.b64encode(frame.read_bytes()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def parse_model_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise RuntimeError("Vision model did not return a JSON assessment")
        return json.loads(match.group(0))


def analysis_prompt(roster: list[RosterPlayer]) -> str:
    roster_text = json.dumps([player.model_dump() for player in roster])
    return f"""You are assisting a high-school soccer coach. Review these chronological frames from one short clip.
Identify the single clearest one-on-one duel involving the coach's team, if one is visible. A ground duel includes a tackle, dribble challenge, or loose-ball contest. An aerial duel includes a header or other aerial contest.

Outcome rules: ground = won only when the coach's team retains possession; aerial = won when the coach's team prevents meaningful opponent progression or wins the ball. Be conservative. Do not invent jersey numbers, names, or a player identity. Only select playerId when a roster player can be reasonably matched by visible shirt number or clearly readable name.

Roster: {roster_text}

Return JSON only, with this exact shape:
{{"playerId":"roster UUID or null","duelType":"ground or aerial","outcome":"won or lost","confidence":0,"occurredAtSeconds":0,"pitchX":50,"pitchY":50,"note":"brief uncertainty-aware coaching explanation"}}
pitchX and pitchY are percentages; use 50 when field location cannot be inferred. Confidence must be 0-100 and should be below 60 when the footage is unclear."""


def normalize_result(result: dict, roster: list[RosterPlayer]) -> dict:
    roster_ids = {player.id for player in roster}
    if result.get("playerId") not in roster_ids:
        result["playerId"] = None
    if result.get("duelType") not in {"ground", "aerial"} or result.get("outcome") not in {"won", "lost"}:
        raise RuntimeError("Vision model returned an invalid duel classification")
    result["confidence"] = max(0, min(100, round(float(result.get("confidence", 0)))))
    result["occurredAtSeconds"] = max(0, round(float(result.get("occurredAtSeconds", 0))))
    result["pitchX"] = max(0, min(100, float(result.get("pitchX", 50))))
    result["pitchY"] = max(0, min(100, float(result.get("pitchY", 50))))
    result["note"] = str(result.get("note", "Suggested from clip frames."))[:500]
    return result


def assess_frames_openai(frames: list[Path], roster: list[RosterPlayer]) -> dict:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    content = [{"type": "input_text", "text": analysis_prompt(roster)}]
    content.extend({"type": "input_image", "image_url": frame_base64(frame), "detail": "low"} for frame in frames)
    response = OpenAI(api_key=api_key).responses.create(
        model=os.environ.get("OPENAI_MODEL", "gpt-4.1-mini"),
        input=[{"role": "user", "content": content}],
    )
    return normalize_result(parse_model_json(response.output_text), roster)


def assess_frames_ollama(frames: list[Path], roster: list[RosterPlayer]) -> dict:
    host = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
    body = {
        "model": os.environ.get("OLLAMA_MODEL", "gemma3"),
        "prompt": analysis_prompt(roster),
        "images": [frame_base64(frame).removeprefix("data:image/jpeg;base64,") for frame in frames],
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.1},
    }
    response = httpx.post(f"{host}/api/generate", json=body, timeout=180.0)
    response.raise_for_status()
    return normalize_result(parse_model_json(response.json().get("response", "")), roster)


def assess_frames(frames: list[Path], roster: list[RosterPlayer]) -> dict:
    provider = os.environ.get("ANALYSIS_PROVIDER", "ollama").lower()
    if provider == "ollama":
        return assess_frames_ollama(frames, roster)
    if provider == "openai":
        return assess_frames_openai(frames, roster)
    raise RuntimeError("ANALYSIS_PROVIDER must be 'ollama' or 'openai'")


async def send_callback(request: AnalysisRequest, result: dict) -> None:
    secret = os.environ["DUEL_ANALYSIS_WORKER_SECRET"]
    payload = {"jobId": request.jobId, "status": "complete", **result}
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(str(request.callbackUrl), json=payload, headers={"X-Worker-Secret": secret})
        response.raise_for_status()


async def report_failure(request: AnalysisRequest, reason: str) -> None:
    secret = os.environ.get("DUEL_ANALYSIS_WORKER_SECRET")
    if not secret:
        return
    async with httpx.AsyncClient(timeout=20.0) as client:
        await client.post(str(request.callbackUrl), json={"jobId": request.jobId, "status": "failed", "note": reason[:500]}, headers={"X-Worker-Secret": secret})


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "configured": bool(os.environ.get("OPENAI_API_KEY") and os.environ.get("DUEL_ANALYSIS_WORKER_SECRET"))}


@app.post("/analyze", status_code=202)
async def analyze(request: AnalysisRequest, x_worker_secret: str | None = Header(default=None)) -> dict:
    if not secret_is_valid(x_worker_secret):
        raise HTTPException(status_code=401, detail="Unauthorized worker request")
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
        return {"accepted": True, "jobId": request.jobId}
    except Exception as error:
        await report_failure(request, str(error))
        raise HTTPException(status_code=500, detail="Analysis failed") from error
