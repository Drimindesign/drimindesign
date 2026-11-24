import { createHash } from "node:crypto";
import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const files = ["src/components/ui/brand-mark-paths.ts", "src/content/team.ts", "src/features/about-team/scene/card-art.ts"];
const sources = await Promise.all(files.map((file) => fs.readFile(new URL(file, root), "utf8")));
const hash = createHash("sha256").update(sources.map((source) => source.replace(/\r\n/g, "\n")).join("\n")).digest("hex").slice(0, 12);
const manifest = JSON.parse(await fs.readFile(new URL("src/content/team-art.generated.json", root), "utf8"));
if (manifest.sourceHash !== hash) throw new Error("Team artwork is stale. Run npm run prepare:team-art, then commit the regenerated artwork and manifest.");
for (const variant of Object.values(manifest.variants)) {
  await Promise.all([...variant.fronts, ...variant.backs, variant.strap].map((file) => fs.access(new URL(`public${file}`, root))));
}
console.log("Team artwork matches the current content and card design.");
