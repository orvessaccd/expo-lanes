import type { BigFloat } from "./bigNumber";

/**
 * Pure Numeric Exponential Lane Racing — Schema & Simulation State Types
 * Zero RPG skills (no freeze/shield/poison); 100% pure numbers & mathematical operators.
 */

export type WinRuleType =
  | "breakthrough_timed" // 破底竞速 + 限时兜底
  | "endless_timed" // 无限层限时冲刺
  | "breakthrough_untimed" // 纯破底无时限
  | "push_elimination"; // 双向推线淘汰制

export type TriggerCondition =
  | "wall_hits" // 每撞墙 K 次
  | "boundary_hits" // 每碰撞任意边界 K 次
  | "time_sec" // 每存活 T 秒
  | "wall_breaks"; // 每击碎 1/K 层墙

export type TriggerTarget = "ball_value" | "ball_count" | "ball_speed";

export type MathOp = "add" | "mul" | "pow";

export interface GrowthTriggerConfig {
  id: string;
  when: TriggerCondition;
  every: number;
  target: TriggerTarget;
  op: MathOp;
  operand: number;
}

export interface BallConfig {
  /** Initial balls spawned at t = 0 */
  initialCount: number;
  /** Starting numeric face value per ball */
  initialValue: number;
  /** Additional balls emitted from top spawn bar per second (0 = closed arena) */
  spawnPerSec: number;
  /** Max wall hits before ball expires (0 = infinite permanent bounce) */
  maxHitsPerBall: number;
  /** Base speed in logical px/s (e.g., 260 ~ 520) */
  baseSpeed: number;
  /** Overkill damage carried into next wall layer (0.0 ~ 1.0) */
  overflowPenetration: number;
  /** Pure numeric exponential triggers */
  triggers: GrowthTriggerConfig[];
}

export type GateOperator =
  | "add" // +N
  | "sub" // -N
  | "mul" // ×N
  | "div" // ÷N
  | "pow" // ^N
  | "sqrt" // √
  | "split_merge" // 球值÷N, 球数×N
  | "threshold_mul"; // 球值 ≥ threshold 才触发 ×N

export interface GateSlotConfig {
  op: GateOperator;
  operand: number;
  /** Used only when op === 'threshold_mul' */
  threshold?: number;
}

export interface GateRowConfig {
  id: string;
  /** Vertical position ratio within upper arena (0.18 ~ 0.68) */
  yRatio: number;
  /** Single gate (can oscillate) or side-by-side dual choice gate */
  layout: "single" | "dual";
  /** Width ratio for single gate (0.25 ~ 0.95) */
  widthRatio: number;
  /** Horizontal oscillation speed (0 = fixed, >0 = cycles/sec) */
  oscillateHz: number;
  leftSlot: GateSlotConfig;
  rightSlot?: GateSlotConfig;
}

export type WallCapMode = "none" | "fixed" | "max_pct";

export interface WallConfig {
  /** Total wall layers to break (ignored in endless_timed) */
  totalLayers: number;
  /** Layer 1 initial numeric HP */
  baseValue: number;
  /** Layer-to-layer progression operator */
  layerOp: MathOp;
  /** Layer-to-layer progression operand */
  layerOperand: number;
  /** Compound multiplier per second on active front wall (1.0 = no regen, 1.08 = +8%/s) */
  compoundPerSec: number;
  /** Per-single-ball-hit damage cap mode */
  capMode: WallCapMode;
  /** Cap value: fixed number for 'fixed', or 0~1 fraction (e.g. 0.05 = 5%) for 'max_pct' */
  capValue: number;
}

export interface CrossLaneCouplingConfig {
  /** Fraction (0 ~ 1) of broken wall's initial HP added (+) to opponents' front wall */
  sabotageTransferPct: number;
  /** Enable shared exponentially growing milestone number pool */
  sharedPoolEnabled: boolean;
  /** Initial numeric value in shared pool */
  poolInitial: number;
  /** Shared pool compound growth per second (e.g. 1.15 = +15%/s) */
  poolCompoundPerSec: number;
  /** Claim pool every K broken layers (first lane to reach each milestone takes all) */
  poolMilestoneEveryLayers: number;
}

export interface LaneConfig {
  id: string;
  name: string;
  subtitle?: string;
  ball: BallConfig;
  gates: GateRowConfig[];
  pinsEnabled: boolean;
  pinRows: number;
  wall: WallConfig;
}

export interface MatchRulesConfig {
  winRule: WinRuleType;
  /** Time limit in seconds for breakthrough_timed & endless_timed */
  timeLimitSec: number;
  /** Upward wall push speed (px/s) for push_elimination */
  pushSpeedPxPerSec: number;
}

export interface MatchConfig {
  id: string;
  title: string;
  description: string;
  /** Intuition trap hint / mathematical takeaway shown after settlement */
  mathInsight?: string;
  tags?: string[];
  difficulty?: "入门" | "进阶" | "烧脑" | "奇点";
  seed: string;
  rules: MatchRulesConfig;
  coupling: CrossLaneCouplingConfig;
  /** 2 or 3 lanes */
  lanes: LaneConfig[];
}

/* ======================== Runtime Simulation State ======================== */

export interface BallEntity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** Numeric value written on each ball */
  value: BigFloat;
  /** Stacked ball count (×N颗) represented by this physical entity */
  stackCount: BigFloat;
  wallHits: number;
  boundaryHits: number;
  aliveSec: number;
  /** Per-gate-row cooldown map (gateRowId -> remaining cooldown seconds) */
  gateCooldowns: Record<string, number>;
}

export interface PinObstacle {
  x: number;
  y: number;
  radius: number;
}

export interface ActiveWallLayer {
  layerIndex: number; // 0-indexed
  initialValue: BigFloat;
  maxHp: BigFloat;
  currentHp: BigFloat;
}

export interface VisualFloatText {
  id: number;
  laneIndex: number;
  x: number;
  y: number;
  text: string;
  kind: "hit" | "gate" | "break" | "sabotage" | "jackpot";
  age: number;
  ttl: number;
}

export interface ShatterParticle {
  id: number;
  laneIndex: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  age: number;
  ttl: number;
}

export interface SimSoundEvent {
  type: "hit" | "gate" | "wall_break" | "jackpot" | "sabotage" | "finish";
  laneIndex: number;
  intensity: number; // 0 ~ 1 or layer index for musical pitch
}

export interface LaneRuntimeState {
  laneIndex: number;
  config: LaneConfig;
  balls: BallEntity[];
  pins: PinObstacle[];
  /** Currently exposed front wall (null when all finite layers cleared) */
  frontWall: ActiveWallLayer | null;
  /** Preview of upcoming 3 wall layers below frontWall */
  upcomingWalls: ActiveWallLayer[];
  brokenLayers: number;
  totalDamageDealt: BigFloat;
  /** Current Y coordinate of the top edge of frontWall */
  wallTopY: number;
  spawnAccumulator: number;
  eliminated: boolean;
  eliminatedAtSec: number | null;
  clearedAtSec: number | null;
  /** Aggregated stats for HUD & telemetry */
  totalBallCount: BigFloat;
  maxBallValue: BigFloat;
  totalOutputPower: BigFloat;
}

export interface TelemetryLanePoint {
  outputLog10: number;
  wallLog10: number;
  brokenLayers: number;
  ballsLog10: number;
}

export interface TelemetrySample {
  time: number;
  lanes: TelemetryLanePoint[];
}

export interface SimulationState {
  config: MatchConfig;
  status: "ready" | "running" | "paused" | "finished";
  elapsedSec: number;
  stepCount: number;
  lanes: LaneRuntimeState[];
  sharedPoolValue: BigFloat;
  /** Milestone layer numbers already claimed across the arena */
  claimedMilestones: Record<number, number>; // milestoneLayer -> winnerLaneIndex
  winnerLaneIndex: number | null;
  winReason: string;
  /** Final ranking of lane indices from 1st to last */
  ranking: number[];
  telemetry: TelemetrySample[];
  telemetryAccumulator: number;
  floatTexts: VisualFloatText[];
  particles: ShatterParticle[];
  pendingSounds: SimSoundEvent[];
}
