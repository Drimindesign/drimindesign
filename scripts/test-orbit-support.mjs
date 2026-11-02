import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(file) {
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(compiled, {
    module: result, exports: result.exports,
    require: (specifier) => load(path.resolve(path.dirname(file), specifier + ".ts")),
  });
  return result.exports;
}

const { CompanionSupport } = load("src/features/orbit/actors/companion-support.ts");
const { RoadTerrain } = load("src/features/orbit/engine/terrain.ts");
const dt = 1 / 60;
const gravity = 9.81;
const body = (x, y) => ({ x, y, vx: 0, facing: 1, spec: { speed: 4.4 } });

function step(actor, support, terrain, target) {
  if (support.move(actor, dt, target)) return;
  const dx = support.approachTarget(actor, target) - actor.x;
  actor.x += Math.sign(dx) * Math.min(Math.abs(dx), actor.spec.speed * dt);
  actor.y = terrain.height(actor.x);
}

test("the slowest recruit crosses the actual moving logs in both directions", () => {
  const river = { kind: "water", x: 50, size: 17 };
  const terrain = new RoadTerrain(47, [river], 0.55);
  const logHeight = Math.min(terrain.height(49.4), terrain.height(67.6)) - 1.1 + 0.25;
  for (const direction of [1, -1]) {
    let clock = 0;
    const logs = [51, 55.4, 59.7].map((homeX, i) => ({
      homeX, top: logHeight,
      center: (ahead) => homeX + 3.8 * (0.5 - 0.5 * Math.cos(i * 1.9 + (clock + ahead) * 1.2 / 3.8)),
    }));
    const support = new CompanionSupport(terrain, { gravity, features: [river], walks: [], logs });
    const actor = body(direction > 0 ? 48 : 69, 0);
    actor.y = terrain.height(actor.x);
    const target = direction > 0 ? 70 : 47;
    const observed = new Set();
    let lastVy;
    for (let i = 0; i < 5400 && Math.abs(actor.x - target) > 0.15; i++) {
      clock += dt;
      const prev = { x: actor.x, y: actor.y, phase: support.phase(actor) };
      step(actor, support, terrain, target);
      const phase = support.phase(actor);
      const vy = (actor.y - prev.y) / dt;
      if (prev.phase === "jump" && phase === "jump") {
        if (lastVy !== undefined) assert.ok(Math.abs(vy - lastVy + gravity * dt) < 0.00001);
        lastVy = vy;
        assert.ok(Math.abs(actor.x - prev.x) <= actor.spec.speed * dt + 0.000001);
      } else lastVy = undefined;
      if (phase === "ride") {
        const on = logs.find((log) => Math.abs(actor.x - log.center(0)) <= 1.3);
        assert.ok(on, "feet missed the log");
        assert.equal(actor.y, logHeight);
        observed.add(on.homeX);
      }
      if (actor.x > 50.4 && actor.x < 66.6) assert.ok(actor.y >= logHeight - 0.01, "fell into the river");
    }
    assert.ok(Math.abs(actor.x - target) < 0.15, `stranded at ${actor.x}`);
    assert.ok(observed.size >= 2, "crossing did not use successive physical logs");
  }
});

test("an empty river leaves the recruit on the bank", () => {
  const river = { kind: "water", x: 10, size: 14 };
  const terrain = new RoadTerrain(0, [river], 0);
  const support = new CompanionSupport(terrain, { gravity, features: [river], walks: [] });
  const actor = body(8, 0);
  for (let i = 0; i < 600; i++) step(actor, support, terrain, 28);
  assert.ok(actor.x < 9.6);
  assert.equal(actor.y, 0);
});

test("a recruit underneath the canopy returns to its vine, climbs, follows the deck and drops to ground", () => {
  let upper = true;
  const deck = { x0: 20, x1: 42, y: 6.4 };
  const terrain = new RoadTerrain(0, [], 0);
  const support = new CompanionSupport(terrain, { gravity, features: [], walks: [deck], wantsCanopy: () => upper });
  const actor = body(32, 0);
  const observed = new Set();
  for (let i = 0; i < 1200; i++) {
    const prevY = actor.y;
    step(actor, support, terrain, 29);
    observed.add(support.phase(actor));
    if (actor.y > prevY) {
      assert.ok(Math.abs(actor.x - (deck.x0 - 0.35)) <= 0.16);
      assert.ok(actor.y - prevY <= 1.5 * dt + 0.00001);
    }
  }
  assert.equal(actor.x, 29);
  assert.equal(actor.y, deck.y);
  assert.ok(observed.has("climb") && observed.has("walk"));
  upper = false;
  for (let i = 0; i < 1200; i++) {
    step(actor, support, terrain, 50);
    observed.add(support.phase(actor));
  }
  assert.ok(observed.has("jump"));
  assert.equal(actor.x, 50);
  assert.equal(actor.y, 0);
});
