"use client";

import React, { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import PlayCircleFilledWhiteRoundedIcon from "@mui/icons-material/PlayCircleFilledWhiteRounded";
import ScienceRoundedIcon from "@mui/icons-material/ScienceRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import type { MatchConfig } from "@/engine/types";
import type { OddsSummary, StoredLevelRecord } from "@/lib/storage";
import { getLanePalettes } from "@/theme/theme";

export interface LevelWithOdds extends StoredLevelRecord {
  oddsSummary: OddsSummary;
}

export interface ChallengeBrowserProps {
  levels: LevelWithOdds[];
  solvedIds: Record<string, boolean>;
  activeLevelId: string;
  loading: boolean;
  onRefresh: () => void;
  onSelectForChallenge: (level: LevelWithOdds) => void;
  onLoadIntoSandbox: (config: MatchConfig) => void;
}

export default function ChallengeBrowser({
  levels,
  solvedIds,
  activeLevelId,
  loading,
  onRefresh,
  onSelectForChallenge,
  onLoadIntoSandbox,
}: ChallengeBrowserProps) {
  const theme = useTheme();
  const palettes = getLanePalettes(theme.palette.mode);
  const [filter, setFilter] = useState<"all" | "preset" | "custom">("all");

  const filtered = levels.filter((lvl) => {
    if (filter === "preset") return lvl.isPreset;
    if (filter === "custom") return !lvl.isPreset;
    return true;
  });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.25 }}>
      <Paper sx={{ p: 2.25 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{
            alignItems: { xs: "flex-start", sm: "center" },
            justifyContent: "space-between",
          }}
        >
          <Box>
            <Typography variant="h2">挑战题库广场</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
              挑选官方纯数学反直觉关卡或玩家分享的沙盒残局，押注动态赔率实现筹码指数复利。
            </Typography>
          </Box>

          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", flexWrap: "wrap" }}
          >
            <ToggleButtonGroup
              size="small"
              exclusive
              value={filter}
              onChange={(_, v) => {
                if (v) setFilter(v);
              }}
            >
              <ToggleButton id="filter-all-levels" value="all">
                全部 ({levels.length})
              </ToggleButton>
              <ToggleButton id="filter-preset-levels" value="preset">
                官方题库 ({levels.filter((l) => l.isPreset).length})
              </ToggleButton>
              <ToggleButton id="filter-custom-levels" value="custom">
                玩家出题 ({levels.filter((l) => !l.isPreset).length})
              </ToggleButton>
            </ToggleButtonGroup>

            <Button
              id="refresh-levels-btn"
              size="small"
              variant="outlined"
              startIcon={<RefreshRoundedIcon />}
              onClick={onRefresh}
              disabled={loading}
            >
              刷新
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {filtered.length === 0 ? (
        <Paper sx={{ p: 5, textAlign: "center" }}>
          <Typography variant="body1" color="text.secondary">
            暂无玩家发布的自定义关卡。前往「沙盒工坊」调配一道反直觉数学题并一键发布吧！
          </Typography>
        </Paper>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "repeat(2, minmax(0, 1fr))",
            },
            gap: 2,
          }}
        >
          {filtered.map((item) => {
            const isSolved = Boolean(solvedIds[item.id]);
            const isCurrent = activeLevelId === item.id;

            return (
              <Paper
                key={item.id}
                sx={{
                  p: 2.25,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: 1.5,
                  borderColor: isCurrent ? "primary.main" : "divider",
                }}
              >
                <Box>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                      alignItems: "center",
                      justifyContent: "space-between",
                      mb: 0.75,
                    }}
                  >
                    <Stack
                      direction="row"
                      spacing={0.75}
                      sx={{ alignItems: "center", minWidth: 0 }}
                    >
                      {isSolved && (
                        <CheckCircleRoundedIcon
                          fontSize="small"
                          color="success"
                        />
                      )}
                      <Typography
                        variant="subtitle1"
                        noWrap
                        sx={{ fontWeight: 700 }}
                      >
                        {item.config.title}
                      </Typography>
                    </Stack>

                    <Stack direction="row" spacing={0.6} sx={{ flexShrink: 0 }}>
                      <Chip
                        size="small"
                        color={item.isPreset ? "primary" : "secondary"}
                        variant="outlined"
                        label={item.isPreset ? "官方" : `出题 · ${item.author}`}
                      />
                      {item.config.difficulty && (
                        <Chip
                          size="small"
                          label={item.config.difficulty}
                          variant="outlined"
                        />
                      )}
                    </Stack>
                  </Stack>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 1.25, lineHeight: 1.55 }}
                  >
                    {item.config.description}
                  </Typography>

                  {item.config.tags && item.config.tags.length > 0 && (
                    <Stack
                      direction="row"
                      spacing={0.75}
                      useFlexGap
                      sx={{ flexWrap: "wrap", mb: 1.5 }}
                    >
                      {item.config.tags.map((tag) => (
                        <Chip
                          key={tag}
                          size="small"
                          label={tag}
                          sx={{ height: 22, fontSize: "0.72rem" }}
                        />
                      ))}
                    </Stack>
                  )}

                  {/* Dynamic Odds Preview Strip */}
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${item.config.lanes.length}, minmax(0, 1fr))`,
                      gap: 1,
                    }}
                  >
                    {item.config.lanes.map((lane, lIdx) => {
                      const pal = palettes[lIdx % palettes.length];
                      const odd = item.oddsSummary.odds[lIdx] ?? 2.0;
                      const pct = Math.round(
                        (item.oddsSummary.shares[lIdx] ?? 0.5) * 100
                      );
                      return (
                        <Box
                          key={lane.id || lIdx}
                          sx={{
                            p: 1,
                            borderRadius: 1.25,
                            bgcolor: pal.softBg,
                            border: "1px solid",
                            borderColor: "divider",
                          }}
                        >
                          <Typography
                            variant="caption"
                            noWrap
                            sx={{ display: "block", fontWeight: 600 }}
                          >
                            {lane.name}
                          </Typography>
                          <Stack
                            direction="row"
                            sx={{
                              alignItems: "baseline",
                              justifyContent: "space-between",
                              mt: 0.25,
                            }}
                          >
                            <Typography
                              variant="body2"
                              className="tabular-nums"
                              sx={{ fontWeight: 700, color: pal.main }}
                            >
                              ×{odd.toFixed(2)}
                            </Typography>
                            <Typography
                              variant="caption"
                              className="tabular-nums"
                              color="text.secondary"
                            >
                              {pct}%押
                            </Typography>
                          </Stack>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>

                <Stack
                  direction="row"
                  spacing={1}
                  sx={{
                    alignItems: "center",
                    justifyContent: "space-between",
                    pt: 0.5,
                  }}
                >
                  <Typography
                    variant="caption"
                    className="tabular-nums"
                    color="text.secondary"
                  >
                    累计 {item.oddsSummary.totalBets} 人次参与竞猜
                  </Typography>

                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ScienceRoundedIcon />}
                      onClick={() => onLoadIntoSandbox(item.config)}
                    >
                      改装沙盒
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<PlayCircleFilledWhiteRoundedIcon />}
                      onClick={() => onSelectForChallenge(item)}
                    >
                      去竞猜
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
