import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const file = path.resolve("src/features/orbit/actors/squad-tactics.ts");
const result = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: result, exports: result.exports, require: () => ({}) });
const { planTargets } = result.exports;

const foe = (x) => ({ x, y: 0, active: true });
const mate = (x, extra = {}) => ({ x, y: 0, ranged: false, bodyguard: false, previous: null, ...extra });

test("three blades facing three enemies on her take one each, not all the same", () => {
  const foes = [foe(1), foe(1.5), foe(-1.2)];
  const team = [mate(3), mate(4), mate(-3)];
  const plan = planTargets(team, foes, { heroX: 0, trouble: true });
  const targets = team.map((m) => plan.get(m).foe);
  assert.equal(new Set(targets).size, 3);
});

test("each holds its own side: the one ahead takes the enemy ahead, the one behind the enemy behind", () => {
  const ahead = foe(4);
  const behind = foe(-4);
  const front = mate(6);
  const back = mate(-6);
  const plan = planTargets([front, back], [ahead, behind], { heroX: 0, trouble: true });
  assert.equal(plan.get(front).foe, ahead);
  assert.equal(plan.get(back).foe, behind);
});

test("the bodyguard takes whoever is closest to her, wherever he stands", () => {
  const onHer = foe(0.8);
  const far = foe(9);
  const gorr = mate(8.5, { bodyguard: true });
  const plan = planTargets([gorr], [onHer, far], { heroX: 0, trouble: true });
  assert.equal(plan.get(gorr).foe, onHer);
});

test("a fighter with an enemy on it fights that one first", () => {
  const onIt = foe(10.5);
  const onHer = foe(0.5);
  const knight = mate(10);
  const plan = planTargets([knight], [onIt, onHer], { heroX: 0, trouble: true });
  assert.equal(plan.get(knight).foe, onIt);
});

test("ranged fighters spread over different targets too", () => {
  const foes = [foe(5), foe(6)];
  const archers = [mate(1, { ranged: true }), mate(1.5, { ranged: true })];
  const plan = planTargets(archers, foes, { heroX: 0, trouble: false });
  assert.notEqual(plan.get(archers[0]).foe, plan.get(archers[1]).foe);
});
