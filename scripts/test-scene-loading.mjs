import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function load(file, imports, globals = {}) {
  const compiledModule = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: (name) => {
    if (!(name in imports)) throw new Error(`Unexpected runtime dependency: ${name}`);
    return imports[name];
  }, ...globals });
  return compiledModule.exports;
}

test("capability hints never create a spare GPU context and reuse a stable snapshot", () => {
  const api = load("../src/lib/device/capabilities.ts", {
    react: {}, "@/lib/motion/after-intro": {},
  }, {
    navigator: { hardwareConcurrency: 8, deviceMemory: 8 },
    matchMedia: () => ({ matches: false }),
    WebGL2RenderingContext: class {},
    document: { createElement() { throw new Error("A capability check must not initialize a GPU"); } },
  });
  const first = api.readCapabilities();
  assert.equal(first.tier, "high");
  assert.equal(first.webgl, "webgl");
  assert.equal(api.readCapabilities(), first);
  api.reportGraphicsContext({ getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }), getParameter: () => "SwiftShader" });
  assert.equal(api.readCapabilities().tier, "low");
});

function artworkHarness({ fail = false } = {}) {
  const textures = [];
  let idleTasks = 0;
  class TextureLoader {
    async loadAsync(url) {
      if (fail && url === "back") throw new Error("offline");
      const texture = { url, disposed: false, dispose() { this.disposed = true; } };
      textures.push(texture);
      return texture;
    }
  }
  const variant = { fronts: ["front"], backs: ["back"], strap: "strap" };
  const api = load("../src/features/about-team/scene/prebuilt-card-art.ts", {
    three: { TextureLoader, RepeatWrapping: 1000, SRGBColorSpace: "srgb" },
    "@/content/team-art.generated.json": { variants: { 320: variant, 640: variant } },
    "@/lib/motion/after-intro": { whenIdle: async () => { idleTasks++; } },
  });
  const uploaded = [];
  const renderer = { capabilities: { getMaxAnisotropy: () => 8 }, initTexture(texture) { uploaded.push(texture); assert.ok(idleTasks > 0); } };
  return { api, renderer, uploaded, textures, idleCount: () => idleTasks };
}

test("artwork uploads are yielded, ordered, and owned until disposal", async () => {
  const harness = artworkHarness();
  const art = await harness.api.loadCardArt(harness.renderer, false, () => false);
  assert.equal(harness.idleCount(), 3);
  assert.deepEqual(harness.uploaded.map((texture) => texture.url), ["front", "back", "strap"]);
  assert.equal(art.fronts[0].url, "front");
  assert.equal(art.backs[0].url, "back");
  assert.equal(art.strap.wrapS, 1000);
  art.dispose();
  assert.ok(harness.textures.every((texture) => texture.disposed));
});

test("a hidden/unmounted scene cancels uploads and frees downloaded textures", async () => {
  const harness = artworkHarness();
  const art = await harness.api.loadCardArt(harness.renderer, false, () => true);
  assert.equal(art, null);
  assert.equal(harness.uploaded.length, 0);
  assert.ok(harness.textures.every((texture) => texture.disposed));
});

test("an artwork download failure releases successful downloads", async () => {
  const harness = artworkHarness({ fail: true });
  await assert.rejects(harness.api.loadCardArt(harness.renderer, true, () => false), /could not load/);
  assert.equal(harness.uploaded.length, 0);
  assert.ok(harness.textures.every((texture) => texture.disposed));
});
