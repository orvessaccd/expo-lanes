"use client";

import React, { useEffect, useRef } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  Paper,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import {
  NumberFormatStyle,
  bfCmp,
  bfDiv,
  bfGt,
  bfIsZero,
  bfLog10Safe,
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
import type { LaneRuntimeState, SimulationState, WinRuleType } from "@/engine/types";
import { getLanePalettes, LanePalette } from "@/theme/theme";

export interface RaceArenaProps {
  simState: SimulationState;
  formatStyle: NumberFormatStyle;
  speedMultiplier: number;
  onSpeedChange: (speed: number) => void;
  onTogglePlay: () => void;
  onReset: () => void;
  lockedBetLane: number | null;
  lockedOdds: number | null;
}

const WIN_RULE_LABELS: Record<WinRuleType, string> = {
  breakthrough_timed: "破底竞速 + 限时兜底",
  endless_timed: "无限层限时冲刺",
  breakthrough_untimed: "纯破底无时限",
  push_elimination: "双向推线淘汰制",
};

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

function renderLaneCanvas(
  canvas: HTMLCanvasElement,
  lane: LaneRuntimeState,
  simState: SimulationState,
  palette: LanePalette,
  isDark: boolean,
  formatStyle: NumberFormatStyle,
  isWinner: boolean
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const targetW = Math.round(LANE_WIDTH * dpr);
  const targetH = Math.round(LANE_HEIGHT * dpr);

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.save();
  ctx.scale(dpr, dpr);

  // 1. Arena background surface
  const bgGrad = ctx.createLinearGradient(0, 0, 0, LANE_HEIGHT);
  if (isDark) {
    bgGrad.addColorStop(0, "#0D1219");
    bgGrad.addColorStop(1, "#121924");
  } else {
    bgGrad.addColorStop(0, "#F8FAFC");
    bgGrad.addColorStop(1, "#EEF3F8");
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, LANE_WIDTH, LANE_HEIGHT);

  // 2. Top Spawn / Push Elimination Line
  const isPushMode = simState.config.rules.winRule === "push_elimination";
  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = isPushMode
    ? "rgba(244, 63, 94, 0.72)"
    : isDark
      ? "rgba(148, 163, 184, 0.28)"
      : "rgba(71, 85, 105, 0.25)";
  ctx.lineWidth = isPushMode ? 1.6 : 1;
  ctx.moveTo(8, SPAWN_LINE_Y);
  ctx.lineTo(LANE_WIDTH - 8, SPAWN_LINE_Y);
  ctx.stroke();
  ctx.restore();

  ctx.font = "600 10px monospace";
  ctx.textBaseline = "middle";
  if (isPushMode) {
    ctx.fillStyle = isDark ? "#FB7185" : "#E11D48";
    ctx.textAlign = "left";
    ctx.fillText("▲ 触顶淘汰警戒线", 10, SPAWN_LINE_Y - 12);
  } else {
    ctx.fillStyle = isDark ? "rgba(148,163,184,0.65)" : "rgba(71,85,105,0.65)";
    ctx.textAlign = "left";
    ctx.fillText("发射基准线", 10, SPAWN_LINE_Y - 12);
  }

  if (lane.config.ball.spawnPerSec > 0) {
    ctx.fillStyle = palette.main;
    ctx.textAlign = "right";
    ctx.fillText(
      `补球 +${lane.config.ball.spawnPerSec}/s`,
      LANE_WIDTH - 10,
      SPAWN_LINE_Y - 12
    );
  } else if (lane.config.ball.maxHitsPerBall > 0) {
    ctx.fillStyle = isDark ? "#FBBF24" : "#D97706";
    ctx.textAlign = "right";
    ctx.fillText(
      `寿命 ${lane.config.ball.maxHitsPerBall}撞`,
      LANE_WIDTH - 10,
      SPAWN_LINE_Y - 12
    );
  }

  // 3. Pachinko Pins
  if (lane.pins.length > 0) {
    for (const pin of lane.pins) {
      ctx.beginPath();
      ctx.arc(pin.x, pin.y, pin.radius, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? "#334155" : "#CBD5E1";
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = isDark ? "#64748B" : "#94A3B8";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(pin.x - 1.5, pin.y - 1.5, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.85)";
      ctx.fill();
    }
  }

  // 4. Mid-lane Math Gates
  for (const gateRow of lane.config.gates) {
    const boxes = getGateRowBoxes(gateRow, simState.elapsedSec);
    for (const box of boxes) {
      const isNegative =
        box.slot.op === "sub" || box.slot.op === "div" || box.slot.op === "sqrt";
      const fill = isNegative
        ? isDark
          ? "rgba(244, 63, 94, 0.16)"
          : "rgba(225, 29, 72, 0.11)"
        : isDark
          ? "rgba(16, 217, 136, 0.16)"
          : "rgba(7, 138, 82, 0.11)";
      const stroke = isNegative
        ? isDark
          ? "rgba(251, 113, 133, 0.65)"
          : "rgba(225, 29, 72, 0.55)"
        : isDark
          ? "rgba(52, 211, 153, 0.68)"
          : "rgba(7, 138, 82, 0.55)";

      drawRoundedRect(ctx, box.x, box.y, box.width, box.height, 6);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = stroke;
      ctx.stroke();

      ctx.fillStyle = isNegative
        ? isDark
          ? "#FDA4AF"
          : "#BE123C"
        : isDark
          ? "#6EE7B7"
          : "#065F46";
      ctx.font = "700 11.5px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = formatGateSlotLabel(box.slot, formatStyle);
      ctx.fillText(label, box.x + box.width / 2, box.y + box.height / 2 + 0.5);
    }
  }

  // 5. Bottom Number Wall Stack
  const isEndless = simState.config.rules.winRule === "endless_timed";
  if (lane.frontWall) {
    const fw = lane.frontWall;
    const topY = lane.wallTopY;

    // Calculate HP fill ratio safely across huge exponents
    let hpRatio = 1;
    if (!bfIsZero(fw.maxHp)) {
      const logDiff = bfLog10Safe(fw.maxHp, -6) - bfLog10Safe(fw.currentHp, -6);
      if (logDiff > 3) {
        hpRatio = 0.02;
      } else {
        hpRatio = Math.max(
          0.02,
          Math.min(1, bfToNumber(bfDiv(fw.currentHp, fw.maxHp)))
        );
      }
    }

    // Front wall container
    const wallX = 6;
    const wallW = LANE_WIDTH - 12;
    const wallH = WALL_LAYER_HEIGHT + 6;
    drawRoundedRect(ctx, wallX, topY, wallW, wallH, 6);
    ctx.fillStyle = isDark ? "#1B2432" : "#E2E8F0";
    ctx.fill();

    // Active HP bar inside front wall
    ctx.save();
    ctx.clip();
    ctx.fillStyle = palette.softBg.replace(/0\.11|0\.09/, isDark ? "0.34" : "0.26");
    ctx.fillRect(wallX, topY, wallW * hpRatio, wallH);
    // Top impact edge highlight
    ctx.fillStyle = palette.main;
    ctx.fillRect(wallX, topY, wallW * hpRatio, 2.5);
    ctx.restore();

    drawRoundedRect(ctx, wallX, topY, wallW, wallH, 6);
    ctx.lineWidth = 1;
    ctx.strokeStyle = isDark
      ? "rgba(226, 232, 240, 0.16)"
      : "rgba(15, 23, 42, 0.16)";
    ctx.stroke();

    // Layer badge on left
    ctx.fillStyle = isDark ? "#94A3B8" : "#475569";
    ctx.font = "600 10.5px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`#${fw.layerIndex + 1}`, wallX + 8, topY + wallH / 2);

    // Center large wall HP number
    ctx.fillStyle = isDark ? "#F8FAFC" : "#0F172A";
    ctx.font = "700 13.5px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      formatBigFloat(fw.currentHp, formatStyle, 2),
      LANE_WIDTH / 2,
      topY + wallH / 2 + 0.5
    );

    // Right wall modifier tag (cap or compound regen)
    const wallCfg = lane.config.wall;
    const modTags: string[] = [];
    if (wallCfg.capMode === "fixed") {
      modTags.push(`限-${formatBigFloat(wallCfg.capValue, formatStyle, 1)}`);
    } else if (wallCfg.capMode === "max_pct") {
      modTags.push(`限${Math.round(wallCfg.capValue * 100)}%`);
    }
    if (wallCfg.compoundPerSec > 1.0001) {
      modTags.push(`×${wallCfg.compoundPerSec}/s`);
    }
    if (modTags.length > 0) {
      ctx.fillStyle = isDark ? "#FBBF24" : "#B45309";
      ctx.font = "600 9.5px monospace";
      ctx.textAlign = "right";
      ctx.fillText(modTags.join(" "), wallX + wallW - 8, topY + wallH / 2);
    }

    // Upcoming wall layers preview beneath frontWall
    lane.upcomingWalls.forEach((uw, idx) => {
      const uy = topY + wallH + 4 + idx * (WALL_LAYER_HEIGHT - 2);
      if (uy > LANE_HEIGHT - 6) return;
      const alphaFactor = Math.max(0.22, 0.72 - idx * 0.22);
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
      ctx.font = "600 10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`#${uw.layerIndex + 1}`, wallX + 10, uy + (WALL_LAYER_HEIGHT - 5) / 2);

      ctx.textAlign = "center";
      ctx.fillText(
        formatBigFloat(uw.currentHp, formatStyle, 2),
        LANE_WIDTH / 2,
        uy + (WALL_LAYER_HEIGHT - 5) / 2
      );
      ctx.restore();
    });

    // Remaining layers footer badge
    if (!isEndless) {
      const rem = Math.max(0, lane.config.wall.totalLayers - lane.brokenLayers);
      ctx.fillStyle = isDark ? "rgba(148,163,184,0.65)" : "rgba(71,85,105,0.7)";
      ctx.font = "600 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`剩余 ${rem} 层触底`, LANE_WIDTH / 2, LANE_HEIGHT - 10);
    }
  } else {
    // All finite walls cleared!
    drawRoundedRect(ctx, 16, LANE_HEIGHT - 66, LANE_WIDTH - 32, 42, 8);
    ctx.fillStyle = palette.softBg;
    ctx.fill();
    ctx.strokeStyle = palette.main;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = palette.main;
    ctx.font = "700 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✓ 全部数字墙已击穿！", LANE_WIDTH / 2, LANE_HEIGHT - 45);
  }

  // 6. Shatter Particles for this lane
  for (const p of simState.particles) {
    if (p.laneIndex !== lane.laneIndex) continue;
    const life = Math.max(0, 1 - p.age / p.ttl);
    ctx.save();
    ctx.globalAlpha = life * 0.85;
    ctx.fillStyle = palette.main;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    ctx.restore();
  }

  // 7. Physical Balls + Motion Trails + Numeric Labels + ×N Stack Pills
  const showAllLabels = lane.balls.length <= 24;
  lane.balls.forEach((ball, bIdx) => {
    // Motion trail
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(ball.x - ball.vx * 0.024, ball.y - ball.vy * 0.024);
    ctx.strokeStyle = palette.canvasTrail;
    ctx.lineWidth = ball.radius * 1.45;
    ctx.lineCap = "round";
    ctx.stroke();

    // Ball body
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = palette.canvasFill;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.5)";
    ctx.stroke();

    // Render value & ×N stack badge (throttled neatly if >24 physical balls so screen stays readable)
    if (showAllLabels || bIdx % 3 === 0 || bfGt(ball.stackCount, bf(1.5))) {
      const valText = formatBigFloat(ball.value, formatStyle, 1);
      ctx.font = "700 9.5px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      // Subtle contrast outline behind text
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = isDark ? "rgba(11, 14, 19, 0.9)" : "rgba(255, 255, 255, 0.92)";
      ctx.strokeText(valText, ball.x, ball.y - ball.radius - 2);
      ctx.fillStyle = isDark ? "#F8FAFC" : "#0F172A";
      ctx.fillText(valText, ball.x, ball.y - ball.radius - 2);

      if (bfCmp(ball.stackCount, bf(1.4)) >= 0) {
        const stackText = `×${formatBigFloat(ball.stackCount, formatStyle, 1)}`;
        ctx.font = "700 8.5px monospace";
        ctx.textBaseline = "top";
        ctx.strokeText(stackText, ball.x, ball.y + ball.radius + 1.5);
        ctx.fillStyle = palette.light;
        ctx.fillText(stackText, ball.x, ball.y + ball.radius + 1.5);
      }
    }
  });

  // 8. Floating Combat / Formula Delta Texts
  for (const ft of simState.floatTexts) {
    if (ft.laneIndex !== lane.laneIndex) continue;
    const alpha = Math.max(0, 1 - ft.age / ft.ttl);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font =
      ft.kind === "break" || ft.kind === "jackpot"
        ? "700 12px monospace"
        : "600 10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (ft.kind === "break") {
      ctx.fillStyle = palette.light;
    } else if (ft.kind === "jackpot") {
      ctx.fillStyle = "#FBBF24";
    } else if (ft.kind === "sabotage") {
      ctx.fillStyle = "#FB7185";
    } else if (ft.kind === "gate") {
      ctx.fillStyle = isDark ? "#6EE7B7" : "#047857";
    } else {
      ctx.fillStyle = isDark ? "#CBD5E1" : "#334155";
    }
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  // 9. Eliminated or Winner State Banner
  if (lane.eliminated) {
    ctx.fillStyle = isDark ? "rgba(11, 14, 19, 0.72)" : "rgba(241, 245, 249, 0.78)";
    ctx.fillRect(0, 0, LANE_WIDTH, LANE_HEIGHT);
    ctx.fillStyle = "#F43F5E";
    ctx.font = "700 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✕ 推线触顶淘汰", LANE_WIDTH / 2, LANE_HEIGHT / 2 - 10);
    ctx.font = "600 12px monospace";
    ctx.fillStyle = isDark ? "#94A3B8" : "#475569";
    ctx.fillText(
      `淘汰于 ${(lane.eliminatedAtSec ?? 0).toFixed(2)}s · 碎 ${lane.brokenLayers} 层`,
      LANE_WIDTH / 2,
      LANE_HEIGHT / 2 + 14
    );
  } else if (isWinner && simState.status === "finished") {
    drawRoundedRect(ctx, 28, 62, LANE_WIDTH - 56, 34, 8);
    ctx.fillStyle = isDark ? "rgba(16, 217, 136, 0.2)" : "rgba(7, 138, 82, 0.15)";
    ctx.fill();
    ctx.strokeStyle = palette.main;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = isDark ? "#ECFDF5" : "#064E3B";
    ctx.font = "700 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("★ 本局优胜赛道", LANE_WIDTH / 2, 79);
  }

  ctx.restore();
}

export default function RaceArena({
  simState,
  formatStyle,
  speedMultiplier,
  onSpeedChange,
  onTogglePlay,
  onReset,
  lockedBetLane,
  lockedOdds,
}: RaceArenaProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const palettes = getLanePalettes(theme.palette.mode);
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);

  // Paint canvases whenever simState updates
  useEffect(() => {
    simState.lanes.forEach((lane, idx) => {
      const canvas = canvasRefs.current[idx];
      if (!canvas) return;
      renderLaneCanvas(
        canvas,
        lane,
        simState,
        palettes[idx % palettes.length],
        isDark,
        formatStyle,
        simState.winnerLaneIndex === idx
      );
    });
  });

  const isTimed =
    simState.config.rules.winRule === "breakthrough_timed" ||
    simState.config.rules.winRule === "endless_timed";
  const isEndless = simState.config.rules.winRule === "endless_timed";
  const hasCoupling =
    simState.config.coupling.sabotageTransferPct > 0 ||
    simState.config.coupling.sharedPoolEnabled;

  return (
    <Paper sx={{ p: { xs: 1.5, sm: 2.25 } }}>
      {/* Top Arena Control Bar */}
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        sx={{
          alignItems: { xs: "stretch", md: "center" },
          justifyContent: "space-between",
          mb: 1.75,
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ alignItems: "center", flexWrap: "wrap" }}
        >
          <Chip
            size="small"
            color={
              simState.status === "running"
                ? "primary"
                : simState.status === "finished"
                  ? "success"
                  : "default"
            }
            label={
              simState.status === "ready"
                ? "待发车"
                : simState.status === "running"
                  ? "120Hz 运算中"
                  : simState.status === "paused"
                    ? "已暂停"
                    : "比赛结束"
            }
          />
          <Chip
            size="small"
            variant="outlined"
            label={WIN_RULE_LABELS[simState.config.rules.winRule]}
          />
          <Typography
            variant="caption"
            className="tabular-nums"
            color="text.secondary"
            sx={{ px: 0.5 }}
          >
            Seed: {simState.config.seed}
          </Typography>
        </Stack>

        <Stack
          direction="row"
          spacing={1.25}
          useFlexGap
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <Typography
            variant="body2"
            className="tabular-nums"
            sx={{ fontWeight: 700, minWidth: 112 }}
          >
            {isTimed
              ? `⏱ ${simState.elapsedSec.toFixed(2)}s / ${simState.config.rules.timeLimitSec}s`
              : `⏱ ${simState.elapsedSec.toFixed(2)}s`}
          </Typography>

          <ButtonGroup size="small" aria-label="倍速切换">
            {[0.5, 1, 2, 4].map((spd) => (
              <Button
                key={spd}
                id={`speed-btn-${spd}x`}
                variant={speedMultiplier === spd ? "contained" : "outlined"}
                onClick={() => onSpeedChange(spd)}
                sx={{ px: 1.1, minWidth: 42 }}
              >
                {spd}x
              </Button>
            ))}
          </ButtonGroup>

          <Stack direction="row" spacing={0.75}>
            <Button
              id="arena-play-pause-btn"
              size="small"
              variant="contained"
              color={simState.status === "running" ? "secondary" : "primary"}
              startIcon={
                simState.status === "running" ? (
                  <PauseRoundedIcon />
                ) : (
                  <PlayArrowRoundedIcon />
                )
              }
              onClick={onTogglePlay}
              disabled={simState.status === "finished"}
            >
              {simState.status === "running"
                ? "暂停"
                : simState.status === "paused"
                  ? "继续"
                  : "直接开赛"}
            </Button>
            <Button
              id="arena-reset-btn"
              size="small"
              variant="outlined"
              startIcon={<ReplayRoundedIcon />}
              onClick={onReset}
            >
              重置
            </Button>
          </Stack>
        </Stack>
      </Stack>

      {/* Cross-Lane Numeric Coupling Banner */}
      {hasCoupling && (
        <Box
          sx={{
            mb: 1.75,
            px: 1.75,
            py: 1,
            borderRadius: 1.5,
            bgcolor: isDark
              ? "rgba(245, 158, 11, 0.08)"
              : "rgba(217, 119, 6, 0.07)",
            border: "1px solid",
            borderColor: isDark
              ? "rgba(245, 158, 11, 0.25)"
              : "rgba(217, 119, 6, 0.22)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <BoltRoundedIcon fontSize="small" color="warning" />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              跨赛道数字联动已开启
            </Typography>
          </Stack>
          <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
            {simState.config.coupling.sabotageTransferPct > 0 && (
              <Typography variant="caption" className="tabular-nums">
                破墙转嫁对手：
                <strong>
                  +{Math.round(simState.config.coupling.sabotageTransferPct * 100)}%
                </strong>{" "}
                初始墙值
              </Typography>
            )}
            {simState.config.coupling.sharedPoolEnabled && (
              <Typography
                variant="caption"
                className="tabular-nums"
                color="warning.main"
                sx={{ fontWeight: 700 }}
              >
                公共倍增池：+{formatBigFloat(simState.sharedPoolValue, formatStyle)}（每破{" "}
                {simState.config.coupling.poolMilestoneEveryLayers} 层夺取）
              </Typography>
            )}
          </Stack>
        </Box>
      )}

      {/* Win Result Banner */}
      {simState.status === "finished" && simState.winReason && (
        <Box
          sx={{
            mb: 1.75,
            px: 2,
            py: 1.25,
            borderRadius: 1.5,
            bgcolor: isDark
              ? "rgba(16, 217, 136, 0.1)"
              : "rgba(7, 138, 82, 0.08)",
            border: "1px solid",
            borderColor: "success.main",
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            🏁 {simState.winReason}
          </Typography>
        </Box>
      )}

      {/* Parallel 2~3 Lanes Grid */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: `repeat(${simState.lanes.length}, minmax(0, 1fr))`,
          },
          gap: 1.75,
        }}
      >
        {simState.lanes.map((lane, idx) => {
          const pal = palettes[idx % palettes.length];
          const isBetTarget = lockedBetLane === idx;

          return (
            <Box
              key={lane.config.id || idx}
              sx={{
                display: "flex",
                flexDirection: "column",
                borderRadius: 2,
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
              }}
            >
              {/* Lane HUD Header */}
              <Box
                sx={{
                  p: 1.25,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  backgroundColor: pal.softBg,
                }}
              >
                <Stack
                  direction="row"
                  spacing={0.5}
                  sx={{ alignItems: "center", justifyContent: "space-between" }}
                >
                  <Stack
                    direction="row"
                    spacing={0.85}
                    sx={{ alignItems: "center", minWidth: 0 }}
                  >
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        bgcolor: pal.main,
                        flexShrink: 0,
                      }}
                    />
                    <Typography
                      variant="subtitle2"
                      noWrap
                      sx={{ fontWeight: 700, fontSize: "0.86rem" }}
                    >
                      {lane.config.name}
                    </Typography>
                  </Stack>

                  {isBetTarget && (
                    <Chip
                      size="small"
                      color="secondary"
                      label={`已押 ×${(lockedOdds ?? 1).toFixed(2)}`}
                      sx={{ height: 20, fontSize: "0.7rem" }}
                    />
                  )}
                </Stack>

                {lane.config.subtitle && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    sx={{ display: "block", mt: 0.25 }}
                  >
                    {lane.config.subtitle}
                  </Typography>
                )}

                <Box
                  sx={{
                    mt: 1,
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 0.75,
                  }}
                >
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: "0.68rem", display: "block" }}
                    >
                      当前球数
                    </Typography>
                    <Typography
                      variant="body2"
                      className="tabular-nums"
                      sx={{ fontWeight: 700, fontSize: "0.82rem" }}
                    >
                      {formatBigFloat(lane.totalBallCount, formatStyle, 1)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: "0.68rem", display: "block" }}
                    >
                      最高球值
                    </Typography>
                    <Typography
                      variant="body2"
                      className="tabular-nums"
                      sx={{ fontWeight: 700, fontSize: "0.82rem", color: pal.main }}
                    >
                      {formatBigFloat(lane.maxBallValue, formatStyle, 2)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: "0.68rem", display: "block" }}
                    >
                      已破墙层
                    </Typography>
                    <Typography
                      variant="body2"
                      className="tabular-nums"
                      sx={{ fontWeight: 700, fontSize: "0.82rem" }}
                    >
                      {lane.brokenLayers} /{" "}
                      {isEndless ? "∞" : lane.config.wall.totalLayers}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* High-DPI Lane Simulation Canvas */}
              <Box
                sx={{
                  width: "100%",
                  aspectRatio: `${LANE_WIDTH} / ${LANE_HEIGHT}`,
                  position: "relative",
                }}
              >
                <canvas
                  ref={(el) => {
                    canvasRefs.current[idx] = el;
                  }}
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "block",
                  }}
                />
              </Box>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}
