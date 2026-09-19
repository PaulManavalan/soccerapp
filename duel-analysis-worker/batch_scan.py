"""Create a local, coach-reviewable set of likely duel clips from a full match.

This is intentionally separate from the Supabase queue. It never uploads the
source match or any extracted clips: all analysis and output remain on the
coach's computer. The vision model is used as a high-recall candidate finder,
not an official match-stat provider.
"""

import argparse
import asyncio
import json
import math
import shutil
import tempfile
from pathlib import Path

from main import extract_frames, parse_model_json, run


def full_duration_seconds(video_path: Path) -> float:
    raw = run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(video_path),
    ])
    return max(1.0, float(raw))


def extract_clip(source: Path, start: float, duration: float, destination: Path) -> None:
    run([
        "ffmpeg", "-y", "-ss", f"{max(0, start):.2f}", "-i", str(source),
        "-t", f"{duration:.2f}", "-map", "0:v:0", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "aac", "-movflags", "+faststart", str(destination),
    ])


def candidate_prompt() -> str:
    return """You are reviewing chronological frames from one short high-school soccer video window.
Identify whether any actual one-on-one duel occurs: two opposing players physically contest the ball through a tackle, dribble challenge, loose-ball contest, or aerial/header contest. Do not mark an ordinary pass interception, an uncontested bad pass, routine pressure without a ball contest, or players merely close together as a duel.

Return JSON only with this exact shape:
{"isDuel":true,"duelType":"ground or aerial","confidence":0,"momentOffsetSeconds":0,"note":"brief reason"}

Set isDuel to false unless the contest is genuinely visible. For false, still supply duelType as "ground", confidence 0, and momentOffsetSeconds 0. Confidence must be 0-100. momentOffsetSeconds is the estimated time after the start of this window where the contest occurs."""


def assess_candidate(frames: list[Path]) -> dict:
    # Importing here keeps the command's local-only intent obvious and reuses
    # the configured Ollama/OpenAI provider from the short-clip worker.
    from main import frame_base64
    import httpx
    import os

    provider = os.environ.get("ANALYSIS_PROVIDER", "ollama").lower()
    if provider != "ollama":
        raise RuntimeError("Batch scanning currently supports ANALYSIS_PROVIDER=ollama only")
    host = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
    response = httpx.post(
        f"{host}/api/generate",
        json={
            "model": os.environ.get("OLLAMA_MODEL", "gemma3"),
            "prompt": candidate_prompt(),
            "images": [frame_base64(frame).removeprefix("data:image/jpeg;base64,") for frame in frames],
            "format": "json",
            "stream": False,
            "options": {"temperature": 0.1},
        },
        timeout=240.0,
    )
    response.raise_for_status()
    result = parse_model_json(response.json().get("response", ""))
    is_duel = result.get("isDuel") is True
    confidence = max(0, min(100, round(float(result.get("confidence", 0)))))
    duel_type = result.get("duelType") if result.get("duelType") in {"ground", "aerial"} else "ground"
    offset = max(0, float(result.get("momentOffsetSeconds", 0)))
    return {
        "isDuel": is_duel,
        "confidence": confidence,
        "duelType": duel_type,
        "momentOffsetSeconds": offset,
        "note": str(result.get("note", ""))[:500],
    }


def frame_sampling_settings() -> tuple[int, int]:
    import os
    model = os.environ.get("OLLAMA_MODEL", "").lower()
    return (3, 512) if model.startswith("qwen2.5vl") else (8, 768)


def timestamp_label(seconds: float) -> str:
    total = max(0, round(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}h{minutes:02d}m{secs:02d}s"


def scan(source: Path, output: Path, window: float, stride: float, clip_length: float, threshold: int) -> None:
    if not source.is_file():
        raise FileNotFoundError(f"Match video was not found: {source}")
    if stride > window:
        raise ValueError("--stride must be less than or equal to --window so the match is fully covered")
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = output / "duel-candidates.jsonl"
    duration = full_duration_seconds(source)
    starts = [round(value * stride, 2) for value in range(math.ceil(duration / stride))]
    accepted_times: list[float] = []
    accepted = 0

    print(f"Scanning {timestamp_label(duration)} of footage in {len(starts)} overlapping windows.")
    print(f"Likely duel clips will be saved to: {output}")
    with manifest_path.open("a", encoding="utf-8") as manifest, tempfile.TemporaryDirectory() as temporary:
        temp = Path(temporary)
        for index, start in enumerate(starts, start=1):
            window_path = temp / "window.mp4"
            frames_dir = temp / "frames"
            if window_path.exists():
                window_path.unlink()
            if frames_dir.exists():
                shutil.rmtree(frames_dir)
            frames_dir.mkdir()
            extract_clip(source, start, min(window, max(1, duration - start)), window_path)
            max_frames, frame_width = frame_sampling_settings()
            result = assess_candidate(extract_frames(window_path, frames_dir, max_frames, frame_width))
            event_time = min(duration, start + min(window, result["momentOffsetSeconds"]))
            is_duplicate = any(abs(event_time - prior) < max(4, clip_length / 2) for prior in accepted_times)
            record = {"window": index, "windowStartSeconds": start, "eventTimeSeconds": event_time, **result}
            if result["isDuel"] and result["confidence"] >= threshold and not is_duplicate:
                accepted += 1
                accepted_times.append(event_time)
                clip_start = max(0, min(duration - 1, event_time - clip_length / 2))
                clip_name = f"duel-{accepted:03d}-{timestamp_label(event_time)}-{result['duelType']}.mp4"
                clip_path = output / clip_name
                extract_clip(source, clip_start, min(clip_length, duration - clip_start), clip_path)
                record["savedClip"] = clip_name
                print(f"[{index}/{len(starts)}] saved {clip_name} ({result['confidence']}%)")
            elif index % 10 == 0:
                print(f"[{index}/{len(starts)}] scanned; {accepted} likely duels saved")
            manifest.write(json.dumps(record) + "\n")
            manifest.flush()
    print(f"Finished. Saved {accepted} likely duel clips. Review {manifest_path.name} alongside the clips.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Find likely one-on-one duels in a local soccer match video.")
    parser.add_argument("source", type=Path, help="Path to the full match video")
    parser.add_argument("--output", type=Path, required=True, help="Folder for likely duel clips and the manifest")
    parser.add_argument("--window", type=float, default=14, help="Seconds analyzed per model call (default: 14)")
    parser.add_argument("--stride", type=float, default=10, help="Seconds between windows; must not exceed window (default: 10)")
    parser.add_argument("--clip-length", type=float, default=10, help="Length of each saved candidate clip (default: 10)")
    parser.add_argument("--threshold", type=int, default=60, help="Minimum model confidence to save a candidate (default: 60)")
    args = parser.parse_args()
    scan(args.source, args.output, args.window, args.stride, args.clip_length, args.threshold)


if __name__ == "__main__":
    main()
