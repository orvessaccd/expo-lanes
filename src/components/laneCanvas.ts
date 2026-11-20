import {
  type NumberFormatStyle,
  bfCmp,
  bfDiv,
  bfIsZero,
  bfToNumber,
  formatBigFloat,
  bf,
} from "@/engine/bigNumber";
import {
  LANE_HEIGHT,
  LANE_WIDTH,
  SPAWN_LINE_Y,
  WALL_LAYER_HEIGHT,
  formatGateSlotLabel,
  getGateRowBoxes,
} from "@/engine/simulation";
import type { BallEntity, LaneRuntimeState, SimulationState } from "@/engine/types";
import type { LanePalette } from "@/theme/theme";
import { getLaneArtwork, ORB_SPRITE_RADIUS } from "./laneArtwork";

const STACK_BADGE_MIN = bf(1.4);

interface LabelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlaps(a: LabelBounds, b: LabelBounds) {
  return a.x < b.x + b.width + 2 && a.x + a.width + 2 > b.x &&
    a.y < b.y + b.height + 2 && a.y + a.height + 2 > b.y;
}

function labelCandidates(balls: BallEntity[], limit: number): BallEntity[] {
  if (balls.length <= limit) return balls;

  // Give the largest stack first choice of a label position in a crowded lane.
  const largest = balls.reduce((best, ball) => {
    const stacks = bfCmp(ball.stackCount, best.stackCount);
    if (stacks === 0) return bfCmp(ball.value, best.value) > 0 ? ball : best;
    return stacks > 0 ? ball : best;
  });
  const stride = Math.ceil(balls.length / (limit - 1));
  return [largest, ...balls.filter((ball, i) => ball !== largest && i % stride === 0)];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function renderLaneCanvas(
  canvas: HTMLCanvasElement,
  displayWidth: number,
  lane: LaneRuntimeState,
  simState: SimulationState,
  palette: LanePalette,
  isDark: boolean,
  formatStyle: NumberFormatStyle
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const art = getLaneArtwork(canvas, palette, isDark);
  const compact = displayWidth < 225;
  // Sizes below are in physics coordinates. Protect label sizes on narrow tracks.
  const unit = Math.min(2.5, Math.max(1, LANE_WIDTH / displayWidth));
  const ink = isDark ? "#eff7fd" : "#172c3a";
  const muted = isDark ? "#abbdce" : "#476077";
  ctx.drawImage(art.background, 0, 0);
  ctx.save();
  ctx.scale(canvas.width / LANE_WIDTH, canvas.height / LANE_HEIGHT);

  // The comparison rows already describe spawning. Only the elimination boundary needs a label.
  const isPushMode = simState.config.rules.winRule === "push_elimination";
  const occupied: LabelBounds[] = [];
  const labelFits = (bounds: LabelBounds) =>
    bounds.y >= 2 && bounds.y + bounds.height <= LANE_HEIGHT - 2 &&
    !occupied.some(box => overlaps(box, bounds));
  if (isPushMode) {
    ctx.save();
    ctx.strokeStyle = isDark ? "#fb7185" : "#be123c";
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(4, SPAWN_LINE_Y);
    ctx.lineTo(LANE_WIDTH - 4, SPAWN_LINE_Y);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillRect(2, SPAWN_LINE_Y - 2, 9, 4);
    ctx.fillRect(LANE_WIDTH - 11, SPAWN_LINE_Y - 2, 9, 4);
    ctx.font = `650 ${11 * unit}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("触顶淘汰红线", LANE_WIDTH / 2, SPAWN_LINE_Y / 2);
    const warningWidth = ctx.measureText("触顶淘汰红线").width;
    occupied.push({ x: (LANE_WIDTH - warningWidth) / 2, y: 0, width: warningWidth, height: SPAWN_LINE_Y });
    ctx.restore();
  }

  for (const pin of lane.pins) {
    ctx.beginPath();
    ctx.arc(pin.x, pin.y, pin.radius, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? "#334155" : "#cbd5e1";
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = isDark ? "#64748b" : "#879bab";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pin.x - 1.5, pin.y - 1.5, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? "#ffffff69" : "#ffffffcc";
    ctx.fill();
  }

  // Math gates
  for (const gateRow of lane.config.gates) {
    const boxes = getGateRowBoxes(gateRow, simState.elapsedSec);
    for (const box of boxes) {
      const isNegative =
        box.slot.op === "sub" || box.slot.op === "div" || box.slot.op === "sqrt";
      const accent = isNegative
        ? (isDark ? "#fc92a5" : "#a81b47")
        : (isDark ? "#73ebc2" : "#046850");
      const fill = isNegative
        ? (isDark ? "#412432" : "#ffe6ec")
        : (isDark ? "#163b38" : "#d4f4e9");

      drawRoundedRect(ctx, box.x, box.y, box.width, box.height, 5);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = accent;
      for (const x of [box.x, box.x + box.width - 2.5]) {
        ctx.fillRect(x, box.y + 5, 2.5, box.height - 10);
      }
      ctx.font = `700 ${Math.min(18, 13 * unit)}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = formatGateSlotLabel(box.slot, formatStyle);
      const centerX = box.x + box.width / 2;
      ctx.fillText(label, centerX, box.y + box.height / 2 + 0.5, box.width - 10);
      occupied.push(box);
    }
  }

  // Wall stack
  if (lane.frontWall) {
    const fw = lane.frontWall;
    const topY = lane.wallTopY;
    const wallX = 7;
    const wallW = LANE_WIDTH - wallX * 2;
    const wallCfg = lane.config.wall;
    const mods: string[] = [];
    if (wallCfg.capMode === "fixed") mods.push(`限 ${formatBigFloat(wallCfg.capValue, formatStyle, 1)}`);
    if (wallCfg.capMode === "max_pct") mods.push(`限 ${Math.round(wallCfg.capValue * 100)}%`);
    if (wallCfg.compoundPerSec > 1.0001) mods.push(`×${wallCfg.compoundPerSec}/s`);
    const stackedText = compact && mods.length > 0;
    const wallH = stackedText ? 56 : WALL_LAYER_HEIGHT + 8;
    const valueY = topY + (stackedText ? 20 : wallH / 2 + 1);
    const hpRatio = bfIsZero(fw.maxHp)
      ? 1
      : Math.min(1, Math.max(0, bfToNumber(bfDiv(fw.currentHp, fw.maxHp))));
    occupied.push({ x: wallX, y: topY, width: wallW, height: wallH });

    drawRoundedRect(ctx, wallX, topY, wallW, wallH, 5);
    ctx.fillStyle = isDark ? "#192937" : "#dce7ef";
    ctx.fill();
    ctx.save();
    ctx.clip();
    const fillWidth = bfIsZero(fw.currentHp) ? 0 : Math.max(unit, wallW * hpRatio);
    ctx.fillStyle = palette.canvasTrail;
    ctx.fillRect(wallX, topY, fillWidth, wallH);
    ctx.fillStyle = palette.main;
    ctx.fillRect(wallX, topY, fillWidth, 3.5);
    ctx.restore();

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = muted;
    ctx.font = `650 ${11 * unit}px monospace`;
    ctx.fillText(`#${fw.layerIndex + 1}`, wallX + 8, valueY, 54);

    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.font = `750 ${14 * unit}px monospace`;
    ctx.fillText(formatBigFloat(fw.currentHp, formatStyle, 2), LANE_WIDTH / 2, valueY, 134);
    if (mods.length) {
      ctx.font = `650 ${10 * unit}px monospace`;
      ctx.fillStyle = isDark ? "#fed385" : "#854408";
      ctx.textAlign = stackedText ? "center" : "right";
      ctx.fillText(mods.join(" · "), stackedText ? LANE_WIDTH / 2 : wallX + wallW - 7,
        stackedText ? topY + 42 : valueY, stackedText ? wallW - 14 : 73);
    }

    // Upcoming wall layers preview beneath frontWall
    for (let idx = 0; idx < Math.min(2, lane.upcomingWalls.length); idx++) {
      const uw = lane.upcomingWalls[idx];
      const uy = topY + wallH + 4 + idx * (WALL_LAYER_HEIGHT - 2);
      if (uy > LANE_HEIGHT - 6) break;
      const alphaFactor = Math.max(0.5, 0.88 - idx * 0.15);
      ctx.save();
      ctx.globalAlpha = alphaFactor;
      drawRoundedRect(ctx, wallX + 3, uy, wallW - 6, WALL_LAYER_HEIGHT - 5, 5);
      ctx.fillStyle = isDark ? "#141B26" : "#E8EEF5";
      ctx.fill();
      ctx.strokeStyle = isDark
        ? "rgba(148, 163, 184, 0.14)"
        : "rgba(15, 23, 42, 0.1)";
      ctx.stroke();

      ctx.fillStyle = isDark ? "#94A3B8" : "#475569";
      ctx.font = `600 ${Math.min(18, 10.5 * unit)}px monospace`;
      ctx.textAlign = "left";
      ctx.fillText(`#${uw.layerIndex + 1}`, wallX + 10, uy + (WALL_LAYER_HEIGHT - 5) / 2);

      ctx.textAlign = "center";
      ctx.fillText(
        formatBigFloat(uw.currentHp, formatStyle, 2),
        LANE_WIDTH / 2,
        uy + (WALL_LAYER_HEIGHT - 5) / 2
      );
      ctx.restore();
    }
  } else {
    // All finite walls cleared!
    drawRoundedRect(ctx, 16, LANE_HEIGHT - 66, LANE_WIDTH - 32, 42, 8);
    occupied.push({ x: 16, y: LANE_HEIGHT - 66, width: LANE_WIDTH - 32, height: 42 });
    ctx.fillStyle = palette.softBg;
    ctx.fill();
    ctx.strokeStyle = palette.main;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = palette.main;
    ctx.font = `700 ${Math.min(21, 13 * unit)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✓ 数字墙已全部击穿", LANE_WIDTH / 2, LANE_HEIGHT - 45, LANE_WIDTH - 40);
  }

  // Shatter particles
  for (const p of simState.particles) {
    if (p.laneIndex !== lane.laneIndex) continue;
    const life = Math.max(0, 1 - p.age / p.ttl);
    ctx.save();
    ctx.globalAlpha = life * 0.85;
    ctx.fillStyle = palette.main;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    ctx.restore();
  }

  // Paint all trails behind the balls, and all numeric labels in front.
  const balls = lane.balls;
  const dense = balls.length > 16;
  if (simState.stepCount > 0) {
    for (const ball of balls) {
      const speed = Math.hypot(ball.vx, ball.vy);
      const length = Math.min(speed * (dense ? 0.028 : 0.065), ball.radius * (dense ? 3.5 : 6));
      ctx.save();
      ctx.translate(ball.x, ball.y);
      ctx.rotate(Math.atan2(ball.vy, ball.vx));
      ctx.drawImage(art.trail, -length, -ball.radius * 0.76, length, ball.radius * 1.52);
      ctx.restore();
    }
  }

  for (const ball of balls) {
    const radius = Math.max(ball.radius, 5.25 * unit);
    const size = radius * art.orb.width / ORB_SPRITE_RADIUS;
    ctx.drawImage(art.orb, ball.x - size / 2, ball.y - size / 2, size, size);
    occupied.push({ x: ball.x - radius, y: ball.y - radius, width: 2 * radius, height: 2 * radius });
  }

  const maxLabels = compact ? 4 : 10;
  const labelHeight = 15 * unit;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `650 ${11 * unit}px monospace`;
  for (const ball of labelCandidates(balls, maxLabels)) {
    const stacked = bfCmp(ball.stackCount, STACK_BADGE_MIN) >= 0;
    const value = formatBigFloat(ball.value, formatStyle, 1);
    const label = stacked ? `${value}  ×${formatBigFloat(ball.stackCount, formatStyle, 1)}` : value;
    const width = Math.min(LANE_WIDTH - 8, ctx.measureText(label).width + 8 * unit);
    const x = Math.max(4, Math.min(LANE_WIDTH - width - 4, ball.x - width / 2));
    const clearance = Math.max(ball.radius, 5.25 * unit) + 3 * unit;
    const bounds = { x, y: ball.y - clearance - labelHeight, width, height: labelHeight };
    if (!labelFits(bounds)) {
      bounds.y = ball.y + clearance;
      if (!labelFits(bounds)) continue;
    }
    occupied.push(bounds);

    drawRoundedRect(ctx, x, bounds.y, width, labelHeight, 4 * unit);
    ctx.fillStyle = isDark ? "#0b1824ed" : "#ffffffed";
    ctx.fill();
    ctx.strokeStyle = stacked ? palette.main : palette.canvasTrail;
    ctx.lineWidth = unit * 0.8;
    ctx.stroke();
    ctx.fillStyle = stacked && isDark ? palette.light : ink;
    ctx.fillText(label, x + width / 2, bounds.y + labelHeight / 2 + 0.4 * unit, width - 5 * unit);
  }

  const eventColors = isDark
    ? { break: palette.light, jackpot: "#fbd57e", sabotage: "#ff9cae", gate: "#83e8c7", hit: muted }
    : { break: palette.main, jackpot: "#865608", sabotage: "#a51e47", gate: "#046850", hit: muted };
  // Give a ball's value priority over short-lived hit and gate annotations.
  for (const ft of simState.floatTexts) {
    if (ft.laneIndex !== lane.laneIndex) continue;
    const major = ft.kind === "break" || ft.kind === "jackpot" || ft.kind === "sabotage";
    const fontSize = (major ? 12 : 10) * unit;
    ctx.font = `${major ? 700 : 600} ${fontSize}px monospace`;
    const width = Math.min(LANE_WIDTH - 12, ctx.measureText(ft.text).width);
    const x = Math.min(LANE_WIDTH - width / 2 - 6, Math.max(width / 2 + 6, ft.x));
    const bounds = { x: x - width / 2, y: ft.y - fontSize / 2, width, height: fontSize };
    const maxLifts = major ? 2 : 0;
    for (let lift = 0; lift < maxLifts && !labelFits(bounds); lift++) {
      bounds.y -= labelHeight;
    }
    if (!labelFits(bounds)) continue;
    occupied.push(bounds);

    ctx.fillStyle = eventColors[ft.kind];
    ctx.globalAlpha = Math.max(0, 1 - ft.age / ft.ttl);
    ctx.fillText(ft.text, x, bounds.y + fontSize / 2, width);
  }
  ctx.globalAlpha = 1;

  // Finish and elimination overlays
  if (lane.eliminated) {
    ctx.fillStyle = isDark ? "rgba(11, 14, 19, 0.72)" : "rgba(241, 245, 249, 0.78)";
    ctx.fillRect(0, 0, LANE_WIDTH, LANE_HEIGHT);
    ctx.fillStyle = "#F43F5E";
    ctx.font = `700 ${16 * unit}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✕ 推线触顶淘汰", LANE_WIDTH / 2, LANE_HEIGHT / 2 - 12 * unit, LANE_WIDTH - 24);
    ctx.font = `600 ${12 * unit}px monospace`;
    ctx.fillStyle = isDark ? "#94A3B8" : "#475569";
    ctx.fillText(
      `淘汰于 ${(lane.eliminatedAtSec ?? 0).toFixed(2)}s · 碎 ${lane.brokenLayers} 层`,
      LANE_WIDTH / 2,
      LANE_HEIGHT / 2 + 12 * unit,
      LANE_WIDTH - 22
    );
  } else if (simState.winnerLaneIndex === lane.laneIndex && simState.status === "finished") {
    drawRoundedRect(ctx, 36, 36, LANE_WIDTH - 72, 32, 8);
    ctx.fillStyle = isDark ? "#16383a" : "#daf6e9";
    ctx.fill();
    ctx.strokeStyle = palette.main;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = isDark ? "#ECFDF5" : "#064E3B";
    ctx.font = `700 ${Math.min(21, 13 * unit)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("★ 本局获胜赛道", LANE_WIDTH / 2, 52, LANE_WIDTH - 84);
  }

  ctx.restore();
}
