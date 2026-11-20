"use client";

import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CasinoRoundedIcon from "@mui/icons-material/CasinoRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import ShareRoundedIcon from "@mui/icons-material/ShareRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import SyncAltRoundedIcon from "@mui/icons-material/SyncAltRounded";
import { LANE_TEMPLATES } from "@/engine/presets";
import type {
  GateOperator,
  GateRowConfig,
  GrowthTriggerConfig,
  LaneConfig,
  MathOp,
  MatchConfig,
  TriggerCondition,
  TriggerTarget,
  WallCapMode,
  WinRuleType,
} from "@/engine/types";
import { encodeMatchToUrlParam } from "@/lib/urlCodec";
import type { LevelWithOdds } from "./ChallengeBrowser";
import { getLanePalettes } from "@/theme/theme";
import { useTheme } from "@mui/material/styles";

export interface SandboxEditorProps {
  draft: MatchConfig;
  onDraftChange: (next: MatchConfig, restartSim?: boolean) => void;
  onPublishedLevel: (created: LevelWithOdds) => void;
}

type EditorSection = "templates" | "ball" | "gates_wall" | "rules";

const GATE_OP_OPTIONS: Array<{ value: GateOperator; label: string }> = [
  { value: "add", label: "+ 加法" },
  { value: "sub", label: "- 减法" },
  { value: "mul", label: "× 乘法" },
  { value: "div", label: "÷ 除法" },
  { value: "pow", label: "^ 次方" },
  { value: "sqrt", label: "√ 开根号" },
  { value: "split_merge", label: "拆合 (值÷N·球×N)" },
  { value: "threshold_mul", label: "门槛倍增 (≥T ⇒ ×N)" },
];

export default function SandboxEditor({
  draft,
  onDraftChange,
  onPublishedLevel,
}: SandboxEditorProps) {
  const theme = useTheme();
  const palettes = getLanePalettes(theme.palette.mode);
  const [activeLaneIdx, setActiveLaneIdx] = useState(0);
  const [section, setSection] = useState<EditorSection>("templates");
  const [shareOpen, setShareOpen] = useState(false);
  const [authorName, setAuthorName] = useState("数字建筑师");
  const [publishing, setPublishing] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const safeLaneIdx = activeLaneIdx < draft.lanes.length ? activeLaneIdx : 0;
  const activeLane = draft.lanes[safeLaneIdx];

  const updateLane = (idx: number, updater: (prev: LaneConfig) => LaneConfig) => {
    const nextLanes = draft.lanes.map((l, i) =>
      i === idx ? updater(structuredClone(l)) : l
    );
    onDraftChange({ ...draft, lanes: nextLanes }, false);
  };

  const handleLaneCountChange = (targetCount: 2 | 3) => {
    if (draft.lanes.length === targetCount) return;
    if (targetCount === 2) {
      onDraftChange({ ...draft, lanes: draft.lanes.slice(0, 2) }, true);
      if (activeLaneIdx >= 2) setActiveLaneIdx(1);
    } else {
      const baseWall = structuredClone(draft.lanes[0].wall);
      const thirdLane = LANE_TEMPLATES[2].apply(baseWall, 2);
      onDraftChange({ ...draft, lanes: [...draft.lanes, thirdLane] }, true);
    }
  };

  const handleRandomSeed = () => {
    const nextSeed = `seed-${Math.floor(100000 + Math.random() * 900000)}`;
    onDraftChange({ ...draft, seed: nextSeed }, true);
  };

  const handleSyncWallToAll = () => {
    const sourceWall = structuredClone(activeLane.wall);
    const nextLanes = draft.lanes.map((l) => ({
      ...l,
      wall: structuredClone(sourceWall),
    }));
    onDraftChange({ ...draft, lanes: nextLanes }, true);
  };

  const handlePublish = async () => {
    setPublishing(true);
    setCopied(false);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const encodedFallback = encodeMatchToUrlParam(draft);

    try {
      const res = await fetch("/api/levels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: draft,
          author: authorName.trim() || "匿名出题人",
        }),
      });
      const data = await res.json();
      if (res.ok && data.level) {
        onPublishedLevel(data.level);
        const full = `${origin}/?level=${encodeURIComponent(
          data.level.id
        )}&s=${encodedFallback}`;
        setShareUrl(full);
      } else {
        setShareUrl(`${origin}/?s=${encodedFallback}`);
      }
    } catch {
      setShareUrl(`${origin}/?s=${encodedFallback}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      // ignore
    }
  };

  return (
    <Paper
      sx={{
        display: "grid",
        gridTemplateRows: "52px 42px 42px minmax(0, 1fr) 62px",
        height: { xs: "auto", lg: 684 },
        overflow: "hidden",
      }}
    >
      {/* Row 1 (52px): Studio Header + 2/3 Lane Switcher */}
      <Box
        sx={{
          px: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
          沙盒参数工作台
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={draft.lanes.length}
          onChange={(_, v) => {
            if (v === 2 || v === 3) handleLaneCountChange(v);
          }}
          sx={{ height: 30 }}
        >
          <ToggleButton id="sandbox-2lanes-btn" value={2} sx={{ px: 1.25 }}>
            2 赛道
          </ToggleButton>
          <ToggleButton id="sandbox-3lanes-btn" value={3} sx={{ px: 1.25 }}>
            3 赛道
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Row 2 (42px): Active Lane Selector Tabs */}
      <Tabs
        value={safeLaneIdx}
        onChange={(_, v) => setActiveLaneIdx(v)}
        variant="fullWidth"
        sx={{
          minHeight: 42,
          borderBottom: "1px solid",
          borderColor: "divider",
          "& .MuiTab-root": { minHeight: 42, py: 0, fontWeight: 700 },
        }}
      >
        {draft.lanes.map((lane, idx) => (
          <Tab
            key={lane.id || idx}
            label={`${idx + 1}号 · ${lane.name.slice(0, 6)}`}
            sx={{
              color: palettes[idx % palettes.length].main,
              "&.Mui-selected": {
                color: palettes[idx % palettes.length].main,
              },
            }}
          />
        ))}
      </Tabs>

      {/* Row 3 (42px): Section Category Tabs */}
      <Tabs
        value={section}
        onChange={(_, v) => setSection(v)}
        variant="fullWidth"
        textColor="primary"
        indicatorColor="primary"
        sx={{
          minHeight: 42,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "action.hover",
          "& .MuiTab-root": {
            minHeight: 42,
            py: 0,
            fontSize: "0.78rem",
            px: 0.5,
          },
        }}
      >
        <Tab value="templates" label="① 基础与流派" />
        <Tab value="ball" label="② 球与增长" />
        <Tab value="gates_wall" label="③ 门与数字墙" />
        <Tab value="rules" label="④ 全局赛制" />
      </Tabs>

      {/* Row 4: Clean Scrollable Inspector Body */}
      <Box sx={{ p: 2, overflowY: "auto" }}>
        {/* SECTION 1: Templates & Match Info */}
        {section === "templates" && activeLane && (
          <Stack spacing={2}>
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 1, fontWeight: 700 }}
              >
                为【{safeLaneIdx + 1}号赛道】一键套用纯数学流派（保留当前墙体）：
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 1,
                }}
              >
                {LANE_TEMPLATES.map((tpl) => (
                  <Button
                    key={tpl.id}
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      const applied = tpl.apply(
                        structuredClone(activeLane.wall),
                        safeLaneIdx
                      );
                      const nextLanes = draft.lanes.map((l, i) =>
                        i === safeLaneIdx ? applied : l
                      );
                      onDraftChange({ ...draft, lanes: nextLanes }, true);
                    }}
                    sx={{
                      justifyContent: "flex-start",
                      px: 1.25,
                      py: 0.75,
                      fontWeight: 600,
                    }}
                  >
                    {tpl.name}
                  </Button>
                ))}
              </Box>
            </Box>

            <Divider />

            <Stack spacing={1.25}>
              <TextField
                size="small"
                label="当前赛道名称"
                value={activeLane.name}
                onChange={(e) =>
                  updateLane(safeLaneIdx, (l) => ({
                    ...l,
                    name: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                size="small"
                label="关卡总标题"
                value={draft.title}
                onChange={(e) =>
                  onDraftChange({ ...draft, title: e.target.value }, false)
                }
                fullWidth
              />
              <TextField
                size="small"
                label="一句话题目描述"
                value={draft.description}
                multiline
                minRows={2}
                onChange={(e) =>
                  onDraftChange({ ...draft, description: e.target.value }, false)
                }
                fullWidth
              />
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 1,
                }}
              >
                <TextField
                  size="small"
                  label="确定性种子 (Seed)"
                  value={draft.seed}
                  onChange={(e) =>
                    onDraftChange({ ...draft, seed: e.target.value }, false)
                  }
                  fullWidth
                />
                <Button
                  id="sandbox-random-seed-btn"
                  variant="outlined"
                  startIcon={<CasinoRoundedIcon />}
                  onClick={handleRandomSeed}
                  sx={{ height: 40 }}
                >
                  随机
                </Button>
              </Box>
            </Stack>
          </Stack>
        )}

        {/* SECTION 2: Ball Physics & Exponential Triggers */}
        {section === "ball" && activeLane && (
          <Stack spacing={2}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 1.15,
              }}
            >
              <TextField
                size="small"
                type="number"
                label="初始球数"
                value={activeLane.ball.initialCount}
                onChange={(e) =>
                  updateLane(safeLaneIdx, (l) => ({
                    ...l,
                    ball: {
                      ...l.ball,
                      initialCount: Math.max(
                        0,
                        Math.round(Number(e.target.value) || 0)
                      ),
                    },
                  }))
                }
              />
              <TextField
                size="small"
                type="number"
                label="单球初始数字"
                value={activeLane.ball.initialValue}
                onChange={(e) =>
                  updateLane(safeLaneIdx, (l) => ({
                    ...l,
                    ball: {
                      ...l.ball,
                      initialValue: Math.max(0.01, Number(e.target.value) || 1),
                    },
                  }))
                }
              />
              <TextField
                size="small"
                type="number"
                label="每秒补球 (0=无)"
                value={activeLane.ball.spawnPerSec}
                onChange={(e) =>
                  updateLane(safeLaneIdx, (l) => ({
                    ...l,
                    ball: {
                      ...l.ball,
                      spawnPerSec: Math.max(0, Number(e.target.value) || 0),
                    },
                  }))
                }
              />
              <TextField
                size="small"
                type="number"
                label="撞墙寿命 (0=无限)"
                value={activeLane.ball.maxHitsPerBall}
                onChange={(e) =>
                  updateLane(safeLaneIdx, (l) => ({
                    ...l,
                    ball: {
                      ...l.ball,
                      maxHitsPerBall: Math.max(
                        0,
                        Math.round(Number(e.target.value) || 0)
                      ),
                    },
                  }))
                }
              />
              <TextField
                size="small"
                type="number"
                label="初速度 (px/s)"
                value={activeLane.ball.baseSpeed}
                onChange={(e) =>
                  updateLane(safeLaneIdx, (l) => ({
                    ...l,
                    ball: {
                      ...l.ball,
                      baseSpeed: Math.min(
                        900,
                        Math.max(160, Number(e.target.value) || 350)
                      ),
                    },
                  }))
                }
              />
              <TextField
                size="small"
                type="number"
                label="余量穿透 (0~1)"
                slotProps={{ htmlInput: { step: 0.1, min: 0, max: 1 } }}
                value={activeLane.ball.overflowPenetration}
                onChange={(e) =>
                  updateLane(safeLaneIdx, (l) => ({
                    ...l,
                    ball: {
                      ...l.ball,
                      overflowPenetration: Math.min(
                        1,
                        Math.max(0, Number(e.target.value) || 0)
                      ),
                    },
                  }))
                }
              />
            </Box>

            <Divider />

            <Stack spacing={1.25}>
              <Stack
                direction="row"
                sx={{ alignItems: "center", justifyContent: "space-between" }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  纯数字增长触发器 ({activeLane.ball.triggers.length})
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AddRoundedIcon />}
                  onClick={() =>
                    updateLane(safeLaneIdx, (l) => {
                      const newTrig: GrowthTriggerConfig = {
                        id: `tr-${Date.now()}`,
                        when: "wall_hits",
                        every: 1,
                        target: "ball_value",
                        op: "mul",
                        operand: 1.5,
                      };
                      return {
                        ...l,
                        ball: {
                          ...l.ball,
                          triggers: [...l.ball.triggers, newTrig],
                        },
                      };
                    })
                  }
                >
                  添加触发器
                </Button>
              </Stack>

              {activeLane.ball.triggers.map((trig, tIdx) => (
                <Box
                  key={trig.id || tIdx}
                  sx={{
                    p: 1.25,
                    borderRadius: 1.5,
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Stack
                    direction="row"
                    sx={{
                      alignItems: "center",
                      justifyContent: "space-between",
                      mb: 1,
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      触发规则 #{tIdx + 1}
                    </Typography>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() =>
                        updateLane(safeLaneIdx, (l) => ({
                          ...l,
                          ball: {
                            ...l.ball,
                            triggers: l.ball.triggers.filter(
                              (_, i) => i !== tIdx
                            ),
                          },
                        }))
                      }
                    >
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Stack>

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 1,
                    }}
                  >
                    <FormControl size="small">
                      <InputLabel>触发条件</InputLabel>
                      <Select
                        label="触发条件"
                        value={trig.when}
                        onChange={(e) =>
                          updateLane(safeLaneIdx, (l) => {
                            const next = [...l.ball.triggers];
                            next[tIdx] = {
                              ...next[tIdx],
                              when: e.target.value as TriggerCondition,
                            };
                            return { ...l, ball: { ...l.ball, triggers: next } };
                          })
                        }
                      >
                        <MenuItem value="wall_hits">每撞数字墙 K 次</MenuItem>
                        <MenuItem value="boundary_hits">每碰边界 K 次</MenuItem>
                        <MenuItem value="time_sec">每存活 T 秒</MenuItem>
                        <MenuItem value="wall_breaks">每破 K 层墙</MenuItem>
                      </Select>
                    </FormControl>

                    <TextField
                      size="small"
                      type="number"
                      label="间隔 K / T"
                      value={trig.every}
                      onChange={(e) =>
                        updateLane(safeLaneIdx, (l) => {
                          const next = [...l.ball.triggers];
                          next[tIdx] = {
                            ...next[tIdx],
                            every: Math.max(0.25, Number(e.target.value) || 1),
                          };
                          return { ...l, ball: { ...l.ball, triggers: next } };
                        })
                      }
                    />

                    <FormControl size="small">
                      <InputLabel>作用目标</InputLabel>
                      <Select
                        label="作用目标"
                        value={trig.target}
                        onChange={(e) =>
                          updateLane(safeLaneIdx, (l) => {
                            const next = [...l.ball.triggers];
                            next[tIdx] = {
                              ...next[tIdx],
                              target: e.target.value as TriggerTarget,
                            };
                            return { ...l, ball: { ...l.ball, triggers: next } };
                          })
                        }
                      >
                        <MenuItem value="ball_value">球面数字</MenuItem>
                        <MenuItem value="ball_count">球体数量 (叠层)</MenuItem>
                        <MenuItem value="ball_speed">飞行速度 (%)</MenuItem>
                      </Select>
                    </FormControl>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "68px minmax(0, 1fr)",
                        gap: 0.75,
                      }}
                    >
                      <FormControl size="small">
                        <InputLabel>算符</InputLabel>
                        <Select
                          label="算符"
                          value={trig.op}
                          onChange={(e) =>
                            updateLane(safeLaneIdx, (l) => {
                              const next = [...l.ball.triggers];
                              next[tIdx] = {
                                ...next[tIdx],
                                op: e.target.value as MathOp,
                              };
                              return {
                                ...l,
                                ball: { ...l.ball, triggers: next },
                              };
                            })
                          }
                        >
                          <MenuItem value="add">+</MenuItem>
                          <MenuItem value="mul">×</MenuItem>
                          <MenuItem value="pow">^</MenuItem>
                        </Select>
                      </FormControl>

                      <TextField
                        size="small"
                        type="number"
                        label="数值"
                        slotProps={{ htmlInput: { step: 0.1 } }}
                        value={trig.operand}
                        onChange={(e) =>
                          updateLane(safeLaneIdx, (l) => {
                            const next = [...l.ball.triggers];
                            next[tIdx] = {
                              ...next[tIdx],
                              operand: Number(e.target.value) || 1,
                            };
                            return {
                              ...l,
                              ball: { ...l.ball, triggers: next },
                            };
                          })
                        }
                      />
                    </Box>
                  </Box>
                </Box>
              ))}
            </Stack>
          </Stack>
        )}

        {/* SECTION 3: Gates, Pins & Number Wall */}
        {section === "gates_wall" && activeLane && (
          <Stack spacing={2}>
            {/* Wall Grid */}
            <Box>
              <Stack
                direction="row"
                sx={{
                  alignItems: "center",
                  justifyContent: "space-between",
                  mb: 1,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  底层数字墙配置
                </Typography>
                <Button
                  id="sandbox-sync-wall-btn"
                  size="small"
                  variant="text"
                  startIcon={<SyncAltRoundedIcon />}
                  onClick={handleSyncWallToAll}
                >
                  同步至全部赛道
                </Button>
              </Stack>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 1.15,
                }}
              >
                <TextField
                  size="small"
                  type="number"
                  label="总层数"
                  value={activeLane.wall.totalLayers}
                  onChange={(e) =>
                    updateLane(safeLaneIdx, (l) => ({
                      ...l,
                      wall: {
                        ...l.wall,
                        totalLayers: Math.max(
                          1,
                          Math.round(Number(e.target.value) || 10)
                        ),
                      },
                    }))
                  }
                />
                <TextField
                  size="small"
                  type="number"
                  label="首层墙初始值"
                  value={activeLane.wall.baseValue}
                  onChange={(e) =>
                    updateLane(safeLaneIdx, (l) => ({
                      ...l,
                      wall: {
                        ...l.wall,
                        baseValue: Math.max(1, Number(e.target.value) || 100),
                      },
                    }))
                  }
                />
                <FormControl size="small">
                  <InputLabel>层间算符</InputLabel>
                  <Select
                    label="层间算符"
                    value={activeLane.wall.layerOp}
                    onChange={(e) =>
                      updateLane(safeLaneIdx, (l) => ({
                        ...l,
                        wall: {
                          ...l.wall,
                          layerOp: e.target.value as MathOp,
                        },
                      }))
                    }
                  >
                    <MenuItem value="add">+ 等差递增</MenuItem>
                    <MenuItem value="mul">× 等比倍增</MenuItem>
                    <MenuItem value="pow">^ 双指数次方</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  type="number"
                  label="层间递增参数"
                  slotProps={{ htmlInput: { step: 0.1 } }}
                  value={activeLane.wall.layerOperand}
                  onChange={(e) =>
                    updateLane(safeLaneIdx, (l) => ({
                      ...l,
                      wall: {
                        ...l.wall,
                        layerOperand: Number(e.target.value) || 2,
                      },
                    }))
                  }
                />
                <TextField
                  size="small"
                  type="number"
                  label="每秒复利自增 (1=无)"
                  slotProps={{ htmlInput: { step: 0.02 } }}
                  value={activeLane.wall.compoundPerSec}
                  onChange={(e) =>
                    updateLane(safeLaneIdx, (l) => ({
                      ...l,
                      wall: {
                        ...l.wall,
                        compoundPerSec: Math.max(
                          1,
                          Number(e.target.value) || 1
                        ),
                      },
                    }))
                  }
                />
                <FormControl size="small">
                  <InputLabel>单球撞击限流</InputLabel>
                  <Select
                    label="单球撞击限流"
                    value={activeLane.wall.capMode}
                    onChange={(e) =>
                      updateLane(safeLaneIdx, (l) => ({
                        ...l,
                        wall: {
                          ...l.wall,
                          capMode: e.target.value as WallCapMode,
                          capValue:
                            e.target.value === "fixed"
                              ? 500
                              : e.target.value === "max_pct"
                                ? 0.08
                                : 0,
                        },
                      }))
                    }
                  >
                    <MenuItem value="none">无限流</MenuItem>
                    <MenuItem value="fixed">固定上限 (-K)</MenuItem>
                    <MenuItem value="max_pct">墙值比例 (-X%)</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              {activeLane.wall.capMode !== "none" && (
                <TextField
                  size="small"
                  type="number"
                  label={
                    activeLane.wall.capMode === "fixed"
                      ? "单球最大扣减值 K"
                      : "单球最大扣减比例 (如 0.05 = 5%)"
                  }
                  slotProps={{
                    htmlInput: {
                      step: activeLane.wall.capMode === "fixed" ? 50 : 0.01,
                    },
                  }}
                  value={activeLane.wall.capValue}
                  onChange={(e) =>
                    updateLane(safeLaneIdx, (l) => ({
                      ...l,
                      wall: {
                        ...l.wall,
                        capValue: Math.max(0.001, Number(e.target.value) || 1),
                      },
                    }))
                  }
                  fullWidth
                  sx={{ mt: 1.15 }}
                />
              )}
            </Box>

            <Divider />

            {/* Pins & Mid-lane Gates */}
            <Stack spacing={1.25}>
              <Stack
                direction="row"
                sx={{ alignItems: "center", justifyContent: "space-between" }}
              >
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={activeLane.pinsEnabled}
                      onChange={(e) =>
                        updateLane(safeLaneIdx, (l) => ({
                          ...l,
                          pinsEnabled: e.target.checked,
                          pinRows: e.target.checked
                            ? Math.max(2, l.pinRows || 3)
                            : 0,
                        }))
                      }
                    />
                  }
                  label={<Typography variant="body2">启用弹珠钉阵</Typography>}
                />
                {activeLane.pinsEnabled && (
                  <TextField
                    size="small"
                    type="number"
                    label="钉排数 (1~5)"
                    value={activeLane.pinRows}
                    onChange={(e) =>
                      updateLane(safeLaneIdx, (l) => ({
                        ...l,
                        pinRows: Math.min(
                          5,
                          Math.max(1, Math.round(Number(e.target.value) || 2))
                        ),
                      }))
                    }
                    sx={{ width: 112 }}
                  />
                )}
              </Stack>

              <Stack
                direction="row"
                sx={{ alignItems: "center", justifyContent: "space-between" }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  中段算符门 ({activeLane.gates.length}/3)
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AddRoundedIcon />}
                  disabled={activeLane.gates.length >= 3}
                  onClick={() =>
                    updateLane(safeLaneIdx, (l) => {
                      const newGate: GateRowConfig = {
                        id: `gt-${Date.now()}`,
                        yRatio: 0.48,
                        layout: "single",
                        widthRatio: 0.6,
                        oscillateHz: 0.4,
                        leftSlot: { op: "mul", operand: 2.2 },
                      };
                      return { ...l, gates: [...l.gates, newGate] };
                    })
                  }
                >
                  添加算符门
                </Button>
              </Stack>

              {activeLane.gates.map((gate, gIdx) => (
                <Box
                  key={gate.id || gIdx}
                  sx={{
                    p: 1.25,
                    borderRadius: 1.5,
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Stack
                    direction="row"
                    sx={{
                      alignItems: "center",
                      justifyContent: "space-between",
                      mb: 1,
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      算符门 #{gIdx + 1}
                    </Typography>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() =>
                        updateLane(safeLaneIdx, (l) => ({
                          ...l,
                          gates: l.gates.filter((_, i) => i !== gIdx),
                        }))
                      }
                    >
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Stack>

                  <Stack spacing={1}>
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: 0.85,
                      }}
                    >
                      <FormControl size="small">
                        <InputLabel>布局</InputLabel>
                        <Select
                          label="布局"
                          value={gate.layout}
                          onChange={(e) =>
                            updateLane(safeLaneIdx, (l) => {
                              const next = [...l.gates];
                              const layout = e.target.value as "single" | "dual";
                              next[gIdx] = {
                                ...next[gIdx],
                                layout,
                                rightSlot:
                                  layout === "dual"
                                    ? next[gIdx].rightSlot ?? {
                                        op: "div",
                                        operand: 2,
                                      }
                                    : next[gIdx].rightSlot,
                              };
                              return { ...l, gates: next };
                            })
                          }
                        >
                          <MenuItem value="single">单门</MenuItem>
                          <MenuItem value="dual">双选门</MenuItem>
                        </Select>
                      </FormControl>

                      <TextField
                        size="small"
                        type="number"
                        label="高度 (0.2~0.7)"
                        slotProps={{ htmlInput: { step: 0.05 } }}
                        value={gate.yRatio}
                        onChange={(e) =>
                          updateLane(safeLaneIdx, (l) => {
                            const next = [...l.gates];
                            next[gIdx] = {
                              ...next[gIdx],
                              yRatio: Math.min(
                                0.72,
                                Math.max(0.2, Number(e.target.value) || 0.48)
                              ),
                            };
                            return { ...l, gates: next };
                          })
                        }
                      />

                      <TextField
                        size="small"
                        type="number"
                        label="横移 Hz"
                        slotProps={{ htmlInput: { step: 0.1 } }}
                        disabled={gate.layout === "dual"}
                        value={gate.oscillateHz}
                        onChange={(e) =>
                          updateLane(safeLaneIdx, (l) => {
                            const next = [...l.gates];
                            next[gIdx] = {
                              ...next[gIdx],
                              oscillateHz: Math.max(
                                0,
                                Number(e.target.value) || 0
                              ),
                            };
                            return { ...l, gates: next };
                          })
                        }
                      />
                    </Box>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns:
                          gate.leftSlot.op === "threshold_mul"
                            ? "repeat(3, minmax(0, 1fr))"
                            : "repeat(2, minmax(0, 1fr))",
                        gap: 0.85,
                      }}
                    >
                      <FormControl size="small">
                        <InputLabel>
                          {gate.layout === "dual" ? "左门算符" : "门算符"}
                        </InputLabel>
                        <Select
                          label={gate.layout === "dual" ? "左门算符" : "门算符"}
                          value={gate.leftSlot.op}
                          onChange={(e) =>
                            updateLane(safeLaneIdx, (l) => {
                              const next = [...l.gates];
                              next[gIdx] = {
                                ...next[gIdx],
                                leftSlot: {
                                  ...next[gIdx].leftSlot,
                                  op: e.target.value as GateOperator,
                                },
                              };
                              return { ...l, gates: next };
                            })
                          }
                        >
                          {GATE_OP_OPTIONS.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      {gate.leftSlot.op === "threshold_mul" && (
                        <TextField
                          size="small"
                          type="number"
                          label="门槛 T"
                          value={gate.leftSlot.threshold ?? 1000}
                          onChange={(e) =>
                            updateLane(safeLaneIdx, (l) => {
                              const next = [...l.gates];
                              next[gIdx] = {
                                ...next[gIdx],
                                leftSlot: {
                                  ...next[gIdx].leftSlot,
                                  threshold: Number(e.target.value) || 100,
                                },
                              };
                              return { ...l, gates: next };
                            })
                          }
                        />
                      )}

                      <TextField
                        size="small"
                        type="number"
                        label="数值 N"
                        slotProps={{ htmlInput: { step: 0.1 } }}
                        value={gate.leftSlot.operand}
                        onChange={(e) =>
                          updateLane(safeLaneIdx, (l) => {
                            const next = [...l.gates];
                            next[gIdx] = {
                              ...next[gIdx],
                              leftSlot: {
                                ...next[gIdx].leftSlot,
                                operand: Number(e.target.value) || 2,
                              },
                            };
                            return { ...l, gates: next };
                          })
                        }
                      />
                    </Box>

                    {gate.layout === "dual" && gate.rightSlot && (
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 0.85,
                        }}
                      >
                        <FormControl size="small">
                          <InputLabel>右门算符</InputLabel>
                          <Select
                            label="右门算符"
                            value={gate.rightSlot.op}
                            onChange={(e) =>
                              updateLane(safeLaneIdx, (l) => {
                                const next = [...l.gates];
                                next[gIdx] = {
                                  ...next[gIdx],
                                  rightSlot: {
                                    ...(next[gIdx].rightSlot ?? { operand: 2 }),
                                    op: e.target.value as GateOperator,
                                  },
                                };
                                return { ...l, gates: next };
                              })
                            }
                          >
                            {GATE_OP_OPTIONS.map((opt) => (
                              <MenuItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        <TextField
                          size="small"
                          type="number"
                          label="右门数值 N"
                          slotProps={{ htmlInput: { step: 0.1 } }}
                          value={gate.rightSlot.operand}
                          onChange={(e) =>
                            updateLane(safeLaneIdx, (l) => {
                              const next = [...l.gates];
                              next[gIdx] = {
                                ...next[gIdx],
                                rightSlot: {
                                  ...(next[gIdx].rightSlot ?? { op: "div" }),
                                  operand: Number(e.target.value) || 2,
                                },
                              };
                              return { ...l, gates: next };
                            })
                          }
                        />
                      </Box>
                    )}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Stack>
        )}

        {/* SECTION 4: Global Match Rules & Cross-Lane Coupling */}
        {section === "rules" && (
          <Stack spacing={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>比赛胜负规则</InputLabel>
              <Select
                label="比赛胜负规则"
                value={draft.rules.winRule}
                onChange={(e) =>
                  onDraftChange(
                    {
                      ...draft,
                      rules: {
                        ...draft.rules,
                        winRule: e.target.value as WinRuleType,
                      },
                    },
                    true
                  )
                }
              >
                <MenuItem value="breakthrough_timed">
                  破底竞速 + 限时兜底
                </MenuItem>
                <MenuItem value="endless_timed">无限层限时冲刺</MenuItem>
                <MenuItem value="breakthrough_untimed">纯破底无时限</MenuItem>
                <MenuItem value="push_elimination">双向推线淘汰制</MenuItem>
              </Select>
            </FormControl>

            {(draft.rules.winRule === "breakthrough_timed" ||
              draft.rules.winRule === "endless_timed") && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  比赛限时：{draft.rules.timeLimitSec} 秒
                </Typography>
                <Slider
                  size="small"
                  min={15}
                  max={120}
                  step={5}
                  value={draft.rules.timeLimitSec}
                  onChange={(_, v) =>
                    onDraftChange(
                      {
                        ...draft,
                        rules: { ...draft.rules, timeLimitSec: v as number },
                      },
                      false
                    )
                  }
                />
              </Box>
            )}

            {draft.rules.winRule === "push_elimination" && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  墙体上推速度：{draft.rules.pushSpeedPxPerSec} px/s
                </Typography>
                <Slider
                  size="small"
                  min={5}
                  max={28}
                  step={1}
                  value={draft.rules.pushSpeedPxPerSec}
                  onChange={(_, v) =>
                    onDraftChange(
                      {
                        ...draft,
                        rules: {
                          ...draft.rules,
                          pushSpeedPxPerSec: v as number,
                        },
                      },
                      false
                    )
                  }
                />
              </Box>
            )}

            <Divider />

            <Box>
              <Typography variant="caption" color="text.secondary">
                破墙向对手首层墙转嫁比例：
                <strong>
                  {Math.round(draft.coupling.sabotageTransferPct * 100)}%
                </strong>
              </Typography>
              <Slider
                size="small"
                min={0}
                max={0.8}
                step={0.05}
                value={draft.coupling.sabotageTransferPct}
                onChange={(_, v) =>
                  onDraftChange(
                    {
                      ...draft,
                      coupling: {
                        ...draft.coupling,
                        sabotageTransferPct: v as number,
                      },
                    },
                    false
                  )
                }
              />
            </Box>

            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={draft.coupling.sharedPoolEnabled}
                  onChange={(e) =>
                    onDraftChange(
                      {
                        ...draft,
                        coupling: {
                          ...draft.coupling,
                          sharedPoolEnabled: e.target.checked,
                        },
                      },
                      true
                    )
                  }
                />
              }
              label={
                <Typography variant="body2">
                  开启全赛道共享复利奖池（破里程碑者夺取）
                </Typography>
              }
            />

            {draft.coupling.sharedPoolEnabled && (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 1,
                }}
              >
                <TextField
                  size="small"
                  type="number"
                  label="初始池值"
                  value={draft.coupling.poolInitial}
                  onChange={(e) =>
                    onDraftChange(
                      {
                        ...draft,
                        coupling: {
                          ...draft.coupling,
                          poolInitial: Math.max(1, Number(e.target.value) || 1),
                        },
                      },
                      false
                    )
                  }
                />
                <TextField
                  size="small"
                  type="number"
                  label="每秒倍增"
                  slotProps={{ htmlInput: { step: 0.05 } }}
                  value={draft.coupling.poolCompoundPerSec}
                  onChange={(e) =>
                    onDraftChange(
                      {
                        ...draft,
                        coupling: {
                          ...draft.coupling,
                          poolCompoundPerSec: Math.max(
                            1,
                            Number(e.target.value) || 1
                          ),
                        },
                      },
                      false
                    )
                  }
                />
                <TextField
                  size="small"
                  type="number"
                  label="每破几层夺池"
                  value={draft.coupling.poolMilestoneEveryLayers}
                  onChange={(e) =>
                    onDraftChange(
                      {
                        ...draft,
                        coupling: {
                          ...draft.coupling,
                          poolMilestoneEveryLayers: Math.max(
                            1,
                            Math.round(Number(e.target.value) || 3)
                          ),
                        },
                      },
                      false
                    )
                  }
                />
              </Box>
            )}
          </Stack>
        )}
      </Box>

      {/* Row 5 (62px): Pinned Symmetric Action Footer */}
      <Box
        sx={{
          px: 2,
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          alignItems: "center",
          gap: 1.25,
          borderTop: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Button
          id="sandbox-apply-run-btn"
          variant="contained"
          color="primary"
          startIcon={<PlayArrowRoundedIcon />}
          onClick={() => onDraftChange({ ...draft }, true)}
          sx={{ height: 38, fontWeight: 700 }}
        >
          应用并重测
        </Button>
        <Button
          id="sandbox-open-share-btn"
          variant="contained"
          color="secondary"
          startIcon={<ShareRoundedIcon />}
          onClick={() => {
            setShareUrl("");
            setCopied(false);
            setShareOpen(true);
          }}
          sx={{ height: 38, fontWeight: 700 }}
        >
          发布挑战短链
        </Button>
      </Box>

      {/* Share & Publish Dialog */}
      <Dialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>发布纯数学挑战题 & 生成分享链接</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              发布后关卡将进入「挑战广场」供全站玩家押注竞猜；同时链接内置免数据库压缩编码，任何环境打开均可 100% 复现相同种子对局。
            </Typography>
            <TextField
              size="small"
              label="出题人署名"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              fullWidth
            />

            {!shareUrl ? (
              <Button
                id="confirm-publish-level-btn"
                variant="contained"
                color="secondary"
                disabled={publishing}
                onClick={handlePublish}
              >
                {publishing ? "正在生成短链..." : "立即生成挑战短链"}
              </Button>
            ) : (
              <Stack spacing={1.25}>
                <Alert severity="success">
                  挑战关卡已生成！复制下方链接发给好友猜猜哪条赛道赢：
                </Alert>
                <TextField
                  size="small"
                  value={shareUrl}
                  slotProps={{ input: { readOnly: true } }}
                  fullWidth
                />
                <Button
                  id="copy-share-url-btn"
                  variant="contained"
                  startIcon={<ContentCopyRoundedIcon />}
                  onClick={handleCopyUrl}
                >
                  {copied ? "✓ 已复制到剪贴板" : "复制分享链接"}
                </Button>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
