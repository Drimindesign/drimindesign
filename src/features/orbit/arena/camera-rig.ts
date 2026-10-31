import type * as Three from "three";

/*
 * The arena camera: an operator standing on the deck where the set was shot from. It keeps the
 * fighters framed, breathes like a handheld camera, drifts a step to either side (true parallax
 * on the set), and pushes in or pulls out on demand with a critically damped spring, so every
 * move eases in and settles without overshoot. The player can look around and zoom.
 */

/** Framing: field of view (degrees), how far the operator may step from the eye point (m), handheld sway (degrees). */
export const RIG = { fov: 34, closest: 14, widest: 62, step: 0.35, handheld: 0.18, look: [26, 9], settle: 5 } as const;

export interface CameraRig {
  camera: Three.PerspectiveCamera;
  /** The point to frame (world), e.g. between the fighters at chest height. */
  target: Three.Vector3;
  /** Player look-around offsets (degrees) and zoom (field of view). */
  look(yaw: number, pitch: number): void;
  zoom(fov: number): void;
  /** A sudden push-in (a big hit): extra zoom (degrees) that springs back. */
  punch(degrees: number): void;
  /** A film cut: the operator is instantly at another eye point, framing the same target. */
  cut(eye: Three.Vector3, fov: number, step: number): void;
  resize(width: number, height: number): void;
  update(dt: number, time: number): void;
}

export function makeCameraRig(THREE: typeof Three, eye: Three.Vector3, target: Three.Vector3): CameraRig {
  const camera = new THREE.PerspectiveCamera(RIG.fov, 16 / 9, 0.1, 1200);
  eye = eye.clone();
  camera.position.copy(eye);
  let step: number = RIG.step;
  let yaw = 0;
  let pitch = 0;
  let fov: number = RIG.fov;
  let fovNow: number = RIG.fov;
  let fovVelocity = 0;
  let kick = 0;
  let kickVelocity = 0;
  const aim = target.clone();
  const offset = new THREE.Vector3();

  // Critically damped spring toward a goal: no overshoot, settles in about 4 / rate seconds.
  const spring = (value: number, velocity: number, goal: number, rate: number, dt: number): [number, number] => {
    const a = rate * rate * (goal - value) - 2 * rate * velocity;
    velocity += a * dt;
    return [value + velocity * dt, velocity];
  };

  return {
    camera,
    target,
    look(y, p) {
      yaw = THREE.MathUtils.clamp(y, -RIG.look[0], RIG.look[0]);
      pitch = THREE.MathUtils.clamp(p, -RIG.look[1], RIG.look[1]);
    },
    zoom(f) {
      fov = THREE.MathUtils.clamp(f, RIG.closest, RIG.widest);
    },
    punch(degrees) {
      kickVelocity -= degrees * 9;
    },
    cut(next, f, s) {
      eye.copy(next);
      step = s;
      fov = fovNow = THREE.MathUtils.clamp(f, RIG.closest, RIG.widest);
      fovVelocity = 0;
      yaw = pitch = 0;
      aim.copy(target);
    },
    resize(width, height) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    update(dt, time) {
      aim.lerp(target, 1 - Math.exp(-dt * RIG.settle));
      [fovNow, fovVelocity] = spring(fovNow, fovVelocity, fov, 3.2, dt);
      [kick, kickVelocity] = spring(kick, kickVelocity, 0, 9, dt);
      camera.fov = fovNow + kick;
      camera.updateProjectionMatrix();
      // The operator shifts their weight: a slow step side to side and a little forward and back.
      offset.set(Math.sin(time * 0.071) * step, Math.sin(time * 0.11) * 0.05, Math.sin(time * 0.053 + 1) * step * 0.5);
      camera.position.copy(eye).add(offset);
      camera.lookAt(aim);
      // Handheld: small, slow, layered rotations (never a jitter).
      const h = THREE.MathUtils.degToRad(RIG.handheld);
      camera.rotateY(THREE.MathUtils.degToRad(yaw) + Math.sin(time * 0.37) * h + Math.sin(time * 0.91 + 2) * h * 0.4);
      camera.rotateX(THREE.MathUtils.degToRad(pitch) + Math.sin(time * 0.29 + 1) * h * 0.7 + Math.sin(time * 1.13) * h * 0.3);
      camera.rotateZ(Math.sin(time * 0.19 + 3) * h * 0.35);
    },
  };
}
