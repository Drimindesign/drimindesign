/*
 * Whether this device runs the 3D arena: WebGL2 and enough memory. Older or low-memory devices
 * keep the 2D fight. Checked once (it creates and drops a WebGL context).
 */
let capability: boolean | null = null;

export function canRunArena(): boolean {
  if (capability !== null) return capability;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    capability = gl !== null && (memory === undefined || memory >= 4);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    capability = false;
  }
  return capability;
}
