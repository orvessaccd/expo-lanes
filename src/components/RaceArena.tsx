"use client";

import React, { useEffect, useEffectEvent, useMemo, useRef } from "react";
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
import { formatBigFloat, type NumberFormatStyle } from "@/engine/bigNumber";
import { LANE_HEIGHT, LANE_WIDTH } from "@/engine/simulation";
import type { LaneRuntimeState, SimulationState, WinRuleType } from "@/engine/types";
import { getLanePalettes, type LanePalette } from "@/theme/theme";
import { renderLaneCanvas } from "./laneCanvas";
import styles from "./RaceArena.module.css";

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

function LaneCanvas({
  lane,
  simState,
  palette,
  isDark,
  formatStyle,
}: {
  lane: LaneRuntimeState;
  simState: SimulationState;
  palette: LanePalette;
  isDark: boolean;
  formatStyle: NumberFormatStyle;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const displayWidth = useRef(0);
  const paint = useEffectEvent(() => {
    if (canvasRef.current && displayWidth.current > 0) {
      renderLaneCanvas(
        canvasRef.current, displayWidth.current, lane, simState, palette, isDark, formatStyle
      );
    }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      displayWidth.current = rect.width;
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      paint();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  // The engine mutates the same simulation object between React snapshots.
  useEffect(() => {
    paint();
  });

  return (
    <div className={styles.stage} style={{ aspectRatio: `${LANE_WIDTH} / ${LANE_HEIGHT}` }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`${lane.config.name}的小球、算符门和数字墙`}
      />
    </div>
  );
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
  const palettes = useMemo(() => getLanePalettes(theme.palette.mode), [theme.palette.mode]);

  const isTimed =
    simState.config.rules.winRule === "breakthrough_timed" ||
    simState.config.rules.winRule === "endless_timed";
  const isEndless = simState.config.rules.winRule === "endless_timed";
  const hasCoupling =
    simState.config.coupling.sabotageTransferPct > 0 ||
    simState.config.coupling.sharedPoolEnabled;

  return (
    <Paper sx={{
      p: { xs: 1, sm: 2 },
      minWidth: 0,
      "--arena-muted": theme.palette.text.secondary,
      "--arena-divider": theme.palette.divider,
      "--arena-paper": theme.palette.background.paper,
    }}>
      {/* Top Arena Control Bar */}
      <Stack
        direction="row"
        useFlexGap
        spacing={1.25}
        sx={{
          alignItems: "center",
          flexWrap: "wrap",
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

      {simState.lanes.length > 2 && (
        <div className={styles.swipeHint}>横向滑动查看全部赛道</div>
      )}
      <div
        className={styles.lanes}
        style={{ "--lane-count": simState.lanes.length } as React.CSSProperties}
        data-count={simState.lanes.length}
        role="region"
        aria-label="竞速赛道"
        tabIndex={simState.lanes.length > 2 ? 0 : undefined}
      >
        {simState.lanes.map((lane, idx) => {
          const palette = palettes[idx % palettes.length];
          return (
            <section
              key={lane.config.id || idx}
              className={styles.lane}
              aria-label={lane.config.name}
              style={{
                "--lane-color": palette.main,
                "--lane-tint": palette.softBg,
              } as React.CSSProperties}
            >
              <div className={styles.hud}>
                <div className={styles.heading}>
                  <h3 title={lane.config.name}>{lane.config.name}</h3>
                  {lockedBetLane === idx && (
                    <Chip size="small" color="secondary" label={`已押 ×${(lockedOdds ?? 1).toFixed(2)}`} />
                  )}
                </div>
                {lane.config.subtitle && <p>{lane.config.subtitle}</p>}
                <dl className={styles.stats}>
                  <div>
                    <dt>球数</dt>
                    <dd>{formatBigFloat(lane.totalBallCount, formatStyle, 1)}</dd>
                  </div>
                  <div>
                    <dt>最高球值</dt>
                    <dd>{formatBigFloat(lane.maxBallValue, formatStyle, 2)}</dd>
                  </div>
                  <div>
                    <dt>已破层</dt>
                    <dd>
                      {lane.brokenLayers}
                      <small> / {isEndless ? "∞" : lane.config.wall.totalLayers}</small>
                    </dd>
                  </div>
                </dl>
              </div>
              {!isEndless && (
                <progress
                  className={styles.progress}
                  aria-label={`${lane.config.name}破墙进度`}
                  value={lane.brokenLayers}
                  max={Math.max(1, lane.config.wall.totalLayers)}
                />
              )}
              <LaneCanvas
                lane={lane}
                simState={simState}
                palette={palette}
                isDark={isDark}
                formatStyle={formatStyle}
              />
            </section>
          );
        })}
      </div>
    </Paper>
  );
}
