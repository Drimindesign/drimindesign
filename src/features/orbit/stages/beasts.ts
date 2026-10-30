import { BOAR_BACK, type Boar } from "../actors/boar";
import type { Crew } from "../actors/crew";
import { POINTS, STUNTS } from "../actors/score";
import { CAR } from "../engine/config";
import type { StageContext } from "./types";

/** Below this speed (m/s) a charging beast that rams the car wrecks it; above it, the car ploughs through. */
const RAM_SPEED = 10;
/** The thruster jet reaches this far below the car (m) and this far either side of it. */
const JET_REACH = 7;
const JET_HALF_WIDTH = 2.4;
/** A sword blow's knockback (m/s, for a 90 kg beast). */
const SWORD_POWER = 6;

/*
 * Beasts against the crew, shared by every stage that has them. In the car: the thruster jet
 * blasts anything under it; a fast car smashes through; a slow car rammed by a charging beast
 * is wrecked. On foot: sword blows (each swing can hit several), stomps, and charges that cost
 * hearts. Returns true when the explorer has lost their last heart.
 */
export function stepBeasts(beasts: readonly Boar[], crew: Crew, context: StageContext, dt: number, gravity: number): boolean {
  const { audio, score, combo, particles } = context;
  const car = crew.car;
  const v = car.vehicle;
  const e = crew.explorer;
  const driving = crew.mode === "car";
  let down = false;
  for (const beast of beasts) {
    if (beast.update(dt, gravity, driving ? v.x : e.body.x)) audio.grunt();
    if (!beast.active) continue;
    if (driving) {
      const side = Math.sign(beast.x - v.x) || 1;
      const below = v.y - beast.y;
      if (v.thrust > 0.25 && Math.abs(beast.x - v.x) < JET_HALF_WIDTH && below > 0.2 && below < JET_REACH) {
        beast.blast(side);
        audio.thwack();
        particles.dust(beast.x, beast.y, 0, 24, 1.3);
        combo.add(1);
        score.add(STUNTS.blast * combo.multiplier, "Blasted", beast.x, beast.y + 2);
        continue;
      }
      if (car.wrecked > 0 || beast.state === "flee") continue;
      if (Math.abs(beast.x - v.x) < 2.3 && beast.y < v.y + 0.4 && beast.y > v.y - 1.6) {
        if (beast.dangerous && v.grounded && Math.abs(v.vx) < RAM_SPEED) {
          car.crash();
          beast.rebound(side);
          score.add(0, "Rammed: go faster or fly over", v.x, v.y + 2.5);
        } else {
          v.vx += beast.hitByCar(v.vx - beast.vx, CAR.mass);
          audio.thwack();
          score.add(POINTS.carBump, "Smashed", beast.x, beast.y + 1.5);
        }
      }
      continue;
    }
    const b = e.body;
    if (e.striking && !e.struck.has(beast)) {
      const box = e.hitbox;
      if (beast.x + 0.6 > box.x0 && beast.x - 0.6 < box.x1 && beast.y + 1 > box.y0 && beast.y < box.y1) {
        e.struck.add(beast);
        e.recoil();
        audio.thwack();
        const off = beast.hit(b.facing, SWORD_POWER);
        score.add(off ? POINTS.swordHit * 2 : POINTS.swordHit, off ? "Driven off" : "Slash", beast.x, beast.y + 1.6);
        continue;
      }
    }
    if (b.vy < 0 && Math.abs(b.x - beast.x) < 0.7 && b.y > beast.y + BOAR_BACK - 0.25 && b.y < beast.y + BOAR_BACK + 0.4) {
      beast.stomp();
      e.bounce();
      audio.thwack();
      score.add(POINTS.stomp, "Stomp", beast.x, beast.y + 1.6);
      continue;
    }
    if (beast.dangerous && Math.abs(beast.x - b.x) < 0.8 && b.y < beast.y + 0.9 && b.y > beast.y - 0.5 && e.hurt(beast.x)) {
      beast.rebound(Math.sign(beast.x - b.x) || 1);
      combo.break();
      if (e.hearts === 0) down = true;
    }
  }
  return down;
}
