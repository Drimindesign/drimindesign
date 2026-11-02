"""Offline Kokoro voice generation for the game's dialogue. Requires kokoro-onnx, soundfile and ffmpeg.
Models are cached outside the repository; no model ships to players.

Every character has a voice: a Kokoro voice (or a blend of two), how fast it speaks, a pitch shift
(the queen light and clear, the gang and the giants deep and heavy), and a finish (a little room
and weight on the heavy ones). Dog lines open with a real bark. Writes the clips to
public/audio/voice/ and the speaker-and-line lookup to src/features/orbit/engine/dialogue-audio.ts.

Usage: python scripts/generate-orbit-voices.py [--speaker NAME] [--missing]
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
parser.add_argument("--missing", action="store_true", help="Only lines without a clip yet")
args = parser.parse_args()

root = Path(__file__).resolve().parent.parent
cache = Path.home() / ".cache/drimin-tts"
engine = Kokoro(str(cache / "kokoro-v1.0.onnx"), str(cache / "voices-v1.0.bin"))
RATE = 24000

# Finishes: weight in the low end and a small room for the heavy voices; air for the light ones.
HEAVY = "bass=g=5:f=110,aecho=0.8:0.55:32:0.14"
HEROIC = "bass=g=3:f=130"
LIGHT = "highpass=f=90,treble=g=2:f=4200"

# speaker: (voices and their weights, speed, pitch, finish)
VOICES = {
    "Kachujin": ((("af_sky", 0.7), ("af_bella", 0.3)), 1.0, 1.03, LIGHT),
    "Crew": ((("am_michael", 1.0),), 1.05, 0.95, HEROIC),
    "Copycat": ((("am_onyx", 0.7), ("am_eric", 0.3)), 1.0, 0.88, HEAVY),
    "Grey's brute": ((("am_onyx", 1.0),), 0.95, 0.78, HEAVY),
    "Grey's chief": ((("am_onyx", 0.5), ("bm_george", 0.5)), 0.92, 0.8, HEAVY),
    "Knight": ((("bm_george", 1.0),), 1.02, 0.94, HEROIC),
    "Barbarian": ((("am_fenrir", 1.0),), 1.0, 0.85, HEAVY),
    "Mage": ((("bf_emma", 1.0),), 1.05, 1.08, LIGHT),
    "Ranger": ((("am_adam", 1.0),), 1.05, 1.06, HEROIC),
    "Rogue": ((("af_nova", 1.0),), 1.08, 1.1, LIGHT),
    "Dog": ((("am_puck", 1.0),), 1.14, 1.15, LIGHT),
    "Gorr": ((("am_onyx", 1.0),), 0.9, 0.72, HEAVY),
}


def style(parts):
    mixed = None
    for name, weight in parts:
        s = engine.get_voice_style(name) * weight
        mixed = s if mixed is None else mixed + s
    return mixed


lines = json.loads((root / "scripts/orbit-dialogue.json").read_text(encoding="utf-8"))
bark = cache / "dog-bark.wav"
for item in lines:
    if args.speaker and item["speaker"] != args.speaker:
        continue
    target = root / "public/audio/voice" / (item["clip"] + ".mp3")
    if args.missing and target.exists():
        continue
    parts, speed, pitch, finish = VOICES[item["speaker"]]
    samples, rate = engine.create(item["text"], voice=style(parts), speed=speed, lang="en-us")
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as scratch:
        wav = Path(scratch) / "line.wav"
        sf.write(str(wav), samples, rate)
        shift = f"asetrate={int(rate * pitch)},aresample={rate},atempo={1 / pitch:.4f}"
        chain = f"{shift},{finish},loudnorm=I=-16:TP=-1.5:LRA=7"
        if item["speaker"] == "Dog" and bark.exists():
            # A real bark, a breath, then the words.
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(bark), "-i", str(wav), "-filter_complex",
                   f"[0:a]aresample={rate},volume=0.8,apad=pad_dur=0.12[b];[1:a]{shift},{finish}[v];[b][v]concat=n=2:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=7",
                   "-b:a", "80k", str(target)]
        else:
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-af", chain, "-b:a", "80k", str(target)]
        subprocess.run(cmd, check=True)
    print(item["clip"], item["speaker"], flush=True)

# The game looks each line up by who says it and what they say.
entries = ",\n".join(f'  {json.dumps(item["speaker"] + ":" + item["text"])}: {json.dumps(item["clip"])}' for item in lines)
(root / "src/features/orbit/engine/dialogue-audio.ts").write_text(
    "// Generated clip lookup; source: scripts/orbit-dialogue.json.\n"
    f"export const DIALOGUE_AUDIO: Readonly<Record<string, string>> = {{\n{entries}\n}};\n",
    encoding="utf-8",
)
