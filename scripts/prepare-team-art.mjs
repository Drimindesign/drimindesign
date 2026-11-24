// Bake the existing browser canvas design without adding a runtime drawing dependency.
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = ["src/components/ui/brand-mark-paths.ts", "src/content/team.ts", "src/features/about-team/scene/card-art.ts"];
const sources = await Promise.all(files.map((file) => fs.readFile(path.join(root, file), "utf8")));
const sourceHash = createHash("sha256").update(sources.map((source) => source.replace(/\r\n/g, "\n")).join("\n")).digest("hex").slice(0, 12);
const compile = (source) => ts.transpileModule(source.replace(/^import .*;\r?$/gm, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace(/^export /gm, "");
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end(`<style>@font-face{font-family:Manrope;src:url(/fonts/manrope-medium.woff2);font-weight:500}@font-face{font-family:Manrope;src:url(/fonts/manrope-semibold.woff2);font-weight:600}@font-face{font-family:Outrun;src:url(/fonts/outrun-regular.woff2)}:root{--font-manrope:Manrope;--font-outrun:Outrun}</style>`);
    return;
  }
  const base = pathname.startsWith("/fonts/") ? path.join(root, "src/app/fonts") : path.join(root, "public/team");
  try { response.end(await fs.readFile(path.join(base, path.basename(pathname)))); }
  catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "drimin-art-"));
const chromePath = process.env.CHROME_PATH ?? (process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "google-chrome");
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
let socket;
try {
  let debuggingPort;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { debuggingPort = (await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  if (!debuggingPort) throw new Error("Chrome did not start; set CHROME_PATH to a Chrome executable");
  const pages = await (await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)).json();
  socket = new WebSocket(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const callback = pending.get(message.id);
    if (callback) {
      pending.delete(message.id);
      if (message.error) callback.reject(new Error(message.error.message));
      else callback.resolve(message.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id;
    pending.set(messageId, { resolve, reject });
    socket.send(JSON.stringify({ id: messageId, method, params }));
  });
  await send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  // Await the new document, rather than evaluating against the departing about:blank.
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await send("Runtime.evaluate", { expression: "location.port + ':' + document.readyState", returnByValue: true });
    if (result.result.value === `${port}:complete`) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const expression = `(async () => {
    class CanvasTexture { constructor(image) { this.image = image; } dispose() {} }
    const RepeatWrapping = 1000, SRGBColorSpace = 'srgb';
    ${sources.map(compile).join("\n")}
    const result = [];
    for (const width of [320, 640]) {
      const art = await createCardArt(team, 1, width / 640, 2);
      result.push({ width, fronts: art.fronts.map(t => t.image.toDataURL('image/webp', .94)), backs: art.backs.map(t => t.image.toDataURL('image/webp', .94)), strap: art.strap.image.toDataURL('image/webp', .94) });
    }
    return { team: team.map(({name, role, photo}) => ({name, role, photo})), artwork: result };
  })()`;
  const evaluated = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (evaluated.exceptionDetails) throw new Error(JSON.stringify(evaluated.exceptionDetails));
  const { team, artwork } = evaluated.result.value;
  const directory = path.join(root, "public/team/artwork");
  await fs.mkdir(directory, { recursive: true });
  const manifest = { sourceHash, team, variants: {} };
  for (const variant of artwork) {
    const entry = { fronts: [], backs: [], strap: "" };
    for (const side of ["fronts", "backs"]) {
      for (const [index, data] of variant[side].entries()) {
        const bytes = Buffer.from(data.split(",")[1], "base64");
        const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
        const filename = `${side}-${index}-${variant.width}-${hash}.webp`;
        await fs.writeFile(path.join(directory, filename), bytes);
        entry[side].push(`/team/artwork/${filename}`);
      }
    }
    const bytes = Buffer.from(variant.strap.split(",")[1], "base64");
    const filename = `strap-${createHash("sha256").update(bytes).digest("hex").slice(0, 10)}.webp`;
    await fs.writeFile(path.join(directory, filename), bytes);
    entry.strap = `/team/artwork/${filename}`;
    manifest.variants[variant.width] = entry;
  }
  await fs.writeFile(path.join(root, "src/content/team-art.generated.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Baked ${team.length} team cards at 320/640 px, preserving the existing canvas design.`);
} finally {
  socket?.close();
  chrome.kill();
  server.close();
  // Chrome owns this temporary profile until its process exits.
  await new Promise((resolve) => chrome.once("exit", resolve));
  const resolvedProfile = path.resolve(profile);
  if (resolvedProfile.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolvedProfile).startsWith("drimin-art-")) {
    await fs.rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
  }
}
