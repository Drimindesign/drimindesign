import { BackSide, FrontSide, MeshBasicMaterial, ShaderChunk } from "three";

/** A half mip level keeps small print crisp without removing the mipmaps that prevent shimmer. */
const DETAIL_BIAS = -0.5;

/** Display artwork independently of the room's lighting, fog and exposure. */
export function createPanelMaterial(inside: boolean): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    color: "#d42600",
    side: inside ? BackSide : FrontSide,
    toneMapped: false,
    fog: false,
  });

  material.onBeforeCompile = (shader): void => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      ShaderChunk.map_fragment.replace(
        "texture2D( map, vMapUv )",
        `texture2D( map, vMapUv, ${DETAIL_BIAS.toFixed(1)} )`,
      ),
    );
  };
  material.customProgramCacheKey = (): string => `ring-panel-detail-${DETAIL_BIAS}`;
  return material;
}
