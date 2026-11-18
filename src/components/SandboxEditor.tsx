"use client";

import React, { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
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
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
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
  const [shareOpen, setShareOpen] = useState(false);
  const [authorName, setAuthorName] = useState("数字建筑师");
  const [publishing, setPublishing] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const safeLaneIdx =
    activeLaneIdx < draft.lanes.length ? activeLaneIdx : 0;
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
      onDraftChange(
        { ...draft, lanes: [...draft.lanes, thirdLane] },
        true
      );
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
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
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
    <Paper sx={{ p: 2.25, display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Header & Top Actions */}
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <Typography variant="h3">纯数字沙盒参数台</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={draft.lanes.length}
          onChange={(_, v) => {
            if (v === 2 || v === 3) handleLaneCountChange(v);
          }}
        >
          <ToggleButton id="sandbox-2lanes-btn" value={2}>
            2 赛道对决
          </ToggleButton>
          <ToggleButton id="sandbox-3lanes-btn" value={3}>
            3 赛道混战
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Stack spacing={1.25}>
        <TextField
          size="small"
          label="关卡标题"
          value={draft.title}
          onChange={(e) =>
            onDraftChange({ ...draft, title: e.target.value }, false)
          }
          fullWidth
        />
        <TextField
          size="small"
          label="数学看点 / 规则简介"
          value={draft.description}
          multiline
          minRows={2}
          onChange={(e) =>
            onDraftChange({ ...draft, description: e.target.value }, false)
          }
          fullWidth
        />
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <TextField
            size="small"
            label="确定性随机种子 (Seed)"
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
            sx={{ flexShrink: 0, height: 40 }}
          >
            换种
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1}>
        <Button
          id="sandbox-apply-run-btn"
          variant="contained"
          color="primary"
          fullWidth
          startIcon={<PlayArrowRoundedIcon />}
          onClick={() => onDraftChange({ ...draft }, true)}
        >
          应用参数并重测
        </Button>
        <Button
          id="sandbox-open-share-btn"
          variant="contained"
          color="secondary"
          fullWidth
          startIcon={<ShareRoundedIcon />}
          onClick={() => {
            setShareUrl("");
            setCopied(false);
            setShareOpen(true);
          }}
        >
          发布挑战短链
        </Button>
      </Stack>

      {/* Global Match Rules & Cross-Lane Coupling */}
      <Accordion defaultExpanded={false}>
        <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            全局胜负规则 & 跨赛道纯数字联动
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
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
                破墙数字转嫁比例（加至对手首层墙）：
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
                  开启全赛道共享指数奖池（率先破里程碑层数者独吞）
                </Typography>
              }
            />

            {draft.coupling.sharedPoolEnabled && (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
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
        </AccordionDetails>
      </Accordion>

      {/* Per-Lane Tabs */}
      <Tabs
        value={safeLaneIdx}
        onChange={(_, v) => setActiveLaneIdx(v)}
        variant="fullWidth"
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        {draft.lanes.map((lane, idx) => (
          <Tab
            key={lane.id || idx}
            label={`${idx + 1}号赛道`}
            sx={{
              color: palettes[idx % palettes.length].main,
              "&.Mui-selected": {
                color: palettes[idx % palettes.length].main,
              },
            }}
          />
        ))}
      </Tabs>

      {activeLane && (
        <Stack spacing={1.5}>
          {/* Quick Archetype Templates */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 0.75 }}
            >
              一键套用纯数学流派模板（保留当前墙体）：
            </Typography>
            <Stack
              direction="row"
              spacing={0.75}
              useFlexGap
              sx={{ flexWrap: "wrap" }}
            >
              {LANE_TEMPLATES.map((tpl) => (
                <Chip
                  key={tpl.id}
                  size="small"
                  label={tpl.name}
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
                  sx={{ cursor: "pointer" }}
                />
              ))}
            </Stack>
          </Box>

          {/* Ball Parameters */}
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                球体物理与穿透参数
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1.5}>
                <TextField
                  size="small"
                  label="赛道名称"
                  value={activeLane.name}
                  onChange={(e) =>
                    updateLane(safeLaneIdx, (l) => ({
                      ...l,
                      name: e.target.value,
                    }))
                  }
                  fullWidth
                />

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 1,
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
                          initialValue: Math.max(
                            0.01,
                            Number(e.target.value) || 1
                          ),
                        },
                      }))
                    }
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="每秒顶部补球 (0=封闭)"
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
                    label="撞墙寿命 (0=无限弹跳)"
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
                    label="弹射初速度 (px/s)"
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
                    label="余量穿透比例 (0~1)"
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
              </Stack>
            </AccordionDetails>
          </Accordion>

          {/* Exponential Growth Triggers */}
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                纯数字指数触发器 ({activeLane.ball.triggers.length})
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1.25}>
                {activeLane.ball.triggers.map((trig, tIdx) => (
                  <Box
                    key={trig.id || tIdx}
                    sx={{
                      p: 1.25,
                      borderRadius: 1.25,
                      border: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Stack
                      direction="row"
                      spacing={0.75}
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
                        gridTemplateColumns: "repeat(2, 1fr)",
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
                          <MenuItem value="boundary_hits">每碰任意边界 K 次</MenuItem>
                          <MenuItem value="time_sec">每存活 T 秒</MenuItem>
                          <MenuItem value="wall_breaks">每击碎 K 层墙</MenuItem>
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

                      <Stack direction="row" spacing={0.75}>
                        <FormControl size="small" sx={{ minWidth: 74 }}>
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
                          fullWidth
                        />
                      </Stack>
                    </Box>
                  </Box>
                ))}

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
                  新增增长触发器
                </Button>
              </Stack>
            </AccordionDetails>
          </Accordion>

          {/* Mid-lane Math Gates & Pins */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                中段算符门 ({activeLane.gates.length}) & 几何弹珠钉
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1.5}>
                <Stack
                  direction="row"
                  spacing={1.5}
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
                    label={<Typography variant="body2">启用纯物理弹珠钉</Typography>}
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
                      sx={{ width: 110 }}
                    />
                  )}
                </Stack>

                <Divider />

                {activeLane.gates.map((gate, gIdx) => (
                  <Box
                    key={gate.id || gIdx}
                    sx={{
                      p: 1.25,
                      borderRadius: 1.25,
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
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: 1,
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
                            <MenuItem value="single">单门 (可横移)</MenuItem>
                            <MenuItem value="dual">左右双选门</MenuItem>
                          </Select>
                        </FormControl>

                        <TextField
                          size="small"
                          type="number"
                          label="高度比例 (0.2~0.7)"
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
                          label="横移频率 Hz"
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

                      {/* Left / Primary Gate Slot */}
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns:
                            gate.leftSlot.op === "threshold_mul"
                              ? "repeat(3, 1fr)"
                              : "repeat(2, 1fr)",
                          gap: 1,
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
                            label="触发门槛 T"
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
                          label="算符数值 N"
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

                      {/* Right Gate Slot when Dual */}
                      {gate.layout === "dual" && gate.rightSlot && (
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, 1fr)",
                            gap: 1,
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
                                      ...(next[gIdx].rightSlot ?? {
                                        operand: 2,
                                      }),
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
                  添加算符门（最多 3 层）
                </Button>
              </Stack>
            </AccordionDetails>
          </Accordion>

          {/* Bottom Number Wall Parameters */}
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                底层数字墙与限流/自增
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1.25}>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 1,
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
                    label="首层墙初始数字"
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
                    <InputLabel>层间递增算符</InputLabel>
                    <Select
                      label="层间递增算符"
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
                      <MenuItem value="fixed">固定数值上限 (-K)</MenuItem>
                      <MenuItem value="max_pct">最大墙值比例 (-X%)</MenuItem>
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
                  />
                )}

                <Button
                  id="sandbox-sync-wall-btn"
                  size="small"
                  variant="outlined"
                  startIcon={<SyncAltRoundedIcon />}
                  onClick={handleSyncWallToAll}
                >
                  将此墙体配置同步至全部赛道（公平对照）
                </Button>
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Stack>
      )}

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
              发布后关卡将进入「挑战广场」供全站玩家押注竞猜；同时链接内置免数据库压缩编码，任何环境打开链接均可 100% 复现相同种子对局。
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
