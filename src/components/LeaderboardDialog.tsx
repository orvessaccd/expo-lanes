"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import PublishRoundedIcon from "@mui/icons-material/PublishRounded";
import {
  BigFloat,
  NumberFormatStyle,
  bf,
  formatBigFloat,
} from "@/engine/bigNumber";
import type { LeaderboardEntry } from "@/lib/storage";

export interface LeaderboardDialogProps {
  open: boolean;
  onClose: () => void;
  bankroll: BigFloat;
  maxStreak: number;
  formatStyle: NumberFormatStyle;
}

const NICKNAME_KEY = "expo-lanes:nickname";

export default function LeaderboardDialog({
  open,
  onClose,
  bankroll,
  maxStreak,
  formatStyle,
}: LeaderboardDialogProps) {
  const [tab, setTab] = useState<"chips" | "streak">("chips");
  const [nickname, setNickname] = useState("");
  const [topChips, setTopChips] = useState<LeaderboardEntry[]>([]);
  const [topStreaks, setTopStreaks] = useState<LeaderboardEntry[]>([]);
  const [backendMode, setBackendMode] = useState<"upstash" | "memory">("memory");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(NICKNAME_KEY);
      if (saved) setNickname(saved);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setFeedback(null);
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.topChips)) setTopChips(data.topChips);
        if (Array.isArray(data.topStreaks)) setTopStreaks(data.topStreaks);
        if (data.storageBackend) setBackendMode(data.storageBackend);
      })
      .catch(() => {});
  }, [open]);

  const handleSubmit = async () => {
    const clean = nickname.trim();
    if (!clean) {
      setFeedback("请先输入你的排行榜代号");
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      window.localStorage.setItem(NICKNAME_KEY, clean);
    } catch {
      // ignore
    }

    try {
      const chipsRaw =
        bankroll.sign <= 0 ? "0" : `${bankroll.m.toFixed(5)}e${bankroll.e}`;
      const res = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: clean,
          chipsRaw,
          maxStreak,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (Array.isArray(data.topChips)) setTopChips(data.topChips);
        if (Array.isArray(data.topStreaks)) setTopStreaks(data.topStreaks);
        setFeedback("成绩已同步至排行榜！");
      } else {
        setFeedback(data.error || "提交失败");
      }
    } catch {
      setFeedback("网络请求异常，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const rows = tab === "chips" ? topChips : topStreaks;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack
          direction="row"
          sx={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <EmojiEventsRoundedIcon color="secondary" />
            <Typography variant="h3">全站指数复利排行榜</Typography>
            <Chip
              size="small"
              variant="outlined"
              label={backendMode === "upstash" ? "Upstash Redis 实时榜" : "本地/内存榜"}
            />
          </Stack>
          <IconButton onClick={onClose} size="small" aria-label="关闭排行榜">
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        {/* Submit Current Score Box */}
        <Box
          sx={{
            p: 1.75,
            mb: 2,
            borderRadius: 1.5,
            bgcolor: "action.hover",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="caption" color="text.secondary">
            我的当前成绩：筹码{" "}
            <strong className="tabular-nums">
              {formatBigFloat(bankroll, formatStyle, 2)}
            </strong>{" "}
            · 历史最高连胜{" "}
            <strong className="tabular-nums">{maxStreak}</strong> 场
          </Typography>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ mt: 1 }}
          >
            <TextField
              id="leaderboard-nickname-input"
              size="small"
              placeholder="输入代号（如Gauss_Prime）"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              fullWidth
            />
            <Button
              id="submit-leaderboard-btn"
              variant="contained"
              color="secondary"
              startIcon={<PublishRoundedIcon />}
              disabled={submitting}
              onClick={handleSubmit}
              sx={{ flexShrink: 0 }}
            >
              上传成绩
            </Button>
          </Stack>

          {feedback && (
            <Alert severity="info" sx={{ mt: 1, py: 0.25 }}>
              {feedback}
            </Alert>
          )}
        </Box>

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ mb: 1.5, borderBottom: 1, borderColor: "divider" }}
        >
          <Tab value="chips" label="最高筹码榜（指数滚雪球）" />
          <Tab value="streak" label="最高连胜榜" />
        </Tabs>

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={64}>排名</TableCell>
              <TableCell>玩家代号</TableCell>
              <TableCell align="right">最高筹码</TableCell>
              <TableCell align="right">最高连胜</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((entry, idx) => (
              <TableRow key={entry.id || entry.nickname}>
                <TableCell className="tabular-nums" sx={{ fontWeight: 700 }}>
                  #{idx + 1}
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{entry.nickname}</TableCell>
                <TableCell
                  align="right"
                  className="tabular-nums"
                  sx={{ color: "secondary.main", fontWeight: 700 }}
                >
                  {formatBigFloat(bf(entry.chipsRaw), formatStyle, 2)}
                </TableCell>
                <TableCell align="right" className="tabular-nums">
                  {entry.maxStreak} 连胜
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
