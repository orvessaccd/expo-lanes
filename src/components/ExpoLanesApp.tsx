"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Chip,
  Collapse,
  Container,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Popover,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Typography,
} from "@mui/material";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import {
  BigFloat,
  NumberFormatStyle,
  bf,
  bfAdd,
  bfMulNum,
  bfSubClampZero,
  formatBigFloat,
} from "@/engine/bigNumber";
import { PRESET_LEVELS, createDefaultSandboxConfig } from "@/engine/presets";
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
import ActionDock, { BetSettlementInfo } from "./ActionDock";
import ChallengeBrowser, { LevelWithOdds } from "./ChallengeBrowser";
import LeaderboardDialog from "./LeaderboardDialog";
import RaceArena from "./RaceArena";
import SandboxEditor from "./SandboxEditor";
import TelemetryChart from "./TelemetryChart";
import { getMatchHeaderSummary } from "./formulaFormat";

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

interface SimSnapshot {
  sim: SimulationState;
  telemetry: SimulationState["telemetry"];
  status: SimulationState["status"];
  winnerLaneIndex: number | null;
  tick: number;
}

function makeSimSnapshot(sim: SimulationState, tick = 0): SimSnapshot {
  return {
    sim,
    telemetry: [...sim.telemetry],
    status: sim.status,
    winnerLaneIndex: sim.winnerLaneIndex,
    tick,
  };
}

export default function ExpoLanesApp() {
  const { mode: colorMode, setColorMode } = useColorMode();

  const [viewMode, setViewMode] = useState<AppViewMode>("challenge");
  const [formatStyle, setFormatStyle] = useState<NumberFormatStyle>("intl");
  const [soundOn, setSoundOn] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(false);

  // Menus & Popovers
  const [prefsAnchor, setPrefsAnchor] = useState<HTMLElement | null>(null);
  const [levelMenuAnchor, setLevelMenuAnchor] = useState<HTMLElement | null>(null);

  // Player progression state
  const [bankroll, setBankroll] = useState<BigFloat>(() => bf(1000));
  const [streak, setStreak] = useState<number>(0);
  const [maxStreak, setMaxStreak] = useState<number>(0);
  const [solvedIds, setSolvedIds] = useState<Record<string, boolean>>({});

  // Levels & Active Match
  const [publicLevels, setPublicLevels] = useState<LevelWithOdds[]>([]);
  const [levelsLoading, setLevelsLoading] = useState<boolean>(true);
  const [challengeConfig, setChallengeConfig] = useState<MatchConfig>(() =>
    structuredClone(PRESET_LEVELS[0])
  );
  const [oddsSummary, setOddsSummary] = useState<OddsSummary>(() =>
    makeDefaultOdds(PRESET_LEVELS[0].lanes.length)
  );
  const [sandboxDraft, setSandboxDraft] = useState<MatchConfig>(() =>
    createDefaultSandboxConfig()
  );

  // Betting selection & lock state
  const [selectedBetLane, setSelectedBetLane] = useState<number>(0);
  const [lockedBetLane, setLockedBetLane] = useState<number | null>(null);
  const [lockedOdds, setLockedOdds] = useState<number | null>(null);
  const [settlement, setSettlement] = useState<BetSettlementInfo | null>(null);
  const lockedBetRef = useRef<LockedBetContext | null>(null);

  // Simulation mutable engine ref + React snapshot state
  const activeConfig =
    viewMode === "sandbox" ? sandboxDraft : challengeConfig;
  const [simSnapshot, setSimSnapshot] = useState<SimSnapshot>(() =>
    makeSimSnapshot(createSimulation(PRESET_LEVELS[0]), 0)
  );
  const simRef = useRef<SimulationState>(simSnapshot.sim);

  const syncSimSnapshot = useCallback((sim: SimulationState) => {
    setSimSnapshot((prev) => ({
      sim,
      telemetry:
        prev.sim === sim && prev.telemetry.length === sim.telemetry.length
          ? prev.telemetry
          : [...sim.telemetry],
      status: sim.status,
      winnerLaneIndex: sim.winnerLaneIndex,
      tick: (prev.tick + 1) % 1_000_000,
    }));
  }, []);

  // Hydrate player state from localStorage asynchronously
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
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
    });
    return () => {
      cancelled = true;
    };
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
    let cancelled = false;

    const bootstrap = async () => {
      const defaultId = PRESET_LEVELS[0].id;
      try {
        const res = await fetch("/api/levels");
        const data = await res.json();
        if (!cancelled && Array.isArray(data.levels)) {
          setPublicLevels(data.levels);
          const matchCurrent = (data.levels as LevelWithOdds[]).find(
            (l) => l.id === defaultId
          );
          if (matchCurrent) {
            setOddsSummary(matchCurrent.oddsSummary);
          }
        }
      } catch {
        // ignore offline
      } finally {
        if (!cancelled) setLevelsLoading(false);
      }

      if (cancelled || typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const levelParam = params.get("level");
      const encodedParam = params.get("s");

      if (levelParam) {
        try {
          const res = await fetch(`/api/levels/${encodeURIComponent(levelParam)}`);
          if (res.ok) {
            const data = await res.json();
            if (!cancelled && data.level?.config) {
              const fresh = createSimulation(data.level.config);
              simRef.current = fresh;
              setChallengeConfig(data.level.config);
              setOddsSummary(data.level.oddsSummary);
              setSelectedBetLane(0);
              setViewMode("challenge");
              syncSimSnapshot(fresh);
              return;
            }
          }
        } catch {
          // fallback to ?s= below
        }
      }

      if (encodedParam && !cancelled) {
        const decoded = decodeMatchFromUrlParam(encodedParam);
        if (decoded) {
          const fresh = createSimulation(decoded);
          simRef.current = fresh;
          setChallengeConfig(decoded);
          setOddsSummary(makeDefaultOdds(decoded.lanes.length));
          setSelectedBetLane(0);
          setViewMode("challenge");
          syncSimSnapshot(fresh);
        }
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [syncSimSnapshot]);

  const resetMatchSimulation = useCallback(
    (cfg: MatchConfig, autoRun = false) => {
      const fresh = createSimulation(cfg);
      if (autoRun) {
        fresh.status = "running";
      }
      simRef.current = fresh;
      lockedBetRef.current = null;
      setLockedBetLane(null);
      setLockedOdds(null);
      setSettlement(null);
      setSelectedBetLane((prev) => (prev < cfg.lanes.length ? prev : 0));
      syncSimSnapshot(fresh);
    },
    [syncSimSnapshot]
  );

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
          syncSimSnapshot(sim);
        }
      } else {
        accumulator = 0;
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, [checkAndSettleFinishedMatch, speedMultiplier, syncSimSnapshot, viewMode]);

  const handleSelectChallenge = (lvl: LevelWithOdds) => {
    setChallengeConfig(structuredClone(lvl.config));
    setOddsSummary(lvl.oddsSummary);
    setViewMode("challenge");
    resetMatchSimulation(lvl.config, false);
  };

  const handleSelectPreset = (preset: MatchConfig) => {
    const record = publicLevels.find((l) => l.id === preset.id);
    const cfg = structuredClone(preset);
    setChallengeConfig(cfg);
    setOddsSummary(
      record ? record.oddsSummary : makeDefaultOdds(cfg.lanes.length)
    );
    resetMatchSimulation(cfg, false);
  };

  const handleLockBetAndStart = (laneIndex: number, stakeFraction: number) => {
    const stakeAmt = bfMulNum(
      bankroll,
      Math.max(0.01, Math.min(1, stakeFraction))
    );
    const oddAtLock = oddsSummary.odds[laneIndex] ?? 2.0;

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
    syncSimSnapshot(simRef.current);

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
    syncSimSnapshot(simRef.current);
  };

  const handleResetBankroll = () => {
    const fresh = bf(1000);
    setBankroll(fresh);
    setStreak(0);
    persistPlayerProgress(fresh, 0, maxStreak);
  };

  const currentPresetIdx = PRESET_LEVELS.findIndex(
    (p) => p.id === challengeConfig.id
  );

  const handleStepPreset = (delta: number) => {
    const baseIdx = currentPresetIdx >= 0 ? currentPresetIdx : 0;
    const nextIdx =
      (baseIdx + delta + PRESET_LEVELS.length) % PRESET_LEVELS.length;
    handleSelectPreset(PRESET_LEVELS[nextIdx]);
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
      const fresh = createSimulation(nextDraft);
      simRef.current = fresh;
      syncSimSnapshot(fresh);
    }
  };

  const handleTogglePlay = () => {
    const sim = simRef.current;
    if (sim.status === "running") {
      sim.status = "paused";
    } else if (sim.status === "paused" || sim.status === "ready") {
      sim.status = "running";
    }
    syncSimSnapshot(sim);
  };

  const headerSummary = getMatchHeaderSummary(activeConfig, formatStyle);

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Strictly Symmetric 3-Column Top Navigation Bar (56px exact) */}
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
              minHeight: "56px !important",
              height: 56,
              display: "grid",
              gridTemplateColumns: { xs: "auto 1fr auto", md: "1fr auto 1fr" },
              alignItems: "center",
              gap: 1.5,
            }}
          >
            {/* Left: Clean Brand Title */}
            <Stack
              direction="row"
              spacing={1.1}
              sx={{ alignItems: "center", justifySelf: "start" }}
            >
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: 1.25,
                  bgcolor: "primary.main",
                  color: "#061018",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 800,
                  fontSize: "0.86rem",
                }}
              >
                xⁿ
              </Box>
              <Typography
                component="h1"
                sx={{
                  display: { xs: "none", sm: "block" },
                  fontSize: "1.02rem",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                }}
              >
                Expo-Lanes
              </Typography>
            </Stack>

            {/* Center: Segmented Mode Switcher */}
            <ToggleButtonGroup
              size="small"
              exclusive
              value={viewMode}
              onChange={(_, v) => {
                if (v) handleSwitchView(v);
              }}
              sx={{
                justifySelf: "center",
                height: 36,
                "& .MuiToggleButton-root": {
                  px: { xs: 1.4, sm: 2.2 },
                  fontSize: "0.84rem",
                  fontWeight: 700,
                },
              }}
            >
              <ToggleButton id="nav-tab-challenge" value="challenge">
                竞猜挑战
              </ToggleButton>
              <ToggleButton id="nav-tab-sandbox" value="sandbox">
                沙盒工坊
              </ToggleButton>
              <ToggleButton id="nav-tab-browser" value="browser">
                挑战广场
              </ToggleButton>
            </ToggleButtonGroup>

            {/* Right: Bankroll/Leaderboard + Clean Preferences Popover */}
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", justifySelf: "end" }}
            >
              <Button
                id="open-leaderboard-btn"
                size="small"
                variant="outlined"
                color="secondary"
                startIcon={<EmojiEventsRoundedIcon fontSize="small" />}
                onClick={() => setLeaderboardOpen(true)}
                className="tabular-nums"
                sx={{
                  height: 36,
                  px: 1.5,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {formatBigFloat(bankroll, formatStyle, 2)}
                {streak > 0 ? ` · ${streak}连胜` : ""}
              </Button>

              <IconButton
                id="open-preferences-btn"
                size="small"
                onClick={(e) => setPrefsAnchor(e.currentTarget)}
                aria-label="显示与音效偏好"
                sx={{
                  width: 36,
                  height: 36,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1.5,
                }}
              >
                <TuneRoundedIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      {/* Clean Preferences Popover (Units, Sound, Theme) */}
      <Popover
        open={Boolean(prefsAnchor)}
        anchorEl={prefsAnchor}
        onClose={() => setPrefsAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: { mt: 1, p: 2, width: 268, borderRadius: 2 },
          },
        }}
      >
        <Stack spacing={1.75}>
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 0.75, fontWeight: 700 }}
            >
              大数显示格式
            </Typography>
            <ToggleButtonGroup
              size="small"
              fullWidth
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
            >
              <ToggleButton value="intl">K/M/B</ToggleButton>
              <ToggleButton value="zh">万/亿</ToggleButton>
              <ToggleButton value="sci">1eN</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Divider />

          <Stack
            direction="row"
            sx={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <Typography variant="body2">碰撞音阶音效</Typography>
            <Switch
              id="toggle-sound-switch"
              size="small"
              checked={soundOn}
              onChange={(e) => {
                const next = e.target.checked;
                setSoundOn(next);
                soundEngine.setEnabled(next);
              }}
            />
          </Stack>

          <Stack
            direction="row"
            sx={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <Typography variant="body2">界面主题模式</Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={colorMode}
              onChange={(_, val) => {
                if (val === "dark" || val === "light") setColorMode(val);
              }}
            >
              <ToggleButton value="dark" sx={{ px: 1.25, py: 0.3 }}>
                深色
              </ToggleButton>
              <ToggleButton value="light" sx={{ px: 1.25, py: 0.3 }}>
                浅色
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Stack>
      </Popover>

      {/* Preset Selector Dropdown Menu */}
      <Menu
        anchorEl={levelMenuAnchor}
        open={Boolean(levelMenuAnchor)}
        onClose={() => setLevelMenuAnchor(null)}
        slotProps={{ paper: { sx: { mt: 0.75, minWidth: 300 } } }}
      >
        {PRESET_LEVELS.map((preset) => {
          const solved = Boolean(solvedIds[preset.id]);
          const selected = preset.id === challengeConfig.id;
          return (
            <MenuItem
              key={preset.id}
              selected={selected}
              onClick={() => {
                handleSelectPreset(preset);
                setLevelMenuAnchor(null);
              }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                {solved ? (
                  <CheckRoundedIcon fontSize="small" color="success" />
                ) : null}
              </ListItemIcon>
              <ListItemText
                primary={preset.title}
                slotProps={{
                  primary: { sx: { fontSize: "0.86rem", fontWeight: selected ? 700 : 500 } },
                }}
              />
              {preset.difficulty && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 2 }}
                >
                  {preset.difficulty}
                </Typography>
              )}
            </MenuItem>
          );
        })}
      </Menu>

      {/* Main Content Stage */}
      <Container
        maxWidth={viewMode === "sandbox" ? "xl" : "lg"}
        component="main"
        sx={{ py: 2.5, flexGrow: 1 }}
      >
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
        ) : viewMode === "challenge" ? (
          /* ================= CHALLENGE MODE: Clean Single-Focus Symmetric Stage ================= */
          <Stack
            spacing={2}
            sx={{
              width: "100%",
              maxWidth: challengeConfig.lanes.length === 2 ? 920 : "100%",
              mx: "auto",
            }}
          >
            {/* Block 1: Level Stepper + Shared Match Goal Header */}
            <Paper sx={{ px: { xs: 2, md: 2.5 }, py: 1.75 }}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1.25}
                sx={{
                  alignItems: { xs: "flex-start", md: "center" },
                  justifyContent: "space-between",
                }}
              >
                {/* Left: Prev / Level Title / Next + Dropdown */}
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                  <IconButton
                    id="prev-preset-btn"
                    size="small"
                    onClick={() => handleStepPreset(-1)}
                    sx={{
                      width: 32,
                      height: 32,
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1.25,
                    }}
                  >
                    <ChevronLeftRoundedIcon fontSize="small" />
                  </IconButton>

                  <Button
                    id="open-preset-menu-btn"
                    color="inherit"
                    endIcon={<KeyboardArrowDownRoundedIcon />}
                    onClick={(e) => setLevelMenuAnchor(e.currentTarget)}
                    sx={{
                      px: 1.25,
                      height: 32,
                      fontWeight: 800,
                      fontSize: "0.96rem",
                    }}
                  >
                    {challengeConfig.title}
                  </Button>

                  <IconButton
                    id="next-preset-btn"
                    size="small"
                    onClick={() => handleStepPreset(1)}
                    sx={{
                      width: 32,
                      height: 32,
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1.25,
                    }}
                  >
                    <ChevronRightRoundedIcon fontSize="small" />
                  </IconButton>

                  {challengeConfig.difficulty && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={challengeConfig.difficulty}
                      sx={{ height: 24, ml: 0.5 }}
                    />
                  )}
                </Stack>

                {/* Right: Unified Match Rule & Shared Wall Summary */}
                <Stack
                  direction="row"
                  spacing={0.85}
                  useFlexGap
                  sx={{ alignItems: "center", flexWrap: "wrap" }}
                >
                  <Chip
                    size="small"
                    label={headerSummary.ruleBadge}
                    sx={{
                      height: 26,
                      fontWeight: 600,
                      fontFamily: "var(--font-mono)",
                    }}
                  />
                  {headerSummary.sharedWallBadge && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={headerSummary.sharedWallBadge}
                      sx={{
                        height: 26,
                        fontFamily: "var(--font-mono)",
                      }}
                    />
                  )}
                </Stack>
              </Stack>

              {/* Concise 1-line Question Description + Coupling Note */}
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{
                  mt: 1,
                  pt: 1,
                  borderTop: "1px solid",
                  borderColor: "divider",
                  alignItems: { xs: "flex-start", sm: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.84rem" }}>
                  {challengeConfig.description}
                </Typography>

                {headerSummary.couplingBadge && (
                  <Stack
                    direction="row"
                    spacing={0.5}
                    sx={{ alignItems: "center", flexShrink: 0 }}
                  >
                    <BoltRoundedIcon sx={{ fontSize: 16 }} color="warning" />
                    <Typography
                      variant="caption"
                      color="warning.main"
                      className="tabular-nums"
                      sx={{ fontWeight: 700 }}
                    >
                      {headerSummary.couplingBadge}
                      {challengeConfig.coupling.sharedPoolEnabled
                        ? ` · 当前奖池 +${formatBigFloat(simSnapshot.sim.sharedPoolValue, formatStyle)}`
                        : ""}
                    </Typography>
                  </Stack>
                )}
              </Stack>
            </Paper>

            {/* Block 2: Strictly Aligned Parallel Lane Stage */}
            <RaceArena
              mode="challenge"
              simState={simSnapshot.sim}
              wallsIdentical={headerSummary.wallsIdentical}
              formatStyle={formatStyle}
              oddsSummary={oddsSummary}
              selectedBetLane={selectedBetLane}
              lockedBetLane={lockedBetLane}
              lockedOdds={lockedOdds}
              onSelectBetLane={setSelectedBetLane}
            />

            {/* Block 3: Unified Horizontal Action Dock */}
            <ActionDock
              mode="challenge"
              config={challengeConfig}
              simState={simSnapshot.sim}
              formatStyle={formatStyle}
              speedMultiplier={speedMultiplier}
              onSpeedChange={setSpeedMultiplier}
              onTogglePlay={handleTogglePlay}
              onReset={() => resetMatchSimulation(challengeConfig, false)}
              oddsSummary={oddsSummary}
              bankroll={bankroll}
              selectedBetLane={selectedBetLane}
              lockedBetLane={lockedBetLane}
              lockedOdds={lockedOdds}
              settlement={settlement}
              onLockBetAndStart={handleLockBetAndStart}
              onSpectateStart={handleSpectateStart}
              onResetBankroll={handleResetBankroll}
              onNextPreset={() => handleStepPreset(1)}
              onOpenInSandbox={() => handleLoadIntoSandbox(challengeConfig)}
            />

            {/* Block 4: Collapsible Telemetry Drawer (Collapsed by default) */}
            <Box>
              <Button
                id="toggle-telemetry-btn"
                size="small"
                color="inherit"
                startIcon={<ShowChartRoundedIcon fontSize="small" color="primary" />}
                endIcon={
                  chartExpanded ? (
                    <KeyboardArrowUpRoundedIcon fontSize="small" />
                  ) : (
                    <KeyboardArrowDownRoundedIcon fontSize="small" />
                  )
                }
                onClick={() => setChartExpanded((v) => !v)}
                sx={{ color: "text.secondary", fontWeight: 600 }}
              >
                {chartExpanded
                  ? "收起实时对数交汇曲线"
                  : "查看实时对数交汇曲线（log10 输出 vs 墙压）"}
              </Button>
              <Collapse in={chartExpanded} unmountOnExit>
                <Box sx={{ mt: 1 }}>
                  <TelemetryChart
                    telemetry={simSnapshot.telemetry}
                    lanes={challengeConfig.lanes}
                  />
                </Box>
              </Collapse>
            </Box>
          </Stack>
        ) : (
          /* ================= SANDBOX MODE: Matched-Height 2-Column Studio ================= */
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "minmax(0, 1fr)",
                lg: "minmax(0, 1.4fr) 420px",
              },
              gap: 2,
              alignItems: "start",
            }}
          >
            <Stack spacing={2} sx={{ minWidth: 0 }}>
              <RaceArena
                mode="sandbox"
                simState={simSnapshot.sim}
                wallsIdentical={headerSummary.wallsIdentical}
                formatStyle={formatStyle}
                lockedBetLane={null}
                lockedOdds={null}
              />

              <ActionDock
                mode="sandbox"
                config={sandboxDraft}
                simState={simSnapshot.sim}
                formatStyle={formatStyle}
                speedMultiplier={speedMultiplier}
                onSpeedChange={setSpeedMultiplier}
                onTogglePlay={handleTogglePlay}
                onReset={() => resetMatchSimulation(sandboxDraft, false)}
              />

              <Box>
                <Button
                  id="sandbox-toggle-telemetry-btn"
                  size="small"
                  color="inherit"
                  startIcon={<ShowChartRoundedIcon fontSize="small" color="primary" />}
                  endIcon={
                    chartExpanded ? (
                      <KeyboardArrowUpRoundedIcon fontSize="small" />
                    ) : (
                      <KeyboardArrowDownRoundedIcon fontSize="small" />
                    )
                  }
                  onClick={() => setChartExpanded((v) => !v)}
                  sx={{ color: "text.secondary", fontWeight: 600 }}
                >
                  {chartExpanded
                    ? "收起实时对数交汇曲线"
                    : "查看实时对数交汇曲线（log10 输出 vs 墙压）"}
                </Button>
                <Collapse in={chartExpanded} unmountOnExit>
                  <Box sx={{ mt: 1 }}>
                    <TelemetryChart
                      telemetry={simSnapshot.telemetry}
                      lanes={sandboxDraft.lanes}
                    />
                  </Box>
                </Collapse>
              </Box>
            </Stack>

            <SandboxEditor
              draft={sandboxDraft}
              onDraftChange={handleSandboxDraftChange}
              onPublishedLevel={(created) => {
                setPublicLevels((prev) => [created, ...prev]);
              }}
            />
          </Box>
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
