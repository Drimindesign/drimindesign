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

test("the guard rings her within 10 m, alternating ahead and behind, nearest places first", () => {
  const team = Array.from({ length: 6 }, () => new Mate(Party.member("knight"), 0, terrain, false));
  for (let i = 0; i < 12000; i++) team.forEach((m, slot) => m.update(1 / 120, hero, slot, null));
  assert.ok(team.every((m) => Math.abs(m.x) <= 10.05));
  assert.ok(team[0].x > 0 && team[1].x < 0);
  assert.ok(Math.abs(team[0].x) < Math.abs(team[2].x) && Math.abs(team[2].x) < Math.abs(team[4].x));
  assert.ok(new Set(team.map((m) => Math.round(m.x * 4))).size === 6);
});

test("soldiers run back from an old fight without teleporting in view", () => {
  const soldier = new Mate(Party.member("knight"), -22, terrain, false);
  soldier.update(1 / 120, hero, 0, null);
  assert.ok(soldier.x > -22 && soldier.x < -21.9);
  assert.equal(soldier.alpha, 1);
});

test("strength in numbers: a bigger squad hits harder, up to a cap; rank alone changes nothing", () => {
  const member = Party.member("barbarian");
  const soldier = new Mate(member, 0, terrain, false);
  const alone = soldier.power;
  member.rank = 100;
  assert.equal(soldier.power, alone);
  soldier.squad = 4;
  assert.ok(soldier.power > alone);
  soldier.squad = 100;
  assert.ok(soldier.power <= alone * 2.2 + 1e-9);
});

test("a swing cannot transfer to another foe or hit one that ran away", () => {
  const soldier = new Mate(Party.member("knight"), 0, terrain, false);
  const first = { x: 1, y: 0, active: true };
  soldier.update(1 / 120, hero, 0, first);
  first.x = 10;
  for (let i = 0; i < 60; i++) assert.equal(soldier.update(1 / 120, hero, 0, { x: 1, y: 0, active: true }), null);
});

test("her side passes through itself and never drags the hero; the two sides stay apart", () => {
  const friends = [
    { x: 0, y: 0, half: 0.32, mass: 60, friend: true, hero: true },
    { x: 0, y: 0, half: 0.85, mass: 200, friend: true },
    { x: 0, y: 0, half: 0.32, mass: 30, friend: true },
  ].map((b) => ({ ...b, move: (dx) => dx }));
  separateBodies(friends);
  assert.ok(friends.every((b) => b.x === 0));
  const sides = [
    { x: 0, y: 0, half: 0.32, mass: 30, friend: true },
    { x: 0.1, y: 0, half: 0.36, mass: 90, friend: false },
  ].map((b) => ({ ...b, move: (dx) => dx }));
  separateBodies(sides);
  assert.ok(sides[1].x - sides[0].x >= sides[0].half + sides[1].half - 0.04);
});

test("a wall cannot make friendly collision push the player", () => {
  const heroBody = { x: 0, y: 0, half: 0.32, mass: 60, friend: true, hero: true, move: (dx) => dx };
  const blocked = { x: 0.2, y: 0, half: 0.85, mass: 200, friend: true, move: () => 0 };
  separateBodies([heroBody, blocked]);
  assert.equal(heroBody.x, 0);
});

test("less skilled allies fall after three ordinary hits, veterans endure longer", () => {
  for (const [kind, hits] of [["mage", 3], ["knight", 5], ["giant", 11]]) {
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

test("a teammate fights the enemy on it before running back to her", () => {
  const soldier = new Mate(Party.member("knight"), 0, terrain, false);
  const behind = { x: -1, y: 0, active: true };
  let struck = null;
  for (let i = 0; i < 240 && !struck; i++) struck = soldier.update(1 / 120, { x: 8, facing: 1, trouble: true }, 0, behind);
  assert.equal(struck, behind);
  assert.ok(soldier.x < 1);
});
