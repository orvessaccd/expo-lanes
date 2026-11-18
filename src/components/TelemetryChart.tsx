"use client";

import React, { useMemo, useState } from "react";
import {
  Box,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import type { LaneConfig, TelemetrySample } from "@/engine/types";
import { getLanePalettes } from "@/theme/theme";

export interface TelemetryChartProps {
  telemetry: TelemetrySample[];
  lanes: LaneConfig[];
}

type ChartMetricMode = "log_power" | "broken_layers";

export default function TelemetryChart({
  telemetry,
  lanes,
}: TelemetryChartProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const palettes = getLanePalettes(theme.palette.mode);
  const [metricMode, setMetricMode] = useState<ChartMetricMode>("log_power");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 760;
  const height = 205;
  const padLeft = 48;
  const padRight = 18;
  const padTop = 16;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const bounds = useMemo(() => {
    if (telemetry.length === 0) {
      return { maxTime: 10, minY: 0, maxY: 6 };
    }
    const maxTime = Math.max(5, telemetry[telemetry.length - 1].time);
    let maxY = metricMode === "log_power" ? 4 : 5;

    for (const sample of telemetry) {
      for (const pt of sample.lanes) {
        if (metricMode === "log_power") {
          if (pt.outputLog10 > maxY) maxY = pt.outputLog10;
          if (pt.wallLog10 > maxY) maxY = pt.wallLog10;
        } else {
          if (pt.brokenLayers > maxY) maxY = pt.brokenLayers;
        }
      }
    }
    return {
      maxTime,
      minY: 0,
      maxY: Math.ceil(maxY * 1.08),
    };
  }, [telemetry, metricMode]);

  const toX = (t: number) => padLeft + (t / bounds.maxTime) * plotW;
  const toY = (val: number) => {
    const clamped = Math.max(bounds.minY, Math.min(bounds.maxY, val));
    const ratio = (clamped - bounds.minY) / Math.max(1e-6, bounds.maxY - bounds.minY);
    return padTop + plotH * (1 - ratio);
  };

  const yTicks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) =>
      Number(((bounds.maxY / count) * i).toFixed(1))
    );
  }, [bounds.maxY]);

  const activeSample =
    hoverIdx !== null && telemetry[hoverIdx]
      ? telemetry[hoverIdx]
      : telemetry[telemetry.length - 1];

  return (
    <Paper sx={{ p: 2 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
          mb: 1.25,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <ShowChartRoundedIcon fontSize="small" color="primary" />
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              实时对数遥测曲线（Live Telemetry）
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {metricMode === "log_power"
                ? "实线 = 各赛道总输出能力 log10 · 虚线 = 当前首层数字墙 log10（实线穿破虚线即破墙加速拐点）"
                : "随比赛时间推进的累计击碎数字墙层数对比"}
            </Typography>
          </Box>
        </Stack>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={metricMode}
          onChange={(_, val) => {
            if (val) setMetricMode(val);
          }}
        >
          <ToggleButton id="telemetry-mode-log" value="log_power" sx={{ px: 1.25, py: 0.4 }}>
            log₁₀ 输出/墙压
          </ToggleButton>
          <ToggleButton id="telemetry-mode-layers" value="broken_layers" sx={{ px: 1.25, py: 0.4 }}>
            累计破墙层数
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* Interactive SVG Telemetry Plot */}
      <Box
        sx={{ width: "100%", overflow: "hidden", userSelect: "none" }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          onMouseMove={(e) => {
            if (telemetry.length < 2) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * width;
            const tRatio = Math.max(0, Math.min(1, (relX - padLeft) / plotW));
            const targetTime = tRatio * bounds.maxTime;
            let bestIdx = 0;
            let bestDist = Infinity;
            telemetry.forEach((s, idx) => {
              const d = Math.abs(s.time - targetTime);
              if (d < bestDist) {
                bestDist = d;
                bestIdx = idx;
              }
            });
            setHoverIdx(bestIdx);
          }}
        >
          {/* Horizontal Reference Lines */}
          {yTicks.map((tick) => {
            const y = toY(tick);
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke={
                    isDark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.08)"
                  }
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  fontFamily="monospace"
                  fill={isDark ? "#94A3B8" : "#64748B"}
                >
                  {metricMode === "log_power" ? `10^${Math.round(tick)}` : Math.round(tick)}
                </text>
              </g>
            );
          })}

          {/* X-axis baseline & time labels */}
          <line
            x1={padLeft}
            y1={padTop + plotH}
            x2={width - padRight}
            y2={padTop + plotH}
            stroke={isDark ? "rgba(148,163,184,0.25)" : "rgba(15,23,42,0.18)"}
          />
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const t = bounds.maxTime * frac;
            const x = toX(t);
            return (
              <text
                key={frac}
                x={x}
                y={height - 7}
                textAnchor="middle"
                fontSize="10"
                fontFamily="monospace"
                fill={isDark ? "#94A3B8" : "#64748B"}
              >
                {t.toFixed(1)}s
              </text>
            );
          })}

          {/* Lane Curves */}
          {telemetry.length >= 2 &&
            lanes.map((lane, lIdx) => {
              const color = palettes[lIdx % palettes.length].main;

              if (metricMode === "log_power") {
                const powerPath = telemetry
                  .map(
                    (s, sIdx) =>
                      `${sIdx === 0 ? "M" : "L"}${toX(s.time).toFixed(1)},${toY(
                        s.lanes[lIdx]?.outputLog10 ?? 0
                      ).toFixed(1)}`
                  )
                  .join(" ");

                const wallPath = telemetry
                  .map(
                    (s, sIdx) =>
                      `${sIdx === 0 ? "M" : "L"}${toX(s.time).toFixed(1)},${toY(
                        s.lanes[lIdx]?.wallLog10 ?? 0
                      ).toFixed(1)}`
                  )
                  .join(" ");

                return (
                  <g key={lane.id || lIdx}>
                    <path
                      d={wallPath}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.3}
                      strokeDasharray="4 4"
                      opacity={0.42}
                    />
                    <path
                      d={powerPath}
                      fill="none"
                      stroke={color}
                      strokeWidth={2.3}
                      strokeLinejoin="round"
                    />
                  </g>
                );
              }

              const brokenPath = telemetry
                .map(
                  (s, sIdx) =>
                    `${sIdx === 0 ? "M" : "L"}${toX(s.time).toFixed(1)},${toY(
                      s.lanes[lIdx]?.brokenLayers ?? 0
                    ).toFixed(1)}`
                )
                .join(" ");

              return (
                <path
                  key={lane.id || lIdx}
                  d={brokenPath}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.3}
                  strokeLinejoin="round"
                />
              );
            })}

          {/* Hover Crosshair */}
          {activeSample && telemetry.length >= 2 && (
            <line
              x1={toX(activeSample.time)}
              y1={padTop}
              x2={toX(activeSample.time)}
              y2={padTop + plotH}
              stroke={isDark ? "rgba(226,232,240,0.35)" : "rgba(15,23,42,0.28)"}
              strokeDasharray="3 3"
            />
          )}
        </svg>
      </Box>

      {/* Compact Live Legend Readout */}
      {activeSample && (
        <Stack
          direction="row"
          spacing={2}
          useFlexGap
          sx={{ mt: 0.75, flexWrap: "wrap" }}
        >
          <Typography
            variant="caption"
            className="tabular-nums"
            color="text.secondary"
          >
            t = {activeSample.time.toFixed(2)}s:
          </Typography>
          {lanes.map((l, idx) => {
            const pt = activeSample.lanes[idx];
            const pal = palettes[idx % palettes.length];
            if (!pt) return null;
            return (
              <Typography
                key={l.id || idx}
                variant="caption"
                className="tabular-nums"
                sx={{ color: pal.main, fontWeight: 600 }}
              >
                {l.name} —{" "}
                {metricMode === "log_power"
                  ? `输出 10^${pt.outputLog10.toFixed(1)} / 墙 10^${pt.wallLog10.toFixed(1)}`
                  : `已碎 ${pt.brokenLayers} 层`}
              </Typography>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}
