import type * as Three from "three";

/** Stage clones share GPU resources, so release each resource only once when the whole stage ends. */
export function disposeScene(scene: Three.Scene): void {
  const geometries = new Set<Three.BufferGeometry>();
  const materials = new Set<Three.Material>();
  const textures = new Set<Three.Texture>();
  const skeletons = new Set<Three.Skeleton>();
  scene.traverse((node) => {
    const mesh = node as Three.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        const texture = value as Three.Texture | null;
        if (texture?.isTexture) textures.add(texture);
      }
    }
    const skinned = node as Three.SkinnedMesh;
    if (skinned.isSkinnedMesh) skeletons.add(skinned.skeleton);
  });
  for (const skeleton of skeletons) skeleton.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
  scene.clear();
}
