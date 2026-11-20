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
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Symmetric Header Bar */}
      <Paper
        sx={{
          px: 2.5,
          py: 1.75,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
        }}
      >
        <Box>
          <Typography variant="h3" sx={{ fontWeight: 800 }}>
            挑战题库广场
          </Typography>
          <Typography variant="caption" color="text.secondary">
            官方反直觉数学关卡与社区沙盒残局 · 选择题目进入竞猜或改装参数
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={filter}
            onChange={(_, v) => {
              if (v) setFilter(v);
            }}
            sx={{ height: 34 }}
          >
            <ToggleButton id="filter-all-levels" value="all" sx={{ px: 1.5 }}>
              全部 ({levels.length})
            </ToggleButton>
            <ToggleButton id="filter-preset-levels" value="preset" sx={{ px: 1.5 }}>
              官方 ({levels.filter((l) => l.isPreset).length})
            </ToggleButton>
            <ToggleButton id="filter-custom-levels" value="custom" sx={{ px: 1.5 }}>
              玩家 ({levels.filter((l) => !l.isPreset).length})
            </ToggleButton>
          </ToggleButtonGroup>

          <Button
            id="refresh-levels-btn"
            size="small"
            variant="outlined"
            startIcon={<RefreshRoundedIcon />}
            onClick={onRefresh}
            disabled={loading}
            sx={{ height: 34 }}
          >
            刷新
          </Button>
        </Stack>
      </Paper>

      {filtered.length === 0 ? (
        <Paper sx={{ p: 5, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
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
            gridAutoRows: "1fr",
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
                  display: "grid",
                  gridTemplateRows: "28px 42px 58px 36px",
                  gap: 1.5,
                  borderColor: isCurrent ? "primary.main" : "divider",
                }}
              >
                {/* Row 1 (28px exact): Title + Source/Difficulty */}
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", justifyContent: "space-between" }}
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
                        sx={{ flexShrink: 0 }}
                      />
                    )}
                    <Typography
                      variant="subtitle2"
                      noWrap
                      sx={{ fontWeight: 800, fontSize: "0.95rem" }}
                    >
                      {item.config.title}
                    </Typography>
                  </Stack>

                  <Stack direction="row" spacing={0.6} sx={{ flexShrink: 0 }}>
                    <Chip
                      size="small"
                      color={item.isPreset ? "primary" : "secondary"}
                      variant="outlined"
                      label={item.isPreset ? "官方" : item.author}
                      sx={{ height: 22, fontSize: "0.72rem" }}
                    />
                    {item.config.difficulty && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={item.config.difficulty}
                        sx={{ height: 22, fontSize: "0.72rem" }}
                      />
                    )}
                  </Stack>
                </Stack>

                {/* Row 2 (42px exact): 2-line Clamped Description */}
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    fontSize: "0.82rem",
                    lineHeight: "21px",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {item.config.description}
                </Typography>

                {/* Row 3 (58px exact): Equal-Column Odds Strip */}
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
                          px: 1.25,
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          borderRadius: 1.25,
                          bgcolor: pal.softBg,
                          border: "1px solid",
                          borderColor: "divider",
                        }}
                      >
                        <Typography
                          variant="caption"
                          noWrap
                          sx={{ fontWeight: 600, lineHeight: 1.3 }}
                        >
                          {lIdx + 1}号 · {lane.name}
                        </Typography>
                        <Stack
                          direction="row"
                          sx={{
                            alignItems: "baseline",
                            justifyContent: "space-between",
                          }}
                        >
                          <Typography
                            variant="body2"
                            className="tabular-nums"
                            sx={{ fontWeight: 800, color: pal.main, fontSize: "0.84rem" }}
                          >
                            ×{odd.toFixed(2)}
                          </Typography>
                          <Typography
                            variant="caption"
                            className="tabular-nums"
                            color="text.secondary"
                            sx={{ fontSize: "0.7rem" }}
                          >
                            {pct}%
                          </Typography>
                        </Stack>
                      </Box>
                    );
                  })}
                </Box>

                {/* Row 4 (36px exact): Aligned Action Bar */}
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", justifyContent: "space-between" }}
                >
                  <Typography
                    variant="caption"
                    className="tabular-nums"
                    color="text.secondary"
                  >
                    共 {item.oddsSummary.totalBets} 次押注
                  </Typography>

                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ScienceRoundedIcon />}
                      onClick={() => onLoadIntoSandbox(item.config)}
                      sx={{ height: 32 }}
                    >
                      改装
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<PlayArrowRoundedIcon />}
                      onClick={() => onSelectForChallenge(item)}
                      sx={{ height: 32, fontWeight: 700 }}
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
