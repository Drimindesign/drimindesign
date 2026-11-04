/*
 * Voices the game's dialogue with ElevenLabs (Eleven v4), once, offline: every line in
 * scripts/orbit-dialogue.json becomes public/audio/voice/<clip>.mp3, and the speaker-and-line
 * lookup is rewritten to src/features/orbit/engine/dialogue-audio.ts. Players only ever load the
 * saved clips, so playing costs no credits; only generating does (about one per character).
 *
 * The SDK reads ELEVENLABS_API_KEY from the environment (kept in .env.local, never in code).
 *
 * Usage:
 *   npm run voices                         every line
 *   npm run voices -- --test               one line per character, into game-art/voice-test/
 *   npm run voices -- --speaker Gorr       one character only
 *   npm run voices -- --missing            only lines without a clip yet
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/*
 * The cast: an ElevenLabs voice for each speaker; stability (lower = more emotional range); a
 * pitch shift for the giants and brutes (1 = none); and a finish: weight and a little room on
 * the heavy voices, air on the light ones.
 */
const HEAVY = "bass=g=4:f=110,aecho=0.8:0.5:30:0.12";
const HEROIC = "bass=g=2:f=130";
const LIGHT = "highpass=f=90,treble=g=1.5:f=4200";
const CAST = {
  Kachujin: { voice: "EXAVITQu4vr4xnSDxMaL", stability: 0.4, pitch: 1, finish: LIGHT }, // Sarah: confident
  Crew: { voice: "iP95p4xoKVk53GoZ742B", stability: 0.5, pitch: 1, finish: HEROIC }, // Chris: down-to-earth
  Copycat: { voice: "N2lVS1w4EtoT3dr4eOWO", stability: 0.35, pitch: 0.95, finish: HEAVY }, // Callum: husky trickster
  "Grey's brute": { voice: "pNInz6obpgDQGcFmaJgB", stability: 0.35, pitch: 0.88, finish: HEAVY }, // Adam: dominant
  "Grey's chief": { voice: "pqHfZKP75CvOlQylNhV4", stability: 0.4, pitch: 0.9, finish: HEAVY }, // Bill: old, cold
  Knight: { voice: "JBFqnCBsd6RMkjVDRZzb", stability: 0.45, pitch: 1, finish: HEROIC }, // George: warm, British
  Barbarian: { voice: "SOYHLrjzK2X1ezoPC6cr", stability: 0.3, pitch: 0.95, finish: HEAVY }, // Harry: fierce warrior
  Mage: { voice: "pFZP5JQG7iQjIQuC4Bku", stability: 0.45, pitch: 1, finish: LIGHT }, // Lily: velvety
  Ranger: { voice: "cgSgspJ2msm6clMCkdW9", stability: 0.4, pitch: 1, finish: LIGHT }, // Jessica: playful
  Rogue: { voice: "FGY2WhTYpPnrIDTdsKH5", stability: 0.35, pitch: 1, finish: LIGHT }, // Laura: sassy
  Dog: { voice: "IKne3meq5aSn9XLyUdCD", stability: 0.35, pitch: 1.1, finish: LIGHT }, // Charlie: energetic
  Gorr: { voice: "nPczCjzI2devNBz1zQrb", stability: 0.4, pitch: 0.82, finish: HEAVY }, // Brian: deep, resonant
};

/*
 * Delivery: Eleven v4 takes audio tags. A short line that ends in "!" is a battle cry; a line
 * from a downed teammate is strained; a quiet "..." line is said softly.
 */
function direct(text) {
  if (/^Help!|down!$/i.test(text)) return `[pained] ${text}`;
  if (text.endsWith("!") && text.length < 40) return `[shouts] ${text}`;
  if (text.includes("...")) return `[softly] ${text}`;
  return text;
}

const lines = JSON.parse(fs.readFileSync(path.join(root, "scripts/orbit-dialogue.json"), "utf8"));
const test = flag("--test");
const only = option("--speaker");
const outDir = test ? path.join(root, "game-art/voice-test") : path.join(root, "public/audio/voice");
fs.mkdirSync(outDir, { recursive: true });

let picked = lines.filter((line) => !only || line.speaker === only);
if (test) {
  // The longest line each character says shows its voice best.
  const best = new Map();
  for (const line of picked) if (!best.has(line.speaker) || line.text.length > best.get(line.speaker).text.length) best.set(line.speaker, line);
  picked = [...best.values()];
}
if (flag("--missing")) picked = picked.filter((line) => !fs.existsSync(path.join(outDir, `${line.clip}.mp3`)));

const missingCast = [...new Set(picked.map((line) => line.speaker))].filter((s) => !CAST[s]);
if (missingCast.length > 0) throw new Error(`No voice cast for: ${missingCast.join(", ")}`);

const client = new ElevenLabsClient();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-voice-"));
const bark = path.join(os.homedir(), ".cache/drimin-tts/dog-bark.wav");
let characters = 0;

for (const line of picked) {
  const cast = CAST[line.speaker];
  const raw = path.join(scratch, `${line.clip}.mp3`);
  const audio = await client.textToSpeech.convert(cast.voice, {
    text: direct(line.text),
    modelId: "eleven_v4",
    outputFormat: "mp3_44100_128",
    voiceSettings: { stability: cast.stability, similarityBoost: 0.8 },
  });
  await pipeline(Readable.fromWeb(audio), fs.createWriteStream(raw));
  characters += line.text.length;

  // Pitch (without changing speed), the finish, and even loudness across every line.
  const rate = 44100;
  const shift = cast.pitch === 1 ? "" : `asetrate=${Math.round(rate * cast.pitch)},aresample=${rate},atempo=${(1 / cast.pitch).toFixed(4)},`;
  const target = path.join(outDir, `${line.clip}.mp3`);
  const filters = `${shift}${cast.finish},loudnorm=I=-16:TP=-1.5:LRA=7`;
  if (line.speaker === "Dog" && fs.existsSync(bark)) {
    // A real bark, a breath, then the words.
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", bark, "-i", raw, "-filter_complex",
      `[0:a]aresample=${rate},volume=0.8,apad=pad_dur=0.12[b];[1:a]${shift}${cast.finish}[v];[b][v]concat=n=2:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=7`,
      "-b:a", "96k", target]);
  } else {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-af", filters, "-b:a", "96k", target]);
  }
  console.log(`${line.clip}  ${line.speaker}: ${line.text}`);
}
fs.rmSync(scratch, { recursive: true, force: true });
console.log(`\n${picked.length} lines, about ${characters} characters (credits).`);

// The game looks each line up by who says it and what they say (full runs only).
if (!test) {
  const entries = lines.map((line) => `  ${JSON.stringify(`${line.speaker}:${line.text}`)}: ${JSON.stringify(line.clip)}`).join(",\n");
  fs.writeFileSync(
    path.join(root, "src/features/orbit/engine/dialogue-audio.ts"),
    `// Generated clip lookup; source: scripts/orbit-dialogue.json.\nexport const DIALOGUE_AUDIO: Readonly<Record<string, string>> = {\n${entries}\n};\n`,
  );
}
