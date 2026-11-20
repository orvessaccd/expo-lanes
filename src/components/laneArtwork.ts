import { LANE_HEIGHT, LANE_WIDTH, SPAWN_LINE_Y } from "@/engine/simulation";
import type { LanePalette } from "@/theme/theme";

function makeSurface(width: number, height: number) {
  const surface = document.createElement("canvas");
  surface.width = width;
  surface.height = height;
  return surface;
}

function drawBackdrop(width: number, height: number, palette: LanePalette, dark: boolean) {
  const surface = makeSurface(width, height);
  const ctx = surface.getContext("2d")!;
  ctx.scale(width / LANE_WIDTH, height / LANE_HEIGHT);
  ctx.fillStyle = dark ? "#0b141f" : "#f2f6fa";
  ctx.fillRect(0, 0, LANE_WIDTH, LANE_HEIGHT);

  const wash = ctx.createRadialGradient(LANE_WIDTH * 0.35, 0, 0, LANE_WIDTH / 2, 0, LANE_HEIGHT * 0.84);
  wash.addColorStop(0, palette.canvasTrail);
  wash.addColorStop(1, "transparent");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, LANE_WIDTH, LANE_HEIGHT);

  ctx.fillStyle = dark ? "#aec6d432" : "#314a641e";
  for (let y = SPAWN_LINE_Y + 24; y < LANE_HEIGHT; y += 24) {
    for (let x = 30; x < LANE_WIDTH - 12; x += 24) {
      ctx.fillRect(x, y, 1.25, 1.25);
    }
  }

  // A calibrated rail gives a moving ball a fixed reference without resembling a gate.
  ctx.fillStyle = palette.canvasTrail;
  ctx.fillRect(2, 0, 1.5, LANE_HEIGHT);
  ctx.fillRect(LANE_WIDTH - 3.5, 0, 1.5, LANE_HEIGHT);
  for (let y = SPAWN_LINE_Y, tick = 0; y < LANE_HEIGHT; y += 16, tick++) {
    const length = tick % 4 === 0 ? 8 : 4;
    ctx.fillRect(3, y, length, 1.5);
    ctx.fillRect(LANE_WIDTH - 3 - length, y, length, 1.5);
  }

  // Shared quarter marks let players judge relative depth across adjacent tracks.
  ctx.beginPath();
  ctx.strokeStyle = dark ? "#c4d7e519" : "#314a641b";
  for (const fraction of [0.25, 0.5, 0.75]) {
    const y = LANE_HEIGHT * fraction;
    ctx.moveTo(9, y);
    ctx.lineTo(LANE_WIDTH - 9, y);
  }
  ctx.stroke();
  return surface;
}

// The disc has a radius of 32 sprite pixels. The transparent margin holds its halo.
export const ORB_SPRITE_RADIUS = 32;
function drawOrb(palette: LanePalette, dark: boolean) {
  const surface = makeSurface(96, 96);
  const ctx = surface.getContext("2d")!;
  const halo = ctx.createRadialGradient(48, 48, 30, 48, 48, 48);
  halo.addColorStop(0, palette.canvasTrail);
  halo.addColorStop(1, "transparent");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 96, 96);

  const body = ctx.createRadialGradient(36, 33, 2, 45, 46, 37);
  body.addColorStop(0, "#ffffff");
  body.addColorStop(0.23, palette.light);
  body.addColorStop(0.58, palette.canvasFill);
  body.addColorStop(0.88, palette.main);
  body.addColorStop(1, dark ? "#284255" : "#18374a");
  ctx.beginPath();
  ctx.arc(48, 48, ORB_SPRITE_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = dark ? "#e8f8ffd9" : "#17475aaf";
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(38, 32, 9, 4, -0.55, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffffbb";
  ctx.fill();
  return surface;
}

function drawTrail(palette: LanePalette) {
  const surface = makeSurface(96, 32);
  const ctx = surface.getContext("2d")!;
  const fade = ctx.createLinearGradient(0, 0, 96, 0);
  fade.addColorStop(0, "transparent");
  fade.addColorStop(0.38, palette.canvasTrail);
  fade.addColorStop(0.88, palette.canvasFill);
  ctx.fillStyle = fade;
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.quadraticCurveTo(56, 12, 96, 0);
  ctx.lineTo(96, 32);
  ctx.quadraticCurveTo(56, 20, 0, 16);
  ctx.fill();
  return surface;
}

interface LaneArtwork {
  background: HTMLCanvasElement;
  orb: HTMLCanvasElement;
  trail: HTMLCanvasElement;
  palette: LanePalette;
  dark: boolean;
}

const cache = new WeakMap<HTMLCanvasElement, LaneArtwork>();

export function getLaneArtwork(canvas: HTMLCanvasElement, palette: LanePalette, dark: boolean) {
  const entry = cache.get(canvas);
  if (
    entry?.palette === palette && entry.dark === dark &&
    entry.background.width === canvas.width && entry.background.height === canvas.height
  ) {
    return entry;
  }
  const art = {
    background: drawBackdrop(canvas.width, canvas.height, palette, dark),
    orb: drawOrb(palette, dark),
    trail: drawTrail(palette),
    palette,
    dark,
  };
  cache.set(canvas, art);
  return art;
}
