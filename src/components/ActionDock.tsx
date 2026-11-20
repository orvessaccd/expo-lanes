"use client";

import React, { useState } from "react";
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
import NavigateNextRoundedIcon from "@mui/icons-material/NavigateNextRounded";
import ScienceRoundedIcon from "@mui/icons-material/ScienceRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import {
  BigFloat,
  NumberFormatStyle,
  bf,
  bfCmp,
  bfMulNum,
  formatBigFloat,
} from "@/engine/bigNumber";
import type { MatchConfig, SimulationState } from "@/engine/types";
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

export interface ActionDockProps {
  mode: "challenge" | "sandbox";
  config: MatchConfig;
  simState: SimulationState;
  formatStyle: NumberFormatStyle;
  speedMultiplier: number;
  onSpeedChange: (speed: number) => void;
  onTogglePlay: () => void;
  onReset: () => void;
  // Challenge-specific props
  oddsSummary?: OddsSummary;
  bankroll?: BigFloat;
  selectedBetLane?: number;
  lockedBetLane?: number | null;
  lockedOdds?: number | null;
  settlement?: BetSettlementInfo | null;
  onLockBetAndStart?: (laneIndex: number, stakeFraction: number) => void;
  onSpectateStart?: () => void;
  onResetBankroll?: () => void;
  onNextPreset?: () => void;
  onOpenInSandbox?: () => void;
}

const STAKE_OPTIONS = [
  { label: "10%", val: 10 },
  { label: "25%", val: 25 },
  { label: "50%", val: 50 },
  { label: "MAX", val: 100 },
];

export default function ActionDock({
  mode,
  config,
  simState,
  formatStyle,
  speedMultiplier,
  onSpeedChange,
  onTogglePlay,
  onReset,
  oddsSummary,
  bankroll = bf(1000),
  selectedBetLane = 0,
  lockedBetLane = null,
  lockedOdds = null,
  settlement = null,
  onLockBetAndStart,
  onSpectateStart,
  onResetBankroll,
  onNextPreset,
  onOpenInSandbox,
}: ActionDockProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const palettes = getLanePalettes(theme.palette.mode);
  const [stakePct, setStakePct] = useState<number>(25);

  const isTimed =
    config.rules.winRule === "breakthrough_timed" ||
    config.rules.winRule === "endless_timed";
  const timeText = isTimed
    ? `${simState.elapsedSec.toFixed(2)}s / ${config.rules.timeLimitSec}s`
    : `${simState.elapsedSec.toFixed(2)}s`;

  const safeLaneIdx =
    selectedBetLane < config.lanes.length ? selectedBetLane : 0;
  const activePal = palettes[safeLaneIdx % palettes.length];
  const currentOdd = oddsSummary?.odds[safeLaneIdx] ?? 2.0;
  const stakeAmount = bfMulNum(bankroll, stakePct / 100);
  const potentialPayout = bfMulNum(stakeAmount, currentOdd);
  const isBankrupt = bfCmp(bankroll, bf(1)) < 0;

  // 1. CHALLENGE PRE-MATCH DOCK (Single clean horizontal bar)
  if (mode === "challenge" && simState.status === "ready") {
    return (
      <Paper
        sx={{
          px: { xs: 2, md: 2.5 },
          py: 1.75,
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "minmax(0, 1fr) auto auto",
          },
          alignItems: "center",
          gap: 2,
        }}
      >
        {/* Left: Selected Lane Summary */}
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              bgcolor: activePal.main,
              flexShrink: 0,
            }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>
              预测获胜：{safeLaneIdx + 1}号 · {config.lanes[safeLaneIdx]?.name}
            </Typography>
            <Typography
              variant="caption"
              className="tabular-nums"
              color="text.secondary"
              sx={{ display: "block" }}
            >
              赔率 ×{currentOdd.toFixed(2)} · 投入{" "}
              <strong>{formatBigFloat(stakeAmount, formatStyle, 2)}</strong> → 命中返还{" "}
              <Box component="span" sx={{ color: "success.main", fontWeight: 700 }}>
                {formatBigFloat(potentialPayout, formatStyle, 2)}
              </Box>
            </Typography>
          </Box>
        </Stack>

        {/* Center: Uniform Stake Ratio Selector */}
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: { xs: "none", lg: "inline" }, fontWeight: 600 }}
          >
            仓位
          </Typography>
          <ButtonGroup size="small" aria-label="投入筹码比例">
            {STAKE_OPTIONS.map((opt) => (
              <Button
                key={opt.val}
                id={`stake-pct-btn-${opt.val}`}
                variant={stakePct === opt.val ? "contained" : "outlined"}
                color={opt.val === 100 ? "secondary" : "primary"}
                onClick={() => setStakePct(opt.val)}
                sx={{ height: 36, minWidth: 54, fontWeight: 700 }}
              >
                {opt.label}
              </Button>
            ))}
          </ButtonGroup>
        </Stack>

        {/* Right: Primary Start Action */}
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {isBankrupt ? (
            <Button
              id="bankroll-rescue-btn"
              variant="contained"
              color="warning"
              startIcon={<RestartAltRoundedIcon />}
              onClick={onResetBankroll}
              sx={{ height: 38, px: 2.25, fontWeight: 700 }}
            >
              破产重置领 1,000
            </Button>
          ) : (
            <Button
              id="lock-bet-and-start-btn"
              variant="contained"
              color="secondary"
              startIcon={<PlayArrowRoundedIcon />}
              onClick={() =>
                onLockBetAndStart?.(safeLaneIdx, stakePct / 100)
              }
              sx={{ height: 38, px: 2.5, fontWeight: 800 }}
            >
              下注并开赛
            </Button>
          )}
          <Button
            id="spectate-without-bet-btn"
            variant="outlined"
            color="inherit"
            onClick={onSpectateStart}
            sx={{ height: 38, px: 1.75 }}
          >
            仅观战
          </Button>
        </Stack>
      </Paper>
    );
  }

  // 2. CHALLENGE POST-MATCH SETTLEMENT & INSIGHT DOCK
  if (mode === "challenge" && simState.status === "finished") {
    return (
      <Paper
        sx={{
          p: { xs: 2, md: 2.25 },
          borderColor: settlement
            ? settlement.won
              ? "success.main"
              : "error.main"
            : "primary.main",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          sx={{
            alignItems: { xs: "flex-start", md: "center" },
            justifyContent: "space-between",
          }}
        >
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
            <EmojiEventsRoundedIcon
              color={
                settlement ? (settlement.won ? "success" : "error") : "primary"
              }
            />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.25 }}>
                {simState.winReason || "本局演算结束"}
              </Typography>
              {settlement ? (
                <Typography
                  variant="body2"
                  className="tabular-nums"
                  sx={{
                    fontWeight: 700,
                    color: settlement.won ? "success.main" : "error.main",
                    mt: 0.25,
                  }}
                >
                  {settlement.won
                    ? `预测命中！按 ×${settlement.odds.toFixed(2)} 净赚 +${formatBigFloat(settlement.netDelta, formatStyle, 2)}（派彩 ${formatBigFloat(settlement.payout, formatStyle, 2)}）`
                    : `预测落空（损失 ${formatBigFloat(settlement.netDelta, formatStyle, 2)} 筹码）`}
                </Typography>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  纯观战模式 · 未消耗筹码
                </Typography>
              )}
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Button
              id="arena-reset-btn"
              size="small"
              variant="outlined"
              startIcon={<ReplayRoundedIcon />}
              onClick={onReset}
              sx={{ height: 36 }}
            >
              重播
            </Button>
            <Button
              id="inspect-in-sandbox-btn"
              size="small"
              variant="outlined"
              startIcon={<ScienceRoundedIcon />}
              onClick={onOpenInSandbox}
              sx={{ height: 36 }}
            >
              进沙盒改参数
            </Button>
            <Button
              id="next-challenge-btn"
              size="small"
              variant="contained"
              endIcon={<NavigateNextRoundedIcon />}
              onClick={onNextPreset}
              sx={{ height: 36, px: 2, fontWeight: 700 }}
            >
              下一关
            </Button>
          </Stack>
        </Stack>

        {config.mathInsight && (
          <Box
            sx={{
              mt: 1.5,
              px: 1.75,
              py: 1.15,
              borderRadius: 1.5,
              bgcolor: isDark
                ? "rgba(255, 255, 255, 0.03)"
                : "rgba(15, 23, 42, 0.035)",
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", lineHeight: 1.6, fontSize: "0.8rem" }}
            >
              📐 <strong style={{ color: isDark ? "#F8FAFC" : "#0F172A" }}>数学揭秘：</strong>
              {config.mathInsight}
            </Typography>
          </Box>
        )}
      </Paper>
    );
  }

  // 3. LIVE PLAYBACK / SANDBOX CONTROL DOCK (Single aligned 56px bar)
  return (
    <Paper
      sx={{
        px: { xs: 2, md: 2.5 },
        py: 1.35,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1.5,
      }}
    >
      {/* Left: Status & Timer */}
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
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
            simState.status === "running"
              ? "120Hz 运算中"
              : simState.status === "paused"
                ? "已暂停"
                : simState.status === "finished"
                  ? "演算完毕"
                  : "待启动"
          }
          sx={{ height: 26, fontWeight: 700 }}
        />
        <Typography
          variant="body2"
          className="tabular-nums"
          sx={{ fontWeight: 700, minWidth: 110 }}
        >
          ⏱ {timeText}
        </Typography>
        {mode === "challenge" && lockedBetLane !== null && (
          <Chip
            size="small"
            color="secondary"
            variant="outlined"
            label={`已押 ${lockedBetLane + 1}号道 ×${(lockedOdds ?? 1).toFixed(2)}`}
            sx={{ height: 26, fontFamily: "var(--font-mono)" }}
          />
        )}
        {mode === "sandbox" && simState.status === "finished" && simState.winReason && (
          <Typography
            variant="caption"
            color="success.main"
            sx={{ fontWeight: 700 }}
          >
            {simState.winReason}
          </Typography>
        )}
      </Stack>

      {/* Center + Right: Speed Group & Play/Reset */}
      <Stack direction="row" spacing={1.25} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <ButtonGroup size="small" aria-label="倍速切换">
          {[0.5, 1, 2, 4].map((spd) => (
            <Button
              key={spd}
              id={`speed-btn-${spd}x`}
              variant={speedMultiplier === spd ? "contained" : "outlined"}
              onClick={() => onSpeedChange(spd)}
              sx={{ height: 34, minWidth: 44 }}
            >
              {spd}x
            </Button>
          ))}
        </ButtonGroup>

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
          sx={{ height: 34, px: 1.75, fontWeight: 700 }}
        >
          {simState.status === "running"
            ? "暂停"
            : simState.status === "paused"
              ? "继续"
              : "运行测试"}
        </Button>

        <Button
          id="arena-reset-btn"
          size="small"
          variant="outlined"
          startIcon={<ReplayRoundedIcon />}
          onClick={onReset}
          sx={{ height: 34 }}
        >
          重置
        </Button>
      </Stack>
    </Paper>
  );
}
