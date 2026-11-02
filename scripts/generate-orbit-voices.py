"""Offline Kokoro voice generation. Requires kokoro-onnx, soundfile and ffmpeg.
Models are cached outside the repository; no model ships to players.
Usage: python scripts/generate-orbit-voices.py
"""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import soundfile as sf
from kokoro_onnx import Kokoro

parser = argparse.ArgumentParser()
parser.add_argument("--speaker", help="Regenerate only one character")
args = parser.parse_args()

root = Path(__file__).resolve().parent.parent
cache = Path.home() / ".cache/drimin-tts"
engine = Kokoro(str(cache / "kokoro-v1.0.onnx"), str(cache / "voices-v1.0.bin"))
voices = {"Dog": "am_puck", "Kachujin": "af_heart", "Crew": "am_michael", "Knight": "bm_george", "Barbarian": "am_fenrir", "Mage": "bf_emma", "Ranger": "am_adam", "Rogue": "af_bella", "Copycat": "am_eric", "Grey's brute": "am_fenrir"}
for item in json.loads((root / "scripts/orbit-dialogue.json").read_text(encoding="utf-8")):
    if args.speaker and item["speaker"] != args.speaker:
        continue
    samples, rate = engine.create(item["text"], voice=voices[item["speaker"]], speed=1.14 if item["speaker"] == "Dog" else 1.08, lang="en-us")
    target = root / "public/audio/voice" / (item["clip"] + ".mp3")
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as scratch:
        wav = Path(scratch) / "line.wav"
        sf.write(str(wav), samples, rate)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-af", "loudnorm=I=-16:TP=-1.5:LRA=7", "-b:a", "80k", str(target)], check=True)
    print(item["clip"], flush=True)
