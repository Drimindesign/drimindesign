import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const root = path.resolve("src/features/orbit");

class FakeMate {
  constructor(member, x, terrain, caged) {
    this.member = member;
    this.x = x;
    this.y = 0;
    this.state = caged ? "caged" : "follow";
    this.order = { kind: "follow" };
    this.active = this.state === "follow";
    this.spec = { name: "Knight", unlocks: undefined };
    this.kind = member.kind;
    this.visitor = false;
  }
  place(x) { this.x = x; }
  free() { this.state = "follow"; this.active = true; }
}

class FakeBoar {
  constructor(x) { this.x = x; this.health = 3; this.state = "wait"; }
  reset() { this.x = 55; this.health = 3; this.state = "wait"; }
}

function load(file) {
  const result = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    module: result,
    exports: result.exports,
    require(name) {
      if (name === "./prisoner-mission") return load(path.join(root, "stages/prisoner-mission.ts"));
      if (name === "../actors/party") return {
        MATES: { knight: { name: "Knight", unlocks: undefined, freed: "Free!" } },
        Mate: FakeMate,
        Party: { restore() {}, join() {}, taken: [] },
        WOUND: { revive: 1 },
      };
      if (name === "../actors/boar") return { Boar: FakeBoar };
      return new Proxy({}, { get: (_target, key) => key === "default" ? undefined : () => undefined });
    },
  });
  return result.exports;
}

const { RoadStage } = load(path.join(root, "stages/road.ts"));

function makeStage() {
  const stage = Object.create(RoadStage.prototype);
  const missionModule = load(path.join(root, "stages/prisoner-mission.ts"));
  stage.mission = new missionModule.PrisonerMission();
  stage.missionSave = stage.mission.checkpoint();
  stage.keyCarrier = new FakeBoar(55);
  stage.config = { rescueObjective: true, finish: 330, checkpoints: [6], features: [] };
  stage.terrain = { height: () => 0 };
  stage.navigator = {};
  stage.reached = 6;
  stage.unlockRequested = false;
  stage.hold = 0;
  stage.done = false;
  stage.fade = 0;
  stage.channel = null;
  stage.mount = null;
  stage.onFoot = false;
  stage.truck = true;
  stage.stops = [];
  stage.encounters = [];
  stage.walks = [];
  stage.ropes = [];
  stage.boardIn = -1;
  stage.leaving = [];
  stage.context = {
    audio: { pickup() {}, crack() {}, land() {}, sting() {} },
    particles: { dust() {}, sparks() {} },
    score: { add() {} },
    fx: { cinema() {} },
    party: { taken: [], join() {}, restore(member) { member.alive = true; member.hearts = 10; }, hearts: 0 },
  };
  stage.debris = { burst() {} };
  const member = { kind: "knight", rank: 0, alive: true, hearts: 10 };
  const mate = new FakeMate(member, 85, stage.terrain, true);
  stage.cages = [{ x: 85, blows: 3, broken: false, shake: 0, mate }];
  stage.mates = [];
  stage.crew = {
    mode: "foot",
    explorer: {
      body: { x: 85, y: 0, facing: 1 },
      striking: true,
      struck: new Set(),
      hitbox: { x0: 84, x1: 86 },
      recoil() {},
      heal() {},
      charge() {},
    },
    car: { vehicle: { x: 330 } },
  };
  return stage;
}

function interact(stage, dt = 1 / 120) {
  stage.stepMission(dt, { interactPressed: true });
}

function breach(stage) {
  stage.mission.update(0, 85);
  stage.cages[0].blows = 1;
  stage.crew.explorer.striking = true;
  stage.stepCages(1 / 120);
  assert.equal(stage.cages[0].broken, true);
  assert.equal(stage.mission.snapshot().cageOpen, true);
}

test("key rescue unlocks through live RoadStage cage logic", () => {
  const stage = makeStage();
  stage.mission.update(0, 85);
  stage.keyCarrier.health = 0;
  stage.crew.explorer.body.x = 55;
  interact(stage);
  assert.equal(stage.mission.snapshot().keyHeld, true);
  stage.crew.explorer.body.x = 85;
  stage.mission.update(0, 85);
  stage.cages[0].blows = 1;
  stage.crew.explorer.striking = false;
  stage.unlockRequested = true;
  stage.stepCages(1 / 120);
  assert.equal(stage.cages[0].broken, true);
  assert.equal(stage.mission.snapshot().phase, "escort");
  assert.equal(stage.cages[0].mate.order.kind, "regroup");
  assert.equal(stage.missionSave.cageOpen, true, "rescue is an immediate recovery checkpoint");
});

test("breach path opens cage without a key or surviving companion role", () => {
  const stage = makeStage();
  breach(stage);
  assert.equal(stage.mission.snapshot().keyHeld, false);
  assert.equal(stage.mates.length, 1);
});

test("deadline follows supplied simulation time and updates the cage continuously", () => {
  const stage = makeStage();
  stage.mission = new (load(path.join(root, "stages/prisoner-mission.ts")).PrisonerMission)({ transferStartSeconds: 1 });
  stage.missionSave = stage.mission.checkpoint();
  stage.mission.update(0, 85);
  stage.stepMission(0.5, { interactPressed: false });
  assert.equal(stage.cages[0].x, 85);
  stage.stepMission(0, { interactPressed: false });
  assert.equal(stage.mission.snapshot().secondsRemaining, 0.5);
  stage.stepMission(0.5, { interactPressed: false });
  assert.equal(stage.mission.snapshot().phase, "transporting");
  assert.equal(stage.cages[0].x, 85);
  stage.stepMission(0.4, { interactPressed: false });
  assert.equal(stage.cages[0].x, 86);
  stage.stepMission(0, { interactPressed: false });
  assert.equal(stage.cages[0].x, 86, "paused zero-dt updates cannot move the carriage");
});

test("route map places the dropped key at the carrier's final world coordinate", () => {
  const stage = makeStage();
  stage.mission.update(0, 85);
  stage.mission.markKeyCarrierDefeated(71);
  const map = stage.routeMap();
  assert.equal(map.objectives[0].x, 85);
  assert.equal(map.objectives[1].x, 71);
  assert.equal(map.objectives[2].x, 330);
});

test("checkpoint recovery restores one living Knight and extraction accepts truck boarding", () => {
  const stage = makeStage();
  breach(stage);
  const savedMate = stage.cages[0].mate;
  stage.missionSave = stage.mission.checkpoint();
  stage.mates.push(savedMate);
  savedMate.state = "dead";
  savedMate.member.alive = false;
  stage.restoreMission();
  assert.equal(stage.mates.filter((mate) => mate.member === savedMate.member).length, 1);
  const knight = stage.mates[0];
  assert.equal(knight.member.alive, true);
  assert.equal(knight.order.kind, "regroup");
  stage.crew.mode = "car";
  stage.crew.car.vehicle.x = 330;
  knight.x = 329;
  assert.equal(stage.rescueComplete(), true);
  assert.equal(stage.mission.snapshot().phase, "complete");
});

test("prison transport stops at solid scenery and resumes only when cleared", () => {
  const stage = makeStage();
  stage.mission.update(0, 85);
  stage.mission.update(90, 85);
  stage.props = [{ x: 86, kind: "fence", broken: false }];
  stage.stepMission(1 / 120, { interactPressed: false });
  assert.equal(stage.mission.snapshot().cageX, 85);
  stage.props[0].broken = true;
  stage.stepMission(1 / 120, { interactPressed: false });
  assert.ok(stage.mission.snapshot().cageX > 85);
});
