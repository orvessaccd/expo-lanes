import { NumberFormatStyle, formatBigFloat } from "@/engine/bigNumber";
import { formatGateSlotLabel } from "@/engine/simulation";
import type {
  GrowthTriggerConfig,
  LaneConfig,
  MatchConfig,
  WallConfig,
  WinRuleType,
} from "@/engine/types";

export const WIN_RULE_SHORT: Record<WinRuleType, string> = {
  breakthrough_timed: "破底竞速",
  endless_timed: "无限层冲刺",
  breakthrough_untimed: "无时限破底",
  push_elimination: "推线淘汰制",
};

function isSameWall(a: WallConfig, b: WallConfig): boolean {
  return (
    a.totalLayers === b.totalLayers &&
    a.baseValue === b.baseValue &&
    a.layerOp === b.layerOp &&
    a.layerOperand === b.layerOperand &&
    a.compoundPerSec === b.compoundPerSec &&
    a.capMode === b.capMode &&
    a.capValue === b.capValue
  );
}

export function formatWallConcise(
  wall: WallConfig,
  winRule: WinRuleType,
  fmt: NumberFormatStyle
): string {
  const layerStr =
    winRule === "endless_timed" ? "无限层" : `${wall.totalLayers}层`;
  const opStr =
    wall.layerOp === "add"
      ? `+${formatBigFloat(wall.layerOperand, fmt, 1)}/层`
      : wall.layerOp === "mul"
        ? `×${wall.layerOperand}/层`
        : `^${wall.layerOperand}/层`;

  const extras: string[] = [];
  if (wall.capMode === "fixed") {
    extras.push(`单球限伤 ${formatBigFloat(wall.capValue, fmt, 1)}`);
  } else if (wall.capMode === "max_pct") {
    extras.push(`单球限伤 ${Math.round(wall.capValue * 100)}%`);
  }
  if (wall.compoundPerSec > 1.0001) {
    extras.push(`墙自增 ×${wall.compoundPerSec}/s`);
  }

  const base = `${layerStr} · 首层 ${formatBigFloat(wall.baseValue, fmt, 1)} (${opStr})`;
  return extras.length > 0 ? `${base} · ${extras.join(" · ")}` : base;
}

export interface MatchHeaderSummary {
  ruleBadge: string;
  sharedWallBadge: string | null;
  couplingBadge: string | null;
  wallsIdentical: boolean;
}

export function getMatchHeaderSummary(
  config: MatchConfig,
  fmt: NumberFormatStyle
): MatchHeaderSummary {
  const { rules, coupling, lanes } = config;

  let ruleBadge = WIN_RULE_SHORT[rules.winRule];
  if (
    rules.winRule === "breakthrough_timed" ||
    rules.winRule === "endless_timed"
  ) {
    ruleBadge += ` · 限时 ${rules.timeLimitSec}s`;
  } else if (rules.winRule === "push_elimination") {
    ruleBadge += ` · 上推 ${rules.pushSpeedPxPerSec}px/s`;
  }

  const wallsIdentical =
    lanes.length > 0 && lanes.every((l) => isSameWall(l.wall, lanes[0].wall));

  const sharedWallBadge =
    wallsIdentical && lanes[0]
      ? `目标墙：${formatWallConcise(lanes[0].wall, rules.winRule, fmt)}`
      : null;

  const couplingParts: string[] = [];
  if (coupling.sabotageTransferPct > 0) {
    couplingParts.push(
      `破墙向对手转嫁 +${Math.round(coupling.sabotageTransferPct * 100)}%`
    );
  }
  if (coupling.sharedPoolEnabled) {
    couplingParts.push(
      `公共复利池 (每破${coupling.poolMilestoneEveryLayers}层夺取)`
    );
  }

  return {
    ruleBadge,
    sharedWallBadge,
    couplingBadge: couplingParts.length > 0 ? couplingParts.join(" · ") : null,
    wallsIdentical,
  };
}

function formatTriggerShort(t: GrowthTriggerConfig, fmt: NumberFormatStyle): string {
  const cond =
    t.when === "wall_hits"
      ? t.every === 1
        ? "每撞墙"
        : `撞墙${t.every}次`
      : t.when === "boundary_hits"
        ? t.every === 1
          ? "每碰壁"
          : `碰壁${t.every}次`
        : t.when === "time_sec"
          ? `每${t.every}秒`
          : t.every === 1
            ? "每破1层"
            : `破${t.every}层`;

  const tgt =
    t.target === "ball_value"
      ? "球值"
      : t.target === "ball_count"
        ? "球数"
        : "速度";

  const op =
    t.op === "add"
      ? `+${formatBigFloat(t.operand, fmt, 1)}`
      : t.op === "mul"
        ? `×${t.operand}`
        : `^${t.operand}`;

  return `${cond}${tgt}${op}`;
}

export interface LaneAlignedSpecs {
  start: string;
  growth: string;
  mechanism: string;
}

/**
 * Produces 3 strictly aligned, single-line scannable specs for each lane column
 */
export function getLaneAlignedSpecs(
  lane: LaneConfig,
  wallsIdentical: boolean,
  winRule: WinRuleType,
  fmt: NumberFormatStyle
): LaneAlignedSpecs {
  const b = lane.ball;
  const startParts = [
    `${b.initialCount}球 × 初值 ${formatBigFloat(b.initialValue, fmt, 1)}`,
  ];
  if (b.spawnPerSec > 0) {
    startParts.push(`+${b.spawnPerSec}球/s`);
  }
  if (b.maxHitsPerBall > 0) {
    startParts.push(`限${b.maxHitsPerBall}撞`);
  }
  if (b.overflowPenetration > 0) {
    startParts.push(`穿透${Math.round(b.overflowPenetration * 100)}%`);
  }

  const growth =
    b.triggers.length > 0
      ? b.triggers.map((t) => formatTriggerShort(t, fmt)).join(" · ")
      : "固定球值（无自身触发增长）";

  const mechParts: string[] = [];
  if (lane.gates.length > 0) {
    const gLabels = lane.gates.map((g) => {
      const left = formatGateSlotLabel(g.leftSlot, fmt);
      if (g.layout === "dual" && g.rightSlot) {
        return `[${left} | ${formatGateSlotLabel(g.rightSlot, fmt)}]`;
      }
      return g.oscillateHz > 0 ? `横移门[${left}]` : `门[${left}]`;
    });
    mechParts.push(gLabels.join(" "));
  }
  if (lane.pinsEnabled && lane.pinRows > 0) {
    mechParts.push(`钉阵${lane.pinRows}排`);
  }
  if (!wallsIdentical) {
    mechParts.push(`独立墙: ${formatWallConcise(lane.wall, winRule, fmt)}`);
  }

  return {
    start: startParts.join(" · "),
    growth,
    mechanism: mechParts.length > 0 ? mechParts.join(" · ") : "无中段门 · 物理直落",
  };
}
