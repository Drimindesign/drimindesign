import type * as Three from "three";
import type { Boar } from "../actors/boar";
import type { Camera } from "../engine/camera";
import { ART, PPM } from "../engine/config";
import { hash, random } from "../engine/noise";
import type { Terrain } from "../engine/terrain";

type ThreeModule = typeof Three;

/** Vertical field of view (deg). The camera distance is solved so the z = 0 plane maps 1 m to PPM art px. */
const FOV = 40;
/** The ground shelf: sampled every STEP m, from its front lip (z) back to its far edge, and how deep it goes. */
const STEP = 0.5;
const ROWS = [3, 0, -5, -14, -30, -60] as const;
const DEPTH = 70;
/** Cloud layers: depth range (m, into the screen), height range (m), size range (m), count, colours. */
const LAYERS = [
  { z: [-90, -260], y: [-70, -40], size: [10, 26], count: 140, flat: 0.35, colors: [0xe9d6b6, 0xd2ae84] },
  { z: [-260, -620], y: [-40, 70], size: [18, 46], count: 170, flat: 0.8, colors: [0xf1e3c8, 0xdcb98e, 0xc99a6a] },
  { z: [-900, -1600], y: [-80, 260], size: [60, 150], count: 130, flat: 0.7, colors: [0xd8b48a, 0xb8714a, 0xe6cfa9] },
  { z: [-2200, -3200], y: [-200, 700], size: [180, 420], count: 90, flat: 0.55, colors: [0xa45a38, 0xd09a68, 0x8a4a30] },
] as const;
/** The Great Red Spot, far behind the clouds (m) and its spin (rad/s). */
const SPOT = { x: 700, y: 320, z: -3700, radius: 760, spin: 0.05 } as const;

interface Creature {
  group: Three.Group;
  body: Three.Mesh;
  material: Three.MeshStandardMaterial;
}

/*
 * Stage 5's world, in 3D: inside Jupiter's atmosphere. A shelf of pale ammonia ice that the
 * road runs along (its top follows the same height field the car's physics uses), seas and
 * towers of cloud in four layers fading into orange haze, the Great Red Spot turning far
 * behind, lightning flickering inside the clouds, and the storm creatures as 3D models. The
 * perspective camera looks straight down -z from a distance solved so the z = 0 plane lines
 * up exactly with the 2D projector: the 2D car, cells and popups sit on the 3D ground. The
 * scene renders into its own WebGL canvas at the game's pixel resolution; three.js loads only
 * when this stage starts, and the 2D fallback is a plain gradient.
 */
export class JupiterScene {
  private three: {
    renderer: Three.WebGLRenderer;
    scene: Three.Scene;
    camera: Three.PerspectiveCamera;
    spot: Three.Mesh;
    lightning: Three.PointLight;
    creatures: Map<Boar, Creature>;
    make: (beast: Boar) => Creature;
  } | null = null;
  private width = 480;
  private height = 270;
  private disposed = false;
  private flash = 0;

  constructor(
    private readonly terrain: Terrain,
    private readonly length: number,
  ) {
    void this.load();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (!this.three) return;
    this.three.renderer.setSize(Math.round(width * ART), Math.round(height * ART), false);
    this.three.camera.aspect = width / height;
    this.three.camera.updateProjectionMatrix();
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera, time: number, dt: number, beasts: readonly Boar[]): void {
    const t = this.three;
    if (!t) {
      const g = ctx.createLinearGradient(0, 0, 0, this.height);
      g.addColorStop(0, "#2a1610");
      g.addColorStop(1, "#c98a52");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.width, this.height);
      return;
    }
    // The camera sits straight back from the view centre, so the z = 0 plane matches the 2D projector.
    const distance = this.height / PPM / (2 * Math.tan((FOV * Math.PI) / 360));
    t.camera.position.set(camera.x, camera.y, distance);

    // The storm turns inside its fixed oval: the texture spins, not the mesh.
    const map = (t.spot.material as Three.MeshBasicMaterial).map;
    if (map) map.rotation = -time * SPOT.spin;
    // Lightning deep in the clouds: rare, sudden, fading fast.
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.flash === 0 && Math.random() < dt * 0.35) {
      this.flash = 1;
      t.lightning.position.set(camera.x + (Math.random() - 0.5) * 900, camera.y + 40 + Math.random() * 200, -400 - Math.random() * 900);
    }
    t.lightning.intensity = this.flash * this.flash * 9;

    for (const beast of beasts) {
      let creature = t.creatures.get(beast);
      const pose = beast.pose();
      if (!pose.visible) {
        if (creature) creature.group.visible = false;
        continue;
      }
      if (!creature) {
        creature = t.make(beast);
        t.creatures.set(beast, creature);
      }
      const { group, body, material } = creature;
      group.visible = true;
      // Hovering a little off the ground, bobbing, turning to face where it's going.
      group.position.set(beast.x, beast.y + 0.75 + Math.sin(time * 4 + beast.home) * 0.08, 0);
      group.rotation.set(0, pose.facing > 0 ? -0.5 : Math.PI + 0.5, pose.angle);
      body.rotation.x = time * 1.6;
      material.emissiveIntensity = pose.flash ? 3 : 0.35;
      material.opacity = pose.alpha;
      material.transparent = pose.alpha < 1;
    }

    t.renderer.render(t.scene, t.camera);
    ctx.drawImage(t.renderer.domElement, 0, 0, this.width, this.height);
  }

  dispose(): void {
    this.disposed = true;
    if (!this.three) return;
    this.three.renderer.dispose();
    this.three.renderer.forceContextLoss();
    this.three = null;
  }

  // ---------------------------------------------------------------------------

  private async load(): Promise<void> {
    let THREE: ThreeModule;
    let renderer: Three.WebGLRenderer;
    try {
      THREE = await import("three");
      if (this.disposed) return;
      renderer = new THREE.WebGLRenderer({ canvas: document.createElement("canvas"), antialias: false, powerPreference: "high-performance" });
    } catch {
      return;
    }
    renderer.setPixelRatio(1);
    renderer.setSize(Math.round(this.width * ART), Math.round(this.height * ART), false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xc8885a, 260, 4300);
    const camera = new THREE.PerspectiveCamera(FOV, this.width / this.height, 1, 12000);

    // Light: a warm high sun through the haze, sky and cloud bounce, and the lightning.
    const sun = new THREE.DirectionalLight(0xffe2b8, 2.2);
    sun.position.set(-0.4, 1, 0.7);
    const lightning = new THREE.PointLight(0xcfd8ff, 0, 0, 0);
    scene.add(sun, new THREE.HemisphereLight(0xffd2a0, 0x40200f, 1), lightning);

    const spotMesh = spot(THREE);
    scene.add(sky(THREE), this.ground(THREE), spotMesh);
    for (const layer of LAYERS) scene.add(clouds(THREE, layer, this.length));

    const creatures = new Map<Boar, Creature>();
    const bodyGeometry = new THREE.IcosahedronGeometry(0.55, 1);
    const spikeGeometry = new THREE.ConeGeometry(0.11, 0.5, 6);
    const eyeGeometry = new THREE.SphereGeometry(0.09, 8, 6);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x7ff3ff });
    // A storm creature: a dark crystalline core ringed with spikes, two glowing eyes ahead.
    const make = (beast: Boar): Creature => {
      const material = new THREE.MeshStandardMaterial({ color: 0x3b2357, emissive: 0x6a2cff, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.5, flatShading: true });
      const group = new THREE.Group();
      const body = new THREE.Mesh(bodyGeometry, material);
      for (let i = 0; i < 7; i++) {
        const spike = new THREE.Mesh(spikeGeometry, material);
        const a = (i / 7) * Math.PI * 2;
        spike.position.set(0, Math.cos(a) * 0.55, Math.sin(a) * 0.55);
        spike.rotation.x = a;
        body.add(spike);
      }
      group.add(body);
      for (const side of [-0.16, 0.16]) {
        const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        eye.position.set(0.48, 0.12, side);
        group.add(eye);
      }
      group.scale.setScalar(beast.kind === "storm" ? 1.1 : 0.9);
      scene.add(group);
      return { group, body, material };
    };

    if (this.disposed) {
      renderer.dispose();
      return;
    }
    this.three = { renderer, scene, camera, spot: spotMesh, lightning, creatures, make };
  }

  /*
   * The ice shelf: its top follows the terrain's height at every column (so the car's wheels
   * meet it exactly at z = 0) and recedes into the haze; a front face drops away beneath it.
   */
  private ground(THREE: ThreeModule): Three.Mesh {
    const columns = Math.ceil((this.length + 120) / STEP);
    const perColumn = ROWS.length + 1;
    const positions = new Float32Array(columns * perColumn * 3);
    const colors = new Float32Array(columns * perColumn * 3);
    const top = new THREE.Color();
    const face = new THREE.Color();
    for (let c = 0; c < columns; c++) {
      const x = -40 + c * STEP;
      const h = this.terrain.height(x);
      const n = hash(Math.floor(x * 2), 61);
      top.setHSL(0.09, 0.32, 0.72 + n * 0.08);
      face.setHSL(0.06, 0.38, 0.3 + n * 0.06);
      ROWS.forEach((z, r) => {
        const i = (c * perColumn + r) * 3;
        // The far rows rise and fall a little: drifts and ridges on the shelf.
        const ridge = r > 2 ? (hash(Math.floor(x / 3), 62 + r) - 0.5) * r * 0.6 : 0;
        positions.set([x, h + ridge, z], i);
        colors.set([top.r, top.g, top.b], i);
      });
      const i = (c * perColumn + ROWS.length) * 3;
      positions.set([x, h - DEPTH, ROWS[0]], i);
      colors.set([face.r * 0.5, face.g * 0.5, face.b * 0.5], i);
    }
    const index: number[] = [];
    for (let c = 0; c < columns - 1; c++) {
      const a = c * perColumn;
      const b = (c + 1) * perColumn;
      for (let r = 0; r < ROWS.length - 1; r++) index.push(a + r, b + r, a + r + 1, b + r, b + r + 1, a + r + 1);
      // The front face, from the lip down.
      const lip = 0;
      const foot = ROWS.length;
      index.push(a + lip, a + foot, b + lip, b + lip, a + foot, b + foot);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05, flatShading: true, side: THREE.DoubleSide }));
  }
}

/* The sky dome: deep umber overhead, burning orange at the horizon, dark brown below. */
function sky(THREE: ThreeModule): Three.Mesh {
  const geometry = new THREE.SphereGeometry(9000, 32, 24);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const high = new THREE.Color(0x1d1018);
  const horizon = new THREE.Color(0xe39a5a);
  const low = new THREE.Color(0x3a1a0e);
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i) / 9000;
    if (y >= 0) c.copy(horizon).lerp(high, Math.pow(y, 0.6));
    else c.copy(horizon).lerp(low, Math.pow(-y, 0.5));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

/* One layer of cloud: lit puffs, flattened, scattered along the run, each tinted from the layer's palette. */
function clouds(THREE: ThreeModule, layer: (typeof LAYERS)[number], length: number): Three.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 }),
    layer.count,
  );
  const rand = random(layer.count + layer.z[0]);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  // Far layers need to span more of the run: perspective shrinks their motion.
  const spread = 1 + -layer.z[1] / 1200;
  for (let i = 0; i < layer.count; i++) {
    const size = layer.size[0] + rand() * (layer.size[1] - layer.size[0]);
    dummy.position.set(-200 * spread + rand() * (length + 400) * spread, layer.y[0] + rand() * (layer.y[1] - layer.y[0]), layer.z[0] + rand() * (layer.z[1] - layer.z[0]));
    dummy.scale.set(size * (1.2 + rand()), size * layer.flat, size);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.setHex(layer.colors[Math.floor(rand() * layer.colors.length)]));
  }
  mesh.frustumCulled = false;
  return mesh;
}

/* The Great Red Spot: a spiral storm painted once, turning slowly far behind the clouds. */
function spot(THREE: ThreeModule): Three.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, "rgba(232, 150, 110, 1)");
    g.addColorStop(0.5, "rgba(180, 70, 46, 0.95)");
    g.addColorStop(0.85, "rgba(150, 60, 40, 0.5)");
    g.addColorStop(1, "rgba(150, 60, 40, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    // Spiral arms of paler cloud wound into the centre.
    ctx.strokeStyle = "rgba(245, 205, 170, 0.35)";
    ctx.lineWidth = 3;
    for (let arm = 0; arm < 4; arm++) {
      ctx.beginPath();
      for (let k = 0; k < 120; k++) {
        const r = 6 + k;
        const a = arm * (Math.PI / 2) + k * 0.06;
        ctx.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r * 0.9);
      }
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.center.set(0.5, 0.5);
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(SPOT.radius, 64),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.position.set(SPOT.x, SPOT.y, SPOT.z);
  mesh.scale.y = 0.55;
  return mesh;
}
