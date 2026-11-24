import { displacementMapDataUrl, fillDisplacementMap, type DisplacementMapSpec } from "./displacement-map";

/** This function is self-contained so the same pixel math can run in a worker. */
function workerSource(): string {
  return `const fill = (${fillDisplacementMap.toString()});
    self.onmessage = async ({data: {id, spec}}) => {
      try {
        const canvas = new OffscreenCanvas(spec.width, spec.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('2D canvas unavailable');
        const pixels = context.createImageData(spec.width, spec.height);
        fill(pixels.data, spec);
        context.putImageData(pixels, 0, 0);
        const blob = await canvas.convertToBlob({type:'image/png'});
        const url = new FileReaderSync().readAsDataURL(blob);
        self.postMessage({id, url});
      } catch { self.postMessage({id, failed:true}); }
    };`;
}

interface Job { resolve: (url: string) => void; reject: () => void }
let worker: Worker | undefined;
let sequence = 0;
const jobs = new Map<number, Job>();

function renderer(): Worker {
  if (worker) return worker;
  const url = URL.createObjectURL(new Blob([workerSource()], { type: "text/javascript" }));
  worker = new Worker(url);
  worker.addEventListener("message", (event: MessageEvent<{ id: number; url: string; failed?: boolean }>) => {
    URL.revokeObjectURL(url);
    const job = jobs.get(event.data.id);
    jobs.delete(event.data.id);
    if (event.data.failed) job?.reject();
    else job?.resolve(event.data.url);
  });
  worker.addEventListener("error", () => {
    URL.revokeObjectURL(url);
    worker?.terminate();
    worker = undefined;
    for (const job of jobs.values()) job.reject();
    jobs.clear();
  });
  return worker;
}

/** Keep refraction pixel loops and PNG encoding off the scrolling thread. */
export async function renderDisplacementMap(spec: DisplacementMapSpec): Promise<string> {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return displacementMapDataUrl(spec);
  try {
    const active = renderer();
    return await new Promise<string>((resolve, reject) => {
      const id = ++sequence;
      jobs.set(id, { resolve, reject: () => reject(new Error("Glass worker unavailable")) });
      active.postMessage({ id, spec });
    });
  } catch {
    return displacementMapDataUrl(spec);
  }
}
