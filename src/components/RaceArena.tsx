"use client";

import React, { useEffect, useRef } from "react";
import {
  Box,
  Chip,
  Paper,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import RadioButtonUncheckedRoundedIcon from "@mui/icons-material/RadioButtonUncheckedRounded";
import {
  NumberFormatStyle,
  bf,
  bfCmp,
  bfDiv,
  bfGt,
  bfIsZero,
  bfLog10Safe,
  bfToNumber,
  formatBigFloat,
} from "@/engine/bigNumber";
import {
  LANE_HEIGHT,
  LANE_WIDTH,
  SPAWN_LINE_Y,
  WALL_LAYER_HEIGHT,
  formatGateSlotLabel,
  getGateRowBoxes,
} from "@/engine/simulation";
import type { LaneRuntimeState, SimulationState } from "@/engine/types";
import type { OddsSummary } from "@/lib/storage";
import { getLanePalettes, LanePalette } from "@/theme/theme";
import { getLaneAlignedSpecs } from "./formulaFormat";

export interface RaceArenaProps {
  mode: "challenge" | "sandbox";
  simState: SimulationState;
  wallsIdentical: boolean;
  formatStyle: NumberFormatStyle;
  oddsSummary?: OddsSummary;
  selectedBetLane?: number;
  lockedBetLane: number | null;
  lockedOdds: number | null;
  onSelectBetLane?: (laneIndex: number) => void;
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

  // 1. Clean laboratory chamber background
  ctx.fillStyle = isDark ? "#0D1219" : "#F8FAFC";
  ctx.fillRect(0, 0, LANE_WIDTH, LANE_HEIGHT);

  // Subtle geometric horizontal reference lines (25% / 50% / 75%) for visual alignment
  ctx.strokeStyle = isDark ? "rgba(148, 163, 184, 0.06)" : "rgba(15, 23, 42, 0.05)";
  ctx.lineWidth = 1;
  for (const ratio of [0.25, 0.5, 0.75]) {
    const gy = Math.round(LANE_HEIGHT * ratio) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(LANE_WIDTH, gy);
    ctx.stroke();
  }

  // 2. Top Push Elimination Warning Line (only prominent in push_elimination mode)
  const isPushMode = simState.config.rules.winRule === "push_elimination";
  if (isPushMode) {
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "rgba(244, 63, 94, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.moveTo(10, SPAWN_LINE_Y);
    ctx.lineTo(LANE_WIDTH - 10, SPAWN_LINE_Y);
    ctx.stroke();
    ctx.restore();

    ctx.font = "600 10px monospace";
    ctx.fillStyle = isDark ? "#FB7185" : "#E11D48";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("▲ 触顶淘汰红线", LANE_WIDTH / 2, SPAWN_LINE_Y - 12);
  }

  // 3. Pachinko Pins
  if (lane.pins.length > 0) {
    for (const pin of lane.pins) {
      ctx.beginPath();
      ctx.arc(pin.x, pin.y, pin.radius, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? "#334155" : "#CBD5E1";
      ctx.fill();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = isDark ? "#64748B" : "#94A3B8";
      ctx.stroke();
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
          ? "rgba(244, 63, 94, 0.15)"
          : "rgba(225, 29, 72, 0.1)"
        : isDark
          ? "rgba(16, 217, 136, 0.15)"
          : "rgba(7, 138, 82, 0.1)";
      const stroke = isNegative
        ? isDark
          ? "rgba(251, 113, 133, 0.62)"
          : "rgba(225, 29, 72, 0.52)"
        : isDark
          ? "rgba(52, 211, 153, 0.65)"
          : "rgba(7, 138, 82, 0.52)";

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

  // 5. Crisp Bottom Number Wall Stack
  if (lane.frontWall) {
    const fw = lane.frontWall;
    const topY = lane.wallTopY;

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

    const wallX = 8;
    const wallW = LANE_WIDTH - 16;
    const wallH = WALL_LAYER_HEIGHT + 6;
    drawRoundedRect(ctx, wallX, topY, wallW, wallH, 6);
    ctx.fillStyle = isDark ? "#18212E" : "#E2E8F0";
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.fillStyle = palette.softBg.replace(/0\.11|0\.09/, isDark ? "0.32" : "0.24");
    ctx.fillRect(wallX, topY, wallW * hpRatio, wallH);
    ctx.fillStyle = palette.main;
    ctx.fillRect(wallX, topY, wallW * hpRatio, 2.5);
    ctx.restore();

    drawRoundedRect(ctx, wallX, topY, wallW, wallH, 6);
    ctx.lineWidth = 1;
    ctx.strokeStyle = isDark
      ? "rgba(226, 232, 240, 0.16)"
      : "rgba(15, 23, 42, 0.14)";
    ctx.stroke();

    ctx.fillStyle = isDark ? "#94A3B8" : "#475569";
    ctx.font = "600 10.5px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`#${fw.layerIndex + 1}`, wallX + 9, topY + wallH / 2);

    ctx.fillStyle = isDark ? "#F8FAFC" : "#0F172A";
    ctx.font = "700 13.5px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      formatBigFloat(fw.currentHp, formatStyle, 2),
      LANE_WIDTH / 2,
      topY + wallH / 2 + 0.5
    );

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

    // Subtle upcoming wall layers stacked beneath
    lane.upcomingWalls.slice(0, 2).forEach((uw, idx) => {
      const uy = topY + wallH + 4 + idx * (WALL_LAYER_HEIGHT - 3);
      if (uy > LANE_HEIGHT - 8) return;
      ctx.save();
      ctx.globalAlpha = idx === 0 ? 0.55 : 0.28;
      drawRoundedRect(ctx, wallX + 3, uy, wallW - 6, WALL_LAYER_HEIGHT - 6, 5);
      ctx.fillStyle = isDark ? "#131A24" : "#E8EEF5";
      ctx.fill();
      ctx.fillStyle = isDark ? "#94A3B8" : "#475569";
      ctx.font = "600 10px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`#${uw.layerIndex + 1}`, wallX + 10, uy + (WALL_LAYER_HEIGHT - 6) / 2);
      ctx.textAlign = "center";
      ctx.fillText(
        formatBigFloat(uw.currentHp, formatStyle, 2),
        LANE_WIDTH / 2,
        uy + (WALL_LAYER_HEIGHT - 6) / 2
      );
      ctx.restore();
    });
  } else {
    drawRoundedRect(ctx, 18, LANE_HEIGHT - 62, LANE_WIDTH - 36, 40, 8);
    ctx.fillStyle = palette.softBg;
    ctx.fill();
    ctx.strokeStyle = palette.main;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = palette.main;
    ctx.font = "700 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✓ 数字墙已全部击穿", LANE_WIDTH / 2, LANE_HEIGHT - 42);
  }

  // 6. Shatter Particles
  for (const p of simState.particles) {
    if (p.laneIndex !== lane.laneIndex) continue;
    const life = Math.max(0, 1 - p.age / p.ttl);
    ctx.save();
    ctx.globalAlpha = life * 0.85;
    ctx.fillStyle = palette.main;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    ctx.restore();
  }

  // 7. Physical Balls + Motion Trails + Numeric Labels
  const showAllLabels = lane.balls.length <= 22;
  lane.balls.forEach((ball, bIdx) => {
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(ball.x - ball.vx * 0.022, ball.y - ball.vy * 0.022);
    ctx.strokeStyle = palette.canvasTrail;
    ctx.lineWidth = ball.radius * 1.4;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = palette.canvasFill;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.72)" : "rgba(15,23,42,0.45)";
    ctx.stroke();

    if (showAllLabels || bIdx % 3 === 0 || bfGt(ball.stackCount, bf(1.5))) {
      const valText = formatBigFloat(ball.value, formatStyle, 1);
      ctx.font = "700 9.5px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
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

  // 8. Floating Delta Texts
  for (const ft of simState.floatTexts) {
    if (ft.laneIndex !== lane.laneIndex) continue;
    const alpha = Math.max(0, 1 - ft.age / ft.ttl);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font =
      ft.kind === "break" || ft.kind === "jackpot"
        ? "700 11.5px monospace"
        : "600 9.5px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle =
      ft.kind === "break"
        ? palette.light
        : ft.kind === "jackpot"
          ? "#FBBF24"
          : ft.kind === "sabotage"
            ? "#FB7185"
            : ft.kind === "gate"
              ? isDark
                ? "#6EE7B7"
                : "#047857"
              : isDark
                ? "#CBD5E1"
                : "#334155";
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  // 9. Eliminated or Winner State Overlay
  if (lane.eliminated) {
    ctx.fillStyle = isDark ? "rgba(11, 14, 19, 0.76)" : "rgba(241, 245, 249, 0.82)";
    ctx.fillRect(0, 0, LANE_WIDTH, LANE_HEIGHT);
    ctx.fillStyle = "#F43F5E";
    ctx.font = "700 15px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✕ 推线触顶淘汰", LANE_WIDTH / 2, LANE_HEIGHT / 2 - 8);
    ctx.font = "600 11.5px monospace";
    ctx.fillStyle = isDark ? "#94A3B8" : "#475569";
    ctx.fillText(
      `${(lane.eliminatedAtSec ?? 0).toFixed(1)}s · 破 ${lane.brokenLayers} 层`,
      LANE_WIDTH / 2,
      LANE_HEIGHT / 2 + 14
    );
  } else if (isWinner && simState.status === "finished") {
    drawRoundedRect(ctx, 36, 36, LANE_WIDTH - 72, 32, 8);
    ctx.fillStyle = isDark ? "rgba(16, 217, 136, 0.2)" : "rgba(7, 138, 82, 0.14)";
    ctx.fill();
    ctx.strokeStyle = palette.main;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = isDark ? "#ECFDF5" : "#064E3B";
    ctx.font = "700 12.5px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("★ 本局获胜赛道", LANE_WIDTH / 2, 52);
  }

  ctx.restore();
}

export default function RaceArena({
  mode,
  simState,
  wallsIdentical,
  formatStyle,
  oddsSummary,
  selectedBetLane = 0,
  lockedBetLane,
  lockedOdds,
  onSelectBetLane,
}: RaceArenaProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const palettes = getLanePalettes(theme.palette.mode);
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);

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

  const isEndless = simState.config.rules.winRule === "endless_timed";
  const isPreMatchChallenge =
    mode === "challenge" && simState.status === "ready";

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          sm: `repeat(${simState.lanes.length}, minmax(0, 1fr))`,
        },
        gap: 2,
        alignItems: "stretch",
      }}
    >
      {simState.lanes.map((lane, idx) => {
        const pal = palettes[idx % palettes.length];
        const odd = oddsSummary?.odds[idx] ?? 2.0;
        const sharePct = Math.round((oddsSummary?.shares[idx] ?? 0.5) * 100);
        const isSelected = isPreMatchChallenge && selectedBetLane === idx;
        const isLockedTarget = lockedBetLane === idx;
        const isWinner =
          simState.status === "finished" && simState.winnerLaneIndex === idx;

        const specs = getLaneAlignedSpecs(
          lane.config,
          wallsIdentical,
          simState.config.rules.winRule,
          formatStyle
        );

        const highlightBorder =
          isWinner || isSelected || isLockedTarget ? pal.main : "divider";

        return (
          <Paper
            key={lane.config.id || idx}
            id={`arena-lane-card-${idx}`}
            onClick={() => {
              if (isPreMatchChallenge && onSelectBetLane) {
                onSelectBetLane(idx);
              }
            }}
            sx={{
              display: "grid",
              gridTemplateRows: "52px 96px auto 48px",
              overflow: "hidden",
              cursor: isPreMatchChallenge ? "pointer" : "default",
              borderWidth: isSelected || isLockedTarget || isWinner ? "1.5px" : "1px",
              borderStyle: "solid",
              borderColor: highlightBorder,
              transition: "border-color 140ms ease, transform 140ms ease",
              "&:hover": isPreMatchChallenge
                ? {
                    borderColor: pal.main,
                  }
                : undefined,
            }}
          >
            {/* Row 1 (52px exact): Lane Index + Name + Odds/Status */}
            <Box
              sx={{
                px: 1.75,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                borderBottom: "1px solid",
                borderColor: "divider",
                bgcolor: isSelected || isLockedTarget ? pal.softBg : "transparent",
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", minWidth: 0 }}
              >
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    borderRadius: 1,
                    bgcolor: pal.main,
                    color: "#061018",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 800,
                    fontSize: "0.8rem",
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </Box>
                <Typography
                  variant="subtitle2"
                  noWrap
                  sx={{ fontWeight: 700, fontSize: "0.92rem" }}
                >
                  {lane.config.name}
                </Typography>
              </Stack>

              {mode === "challenge" ? (
                <Stack
                  direction="row"
                  spacing={0.75}
                  sx={{ alignItems: "center", flexShrink: 0 }}
                >
                  {isLockedTarget ? (
                    <Chip
                      size="small"
                      label={`已押 ×${(lockedOdds ?? odd).toFixed(2)}`}
                      sx={{
                        height: 24,
                        fontWeight: 700,
                        fontFamily: "var(--font-mono)",
                        bgcolor: pal.main,
                        color: "#061018",
                      }}
                    />
                  ) : (
                    <>
                      <Typography
                        variant="caption"
                        className="tabular-nums"
                        color="text.secondary"
                        sx={{ fontSize: "0.72rem" }}
                      >
                        {sharePct}%热度
                      </Typography>
                      <Box
                        sx={{
                          px: 1,
                          py: 0.3,
                          borderRadius: 1,
                          bgcolor: isSelected ? pal.main : pal.softBg,
                          color: isSelected ? "#061018" : pal.main,
                          fontFamily: "var(--font-mono)",
                          fontWeight: 800,
                          fontSize: "0.82rem",
                          lineHeight: 1.2,
                        }}
                      >
                        ×{odd.toFixed(2)}
                      </Box>
                    </>
                  )}
                </Stack>
              ) : (
                <Typography
                  variant="caption"
                  className="tabular-nums"
                  color="text.secondary"
                  sx={{ flexShrink: 0 }}
                >
                  {idx + 1}号实验道
                </Typography>
              )}
            </Box>

            {/* Row 2 (96px exact): 3 Strictly Aligned Parameter Rows */}
            <Box
              sx={{
                px: 1.75,
                py: 1,
                display: "grid",
                gridTemplateRows: "repeat(3, 24px)",
                alignContent: "center",
                borderBottom: "1px solid",
                borderColor: "divider",
                bgcolor: isDark
                  ? "rgba(255, 255, 255, 0.015)"
                  : "rgba(15, 23, 42, 0.018)",
              }}
            >
              {[
                { label: "起手", value: specs.start, accent: false },
                {
                  label: "增长",
                  value: specs.growth,
                  accent: lane.config.ball.triggers.length > 0,
                },
                { label: "装置", value: specs.mechanism, accent: false },
              ].map((row) => (
                <Box
                  key={row.label}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "38px minmax(0, 1fr)",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {row.label}
                  </Typography>
                  <Tooltip title={row.value} placement="top" enterDelay={500}>
                    <Typography
                      variant="caption"
                      noWrap
                      className="tabular-nums"
                      sx={{
                        fontSize: "0.78rem",
                        fontWeight: row.accent ? 700 : 500,
                        color: row.accent ? pal.main : "text.primary",
                      }}
                    >
                      {row.value}
                    </Typography>
                  </Tooltip>
                </Box>
              ))}
            </Box>

            {/* Row 3: High-DPI Physics Simulation Canvas */}
            <Box
              sx={{
                width: "100%",
                aspectRatio: `${LANE_WIDTH} / 440`,
                position: "relative",
                bgcolor: isDark ? "#0D1219" : "#F8FAFC",
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

            {/* Row 4 (48px exact): Pre-match Selection Footer OR Aligned 3-Col Telemetry */}
            {isPreMatchChallenge ? (
              <Box
                sx={{
                  px: 1.75,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.75,
                  borderTop: "1px solid",
                  borderColor: isSelected ? pal.main : "divider",
                  bgcolor: isSelected ? pal.main : "transparent",
                  color: isSelected ? "#061018" : "text.secondary",
                  fontWeight: 700,
                  fontSize: "0.84rem",
                  transition: "background-color 140ms ease, color 140ms ease",
                }}
              >
                {isSelected ? (
                  <>
                    <CheckCircleRoundedIcon sx={{ fontSize: 18 }} />
                    <span>已选此道获胜 · 赔率 ×{odd.toFixed(2)}</span>
                  </>
                ) : (
                  <>
                    <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 17 }} />
                    <span>点击预测此赛道获胜</span>
                  </>
                )}
              </Box>
            ) : (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  borderTop: "1px solid",
                  borderColor: "divider",
                  bgcolor: isDark
                    ? "rgba(255, 255, 255, 0.02)"
                    : "rgba(15, 23, 42, 0.02)",
                }}
              >
                {[
                  {
                    k: "球数",
                    v: formatBigFloat(lane.totalBallCount, formatStyle, 1),
                    accent: false,
                  },
                  {
                    k: "最大球值",
                    v: formatBigFloat(lane.maxBallValue, formatStyle, 2),
                    accent: true,
                  },
                  {
                    k: "破墙进度",
                    v: `${lane.brokenLayers}/${isEndless ? "∞" : lane.config.wall.totalLayers}`,
                    accent: false,
                  },
                ].map((cell, cIdx) => (
                  <Box
                    key={cell.k}
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      borderLeft: cIdx > 0 ? "1px solid" : "none",
                      borderColor: "divider",
                      px: 0.5,
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: "0.66rem", lineHeight: 1.15 }}
                    >
                      {cell.k}
                    </Typography>
                    <Typography
                      variant="caption"
                      noWrap
                      className="tabular-nums"
                      sx={{
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        lineHeight: 1.25,
                        color: cell.accent ? pal.main : "text.primary",
                      }}
                    >
                      {cell.v}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Paper>
        );
      })}
    </Box>
  );
}
