"use client";

import React, { useMemo } from "react";
import {
  Box,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import RadioButtonUncheckedRoundedIcon from "@mui/icons-material/RadioButtonUncheckedRounded";
import { formatBigFloat, type NumberFormatStyle } from "@/engine/bigNumber";
import type { SimulationState } from "@/engine/types";
import type { OddsSummary } from "@/lib/storage";
import { getLanePalettes } from "@/theme/theme";
import LaneSurface from "./LaneSurface";
import { getLaneAlignedSpecs } from "./formulaFormat";

const narrowCard = "@container (max-width: 275px)";

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
  const palettes = useMemo(() => getLanePalettes(theme.palette.mode), [theme.palette.mode]);
  const { config } = simState;
  const specsByLane = useMemo(
    () => config.lanes.map(lane =>
      getLaneAlignedSpecs(lane, wallsIdentical, config.rules.winRule, formatStyle)
    ),
    [config, wallsIdentical, formatStyle]
  );
  const isEndless = simState.config.rules.winRule === "endless_timed";
  const isPreMatchChallenge =
    mode === "challenge" && simState.status === "ready";

  const laneCount = simState.lanes.length;
  return (
    <Box
      role="region"
      aria-label="竞速赛道"
      tabIndex={laneCount > 2 ? 0 : undefined}
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: laneCount > 2 ? `repeat(${laneCount}, calc((100% - 22px) / 2))` : "repeat(2, minmax(0, 1fr))",
          sm: `repeat(${laneCount}, minmax(0, 1fr))`,
        },
        minWidth: 0,
        columnGap: { xs: 0.75, sm: 2 },
        rowGap: { xs: 0.5, sm: 0 },
        alignItems: "stretch",
        overflowX: { xs: "auto", sm: "visible" },
        scrollSnapType: "x proximity",
        overscrollBehaviorX: "contain",
        scrollbarWidth: "thin",
        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" },
      }}
    >
      {laneCount > 2 && (
        <Typography
          component="p"
          variant="caption"
          color="text.secondary"
          sx={{
            display: { xs: "block", sm: "none" },
            gridColumn: "1 / 3",
            gridRow: 1,
            textAlign: "right",
          }}
        >
          横向滑动查看全部赛道
        </Typography>
      )}
      {simState.lanes.map((lane, idx) => {
        const pal = palettes[idx % palettes.length];
        const odd = oddsSummary?.odds[idx] ?? 2.0;
        const sharePct = Math.round((oddsSummary?.shares[idx] ?? 0.5) * 100);
        const isSelected = isPreMatchChallenge && selectedBetLane === idx;
        const isLockedTarget = lockedBetLane === idx;
        const isWinner =
          simState.status === "finished" && simState.winnerLaneIndex === idx;

        const specs = specsByLane[idx];
        const namePrefix = `${idx + 1}号 · `;
        const fullName = lane.config.name || pal.label;
        const name = fullName.startsWith(namePrefix)
          ? fullName.slice(namePrefix.length) || fullName
          : fullName;

        const highlightBorder =
          isWinner || isSelected || isLockedTarget ? pal.main : "divider";

        return (
          <Paper
            key={lane.config.id || idx}
            component="section"
            aria-label={fullName}
            id={`arena-lane-card-${idx}`}
            onClick={() => {
              if (isPreMatchChallenge && onSelectBetLane) {
                onSelectBetLane(idx);
              }
            }}
            sx={{
              display: "grid",
              minWidth: 0,
              containerType: "inline-size",
              scrollSnapAlign: "start",
              gridRow: { xs: laneCount > 2 ? 2 : 1, sm: 1 },
              gridTemplateRows: "52px 96px auto 48px",
              overflow: "hidden",
              cursor: isPreMatchChallenge ? "pointer" : "default",
              borderWidth: "1px",
              boxShadow: isSelected || isLockedTarget || isWinner ? `inset 0 0 0 1px ${pal.main}` : undefined,
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
                px: { xs: 1, sm: 1.5 },
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                [narrowCard]: { gridTemplateColumns: "minmax(0, 1fr)", gap: 0.25 },
                alignItems: "center",
                alignContent: "center",
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
                    [narrowCard]: { width: 18, height: 18, fontSize: "0.72rem" },
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
                  title={fullName}
                  sx={{ fontWeight: 700, fontSize: { xs: "0.84rem", sm: "0.92rem" } }}
                >
                  {name}
                </Typography>
              </Stack>

              {mode === "challenge" ? (
                <Stack
                  direction="row"
                  spacing={0.75}
                  sx={{ alignItems: "center", [narrowCard]: { pl: "26px" } }}
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
                  sx={{ [narrowCard]: { pl: "26px" } }}
                >
                  {idx + 1}号实验道
                </Typography>
              )}
            </Box>

            {/* Row 2 (96px exact): 3 Strictly Aligned Parameter Rows */}
            <Box
              sx={{
                px: { xs: 1, sm: 1.5 },
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
                    gridTemplateColumns: { xs: "26px minmax(0, 1fr)", sm: "38px minmax(0, 1fr)" },
                    alignItems: "center",
                    gap: { xs: 0.5, sm: 1 },
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
            <LaneSurface lane={lane} sim={simState} palette={pal} dark={isDark} format={formatStyle} />

            {/* Row 4 (48px exact): Pre-match Selection Footer OR Aligned 3-Col Telemetry */}
            {isPreMatchChallenge ? (
              <Box
                component="button"
                type="button"
                aria-pressed={isSelected}
                aria-label={`预测${fullName}获胜，赔率 ${odd.toFixed(2)}`}
                sx={{
                  cursor: "pointer",
                  border: 0,
                  fontFamily: "inherit",
                  px: { xs: 0.5, sm: 1.75 },
                  "&:focus-visible": { outline: "2px solid currentColor", outlineOffset: "-4px" },
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
                    <span>已选 · 赔率 ×{odd.toFixed(2)}</span>
                  </>
                ) : (
                  <>
                    <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 17 }} />
                    <span>选择此赛道</span>
                  </>
                )}
              </Box>
            ) : (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  position: "relative",
                  borderTop: "1px solid",
                  borderColor: "divider",
                  bgcolor: isDark
                    ? "rgba(255, 255, 255, 0.02)"
                    : "rgba(15, 23, 42, 0.02)",
                }}
              >
                {!isEndless && (
                  <LinearProgress
                    variant="determinate"
                    aria-label={`${fullName}破墙进度`}
                    value={Math.min(100, lane.brokenLayers / Math.max(1, lane.config.wall.totalLayers) * 100)}
                    sx={{
                      position: "absolute",
                      insetInline: 0,
                      top: 0,
                      height: 2,
                      bgcolor: pal.softBg,
                      "& .MuiLinearProgress-bar": { bgcolor: pal.main },
                    }}
                  />
                )}
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
                      title={cell.v}
                      className="tabular-nums"
                      sx={{
                        maxWidth: "100%",
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
