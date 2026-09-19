"""Find soccer duel candidates from player/ball motion, locally.

This is deliberately a candidate finder, not a result classifier. It searches
for a tracked ball with nearby players wearing opposing kit colours across
consecutive frames, then produces review timestamps. No footage leaves the
coach's computer.
"""

import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO


PERSON_CLASS = 0
SPORTS_BALL_CLASS = 32


def kit_colour(frame: np.ndarray, box: np.ndarray) -> str:
    """Classify the upper-body jersey as white, blue, or unknown."""
    x1, y1, x2, y2 = box.astype(int)
    height, width = frame.shape[:2]
    x1, x2 = max(0, x1), min(width, x2)
    y1, y2 = max(0, y1), min(height, y2)
    if x2 - x1 < 6 or y2 - y1 < 12:
        return "unknown"
    torso = frame[y1 + (y2 - y1) // 5:y1 + (y2 - y1) * 3 // 5, x1:x2]
    if torso.size == 0:
        return "unknown"
    hsv = cv2.cvtColor(torso, cv2.COLOR_BGR2HSV)
    saturation, value = hsv[:, :, 1], hsv[:, :, 2]
    white_fraction = np.mean((saturation < 55) & (value > 145))
    blue_fraction = np.mean((hsv[:, :, 0] > 92) & (hsv[:, :, 0] < 135) & (saturation > 65) & (value > 55))
    if white_fraction >= 0.38:
        return "white"
    if blue_fraction >= 0.12:
        return "blue"
    return "unknown"


def box_center(box: np.ndarray) -> tuple[float, float]:
    return ((float(box[0]) + float(box[2])) / 2, (float(box[1]) + float(box[3])) / 2)


def nearby_opponents(frame: np.ndarray, player_boxes: list[np.ndarray], ball: np.ndarray) -> tuple[bool, dict]:
    ball_x, ball_y = box_center(ball)
    nearby: list[dict] = []
    for player in player_boxes:
        x, y = box_center(player)
        height = max(1.0, float(player[3] - player[1]))
        distance = math.hypot(x - ball_x, y - ball_y)
        # A loose ball or tackle can be roughly two player-heights away from a
        # player's centre in a wide sideline view.
        if distance <= max(45.0, height * 2.35):
            nearby.append({"kit": kit_colour(frame, player), "distance": round(distance, 1)})
    kits = {player["kit"] for player in nearby}
    return "white" in kits and "blue" in kits, {"nearby": nearby, "ball": [round(ball_x, 1), round(ball_y, 1)]}


def close_opponents(frame: np.ndarray, player_boxes: list[np.ndarray]) -> tuple[bool, dict]:
    """Find physical white/blue contact when a tiny ball cannot be detected.

    These are deliberately labelled as *review* candidates, not confirmed
    duels. A normal marker can look similar from a high, wide camera.
    """
    labelled = [{"box": box, "kit": kit_colour(frame, box)} for box in player_boxes]
    white = [player for player in labelled if player["kit"] == "white"]
    blue = [player for player in labelled if player["kit"] == "blue"]
    closest: dict | None = None
    for first in white:
        for second in blue:
            distance = math.dist(box_center(first["box"]), box_center(second["box"]))
            first_height = float(first["box"][3] - first["box"][1])
            second_height = float(second["box"][3] - second["box"][1])
            contact_distance = max(32.0, min(first_height, second_height) * 1.65)
            if distance <= contact_distance and (closest is None or distance < closest["distance"]):
                closest = {"distance": round(distance, 1), "contactDistance": round(contact_distance, 1)}
    return closest is not None, {"closestOpponents": closest}


def merge_candidates(raw: list[dict], max_gap_seconds: float) -> list[dict]:
    merged: list[dict] = []
    for item in raw:
        if not merged or item["timeSeconds"] - merged[-1]["endSeconds"] > max_gap_seconds:
            merged.append({"startSeconds": item["timeSeconds"], "endSeconds": item["timeSeconds"], "frames": 1, "evidence": item["evidence"]})
        else:
            merged[-1]["endSeconds"] = item["timeSeconds"]
            merged[-1]["frames"] += 1
    return merged


def scan(source: Path, output: Path, sample_fps: float, min_frames: int, image_size: int) -> list[dict]:
    if not source.is_file():
        raise FileNotFoundError(f"Video not found: {source}")
    output.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(source))
    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    frame_step = max(1, round(fps / sample_fps))
    model = YOLO("yolo26n.pt")
    raw: list[dict] = []
    diagnostics = {"framesAnalyzed": 0, "playerDetections": 0, "ballDetections": 0, "framesWithWhite": 0, "framesWithBlue": 0, "framesWithBothTeams": 0, "contestedBallFrames": 0}
    frame_index = 0
    processed = 0
    while capture.isOpened():
        ok, frame = capture.read()
        if not ok:
            break
        if frame_index % frame_step:
            frame_index += 1
            continue
        result = model.track(frame, persist=True, classes=[PERSON_CLASS, SPORTS_BALL_CLASS], conf=0.08, imgsz=image_size, tracker="botsort.yaml", verbose=False)[0]
        diagnostics["framesAnalyzed"] += 1
        boxes = result.boxes
        if boxes is not None and len(boxes):
            coordinates = boxes.xyxy.cpu().numpy()
            classes = boxes.cls.int().cpu().numpy()
            players = [box for box, kind in zip(coordinates, classes) if kind == PERSON_CLASS]
            balls = [box for box, kind in zip(coordinates, classes) if kind == SPORTS_BALL_CLASS]
            diagnostics["playerDetections"] += len(players)
            diagnostics["ballDetections"] += len(balls)
            kits = {kit_colour(frame, player) for player in players}
            diagnostics["framesWithWhite"] += int("white" in kits)
            diagnostics["framesWithBlue"] += int("blue" in kits)
            diagnostics["framesWithBothTeams"] += int("white" in kits and "blue" in kits)
            ball_contested = False
            for ball in balls:
                contested, evidence = nearby_opponents(frame, players, ball)
                if contested:
                    ball_contested = True
                    diagnostics["contestedBallFrames"] += 1
                    raw.append({"timeSeconds": round(frame_index / fps, 2), "evidence": {"source": "ball_and_opponents", **evidence}})
            if not ball_contested:
                close, evidence = close_opponents(frame, players)
                if close:
                    diagnostics["closeOpponentFrames"] = diagnostics.get("closeOpponentFrames", 0) + 1
                    raw.append({"timeSeconds": round(frame_index / fps, 2), "evidence": {"source": "opponent_proximity_ball_unconfirmed", **evidence}})
        processed += 1
        if processed % 100 == 0:
            print(f"Processed {frame_index / fps:.0f}s; {len(raw)} contested-ball frames found")
        frame_index += 1
    capture.release()
    candidates = [candidate for candidate in merge_candidates(raw, max_gap_seconds=max(1.2, 2 / sample_fps)) if candidate["frames"] >= min_frames]
    for index, candidate in enumerate(candidates, start=1):
        candidate["id"] = index
        candidate["midpointSeconds"] = round((candidate["startSeconds"] + candidate["endSeconds"]) / 2, 2)
        candidate["needsBallReview"] = candidate["evidence"]["source"] != "ball_and_opponents"
    (output / "cv-duel-candidates.json").write_text(json.dumps(candidates, indent=2), encoding="utf-8")
    (output / "cv-duel-diagnostics.json").write_text(json.dumps(diagnostics, indent=2), encoding="utf-8")
    print(f"Saved {len(candidates)} candidate duels to cv-duel-candidates.json")
    return candidates


def main() -> None:
    parser = argparse.ArgumentParser(description="Find likely soccer duels with local player/ball tracking.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--sample-fps", type=float, default=4.0, help="Frames per second to inspect (default: 4)")
    parser.add_argument("--min-frames", type=int, default=2, help="Consecutive contested frames required (default: 2)")
    parser.add_argument("--imgsz", type=int, default=960, help="Detector input size; increase for a small distant ball")
    args = parser.parse_args()
    scan(args.source, args.output, args.sample_fps, args.min_frames, args.imgsz)


if __name__ == "__main__":
    main()
