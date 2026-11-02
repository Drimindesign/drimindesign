import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve("src/features/orbit");
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(compiled, {
    module: result, exports: result.exports,
    require: (name) => load(path.resolve(path.dirname(file), name + ".ts")),
  });
  cache.set(file, result.exports);
  return result.exports;
}

const { JUNGLE_RUN: jungle } = load(path.join(root, "stages/routes.ts"));
const { Mate, Party, MATES } = load(path.join(root, "actors/party.ts"));
const { CompanionNavigator, companionRopeAnchor } = load(path.join(root, "actors/companion-navigation.ts"));
const { CompanionSupport } = load(path.join(root, "actors/companion-support.ts"));
const { RoadTerrain } = load(path.join(root, "engine/terrain.ts"));
const { PLANETS } = load(path.join(root, "engine/config.ts"));

for (const direction of [1, -1]) {
  for (const kind of Object.keys(MATES)) {
    test(`${kind} completes the entire authored night jungle ${direction > 0 ? "forward" : "backward"}`, () => {
      const terrain = new RoadTerrain(jungle.seed, jungle.features, jungle.hills);
      const gaps = jungle.features.filter((f) => f.kind === "ravine");
      const ropes = jungle.ropes.map((x) => {
        const gap = gaps.find((f) => x > f.x && x < f.x + f.size);
        return companionRopeAnchor(terrain, gap, x);
      });
      const options = { gravity: PLANETS.earth.gravity, features: jungle.features, ropes, walks: [] };
      const navigator = new CompanionNavigator(terrain, options, new CompanionSupport(terrain, options));
      const start = direction === 1 ? 4 : jungle.finish;
      const goal = direction === 1 ? jungle.finish : 4;
      const mate = new Mate(Party.member(kind), start, terrain, false, navigator);
      mate.order = { kind: "scout", x: goal };
      const observed = new Set();
      let frontier = start, stalled = 0;
      for (let step = 0; step < 60 * 300 && Math.abs(mate.x - goal) > 0.3; step++) {
        const beforeX = mate.x, beforeY = mate.y;
        const previousGrip = mate.navigationPose.rope?.x;
        mate.update(1 / 60, { x: goal, facing: direction }, 0, null);
        assert.ok(Number.isFinite(mate.x + mate.y), "invalid physical position");
        assert.ok(Math.abs(mate.x - beforeX) < 0.35, `horizontal discontinuity at ${beforeX}`);
        assert.ok(Math.abs(mate.y - beforeY) < 0.5, `vertical discontinuity at ${mate.x}`);
        const grip = mate.navigationPose.rope;
        if (grip) {
          if (previousGrip !== grip.x) {
            assert.equal(previousGrip, undefined, "a station change must include a release and airborne transfer");
            assert.ok(Math.abs(mate.x - grip.x) <= 0.85 + mate.spec.speed / 60,
              `caught a hanging strand from ${Math.abs(mate.x - grip.x)} m away`);
          }
          observed.add(grip.x);
        }
        for (const gap of gaps) {
          if (mate.x < gap.x + 0.4 || mate.x > gap.x + gap.size - 0.4) continue;
          const lip = Math.min(terrain.height(gap.x - 0.6), terrain.height(gap.x + gap.size + 0.6));
          assert.ok(mate.y > lip - 2, `fell into ravine ${gap.x} at ${mate.x},${mate.y}`);
        }
        if ((mate.x - frontier) * direction > 0.05) { frontier = mate.x; stalled = 0; }
        else if (++stalled > 900) assert.fail(`stalled at ${mate.x},${mate.y}; ${JSON.stringify(mate.traversal)}`);
      }
      assert.ok(Math.abs(mate.x - goal) <= 0.3, `did not reach ${goal}; x=${mate.x}`);
      assert.deepEqual([...observed], direction === 1 ? [...jungle.ropes] : [...jungle.ropes].reverse());
    });
  }
}
