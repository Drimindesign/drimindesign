/*
 * What the hero fights with: the weapons she can switch between, and the skills rescues unlock.
 * Gameplay numbers only; the 3D layer reads `look` to build each one.
 */

export type WeaponId = "blade" | "axe" | "dagger";

export interface Weapon {
  id: WeaponId;
  name: string;
  /** Swing speed (1 = the base swing), the blade's reach in front of her (m), and how hard it hits (× the combo's knockback). */
  speed: number;
  reach: number;
  power: number;
  /** Every blow breaks a raised guard (a heavy weapon), not only the kick. */
  breaksGuard: boolean;
  /** The swing's sound: pitched up for a light blade, down for a heavy one. */
  pitch: number;
  /** The model in her hand: a thin longsword built in code, or a KayKit prop (CC0) and its length (m). */
  look: { kind: "longsword" } | { kind: "prop"; file: string; length: number };
}

/**
 * A slim longsword (fast, long reach), a one-handed axe (slow, heavy, breaks guards) and a dagger
 * (very quick, short): the longsword and dagger from the start, the axe from the Barbarian once freed.
 */
export const WEAPONS: Record<WeaponId, Weapon> = {
  blade: { id: "blade", name: "Longsword", speed: 1.15, reach: 1.75, power: 1, breaksGuard: false, pitch: 1.05, look: { kind: "longsword" } },
  axe: { id: "axe", name: "Axe", speed: 0.8, reach: 1.45, power: 1.6, breaksGuard: true, pitch: 0.8, look: { kind: "prop", file: "axe_1handed.gltf", length: 0.75 } },
  dagger: { id: "dagger", name: "Dagger", speed: 1.65, reach: 1.15, power: 0.6, breaksGuard: false, pitch: 1.3, look: { kind: "prop", file: "dagger.gltf", length: 0.42 } },
};

/**
 * The Fire Sword: the blade bursts into flame for `burn` seconds (heavier, burning blows that
 * light up the dark), then it has to recharge for `recharge` seconds before it can be lit again.
 */
export const FIRE = { burn: 10, recharge: 60, power: 2 } as const;

/**
 * The Master Stroke: a spinning blow whose shockwave throws everyone around her off their feet.
 * The meter fills with blows landed (`perHit`) and taken (`perHurt`); the stroke reaches `reach`
 * (m), costs each enemy `damage` blows, and lands `at` (s) into the spin of `time` (s), during
 * which nothing can touch her.
 */
export const MASTER = { perHit: 0.09, perHurt: 0.16, reach: 6.5, damage: 2, at: 0.38, time: 1 } as const;
