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
    return {};
  } });
  return result.exports;
}
const { Mate, Party } = load(path.join(root, "actors/party.ts"));
const { separateBodies } = load(path.join(root, "engine/body-separation.ts"));
const terrain = { height: () => 0, slope: () => 0 };
const hero = { x: 0, facing: 1 };

test("front, rear and close guard keep distinct stable formation positions", () => {
  const team = Array.from({ length: 6 }, () => new Mate(Party.member("knight"), 0, terrain, false));
  for (let i = 0; i < 12000; i++) team.forEach((m, slot) => m.update(1 / 120, hero, slot, null));
  assert.ok(team[0].x > 4);
  assert.ok(team[1].x < -3);
  assert.ok(team[2].x > 1 && team[2].x < 2.3);
  assert.ok(new Set(team.map((m) => Math.round(m.x))).size === 6);
});

test("soldiers run back from an old fight without teleporting in view", () => {
  const soldier = new Mate(Party.member("knight"), -22, terrain, false);
  soldier.update(1 / 120, hero, 0, null);
  assert.ok(soldier.x > -22 && soldier.x < -21.9);
  assert.equal(soldier.alpha, 1);
});

test("recruitment rank does not multiply support damage", () => {
  const member = Party.member("barbarian");
  const soldier = new Mate(member, 0, terrain, false);
  const damage = soldier.power;
  member.rank = 100;
  assert.equal(soldier.power, damage);
  assert.ok(damage < 1.2);
});

test("a swing cannot transfer to another foe or hit one that ran away", () => {
  const soldier = new Mate(Party.member("knight"), 0, terrain, false);
  const first = { x: 1, y: 0, active: true };
  soldier.update(1 / 120, hero, 0, first);
  first.x = 10;
  for (let i = 0; i < 60; i++) assert.equal(soldier.update(1 / 120, hero, 0, { x: 1, y: 0, active: true }), null);
});

test("Gorr and soldiers separate while friendly bodies never drag the hero", () => {
  const bodies = [
    { x: 0, y: 0, half: 0.32, mass: 60, friend: true, hero: true },
    { x: 0, y: 0, half: 0.85, mass: 200, friend: true },
    { x: 0, y: 0, half: 0.32, mass: 30, friend: true },
  ].map((b) => ({ ...b, move: (dx) => dx }));
  separateBodies(bodies);
  assert.equal(bodies[0].x, 0);
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) assert.ok(Math.abs(bodies[i].x - bodies[j].x) >= bodies[i].half + bodies[j].half - 0.04);
});

test("a wall cannot make friendly collision push the player", () => {
  const heroBody = { x: 0, y: 0, half: 0.32, mass: 60, friend: true, hero: true, move: (dx) => dx };
  const blocked = { x: 0.2, y: 0, half: 0.85, mass: 200, friend: true, move: () => 0 };
  separateBodies([heroBody, blocked]);
  assert.equal(heroBody.x, 0);
});

test("less skilled allies fall after three ordinary hits, veterans endure longer", () => {
  for (const [kind, hits] of [["mage", 3], ["knight", 5], ["giant", 9]]) {
    const mate = new Mate(Party.member(kind), 0, terrain, false);
    for (let i = 1; i <= hits; i++) {
      mate.mercy = 0;
      assert.equal(mate.hurt(-1, 2), i === hits);
      if (i < hits) { mate.state = "follow"; }
    }
    assert.equal(mate.state, "wounded");
  }
});

test("distant soldiers never relocate or accelerate beyond their natural speed", () => {
 for (const distance of [30, 60, 150, 300]) {
  const m = new Mate(Party.member("knight"), -distance, terrain, false);
  for (let i=0;i<120;i++) m.update(1/120, hero, 0, null);
  assert.ok(m.x <= -distance + m.spec.speed + 0.01);
  assert.equal(m.alpha, 1);
 }
});
