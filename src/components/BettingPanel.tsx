"use client";

import React, { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Slider,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import CasinoRoundedIcon from "@mui/icons-material/CasinoRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import ScienceRoundedIcon from "@mui/icons-material/ScienceRounded";
import NavigateNextRoundedIcon from "@mui/icons-material/NavigateNextRounded";
import {
  BigFloat,
  NumberFormatStyle,
  bf,
  bfCmp,
  bfMulNum,
  formatBigFloat,
} from "@/engine/bigNumber";
import { formatGateSlotLabel } from "@/engine/simulation";
import type { LaneConfig, MatchConfig, SimulationState } from "@/engine/types";
import type { OddsSummary } from "@/lib/storage";
import { getLanePalettes } from "@/theme/theme";

export interface BetSettlementInfo {
  betLane: number;
  stakeAmount: BigFloat;
  odds: number;
  won: boolean;
  payout: BigFloat;
  netDelta: BigFloat;
}

export interface BettingPanelProps {
  config: MatchConfig;
  simStatus: SimulationState["status"];
  winnerLaneIndex: number | null;
  oddsSummary: OddsSummary;
  bankroll: BigFloat;
  streak: number;
  maxStreak: number;
  formatStyle: NumberFormatStyle;
  lockedBetLane: number | null;
  settlement: BetSettlementInfo | null;
  onLockBetAndStart: (laneIndex: number, stakeFraction: number) => void;
  onSpectateStart: () => void;
  onResetBankroll: () => void;
  onNextPreset: () => void;
  onOpenInSandbox: () => void;
}

function summarizeLaneMath(lane: LaneConfig, style: NumberFormatStyle): string {
  const parts: string[] = [];
  parts.push(
    `初球 ${lane.ball.initialCount}×${formatBigFloat(lane.ball.initialValue, style)}`
  );
  if (lane.ball.spawnPerSec > 0) {
    parts.push(`+${lane.ball.spawnPerSec}颗/s`);
  }
  if (lane.ball.overflowPenetration > 0) {
    parts.push(`穿透${Math.round(lane.ball.overflowPenetration * 100)}%`);
  }
  for (const t of lane.ball.triggers) {
    const cond =
      t.when === "wall_hits"
        ? `每${t.every}撞墙`
        : t.when === "boundary_hits"
          ? `每${t.every}弹边`
          : t.when === "time_sec"
            ? `每${t.every}s`
            : `每破${t.every}层`;
    const tgt =
      t.target === "ball_value"
        ? "值"
        : t.target === "ball_count"
          ? "球数"
          : "速度";
    const opSym =
      t.op === "add"
        ? `+${t.operand}${t.target === "ball_speed" ? "%" : ""}`
        : t.op === "mul"
          ? `×${t.operand}`
          : `^${t.operand}`;
    parts.push(`${cond}${tgt}${opSym}`);
  }
  for (const g of lane.gates) {
    if (g.layout === "dual" && g.rightSlot) {
      parts.push(
        `门[${formatGateSlotLabel(g.leftSlot, style)} | ${formatGateSlotLabel(g.rightSlot, style)}]`
      );
    } else {
      parts.push(`门[${formatGateSlotLabel(g.leftSlot, style)}]`);
    }
  }
  return parts.join(" · ");
}

export default function BettingPanel({
  config,
  simStatus,
  oddsSummary,
  bankroll,
  streak,
  maxStreak,
  formatStyle,
  lockedBetLane,
  settlement,
  onLockBetAndStart,
  onSpectateStart,
  onResetBankroll,
  onNextPreset,
  onOpenInSandbox,
}: BettingPanelProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const palettes = getLanePalettes(theme.palette.mode);

  const [selectedLane, setSelectedLane] = useState<number>(0);
  const [stakePct, setStakePct] = useState<number>(25);

  const safeSelected =
    selectedLane < config.lanes.length ? selectedLane : 0;
  const currentOdd = oddsSummary.odds[safeSelected] ?? 1.9;
  const stakeAmount = bfMulNum(bankroll, stakePct / 100);
  const potentialPayout = bfMulNum(stakeAmount, currentOdd);
  const isBankrupt = bfCmp(bankroll, bf(10)) < 0;
  const canPlaceBet = simStatus === "ready" && lockedBetLane === null && !isBankrupt;

  return (
    <Paper sx={{ p: 2.25, display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Header & Bankroll Summary */}
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <CasinoRoundedIcon color="secondary" fontSize="small" />
          <Typography variant="h3">纯数学赔率竞猜台</Typography>
        </Stack>
        {config.difficulty && (
          <Chip size="small" variant="outlined" label={`难度 · ${config.difficulty}`} />
        )}
      </Stack>

      <Box
        sx={{
          p: 1.5,
          borderRadius: 1.5,
          bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.03)",
          border: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary">
            持有数字筹码（支持指数复利）
          </Typography>
          <Typography
            variant="h2"
            className="tabular-nums"
            color="secondary.main"
          >
            {formatBigFloat(bankroll, formatStyle, 2)}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Chip
            size="small"
            color={streak > 0 ? "success" : "default"}
            label={`连胜 ${streak} (最高 ${maxStreak})`}
          />
          {isBankrupt && (
            <Button
              id="bankroll-rescue-btn"
              size="small"
              variant="contained"
              color="warning"
              startIcon={<RestartAltRoundedIcon />}
              onClick={onResetBankroll}
            >
              重置领 1,000
            </Button>
          )}
        </Stack>
      </Box>

      {/* Level Brief */}
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
          {config.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.84rem" }}>
          {config.description}
        </Typography>
      </Box>

      {/* Lane Formula Inspection & Dynamic Odds Selection */}
      <Stack spacing={1.15}>
        <Stack
          direction="row"
          sx={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            选择预测获胜赛道（全网共 {oddsSummary.totalBets} 次押注）
          </Typography>
        </Stack>

        {config.lanes.map((lane, idx) => {
          const pal = palettes[idx % palettes.length];
          const odd = oddsSummary.odds[idx] ?? 2.0;
          const sharePct = Math.round((oddsSummary.shares[idx] ?? 0.5) * 100);
          const active =
            lockedBetLane !== null ? lockedBetLane === idx : safeSelected === idx;

          return (
            <Box
              key={lane.id || idx}
              id={`bet-lane-card-${idx}`}
              onClick={() => {
                if (canPlaceBet) setSelectedLane(idx);
              }}
              sx={{
                p: 1.35,
                borderRadius: 1.5,
                cursor: canPlaceBet ? "pointer" : "default",
                border: "1.5px solid",
                borderColor: active ? pal.main : "divider",
                bgcolor: active ? pal.softBg : "transparent",
                transition: "border-color 140ms ease, background-color 140ms ease",
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", justifyContent: "space-between" }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", minWidth: 0 }}
                >
                  <Box
                    sx={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      bgcolor: pal.main,
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ fontWeight: 700 }}
                  >
                    {lane.name}
                  </Typography>
                </Stack>

                <Chip
                  size="small"
                  label={`赔率 ×${odd.toFixed(2)}`}
                  sx={{
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                    bgcolor: active ? pal.main : "action.hover",
                    color: active ? "#081018" : "text.primary",
                  }}
                />
              </Stack>

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 0.6, lineHeight: 1.45 }}
              >
                {summarizeLaneMath(lane, formatStyle)}
              </Typography>

              <Stack
                direction="row"
                spacing={1}
                sx={{ mt: 0.85, alignItems: "center" }}
              >
                <LinearProgress
                  variant="determinate"
                  value={sharePct}
                  sx={{
                    flexGrow: 1,
                    height: 5,
                    borderRadius: 3,
                    bgcolor: isDark
                      ? "rgba(255,255,255,0.07)"
                      : "rgba(15,23,42,0.08)",
                    "& .MuiLinearProgress-bar": {
                      bgcolor: pal.main,
                    },
                  }}
                />
                <Typography
                  variant="caption"
                  className="tabular-nums"
                  color="text.secondary"
                  sx={{ minWidth: 58, textAlign: "right" }}
                >
                  热度 {sharePct}%
                </Typography>
              </Stack>
            </Box>
          );
        })}
      </Stack>

      {/* Stake Controls (Pre-Match) */}
      {canPlaceBet && (
        <>
          <Divider />
          <Box>
            <Stack
              direction="row"
              sx={{
                justifyContent: "space-between",
                alignItems: "center",
                mb: 0.75,
              }}
            >
              <Typography variant="caption" color="text.secondary">
                投入筹码比例：<strong>{stakePct}%</strong>（
                {formatBigFloat(stakeAmount, formatStyle, 2)}）
              </Typography>
              <Typography
                variant="caption"
                className="tabular-nums"
                color="success.main"
                sx={{ fontWeight: 700 }}
              >
                命中返还：{formatBigFloat(potentialPayout, formatStyle, 2)}
              </Typography>
            </Stack>

            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              {[
                { label: "10%", val: 10 },
                { label: "25%", val: 25 },
                { label: "50%", val: 50 },
                { label: "MAX 梭哈", val: 100 },
              ].map((preset) => (
                <Button
                  key={preset.val}
                  id={`stake-pct-btn-${preset.val}`}
                  size="small"
                  fullWidth
                  variant={stakePct === preset.val ? "contained" : "outlined"}
                  color={preset.val === 100 ? "secondary" : "primary"}
                  onClick={() => setStakePct(preset.val)}
                >
                  {preset.label}
                </Button>
              ))}
            </Stack>

            <Slider
              size="small"
              min={5}
              max={100}
              step={5}
              value={stakePct}
              onChange={(_, v) => setStakePct(v as number)}
              aria-label="筹码投入比例"
            />

            <Stack spacing={1} sx={{ mt: 1 }}>
              <Button
                id="lock-bet-and-start-btn"
                variant="contained"
                color="secondary"
                size="large"
                fullWidth
                onClick={() => onLockBetAndStart(safeSelected, stakePct / 100)}
                sx={{ py: 1.15, fontWeight: 700 }}
              >
                锁定预测【{config.lanes[safeSelected]?.name}】并开赛
              </Button>
              <Button
                id="spectate-without-bet-btn"
                variant="text"
                size="small"
                color="inherit"
                onClick={onSpectateStart}
              >
                不押筹码 · 纯观战验证数学结果
              </Button>
            </Stack>
          </Box>
        </>
      )}

      {/* Post-Match Settlement & Math Insight Card */}
      {simStatus === "finished" && (
        <>
          <Divider />
          <Box
            sx={{
              p: 1.6,
              borderRadius: 1.5,
              bgcolor: settlement
                ? settlement.won
                  ? isDark
                    ? "rgba(16, 217, 136, 0.11)"
                    : "rgba(7, 138, 82, 0.08)"
                  : isDark
                    ? "rgba(244, 63, 94, 0.11)"
                    : "rgba(225, 29, 72, 0.08)"
                : "action.hover",
              border: "1px solid",
              borderColor: settlement
                ? settlement.won
                  ? "success.main"
                  : "error.main"
                : "divider",
            }}
          >
            {settlement ? (
              <Stack spacing={0.5} sx={{ mb: 1.25 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                  <EmojiEventsRoundedIcon
                    fontSize="small"
                    color={settlement.won ? "success" : "error"}
                  />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {settlement.won
                      ? `预测命中！按 ×${settlement.odds.toFixed(2)} 结算复利`
                      : "预测落空！遭遇反直觉数学翻盘"}
                  </Typography>
                </Stack>
                <Typography
                  variant="body2"
                  className="tabular-nums"
                  sx={{
                    fontWeight: 700,
                    color: settlement.won ? "success.main" : "error.main",
                  }}
                >
                  筹码变动：{settlement.won ? "+" : "-"}
                  {formatBigFloat(settlement.netDelta, formatStyle, 2)}（派彩{" "}
                  {formatBigFloat(settlement.payout, formatStyle, 2)}）
                </Typography>
              </Stack>
            ) : (
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                观战完毕 · 本局数学复盘
              </Typography>
            )}

            {config.mathInsight && (
              <Box
                sx={{
                  p: 1.15,
                  borderRadius: 1,
                  bgcolor: isDark
                    ? "rgba(11, 14, 19, 0.55)"
                    : "rgba(255, 255, 255, 0.75)",
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", lineHeight: 1.55 }}
                >
                  📐 <strong>数学原理拆解：</strong>
                  {config.mathInsight}
                </Typography>
              </Box>
            )}

            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button
                id="next-challenge-btn"
                variant="contained"
                size="small"
                fullWidth
                endIcon={<NavigateNextRoundedIcon />}
                onClick={onNextPreset}
              >
                下一道数学题
              </Button>
              <Button
                id="inspect-in-sandbox-btn"
                variant="outlined"
                size="small"
                fullWidth
                startIcon={<ScienceRoundedIcon />}
                onClick={onOpenInSandbox}
              >
                进沙盒改参数
              </Button>
            </Stack>
          </Box>
        </>
      )}
    </Paper>
  );
}
