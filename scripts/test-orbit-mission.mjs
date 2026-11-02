import assert from "node:assert/strict";
import { PrisonerMission } from "../src/features/orbit/stages/prisoner-mission.ts";

function discover(mission) {
  mission.update(0, 85);
  assert.equal(mission.snapshot().phase, "key-or-breach");
}

function rescueByBreach() {
  const mission = new PrisonerMission();
  discover(mission);
  assert.equal(mission.openCage("breach", 85), true);
  mission.updatePrisoner({ alive: true, down: false, x: 326 });
  assert.equal(mission.extract(326), true);
  assert.equal(mission.snapshot().phase, "complete");
}

function rescueByKey() {
  const mission = new PrisonerMission();
  discover(mission);
  assert.equal(mission.pickupKey(55), false, "key stays unavailable while carrier is active");
  mission.markKeyCarrierDefeated(71);
  mission.markKeyCarrierDefeated(90);
  assert.equal(mission.snapshot().keyX, 71);
  assert.equal(mission.pickupKey(55), false, "key is at the carrier's drop location");
  assert.equal(mission.pickupKey(75), false, "key needs local proximity");
  assert.equal(mission.pickupKey(71), true);
  assert.equal(mission.openCage("key", 85), true);
  mission.updatePrisoner({ alive: true, down: false, x: 330 });
  assert.equal(mission.extract(330), true);
}

function timeoutAndInterception() {
  const mission = new PrisonerMission({ transferStartSeconds: 10 });
  discover(mission);
  const before = mission.snapshot().cageX;
  mission.update(0, 85);
  assert.equal(mission.snapshot().secondsRemaining, 10, "zero simulation time does not consume deadline");
  mission.update(10, 85);
  assert.equal(mission.snapshot().phase, "transporting");
  assert.equal(mission.snapshot().cageX, before, "transport starts without a coordinate pop");
  mission.update(1, 85);
  assert.equal(mission.snapshot().cageX, before + 2.5);
  mission.update(100, 85);
  assert.equal(mission.snapshot().phase, "intercept");
  assert.equal(mission.snapshot().cageX, 245);
  assert.equal(mission.openCage("breach", 85), false, "queen must reach the moved cage");
  assert.equal(mission.openCage("breach", 245), true, "missed transport remains rescuable");
}

function checkpointRecovery() {
  const mission = new PrisonerMission({ transferStartSeconds: 5 });
  discover(mission);
  mission.markKeyCarrierDefeated(68);
  mission.pickupKey(68);
  mission.update(5, 85);
  mission.update(2, 85);
  const saved = mission.checkpoint();
  const restored = new PrisonerMission({ transferStartSeconds: 5 });
  restored.restore(saved);
  assert.deepEqual(restored.snapshot(), mission.snapshot());
  assert.equal(restored.snapshot().keyX, 68, "checkpoint retains the dropped key coordinate");
  restored.restart();
  assert.equal(restored.snapshot().phase, "undiscovered");
  assert.equal(restored.snapshot().cageX, 85);
  assert.equal(restored.snapshot().keyHeld, false);
  assert.equal(restored.snapshot().keyX, 55);
}

function prisonerMustBePresentAndAlive() {
  const mission = new PrisonerMission();
  discover(mission);
  mission.openCage("breach", 85);
  mission.updatePrisoner({ alive: true, down: true, x: 330 });
  assert.equal(mission.extract(330), false);
  assert.match(mission.snapshot().objective, /Help them up/);
  mission.updatePrisoner({ alive: true, down: false, x: 320 });
  assert.equal(mission.extract(330), false, "prisoner must reach the extraction area too");
  mission.updatePrisoner({ alive: true, down: false, x: 330 });
  assert.equal(mission.extract(330), true);
}

rescueByBreach();
rescueByKey();
timeoutAndInterception();
checkpointRecovery();
prisonerMustBePresentAndAlive();
