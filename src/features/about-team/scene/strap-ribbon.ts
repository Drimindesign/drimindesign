import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Vector3 } from "three";

/*
 * A flat fabric strap drawn along a strand of the simulation: a ribbon swept along a smooth
 * curve through the strand's points, rebuilt in place each frame. Its flat side faces the
 * viewer at the rail and turns with the card's twist towards the clip.
 */

/** Samples along the strap; enough for a smooth curve at any on-screen size. */
const SAMPLES = 40;
/** Strap width in card units (a 16 mm strap on a 54 mm card). */
export const STRAP_WIDTH = 0.3;
/** One repeat of the strap print spans this many strap widths (the texture is 1 : 8). */
const PRINT_REPEAT = 8;

const FACING = new Vector3(0, 0, 1);

export class StrapRibbon {
  readonly geometry = new BufferGeometry();
  private readonly curve: CatmullRomCurve3;
  private readonly position: BufferAttribute;
  private readonly normal: BufferAttribute;
  private readonly uv: BufferAttribute;
  private readonly point = new Vector3();
  private readonly tangent = new Vector3();
  private readonly side = new Vector3();
  private readonly face = new Vector3();
  private readonly previous = new Vector3();

  constructor(points: number) {
    this.curve = new CatmullRomCurve3(
      Array.from({ length: points }, () => new Vector3()),
      false,
      "centripetal",
    );
    this.position = new BufferAttribute(new Float32Array(SAMPLES * 2 * 3), 3);
    this.normal = new BufferAttribute(new Float32Array(SAMPLES * 2 * 3), 3);
    this.uv = new BufferAttribute(new Float32Array(SAMPLES * 2 * 2), 2);
    const index: number[] = [];
    for (let i = 0; i + 1 < SAMPLES; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setIndex(index);
    this.geometry.setAttribute("position", this.position);
    this.geometry.setAttribute("normal", this.normal);
    this.geometry.setAttribute("uv", this.uv);
  }

  /**
   * @param pos   simulation positions (xyz per point)
   * @param chain point indices from the rail to the clip
   * @param twist the card's twist (radians), reached at the clip
   */
  update(pos: Float32Array, chain: readonly number[], twist: number): void {
    chain.forEach((p, k) => this.curve.points[k].set(pos[p * 3], pos[p * 3 + 1], pos[p * 3 + 2]));
    this.curve.updateArcLengths();
    let travelled = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / (SAMPLES - 1);
      this.curve.getPointAt(t, this.point);
      this.curve.getTangentAt(t, this.tangent);
      if (i > 0) travelled += this.point.distanceTo(this.previous);
      this.previous.copy(this.point);
      // Across the strap: perpendicular to its run, in the viewer's plane, then twisted.
      this.side.crossVectors(this.tangent, FACING).normalize();
      this.side.applyAxisAngle(this.tangent, twist * t * t);
      this.face.crossVectors(this.side, this.tangent).normalize();
      const half = STRAP_WIDTH / 2;
      const v = travelled / (STRAP_WIDTH * PRINT_REPEAT);
      for (let edge = 0; edge < 2; edge++) {
        const sign = edge === 0 ? -1 : 1;
        const vertex = i * 2 + edge;
        this.position.setXYZ(
          vertex,
          this.point.x + this.side.x * half * sign,
          this.point.y + this.side.y * half * sign,
          this.point.z + this.side.z * half * sign,
        );
        this.normal.setXYZ(vertex, this.face.x, this.face.y, this.face.z);
        this.uv.setXY(vertex, edge, v);
      }
    }
    this.position.needsUpdate = true;
    this.normal.needsUpdate = true;
    this.uv.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
