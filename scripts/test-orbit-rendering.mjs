import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as THREE from "three";
const require = createRequire(import.meta.url);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

// Exercise the real TypeScript methods with Three objects, without requiring a WebGL driver.
function load(file) {
  const compiledModule = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (name) => {
    if (name.endsWith("/actors/arsenal")) return { WEAPONS: {} };
    if (name.endsWith("/actors/boar")) return { GETUP_TIME: 1.5 };
    if (name.endsWith("/engine/config")) return { PPM: 16 };
    if (name === "./dispose-scene") return load(path.join(path.dirname(file), "dispose-scene.ts"));
    return require(name);
  };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: localRequire, performance, setTimeout });
  return compiledModule.exports;
}
const base = path.join(scriptDirectory, "../src/features/orbit/pixel");

test("fire animation tolerates light children and repeated activation without stopping gameplay", () => {
  const { Fighters3D } = load(path.join(base, "fighters-3d.ts"));
  const renderer = new Fighters3D(null, "jungle");
  const parent = new THREE.Group();
  const object = new THREE.Group();
  parent.add(object);
  const flame = new THREE.Group();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
  const light = new THREE.PointLight();
  flame.add(sprite, light);
  object.add(flame);
  const arm = { object, hand: { parent, matrix: new THREE.Matrix4() }, back: { parent, matrix: new THREE.Matrix4() }, steel: [new THREE.MeshStandardMaterial()], flame };
  const scene = { arms: new Map([["blade", arm]]) };
  const hero = { weapon: "blade", sheathed: false, burning: 5 };
  for (let frame = 0; frame < 180; frame++) renderer.carry(scene, hero);
  assert.equal(flame.visible, true);
  assert.ok(Number.isFinite(sprite.material.rotation));
  hero.burning = 0;
  renderer.carry(scene, hero);
  assert.equal(flame.visible, false);
  hero.burning = 5;
  renderer.carry(scene, hero);
  assert.equal(flame.visible, true);
});

test("stage cleanup disposes shared GPU resources once, including sprite textures", () => {
  const { disposeScene } = load(path.join(base, "dispose-scene.ts"));
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
  scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material), new THREE.Sprite(spriteMaterial));
  const counts = { geometry: 0, material: 0, sprite: 0, texture: 0 };
  for (const [object, key] of [[geometry, "geometry"], [material, "material"], [spriteMaterial, "sprite"], [texture, "texture"]]) object.addEventListener("dispose", () => counts[key]++);
  disposeScene(scene);
  assert.deepEqual(counts, { geometry: 1, material: 1, sprite: 1, texture: 1 });
  assert.equal(scene.children.length, 0);
  disposeScene(scene);
  assert.deepEqual(counts, { geometry: 1, material: 1, sprite: 1, texture: 1 });
});
