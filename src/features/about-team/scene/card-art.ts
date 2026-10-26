import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from "three";
import { BRAND_MARK_PATHS, BRAND_MARK_VIEWBOX } from "@/components/ui/brand-mark-paths";
import { initialsOf, type TeamMember } from "@/content/team";

/*
 * Print artwork for the ID cards and the strap, drawn once into canvas textures. Layout is
 * in a 640-wide design space, rendered at `resolution`× (chosen by the scene so one texel
 * lands on one screen pixel: sampled at full detail, never blurred by mipmapping);
 * the card texture has the card's CR80 aspect (1 : 1.586).
 */

const W = 640;
/** Texture pixels per design unit (1024 px wide cards). */
const H = Math.round(W * 1.586);
const ORANGE = "#fa2e00";
const ORANGE_LIGHT = "#ff6a3d";
const INK = "#0a0a0a";
const MUTED = "#3d3d3d";
const PAPER = "#ffffff";

interface Fonts {
  body: string;
  display: string;
}

/* next/font gives each family a generated name; read it from the CSS variables. */
async function loadFonts(): Promise<Fonts> {
  const styles = getComputedStyle(document.documentElement);
  const body = styles.getPropertyValue("--font-manrope").trim() || "sans-serif";
  const display = styles.getPropertyValue("--font-outrun").trim() || "Impact, sans-serif";
  await Promise.all([
    document.fonts.load(`600 40px ${body}`),
    document.fonts.load(`500 40px ${body}`),
    document.fonts.load(`40px ${display}`),
  ]).catch(() => undefined);
  return { body, display };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, color: string): void {
  const [minX, minY, viewWidth] = BRAND_MARK_VIEWBOX.split(" ").map(Number);
  const scale = width / viewWidth;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.translate(-minX, -minY);
  ctx.fillStyle = color;
  for (const d of BRAND_MARK_PATHS) ctx.fill(new Path2D(d));
  ctx.restore();
}

/* The punched slot the clip goes through, with a little depth. */
function drawSlot(ctx: CanvasRenderingContext2D): void {
  const w = 132;
  const h = 26;
  const x = (W - w) / 2;
  const y = 34;
  roundedRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = "#d9d9d9";
  ctx.fill();
  roundedRect(ctx, x + 2, y + 4, w - 4, h - 6, (h - 6) / 2);
  ctx.fillStyle = "#bdbdbd";
  ctx.fill();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Shrinks a font size until the text fits the width. */
function fit(ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, size: number, maxWidth: number): void {
  let current = size;
  ctx.font = font(current);
  while (ctx.measureText(text).width > maxWidth && current > 12) {
    current -= 2;
    ctx.font = font(current);
  }
}

function barcode(ctx: CanvasRenderingContext2D, seed: string, x: number, y: number, w: number, h: number): void {
  let state = [...seed].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) >>> 0;
  let cursor = x;
  ctx.fillStyle = INK;
  while (cursor < x + w) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const bar = 2 + (state % 4) * 1.6;
    const gap = 2 + ((state >> 8) % 3) * 1.8;
    if (cursor + bar > x + w) break;
    ctx.fillRect(cursor, y, bar, h);
    cursor += bar + gap;
  }
}

function canvas(width: number, height: number, resolution: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement("canvas");
  element.width = Math.round(width * resolution);
  element.height = Math.round(height * resolution);
  const ctx = element.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.scale(resolution, resolution);
  ctx.imageSmoothingQuality = "high";
  return [element, ctx];
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function texture(source: HTMLCanvasElement, anisotropy: number): CanvasTexture {
  const result = new CanvasTexture(source);
  result.colorSpace = SRGBColorSpace;
  result.anisotropy = anisotropy;
  return result;
}

function drawFront(member: TeamMember, index: number, fonts: Fonts, photo: HTMLImageElement | null, resolution: number): HTMLCanvasElement {
  const [element, ctx] = canvas(W, H, resolution);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  drawSlot(ctx);

  // Header: mark, studio name, pass label.
  drawMark(ctx, 48, 92, 76, ORANGE);
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.font = `600 32px ${fonts.body}`;
  ctx.fillText("DRIMINDESIGN", 140, 122);
  ctx.fillStyle = MUTED;
  ctx.font = `600 24px ${fonts.body}`;
  ctx.textAlign = "right";
  ctx.fillText("STUDIO PASS", W - 48, 122);
  ctx.textAlign = "left";

  // Portrait window (1.04 : 1), the photo printed edge to edge; initials if it failed to load.
  const px = 48;
  const py = 176;
  const pw = W - 96;
  const ph = Math.round(pw / 1.04);
  ctx.save();
  roundedRect(ctx, px, py, pw, ph, 22);
  ctx.clip();
  if (photo) {
    ctx.drawImage(photo, px, py, pw, ph);
  } else {
    const gradient = ctx.createLinearGradient(px, py, px + pw, py + ph);
    gradient.addColorStop(0, ORANGE_LIGHT);
    gradient.addColorStop(1, ORANGE);
    ctx.fillStyle = gradient;
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = PAPER;
    ctx.textAlign = "center";
    ctx.font = `${Math.round(ph * 0.5)}px ${fonts.display}`;
    ctx.fillText(initialsOf(member.name), px + pw / 2, py + ph / 2 + ph * 0.03);
  }
  ctx.restore();
  // Orange corner tab with the card number, like a printed pass.
  ctx.fillStyle = ORANGE;
  roundedRect(ctx, px, py + ph - 52, 116, 52, [0, 22, 0, 22]);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 26px ${fonts.body}`;
  ctx.fillText(String(index + 1).padStart(2, "0"), px + 58, py + ph - 26);

  // Name and role.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  fit(ctx, member.name, (size) => `600 ${size}px ${fonts.body}`, 52, W - 96);
  ctx.fillText(member.name, 48, py + ph + 72);
  ctx.fillStyle = MUTED;
  ctx.font = `500 38px ${fonts.body}`;
  ctx.fillText(member.role, 48, py + ph + 118);

  // Footer: meta, divider, barcode.
  const footY = H - 140;
  ctx.fillStyle = "#e5e5e5";
  ctx.fillRect(48, footY, W - 96, 2);
  ctx.fillStyle = MUTED;
  ctx.font = `600 26px ${fonts.body}`;
  ctx.fillText(`SINCE ${member.since}`, 48, footY + 44);
  ctx.textAlign = "right";
  ctx.fillText(`ID ${String(index + 1).padStart(4, "0")}`, W - 48, footY + 44);
  ctx.textAlign = "left";
  barcode(ctx, member.name, 48, footY + 64, W - 96, 40);
  return element;
}

function drawBack(member: TeamMember, fonts: Fonts, resolution: number): HTMLCanvasElement {
  const [element, ctx] = canvas(W, H, resolution);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  drawSlot(ctx);

  ctx.fillStyle = ORANGE;
  ctx.fillRect(48, 112, 56, 6);
  ctx.fillStyle = MUTED;
  ctx.font = `600 26px ${fonts.body}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("ABOUT", 48, 168);

  ctx.fillStyle = INK;
  ctx.font = `600 40px ${fonts.body}`;
  ctx.fillText(member.name, 48, 230);
  ctx.font = `500 36px ${fonts.body}`;
  const lines = wrap(ctx, member.bio, W - 96);
  lines.forEach((line, k) => ctx.fillText(line, 48, 310 + k * 54));

  ctx.fillStyle = "#e5e5e5";
  ctx.fillRect(48, H - 210, W - 96, 2);
  drawMark(ctx, 48, H - 168, 72, ORANGE);
  ctx.fillStyle = INK;
  ctx.font = `600 28px ${fonts.body}`;
  ctx.fillText("drimindesign", 136, H - 128);
  ctx.fillStyle = MUTED;
  ctx.font = `500 26px ${fonts.body}`;
  ctx.fillText("If found, say hello.", 136, H - 96);
  return element;
}

/*
 * Woven strap: brand orange with a darker woven border down each edge and the wordmark
 * once per repeat, large (half the strap's width) and letter-spaced so it reads at a glance.
 * U runs across, V along; one repeat is 8 strap widths.
 */
function drawStrap(fonts: Fonts, resolution: number): HTMLCanvasElement {
  const [element, ctx] = canvas(64, 512, resolution);
  ctx.fillStyle = ORANGE;
  ctx.fillRect(0, 0, 64, 512);
  ctx.fillStyle = "rgb(120 20 0 / 0.3)";
  ctx.fillRect(0, 0, 2.5, 512);
  ctx.fillRect(61.5, 0, 2.5, 512);
  ctx.fillStyle = "rgb(255 255 255 / 0.16)";
  ctx.fillRect(4.5, 0, 1, 512);
  ctx.fillRect(58.5, 0, 1, 512);
  ctx.save();
  ctx.translate(32, 256);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = PAPER;
  ctx.font = `44px ${fonts.display}`;
  ctx.letterSpacing = "9px";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // letterSpacing also trails the last letter: shift by half of it to stay centred.
  ctx.fillText("DRIMIN", 4.5, 2);
  ctx.restore();
  return element;
}

export interface CardArt {
  fronts: Texture[];
  backs: Texture[];
  strap: Texture;
  dispose: () => void;
}

/**
 * @param resolution texture pixels per design unit for the cards (the card is 640 units wide)
 * @param strapResolution the same for the strap (64 units wide)
 */
export async function createCardArt(team: readonly TeamMember[], anisotropy: number, resolution: number, strapResolution: number): Promise<CardArt> {
  const [fonts, photos] = await Promise.all([loadFonts(), Promise.all(team.map((member) => loadImage(member.photo)))]);
  const fronts = team.map((member, index) => texture(drawFront(member, index, fonts, photos[index], resolution), anisotropy));
  const backs = team.map((member) => texture(drawBack(member, fonts, resolution), anisotropy));
  const strap = texture(drawStrap(fonts, strapResolution), anisotropy);
  strap.wrapS = RepeatWrapping;
  strap.wrapT = RepeatWrapping;
  return {
    fronts,
    backs,
    strap,
    dispose: () => [...fronts, ...backs, strap].forEach((item) => item.dispose()),
  };
}
