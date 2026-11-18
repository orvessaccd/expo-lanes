"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  IconButton,
  Stack,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import VolumeUpRoundedIcon from "@mui/icons-material/VolumeUpRounded";
import VolumeOffRoundedIcon from "@mui/icons-material/VolumeOffRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import CasinoRoundedIcon from "@mui/icons-material/CasinoRounded";
import ScienceRoundedIcon from "@mui/icons-material/ScienceRounded";
import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import {
  BigFloat,
  NumberFormatStyle,
  bf,
  bfAdd,
  bfCmp,
  bfMulNum,
  bfSubClampZero,
  formatBigFloat,
} from "@/engine/bigNumber";
import {
  PRESET_LEVELS,
  createDefaultSandboxConfig,
} from "@/engine/presets";
import {
  SIM_DT,
  createSimulation,
  stepSimulationOnce,
} from "@/engine/simulation";
import { soundEngine } from "@/engine/sound";
import type { MatchConfig, SimulationState } from "@/engine/types";
import type { OddsSummary } from "@/lib/storage";
import { decodeMatchFromUrlParam } from "@/lib/urlCodec";
import { useColorMode } from "@/theme/ThemeRegistry";
import BettingPanel, { BetSettlementInfo } from "./BettingPanel";
import ChallengeBrowser, { LevelWithOdds } from "./ChallengeBrowser";
import LeaderboardDialog from "./LeaderboardDialog";
import RaceArena from "./RaceArena";
import SandboxEditor from "./SandboxEditor";
import TelemetryChart from "./TelemetryChart";

type AppViewMode = "challenge" | "sandbox" | "browser";

const LS_BANKROLL = "expo-lanes:bankroll";
const LS_STREAK = "expo-lanes:streak";
const LS_MAX_STREAK = "expo-lanes:max-streak";
const LS_SOLVED = "expo-lanes:solved";
const LS_FORMAT = "expo-lanes:num-format";

function makeDefaultOdds(laneCount: number): OddsSummary {
  const share = Number((1 / laneCount).toFixed(4));
  const odd = Number((laneCount * 0.96).toFixed(2));
  return {
    laneBets: Array.from({ length: laneCount }, () => 20),
    totalBets: laneCount * 20,
    shares: Array.from({ length: laneCount }, () => share),
    odds: Array.from({ length: laneCount }, () => odd),
  };
}

interface LockedBetContext {
  laneIndex: number;
  stakeAmount: BigFloat;
  odds: number;
  settled: boolean;
}

export default function ExpoLanesApp() {
  const { mode: colorMode, toggleColorMode } = useColorMode();

  const [viewMode, setViewMode] = useState<AppViewMode>("challenge");
  const [formatStyle, setFormatStyle] = useState<NumberFormatStyle>("intl");
  const [soundOn, setSoundOn] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  // Player progression state
  const [bankroll, setBankroll] = useState<BigFloat>(() => bf(1000));
  const [streak, setStreak] = useState<number>(0);
  const [maxStreak, setMaxStreak] = useState<number>(0);
  const [solvedIds, setSolvedIds] = useState<Record<string, boolean>>({});

  // Levels & Active Match
  const [publicLevels, setPublicLevels] = useState<LevelWithOdds[]>([]);
  const [levelsLoading, setLevelsLoading] = useState<boolean>(false);
  const [challengeConfig, setChallengeConfig] = useState<MatchConfig>(() =>
    structuredClone(PRESET_LEVELS[0])
  );
  const [oddsSummary, setOddsSummary] = useState<OddsSummary>(() =>
    makeDefaultOdds(PRESET_LEVELS[0].lanes.length)
  );
  const [sandboxDraft, setSandboxDraft] = useState<MatchConfig>(() =>
    createDefaultSandboxConfig()
  );

  // Betting runtime state
  const [lockedBetLane, setLockedBetLane] = useState<number | null>(null);
  const [lockedOdds, setLockedOdds] = useState<number | null>(null);
  const [settlement, setSettlement] = useState<BetSettlementInfo | null>(null);
  const lockedBetRef = useRef<LockedBetContext | null>(null);

  // Simulation mutable engine ref + render tick state
  const activeConfig =
    viewMode === "sandbox" ? sandboxDraft : challengeConfig;
  const simRef = useRef<SimulationState>(createSimulation(activeConfig));
  const [, setRenderTick] = useState<number>(0);

  // Hydrate player state from localStorage
  useEffect(() => {
    try {
      const savedBank = window.localStorage.getItem(LS_BANKROLL);
      if (savedBank) setBankroll(bf(savedBank));
      const savedStreak = Number(window.localStorage.getItem(LS_STREAK) || 0);
      if (Number.isFinite(savedStreak)) setStreak(savedStreak);
      const savedMax = Number(window.localStorage.getItem(LS_MAX_STREAK) || 0);
      if (Number.isFinite(savedMax)) setMaxStreak(savedMax);
      const savedSolved = window.localStorage.getItem(LS_SOLVED);
      if (savedSolved) setSolvedIds(JSON.parse(savedSolved));
      const savedFmt = window.localStorage.getItem(LS_FORMAT);
      if (savedFmt === "intl" || savedFmt === "zh" || savedFmt === "sci") {
        setFormatStyle(savedFmt);
      }
    } catch {
      // ignore
    }
  }, []);

  const persistPlayerProgress = useCallback(
    (nextBank: BigFloat, nextStreak: number, nextMax: number) => {
      try {
        const raw =
          nextBank.sign <= 0 ? "0" : `${nextBank.m.toFixed(6)}e${nextBank.e}`;
        window.localStorage.setItem(LS_BANKROLL, raw);
        window.localStorage.setItem(LS_STREAK, String(nextStreak));
        window.localStorage.setItem(LS_MAX_STREAK, String(nextMax));
      } catch {
        // ignore
      }
    },
    []
  );

  const fetchPublicLevels = useCallback(async () => {
    setLevelsLoading(true);
    try {
      const res = await fetch("/api/levels");
      const data = await res.json();
      if (Array.isArray(data.levels)) {
        setPublicLevels(data.levels);
        const matchCurrent = (data.levels as LevelWithOdds[]).find(
          (l) => l.id === challengeConfig.id
        );
        if (matchCurrent) {
          setOddsSummary(matchCurrent.oddsSummary);
        }
      }
    } catch {
      // ignore offline
    } finally {
      setLevelsLoading(false);
    }
  }, [challengeConfig.id]);

  // Initial levels fetch & URL query param (?level=... / ?s=...) hydration
  useEffect(() => {
    fetchPublicLevels();

    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const levelParam = params.get("level");
    const encodedParam = params.get("s");

    const loadShared = async () => {
      if (levelParam) {
        try {
          const res = await fetch(`/api/levels/${encodeURIComponent(levelParam)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.level?.config) {
              setChallengeConfig(data.level.config);
              setOddsSummary(data.level.oddsSummary);
              simRef.current = createSimulation(data.level.config);
              setViewMode("challenge");
              setRenderTick((t) => t + 1);
              return;
            }
          }
        } catch {
          // fallback to ?s= below
        }
      }
      if (encodedParam) {
        const decoded = decodeMatchFromUrlParam(encodedParam);
        if (decoded) {
          setChallengeConfig(decoded);
          setOddsSummary(makeDefaultOdds(decoded.lanes.length));
          simRef.current = createSimulation(decoded);
          setViewMode("challenge");
          setRenderTick((t) => t + 1);
        }
      }
    };

    loadShared();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetMatchSimulation = useCallback((cfg: MatchConfig, autoRun = false) => {
    const fresh = createSimulation(cfg);
    if (autoRun) {
      fresh.status = "running";
    }
    simRef.current = fresh;
    lockedBetRef.current = null;
    setLockedBetLane(null);
    setLockedOdds(null);
    setSettlement(null);
    setRenderTick((t) => t + 1);
  }, []);

  // Settle bet when match finishes
  const checkAndSettleFinishedMatch = useCallback(
    (sim: SimulationState) => {
      if (sim.status !== "finished") return;
      const betCtx = lockedBetRef.current;
      if (!betCtx || betCtx.settled) return;
      betCtx.settled = true;

      const won = sim.winnerLaneIndex === betCtx.laneIndex;
      if (won) {
        const payout = bfMulNum(betCtx.stakeAmount, betCtx.odds);
        const netProfit = bfSubClampZero(payout, betCtx.stakeAmount);
        setBankroll((prev) => {
          // Stake was already deducted on lock, so add full payout back!
          const updated = bfAdd(prev, payout);
          const nextSt = streak + 1;
          const nextMax = Math.max(maxStreak, nextSt);
          setStreak(nextSt);
          setMaxStreak(nextMax);
          persistPlayerProgress(updated, nextSt, nextMax);
          return updated;
        });

        setSolvedIds((prev) => {
          const next = { ...prev, [sim.config.id]: true };
          try {
            window.localStorage.setItem(LS_SOLVED, JSON.stringify(next));
          } catch {
            // ignore
          }
          return next;
        });

        setSettlement({
          betLane: betCtx.laneIndex,
          stakeAmount: betCtx.stakeAmount,
          odds: betCtx.odds,
          won: true,
          payout,
          netDelta: netProfit,
        });
      } else {
        setStreak(0);
        persistPlayerProgress(bankroll, 0, maxStreak);
        setSettlement({
          betLane: betCtx.laneIndex,
          stakeAmount: betCtx.stakeAmount,
          odds: betCtx.odds,
          won: false,
          payout: bf(0),
          netDelta: betCtx.stakeAmount,
        });
      }
    },
    [bankroll, maxStreak, persistPlayerProgress, streak]
  );

  // Main 60FPS requestAnimationFrame loop driving 120Hz fixed steps
  useEffect(() => {
    let rafId = 0;
    let lastTs = performance.now();
    let accumulator = 0;

    const frame = (now: number) => {
      const rawDt = Math.min(0.1, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;

      const sim = simRef.current;
      const getStatus = (s: SimulationState) => s.status;
      if (getStatus(sim) === "running" && viewMode !== "browser") {
        accumulator += rawDt * speedMultiplier;
        const maxStepsThisFrame = Math.ceil(28 * speedMultiplier);
        let steps = 0;

        while (
          accumulator >= SIM_DT &&
          steps < maxStepsThisFrame &&
          getStatus(sim) === "running"
        ) {
          stepSimulationOnce(sim, true);
          accumulator -= SIM_DT;
          steps += 1;
        }

        if (sim.pendingSounds.length > 0) {
          soundEngine.playEvents(sim.pendingSounds);
          sim.pendingSounds = [];
        }

        if (getStatus(sim) === "finished") {
          checkAndSettleFinishedMatch(sim);
        }

        if (steps > 0) {
          setRenderTick((t) => (t + 1) % 1_000_000);
        }
      } else {
        accumulator = 0;
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, [checkAndSettleFinishedMatch, speedMultiplier, viewMode]);

  const handleSelectChallenge = (lvl: LevelWithOdds) => {
    setChallengeConfig(structuredClone(lvl.config));
    setOddsSummary(lvl.oddsSummary);
    setViewMode("challenge");
    resetMatchSimulation(lvl.config, false);
  };

  const handleSelectPresetPill = (preset: MatchConfig) => {
    const record = publicLevels.find((l) => l.id === preset.id);
    const cfg = structuredClone(preset);
    setChallengeConfig(cfg);
    setOddsSummary(
      record ? record.oddsSummary : makeDefaultOdds(cfg.lanes.length)
    );
    resetMatchSimulation(cfg, false);
  };

  const handleLockBetAndStart = async (
    laneIndex: number,
    stakeFraction: number
  ) => {
    const stakeAmt = bfMulNum(bankroll, Math.max(0.01, Math.min(1, stakeFraction)));
    const oddAtLock = oddsSummary.odds[laneIndex] ?? 2.0;

    // Deduct stake upfront
    const remaining = bfSubClampZero(bankroll, stakeAmt);
    setBankroll(remaining);
    persistPlayerProgress(remaining, streak, maxStreak);

    lockedBetRef.current = {
      laneIndex,
      stakeAmount: stakeAmt,
      odds: oddAtLock,
      settled: false,
    };
    setLockedBetLane(laneIndex);
    setLockedOdds(oddAtLock);
    setSettlement(null);

    simRef.current.status = "running";
    setRenderTick((t) => t + 1);

    // Asynchronously record bet on backend to update community parimutuel odds
    fetch(`/api/levels/${encodeURIComponent(challengeConfig.id)}/bet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        laneIndex,
        laneCount: challengeConfig.lanes.length,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.oddsSummary) {
          setOddsSummary(data.oddsSummary);
        }
      })
      .catch(() => {});
  };

  const handleSpectateStart = () => {
    lockedBetRef.current = null;
    setLockedBetLane(null);
    setLockedOdds(null);
    setSettlement(null);
    simRef.current.status = "running";
    setRenderTick((t) => t + 1);
  };

  const handleResetBankroll = () => {
    const fresh = bf(1000);
    setBankroll(fresh);
    setStreak(0);
    persistPlayerProgress(fresh, 0, maxStreak);
  };

  const handleNextPreset = () => {
    const curIdx = PRESET_LEVELS.findIndex((p) => p.id === challengeConfig.id);
    const nextPreset = PRESET_LEVELS[(curIdx + 1) % PRESET_LEVELS.length];
    handleSelectPresetPill(nextPreset);
  };

  const handleSwitchView = (nextView: AppViewMode) => {
    setViewMode(nextView);
    if (nextView === "sandbox") {
      resetMatchSimulation(sandboxDraft, false);
    } else if (nextView === "challenge") {
      resetMatchSimulation(challengeConfig, false);
    } else if (nextView === "browser") {
      fetchPublicLevels();
    }
  };

  const handleLoadIntoSandbox = (cfg: MatchConfig) => {
    const copy = structuredClone(cfg);
    copy.id = "sandbox-custom";
    copy.title = `${cfg.title} (改装版)`;
    setSandboxDraft(copy);
    setViewMode("sandbox");
    resetMatchSimulation(copy, false);
  };

  const handleSandboxDraftChange = (
    nextDraft: MatchConfig,
    restartSim = false
  ) => {
    setSandboxDraft(nextDraft);
    if (restartSim) {
      resetMatchSimulation(nextDraft, true);
    } else {
      simRef.current = createSimulation(nextDraft);
      setRenderTick((t) => t + 1);
    }
  };

  const handleTogglePlay = () => {
    const sim = simRef.current;
    if (sim.status === "running") {
      sim.status = "paused";
    } else if (sim.status === "paused" || sim.status === "ready") {
      sim.status = "running";
    }
    setRenderTick((t) => t + 1);
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top Digital Lab Navigation Bar */}
      <AppBar
        position="sticky"
        color="default"
        elevation={0}
        sx={{
          bgcolor: "background.paper",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Container maxWidth="xl">
          <Toolbar
            disableGutters
            sx={{
              minHeight: { xs: 58, md: 64 },
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1.5,
              py: 0.75,
            }}
          >
            {/* Brand Title (Single h1 for SEO) */}
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  width: 30,
                  height: 30,
                  borderRadius: 1.5,
                  bgcolor: "primary.main",
                  color: "#061018",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 800,
                  fontSize: "0.9rem",
                }}
              >
                xⁿ
              </Box>
              <Box>
                <Typography
                  component="h1"
                  sx={{
                    fontSize: { xs: "1rem", sm: "1.12rem" },
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.15,
                  }}
                >
                  Expo-Lanes
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: { xs: "none", sm: "block" }, lineHeight: 1.1 }}
                >
                  纯数字指数赛道实验室
                </Typography>
              </Box>
            </Stack>

            {/* Primary Mode Tabs */}
            <Tabs
              value={viewMode}
              onChange={(_, v) => handleSwitchView(v)}
              textColor="primary"
              indicatorColor="primary"
              sx={{ minHeight: 42 }}
            >
              <Tab
                id="nav-tab-challenge"
                value="challenge"
                icon={<CasinoRoundedIcon fontSize="small" />}
                iconPosition="start"
                label="竞猜挑战"
              />
              <Tab
                id="nav-tab-sandbox"
                value="sandbox"
                icon={<ScienceRoundedIcon fontSize="small" />}
                iconPosition="start"
                label="沙盒工坊"
              />
              <Tab
                id="nav-tab-browser"
                value="browser"
                icon={<ExploreRoundedIcon fontSize="small" />}
                iconPosition="start"
                label="挑战广场"
              />
            </Tabs>

            {/* Right Controls: Bankroll, Unit Switcher, Sound, Theme, Leaderboard */}
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Chip
                id="header-bankroll-chip"
                color="secondary"
                variant={bfCmp(bankroll, bf(1000)) > 0 ? "filled" : "outlined"}
                onClick={() => setLeaderboardOpen(true)}
                label={`筹码 ${formatBigFloat(bankroll, formatStyle, 2)} · ${streak}连胜`}
                sx={{ fontFamily: "var(--font-mono)", cursor: "pointer" }}
              />

              <ToggleButtonGroup
                size="small"
                exclusive
                value={formatStyle}
                onChange={(_, val) => {
                  if (val) {
                    setFormatStyle(val);
                    try {
                      window.localStorage.setItem(LS_FORMAT, val);
                    } catch {
                      // ignore
                    }
                  }
                }}
                sx={{ display: { xs: "none", md: "inline-flex" } }}
              >
                <ToggleButton value="intl" sx={{ px: 1, py: 0.35, fontSize: "0.74rem" }}>
                  K/M/B
                </ToggleButton>
                <ToggleButton value="zh" sx={{ px: 1, py: 0.35, fontSize: "0.74rem" }}>
                  万/亿
                </ToggleButton>
                <ToggleButton value="sci" sx={{ px: 1, py: 0.35, fontSize: "0.74rem" }}>
                  1eN
                </ToggleButton>
              </ToggleButtonGroup>

              <Tooltip title={soundOn ? "关闭碰撞音阶音效" : "开启碰撞音阶音效"}>
                <IconButton
                  id="toggle-sound-btn"
                  size="small"
                  color={soundOn ? "primary" : "default"}
                  onClick={() => {
                    const next = !soundOn;
                    setSoundOn(next);
                    soundEngine.setEnabled(next);
                  }}
                >
                  {soundOn ? (
                    <VolumeUpRoundedIcon fontSize="small" />
                  ) : (
                    <VolumeOffRoundedIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>

              <Tooltip
                title={
                  colorMode === "dark" ? "切换至浅色白昼主题" : "切换至深色实验室主题"
                }
              >
                <IconButton
                  id="toggle-theme-btn"
                  size="small"
                  onClick={toggleColorMode}
                >
                  {colorMode === "dark" ? (
                    <LightModeRoundedIcon fontSize="small" />
                  ) : (
                    <DarkModeRoundedIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>

              <Button
                id="open-leaderboard-btn"
                size="small"
                variant="outlined"
                startIcon={<EmojiEventsRoundedIcon fontSize="small" />}
                onClick={() => setLeaderboardOpen(true)}
                sx={{ display: { xs: "none", sm: "inline-flex" } }}
              >
                排行榜
              </Button>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      {/* Main Content Stage */}
      <Container maxWidth="xl" component="main" sx={{ py: 2.5, flexGrow: 1 }}>
        {viewMode === "browser" ? (
          <ChallengeBrowser
            levels={publicLevels}
            solvedIds={solvedIds}
            activeLevelId={challengeConfig.id}
            loading={levelsLoading}
            onRefresh={fetchPublicLevels}
            onSelectForChallenge={handleSelectChallenge}
            onLoadIntoSandbox={handleLoadIntoSandbox}
          />
        ) : (
          <Stack spacing={2}>
            {/* Preset Quick Selector Bar in Challenge Mode */}
            {viewMode === "challenge" && (
              <Box
                sx={{
                  display: "flex",
                  gap: 0.85,
                  overflowX: "auto",
                  pb: 0.5,
                }}
              >
                {PRESET_LEVELS.map((preset, idx) => {
                  const active = challengeConfig.id === preset.id;
                  const solved = Boolean(solvedIds[preset.id]);
                  return (
                    <Chip
                      key={preset.id}
                      id={`preset-pill-${idx + 1}`}
                      clickable
                      color={active ? "primary" : solved ? "success" : "default"}
                      variant={active ? "filled" : "outlined"}
                      label={
                        solved
                          ? `✓ ${preset.title.split(" · ")[0]} ${preset.title.split(" · ")[1] ?? ""}`
                          : preset.title
                      }
                      onClick={() => handleSelectPresetPill(preset)}
                      sx={{ flexShrink: 0 }}
                    />
                  );
                })}
              </Box>
            )}

            {/* Split Layout: Arena + Telemetry on Left, Betting / Sandbox Controls on Right */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  lg: "minmax(0, 1.55fr) minmax(360px, 0.95fr)",
                },
                gap: 2.25,
                alignItems: "start",
              }}
            >
              <Stack spacing={2}>
                <RaceArena
                  simState={simRef.current}
                  formatStyle={formatStyle}
                  speedMultiplier={speedMultiplier}
                  onSpeedChange={setSpeedMultiplier}
                  onTogglePlay={handleTogglePlay}
                  onReset={() => resetMatchSimulation(activeConfig, false)}
                  lockedBetLane={viewMode === "challenge" ? lockedBetLane : null}
                  lockedOdds={viewMode === "challenge" ? lockedOdds : null}
                />

                <TelemetryChart
                  telemetry={simRef.current.telemetry}
                  lanes={activeConfig.lanes}
                />
              </Stack>

              <Box sx={{ position: { lg: "sticky" }, top: { lg: 80 } }}>
                {viewMode === "challenge" ? (
                  <BettingPanel
                    config={challengeConfig}
                    simStatus={simRef.current.status}
                    winnerLaneIndex={simRef.current.winnerLaneIndex}
                    oddsSummary={oddsSummary}
                    bankroll={bankroll}
                    streak={streak}
                    maxStreak={maxStreak}
                    formatStyle={formatStyle}
                    lockedBetLane={lockedBetLane}
                    settlement={settlement}
                    onLockBetAndStart={handleLockBetAndStart}
                    onSpectateStart={handleSpectateStart}
                    onResetBankroll={handleResetBankroll}
                    onNextPreset={handleNextPreset}
                    onOpenInSandbox={() => handleLoadIntoSandbox(challengeConfig)}
                  />
                ) : (
                  <SandboxEditor
                    draft={sandboxDraft}
                    onDraftChange={handleSandboxDraftChange}
                    onPublishedLevel={(created) => {
                      setPublicLevels((prev) => [created, ...prev]);
                    }}
                  />
                )}
              </Box>
            </Box>
          </Stack>
        )}
      </Container>

      <LeaderboardDialog
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        bankroll={bankroll}
        maxStreak={maxStreak}
        formatStyle={formatStyle}
      />
    </Box>
  );
}
