import { BufferAttribute, CylinderGeometry, ExtrudeGeometry, Shape, ShapeGeometry, TorusGeometry, type BufferGeometry } from "three";
import { CARD } from "./lanyard-physics";

/*
 * Card meshes in card units, centred on the card. The body is a bevelled extrusion (the
 * white PVC edge); the print sits on separate faces just above each side so front and back
 * take different textures.
 */

/** ISO/IEC 7810 corner radius (3.18 mm on a 54 mm card). */
const CORNER = 0.059;
const BEVEL = 0.006;

function cardShape(): Shape {
  const w = CARD.width / 2;
  const h = CARD.height / 2;
  const r = CORNER;
  const shape = new Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  return shape;
}

export interface CardGeometry {
  body: BufferGeometry;
  face: BufferGeometry;
  /** Offset of each printed face from the card's centre plane. */
  faceOffset: number;
  ring: BufferGeometry;
  swivel: BufferGeometry;
  dispose: () => void;
}

export function createCardGeometry(): CardGeometry {
  const shape = cardShape();
  const depth = CARD.depth - BEVEL * 2;
  const body = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 2,
    curveSegments: 6,
  });
  body.translate(0, 0, -depth / 2);

  // Printed face: UVs from the shape's own coordinates, normalised to the card.
  const face = new ShapeGeometry(shape, 6);
  const position = face.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = position.getX(i) / CARD.width + 0.5;
    uv[i * 2 + 1] = position.getY(i) / CARD.height + 0.5;
  }
  face.setAttribute("uv", new BufferAttribute(uv, 2));

  // Split ring through the slot: a small steel loop the strap's clip hangs from.
  const ring = new TorusGeometry(0.075, 0.011, 10, 28);
  // Swivel between the ring and the strap's end.
  const swivel = new CylinderGeometry(0.02, 0.027, 0.075, 14);

  return {
    body,
    face,
    faceOffset: CARD.depth / 2 + 0.0015,
    ring,
    swivel,
    dispose: () => [body, face, ring, swivel].forEach((geometry) => geometry.dispose()),
  };
}
