// Bake the existing browser canvas design without adding a runtime drawing dependency.
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end('<script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script>');
    return;
  }
  const base = path.join(root, "node_modules/three");
  const file = path.resolve(base, pathname.replace(/^\/three\//, ""));
  if (!file.startsWith(base + path.sep)) { response.writeHead(404).end(); return; }
  try { response.setHeader("Content-Type", "text/javascript"); response.end(await fs.readFile(file)); }
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
    const T = await import('/three/build/three.module.js');
    const { RoomEnvironment } = await import('/three/examples/jsm/environments/RoomEnvironment.js');
    const renderer = new T.WebGLRenderer({antialias:false});
    const generator = new T.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const target = generator.fromScene(room, .04);
    const {width, height} = target;
    const data = new Uint16Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, data);
    if (!data.some(value => value > 0)) throw new Error('Environment readback was empty');
    const bytes = new Uint8Array(data.buffer);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    const result = {width,height,base64:btoa(binary)};
    target.dispose(); generator.dispose(); room.dispose(); renderer.dispose();
    return result;
  })()`;
  const evaluated = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (evaluated.exceptionDetails) throw new Error(JSON.stringify(evaluated.exceptionDetails));
  const {width, height, base64} = evaluated.result.value;
  const bytes = gzipSync(Buffer.from(base64, "base64"), {level:9});
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0,12);
  const asset = `/team/studio-${hash}.bin.gz`;
  await fs.writeFile(path.join(root, `public${asset}`), bytes);
  await fs.writeFile(path.join(root, 'src/content/studio-environment.generated.json'), JSON.stringify({width,height,asset}) + '\n');
  console.log(`Baked exact studio PMREM: ${width}x${height}, ${bytes.length} compressed bytes`);
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
