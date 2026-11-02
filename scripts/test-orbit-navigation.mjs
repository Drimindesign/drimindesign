import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const root = path.resolve("src/features/orbit");
function load(file) {
  const result = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { module: result, exports: result.exports, require: (name) => {
    if (name === "./squad-formation") return load(path.join(root, "actors/squad-formation.ts"));
    if (name === "./companion-navigation") return load(path.join(root, "actors/companion-navigation.ts"));
    if (name === "../engine/terrain") return {};
    if (name === "../engine/config") return load(path.join(root, "engine/config.ts"));
    return {};
  } });
  return result.exports;
}

const { Mate, Party } = load(path.join(root, "actors/party.ts"));
const { CompanionNavigator } = load(path.join(root, "actors/companion-navigation.ts"));
const routes = load(path.join(root, "stages/routes.ts"));
const jungle = routes.JUNGLE_RUN;

function makeTerrain(features) {
  return {
    height(x) {
      let y = 0;
      for (const feature of features) {
        if (feature.kind === "ravine") {
          const t = Math.max(0, Math.min(1, (x - feature.x + 0.4) / 0.8));
          const u = Math.max(0, Math.min(1, (x - feature.x - feature.size + 0.4) / 0.8));
          y += -40 * t * (1 - u);
        } else if (feature.kind === "ledge" && x >= feature.x) y += feature.size;
      }
      return y;
    },
    slope(x) { return (this.height(x + 0.02) - this.height(x - 0.02)) / 0.04; },
  };
}

function createNavigator() {
  const terrain = makeTerrain(jungle.features);
  return new CompanionNavigator(terrain, {
    features: jungle.features,
    ropes: jungle.ropes,
    walks: jungle.walks ?? [],
    gravity: 9.81,
  });
}

function traverseMate(kind, start, goal, navigator, terrain) {
  const mate = new Mate(Party.member(kind), start, terrain, false, navigator);
  mate.order = { kind: "scout", x: goal };
  let previous = mate.x;
  let previousY = mate.y;
  const observed = [];
  for (let i = 0; i < 20000 && Math.abs(mate.x - goal) > 0.3; i++) {
    const direction = Math.sign(goal - start);
    mate.update(1 / 60, { x: goal - 35 * direction, facing: direction }, 0, null);
    assert.ok(Math.abs(mate.x - previous) < 0.6, `${kind} teleported ${previous} -> ${mate.x}`);
    assert.ok(Math.abs(mate.y - previousY) < 0.7, `${kind} teleported vertically ${previousY} -> ${mate.y}`);
    previous = mate.x;
    previousY = mate.y;
    if (mate.navigationPose.kind === "rope") {
      const rig = mate.navigationPose.rope;
      const radius = Math.hypot(mate.x - rig.x, mate.y + 0.8 - rig.y);
      assert.ok(Math.abs(radius - rig.length) < 0.15, `${kind} left rope radius ${radius}`);
      assert.ok(mate.y > terrain.height(mate.x) + 0.5, `${kind} fell into the ravine`);
      observed.push(rig.x);
    }
  }
  assert.ok(Math.abs(mate.x - goal) <= 0.3, `${kind} stalled at ${mate.x} before ${goal}: vx=${mate.vx} hop=${JSON.stringify(mate.hop)} crossing=${JSON.stringify(mate.traversal)} order=${JSON.stringify(mate.order)}`);
  assert.equal(mate.alpha, 1);
  return { mate, observed };
}

test("every authored jungle ravine has a bidirectional physical rope route for ordinary soldiers", () => {
  for (const feature of jungle.features.filter((item) => item.kind === "ravine")) {
    const start = feature.x - 2;
    const goal = feature.x + feature.size + 2;
    const forward = traverseMate("knight", start, goal, createNavigator(), makeTerrain(jungle.features));
    assert.ok(forward.observed.length > 0, `no rope route observed at ${feature.x}`);
    const backward = traverseMate("knight", goal, start, createNavigator(), makeTerrain(jungle.features));
    assert.ok(backward.observed.length > 0, `no reverse rope route observed at ${feature.x}`);
  }
});

test("leapers and small recruits use the authored sling instead of an impossible wide jump", () => {
  for (const kind of ["dog", "giant", "mage"]) {
    const feature = jungle.features.find((item) => item.kind === "ravine" && item.size === 19);
    const result = traverseMate(kind, feature.x - 2, feature.x + feature.size + 2, createNavigator(), makeTerrain(jungle.features));
    assert.ok(result.observed.length > 0);
  }
});

test("rope occupancy is exclusive and a waiting companion continues from its near bank", () => {
  const terrain = makeTerrain(jungle.features);
  const nav = createNavigator();
  const obstacle = jungle.features.find((item) => item.kind === "ravine");
  const goal = obstacle.x + obstacle.size + 2;
  const first = new Mate(Party.member("knight"), obstacle.x - 2, terrain, false, nav);
  const second = new Mate(Party.member("ranger"), obstacle.x - 2, terrain, false, nav);
  for (let i = 0; i < 500 && first.navigationPose.kind !== "rope"; i++) first.update(1 / 60, { x: goal, facing: 1 }, 0, null);
  assert.equal(first.navigationPose.kind, "rope");
  second.update(1 / 60, { x: goal, facing: 1 }, 0, null);
  assert.ok(second.x < obstacle.x - 0.5);
  for (let i = 0; i < 3000 && first.traversal; i++) first.update(1 / 60, { x: goal, facing: 1 }, 0, null);
  assert.ok(first.x > obstacle.x + obstacle.size);
  for (let i = 0; i < 5000 && Math.abs(second.x - goal) > 0.3; i++) second.update(1 / 60, { x: goal, facing: 1 }, 0, null);
  assert.ok(second.x > obstacle.x + obstacle.size);
});

test("a player-held rope has priority and companions wait safely on the near bank", () => {
  const terrain = makeTerrain(jungle.features);
  const nav = createNavigator();
  nav.setBlockedRopes([60]);
  const feature = jungle.features.find((item) => item.kind === "ravine");
  const mate = new Mate(Party.member("mage"), feature.x - 2, terrain, false, nav);
  mate.order = { kind: "scout", x: feature.x + feature.size + 2 };
  for (let i = 0; i < 500; i++) mate.update(1 / 60, { x: 0, facing: 1 }, 0, null);
  assert.equal(mate.navigationPose.kind, "ground");
  assert.ok(mate.x < feature.x);
  assert.ok(mate.y > -0.5);
});

test("orders can hold a post and regroup without moving beyond role speed", () => {
  const terrain = makeTerrain([]);
  const mate = new Mate(Party.member("ranger"), 0, terrain, false, new CompanionNavigator(terrain, { features: [], ropes: [], walks: [], gravity: 9.81 }));
  mate.order = { kind: "hold", x: 3 };
  const foe = { x: 3.5, y: 0, active: true };
  for (let i = 0; i < 300; i++) mate.update(1 / 60, { x: 20, facing: 1 }, 0, foe);
  assert.ok(Math.abs(mate.x - 3) < 0.25);
  const before = mate.x;
  mate.order = { kind: "regroup" };
  mate.update(1 / 60, { x: 20, facing: 1 }, 0, null);
  assert.ok(Math.abs(mate.x - before) <= mate.spec.speed / 60 + 0.01);
});
