import { RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture, type WebGLRenderer } from "three";
import artwork from "@/content/team-art.generated.json";
import { whenIdle } from "@/lib/motion/after-intro";
import type { CardArt } from "./card-art";

/** Download in parallel, then upload one texture per idle task instead of one large first frame. */
export async function loadCardArt(renderer: WebGLRenderer, low: boolean, cancelled: () => boolean): Promise<CardArt | null> {
  const variant = artwork.variants[low ? "320" : "640"];
  const loader = new TextureLoader();
  const textures: Texture[] = [];
  try {
    // allSettled keeps ownership of successful downloads if any one texture fails.
    const results = await Promise.allSettled([...variant.fronts, ...variant.backs, variant.strap].map((url) => loader.loadAsync(url)));
    for (const result of results) if (result.status === "fulfilled") textures.push(result.value);
    if (results.some((result) => result.status === "rejected")) throw new Error("Team artwork could not load");
    const count = variant.fronts.length;
    const strap = textures[textures.length - 1];
    strap.wrapS = RepeatWrapping;
    strap.wrapT = RepeatWrapping;
    for (const texture of textures) {
      await whenIdle(200);
      if (cancelled()) { textures.forEach((item) => item.dispose()); return null; }
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      renderer.initTexture(texture);
    }
    return { fronts: textures.slice(0, count), backs: textures.slice(count, count * 2), strap, dispose: () => textures.forEach((item) => item.dispose()) };
  } catch (error) {
    textures.forEach((texture) => texture.dispose());
    throw error;
  }
}
