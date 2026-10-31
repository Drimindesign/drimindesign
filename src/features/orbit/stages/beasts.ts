import { BOAR_BACK, type Boar } from "../actors/boar";
import type { Crew } from "../actors/crew";
import { POINTS, STUNTS } from "../actors/score";
import { CAR } from "../engine/config";
import type { StageContext } from "./types";

/** Below this speed (m/s) a charging beast that rams the car wrecks it; above it, the car ploughs through. */
const RAM_SPEED = 10;
/** Fighters that close in at once on a hero on foot. */
const ENGAGED = 2;
/** The thruster jet reaches this far below the car (m) and this far either side of it. */
const JET_REACH = 7;
const JET_HALF_WIDTH = 2.4;

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
  // On foot, only the two nearest fighters close in at once; the rest hold off and wait their turn.
  const engaged = new Set(
    driving
      ? beasts
      : beasts.filter((b) => b.fighter && b.active).sort((a, b) => Math.abs(a.x - e.body.x) - Math.abs(b.x - e.body.x)).slice(0, ENGAGED),
  );
  for (const beast of beasts) {
    if (beast.update(dt, gravity, driving ? v.x : e.body.x, engaged.has(beast))) audio.grunt();
    // The hero starts a swing: fighters in reach may raise a guard or step back.
    if (!driving && e.swingStarted && beast.fighter && Math.abs(beast.x - e.body.x) < 2.8) beast.react(e.body.x);
    if (!beast.active) continue;
    if (driving) {
      const side = Math.sign(beast.x - v.x) || 1;
      const below = v.y - beast.y;
      if (beast.kind === "dog") {
        // Dogs are frightened off, never hurt: the jet scares them, the car bumps them away.
        const near = Math.abs(beast.x - v.x);
        if (v.thrust > 0.25 && near < JET_HALF_WIDTH * 1.5 && below < JET_REACH) beast.scare(side);
        else if (car.wrecked === 0 && beast.state !== "flee" && near < 2.3 && beast.y < v.y + 0.4 && beast.y > v.y - 1.6) {
          beast.scare(side);
          score.add(-50, "Watch the dogs", beast.x, beast.y + 1.5);
        }
        continue;
      }
      if (v.thrust > 0.25 && Math.abs(beast.x - v.x) < JET_HALF_WIDTH && below > 0.2 && below < JET_REACH) {
        beast.blast(side);
        audio.thwack();
        particles.dust(beast.x, beast.y, 0, 24, 1.3);
        combo.add(1);
        score.add(STUNTS.blast * combo.multiplier, "Blasted", beast.x, beast.y + 2);
        context.fx.punch(0.06);
        continue;
      }
      if (car.wrecked > 0 || beast.state === "flee") continue;
      if (beast.fighter) {
        // A raider can't hurt a truck; a truck going faster than a jog knocks it flying.
        if (Math.abs(v.vx) > 4 && Math.abs(beast.x - v.x) < 2.3 && beast.y < v.y + 0.4 && beast.y > v.y - 1.8) {
          v.vx += beast.hitByCar(v.vx - beast.vx, CAR.mass);
          audio.thwack();
          score.add(POINTS.carBump, "Run down", beast.x, beast.y + 2);
          context.fx.punch(0.06);
        }
        continue;
      }
      if (Math.abs(beast.x - v.x) < 2.3 && beast.y < v.y + 0.4 && beast.y > v.y - 1.6) {
        if (beast.dangerous && v.grounded && Math.abs(v.vx) < RAM_SPEED) {
          car.crash();
          beast.rebound(side);
          score.add(0, "Rammed: go faster or fly over", v.x, v.y + 2.5);
        } else {
          v.vx += beast.hitByCar(v.vx - beast.vx, CAR.mass);
          audio.thwack();
          score.add(POINTS.carBump, "Smashed", beast.x, beast.y + 1.5);
          context.fx.punch(0.05);
        }
      }
      continue;
    }
    const b = e.body;
    if (e.striking && !e.struck.has(beast)) {
      const box = e.hitbox;
      if (beast.x + 0.6 > box.x0 && beast.x - 0.6 < box.x1 && beast.y + 1 > box.y0 && beast.y < box.y1) {
        e.struck.add(beast);
        const blow = e.blow;
        if (beast.covers(b.facing)) {
          // Steel on the guard: a kick knocks it open, a cut bounces off and throws the blade back.
          audio.clang(blow.guardBreak ? 0.6 : 1);
          context.fx.punch(0.05);
          context.fx.buzz(25);
          if (blow.guardBreak) {
            beast.breakGuard(b.facing);
            score.add(POINTS.swordHit, "Guard broken", beast.x, beast.y + 1.6);
          } else {
            beast.absorb(b.facing);
            e.parry();
            score.add(0, "Blocked", beast.x, beast.y + 1.9);
          }
          continue;
        }
        e.recoil();
        audio.thwack();
        // Steel on armour as well as the body under it (the knights wear plate).
        if (beast.kind === "raider") audio.clang(0.3);
        context.fx.buzz(blow.heavy ? 45 : 20);
        const off = beast.hit(b.facing, blow.power, blow.joint, blow.heavy);
        score.add(off ? POINTS.swordHit * 2 : POINTS.swordHit, off ? "Driven off" : "Slash", beast.x, beast.y + 1.6);
        context.fx.punch(off ? 0.07 : 0.04);
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
    // An animal hurts on contact; a raider only in the strike of its swing, within its reach, facing you.
    const reach = beast.fighter ? beast.reach : 0.8;
    const facing = !beast.fighter || Math.sign(b.x - beast.x) === beast.facing;
    // A brute's blow takes the hero off their feet.
    if (beast.dangerous && facing && Math.abs(beast.x - b.x) < reach && b.y < beast.y + 1.4 && b.y > beast.y - 0.5 && e.hurt(beast.x, beast.kind === "brute" || beast.kind === "bull")) {
      context.fx.buzz(beast.kind === "brute" ? 70 : 35);
      context.fx.punch(beast.kind === "brute" ? 0.09 : 0.05);
      beast.rebound(Math.sign(beast.x - b.x) || 1);
      combo.break();
      if (e.hearts === 0) down = true;
    }
  }
  return down;
}
