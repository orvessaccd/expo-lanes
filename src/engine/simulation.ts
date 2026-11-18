import {
  BF_ONE,
  BF_ZERO,
  BigFloat,
  NumberFormatStyle,
  bf,
  bfAdd,
  bfCmp,
  bfDiv,
  bfDivNum,
  bfGt,
  bfGte,
  bfIsZero,
  bfLog10Safe,
  bfMax,
  bfMin,
  bfMul,
  bfMulNum,
  bfPowNum,
  bfSqrt,
  bfSub,
  bfSubClampZero,
  bfToNumber,
  formatBigFloat,
} from "./bigNumber";
import { hashSeed } from "./prng";
import {
  ActiveWallLayer,
  BallEntity,
  GateRowConfig,
  GateSlotConfig,
  GrowthTriggerConfig,
  LaneConfig,
  LaneRuntimeState,
  MathOp,
  MatchConfig,
  PinObstacle,
  SimulationState,
  TelemetrySample,
  WallConfig,
} from "./types";

export const LANE_WIDTH = 300;
export const LANE_HEIGHT = 560;
export const SPAWN_LINE_Y = 38;
export const DEFAULT_WALL_TOP_Y = 446;
export const WALL_LAYER_HEIGHT = 28;
export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;
export const MAX_PHYSICAL_BALLS_PER_LANE = 70;
export const MAX_BALL_SPEED = 1120;
export const MIN_BALL_SPEED = 150;
export const BALL_RADIUS = 8.5;

export interface GateBoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
  slot: GateSlotConfig;
  side: "left" | "right" | "single";
}

/**
 * Deterministic inline Mulberry32 step on integer state stored inside SimulationState
 */
function nextRng(stateObj: { rngState: number }): number {
  let s = (stateObj.rngState + 0x6d2b79f5) | 0;
  stateObj.rngState = s;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export interface InternalSimState extends SimulationState {
  rngState: number;
  nextEntityId: number;
  visualRngState: number;
}

function nextVisualRand(state: InternalSimState): number {
  let s = (state.visualRngState + 0x9e3779b9) | 0;
  state.visualRngState = s;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function applyMathOp(base: BigFloat, op: MathOp, operand: number): BigFloat {
  switch (op) {
    case "add":
      return bfAdd(base, bf(operand));
    case "mul":
      return bfMulNum(base, Math.max(0, operand));
    case "pow":
      return bfPowNum(base, Math.max(0.01, operand));
    default:
      return base;
  }
}

export function computeWallLayerInitialHp(
  wallCfg: WallConfig,
  layerIndex: number
): BigFloat {
  const base = bf(Math.max(1, wallCfg.baseValue));
  if (layerIndex <= 0) return base;

  switch (wallCfg.layerOp) {
    case "add":
      return bfMax(
        BF_ONE,
        bfAdd(base, bfMulNum(bf(wallCfg.layerOperand), layerIndex))
      );
    case "mul":
      return bfMax(
        BF_ONE,
        bfMul(base, bfPowNum(bf(Math.max(1, wallCfg.layerOperand)), layerIndex))
      );
    case "pow": {
      const safeOp = Math.max(1.001, wallCfg.layerOperand);
      // Avoid exponentiating values <= 1 which wouldn't grow
      const effectiveBase = bfGt(base, bf(1.2)) ? base : bf(2);
      const totalPower = Math.pow(safeOp, Math.min(layerIndex, 400));
      return bfPowNum(effectiveBase, totalPower);
    }
    default:
      return base;
  }
}

export function makeWallLayer(
  wallCfg: WallConfig,
  layerIndex: number
): ActiveWallLayer {
  const hp = computeWallLayerInitialHp(wallCfg, layerIndex);
  return {
    layerIndex,
    initialValue: hp,
    maxHp: hp,
    currentHp: hp,
  };
}

export function buildLanePins(laneCfg: LaneConfig): PinObstacle[] {
  if (!laneCfg.pinsEnabled || laneCfg.pinRows <= 0) return [];
  const rows = Math.min(5, Math.max(1, Math.round(laneCfg.pinRows)));
  const pins: PinObstacle[] = [];
  const topY = 148;
  const bottomY = 340;
  const rowGap = rows === 1 ? 0 : (bottomY - topY) / (rows - 1);

  for (let r = 0; r < rows; r++) {
    const y = rows === 1 ? 235 : topY + r * rowGap;
    const isOdd = r % 2 === 1;
    const count = isOdd ? 4 : 5;
    const marginX = isOdd ? 56 : 38;
    const span = LANE_WIDTH - marginX * 2;
    const stepX = count > 1 ? span / (count - 1) : 0;
    for (let c = 0; c < count; c++) {
      pins.push({
        x: marginX + c * stepX,
        y,
        radius: 5.5,
      });
    }
  }
  return pins;
}

export function getGateRowBoxes(
  row: GateRowConfig,
  elapsedSec: number
): GateBoxRect[] {
  const gateHeight = 24;
  const y = Math.max(
    SPAWN_LINE_Y + 34,
    Math.min(DEFAULT_WALL_TOP_Y - 56, row.yRatio * DEFAULT_WALL_TOP_Y)
  );
  const pad = 8;
  const usableWidth = LANE_WIDTH - pad * 2;

  if (row.layout === "dual" && row.rightSlot) {
    const gap = 8;
    const halfW = (usableWidth - gap) / 2;
    return [
      {
        x: pad,
        y: y - gateHeight / 2,
        width: halfW,
        height: gateHeight,
        slot: row.leftSlot,
        side: "left",
      },
      {
        x: pad + halfW + gap,
        y: y - gateHeight / 2,
        width: halfW,
        height: gateHeight,
        slot: row.rightSlot,
        side: "right",
      },
    ];
  }

  const wRatio = Math.max(0.22, Math.min(0.96, row.widthRatio || 0.55));
  const width = usableWidth * wRatio;
  const maxTravel = usableWidth - width;
  let offsetRatio = 0.5;
  if (row.oscillateHz > 0 && maxTravel > 1) {
    offsetRatio = 0.5 + 0.5 * Math.sin(elapsedSec * row.oscillateHz * Math.PI * 2);
  }
  const x = pad + maxTravel * offsetRatio;

  return [
    {
      x,
      y: y - gateHeight / 2,
      width,
      height: gateHeight,
      slot: row.leftSlot,
      side: "single",
    },
  ];
}

export function formatGateSlotLabel(
  slot: GateSlotConfig,
  style: NumberFormatStyle = "intl"
): string {
  const opVal = formatBigFloat(slot.operand, style, 2);
  switch (slot.op) {
    case "add":
      return `+${opVal}`;
    case "sub":
      return `-${opVal}`;
    case "mul":
      return `×${opVal}`;
    case "div":
      return `÷${opVal}`;
    case "pow":
      return `^${slot.operand}`;
    case "sqrt":
      return `√x`;
    case "split_merge":
      if (slot.operand >= 1) {
        return `÷${slot.operand} · 球×${slot.operand}`;
      } else {
        const inv = Math.round((1 / Math.max(0.01, slot.operand)) * 10) / 10;
        return `×${inv} · 球÷${inv}`;
      }
    case "threshold_mul": {
      const th = formatBigFloat(slot.threshold ?? 100, style, 1);
      return `≥${th} ⇒ ×${opVal}`;
    }
    default:
      return `×${opVal}`;
  }
}

function clampSpeedVector(vx: number, vy: number, targetMax = MAX_BALL_SPEED) {
  let speed = Math.hypot(vx, vy);
  if (speed < 1e-5) {
    return { vx: 40, vy: 260 };
  }
  const clamped = Math.min(targetMax, Math.max(MIN_BALL_SPEED, speed));
  let nx = vx / speed;
  let ny = vy / speed;

  // Enforce minimum vertical velocity component so balls never bounce horizontally forever
  if (Math.abs(ny) < 0.3) {
    const signY = ny >= 0 ? 1 : -1;
    const signX = nx >= 0 ? 1 : -1;
    ny = 0.32 * signY;
    nx = Math.sqrt(Math.max(0.01, 1 - ny * ny)) * signX;
  }

  return {
    vx: nx * clamped,
    vy: ny * clamped,
  };
}

function createSpawnedBalls(
  state: InternalSimState,
  laneCfg: LaneConfig,
  totalCountNum: number,
  initialValue: BigFloat
): BallEntity[] {
  const count = Math.max(0, Math.floor(totalCountNum));
  if (count === 0) return [];

  const physicalCount = Math.min(count, MAX_PHYSICAL_BALLS_PER_LANE);
  const baseStack = Math.floor(count / physicalCount);
  const remainder = count - baseStack * physicalCount;

  const balls: BallEntity[] = [];
  for (let i = 0; i < physicalCount; i++) {
    const spreadRatio =
      physicalCount === 1 ? 0.5 : (i + 0.5) / physicalCount;
    const jitter = (nextRng(state) - 0.5) * 26;
    const x = Math.max(
      BALL_RADIUS + 8,
      Math.min(
        LANE_WIDTH - BALL_RADIUS - 8,
        36 + spreadRatio * (LANE_WIDTH - 72) + jitter
      )
    );
    const y = SPAWN_LINE_Y + 14 + nextRng(state) * 10;

    // Launch downward at slight fan angle (-34 deg to +34 deg from vertical)
    const angleDeg = (nextRng(state) - 0.5) * 64;
    const angleRad = (angleDeg * Math.PI) / 180;
    const speed = Math.min(
      MAX_BALL_SPEED,
      Math.max(MIN_BALL_SPEED, laneCfg.ball.baseSpeed || 320)
    );
    const vx = Math.sin(angleRad) * speed;
    const vy = Math.cos(angleRad) * speed;
    const stackInt = i < remainder ? baseStack + 1 : baseStack;

    balls.push({
      id: state.nextEntityId++,
      x,
      y,
      vx,
      vy,
      radius: BALL_RADIUS,
      value: initialValue,
      stackCount: bf(stackInt),
      wallHits: 0,
      boundaryHits: 0,
      aliveSec: 0,
      gateCooldowns: {},
    });
  }
  return balls;
}

function populateUpcomingWalls(
  lane: LaneRuntimeState,
  isEndless: boolean
): void {
  const wallCfg = lane.config.wall;
  const maxTotal = isEndless ? Infinity : Math.max(1, wallCfg.totalLayers);

  if (!lane.frontWall && lane.brokenLayers < maxTotal) {
    lane.frontWall = makeWallLayer(wallCfg, lane.brokenLayers);
  }

  lane.upcomingWalls = [];
  if (!lane.frontWall) return;

  for (let offset = 1; offset <= 3; offset++) {
    const idx = lane.frontWall.layerIndex + offset;
    if (idx < maxTotal) {
      lane.upcomingWalls.push(makeWallLayer(wallCfg, idx));
    }
  }
}

function refreshLaneStats(lane: LaneRuntimeState): void {
  let totalBalls = BF_ZERO;
  let maxVal = BF_ZERO;
  let totalPower = BF_ZERO;

  for (const b of lane.balls) {
    totalBalls = bfAdd(totalBalls, b.stackCount);
    if (bfGt(b.value, maxVal)) {
      maxVal = b.value;
    }
    totalPower = bfAdd(totalPower, bfMul(b.value, b.stackCount));
  }

  lane.totalBallCount = totalBalls;
  lane.maxBallValue = maxVal;
  lane.totalOutputPower = totalPower;
}

function recordTelemetrySample(state: SimulationState): void {
  const sample: TelemetrySample = {
    time: Math.round(state.elapsedSec * 100) / 100,
    lanes: state.lanes.map((lane) => ({
      outputLog10: bfLog10Safe(lane.totalOutputPower, 0),
      wallLog10: lane.frontWall
        ? bfLog10Safe(lane.frontWall.currentHp, 0)
        : 0,
      brokenLayers: lane.brokenLayers,
      ballsLog10: bfLog10Safe(lane.totalBallCount, 0),
    })),
  };
  state.telemetry.push(sample);
  // Cap telemetry array to ~400 samples so ultra-long untimed runs stay featherlight
  if (state.telemetry.length > 480) {
    state.telemetry = state.telemetry.filter((_, idx) => idx % 2 === 0);
  }
}

export function createSimulation(config: MatchConfig): SimulationState {
  const seedInt = hashSeed(config.seed || "expo-lanes-2026");
  const isEndless = config.rules.winRule === "endless_timed";

  const state: InternalSimState = {
    config,
    status: "ready",
    elapsedSec: 0,
    stepCount: 0,
    lanes: [],
    sharedPoolValue: config.coupling.sharedPoolEnabled
      ? bf(Math.max(1, config.coupling.poolInitial))
      : BF_ZERO,
    claimedMilestones: {},
    winnerLaneIndex: null,
    winReason: "",
    ranking: [],
    telemetry: [],
    telemetryAccumulator: 0,
    floatTexts: [],
    particles: [],
    pendingSounds: [],
    rngState: seedInt,
    nextEntityId: 1,
    visualRngState: (seedInt ^ 0x5bd1e995) >>> 0,
  };

  state.lanes = config.lanes.map((laneCfg, idx) => {
    const initialVal = bf(Math.max(0.01, laneCfg.ball.initialValue));
    const balls = createSpawnedBalls(
      state,
      laneCfg,
      laneCfg.ball.initialCount,
      initialVal
    );
    const laneState: LaneRuntimeState = {
      laneIndex: idx,
      config: laneCfg,
      balls,
      pins: buildLanePins(laneCfg),
      frontWall: null,
      upcomingWalls: [],
      brokenLayers: 0,
      totalDamageDealt: BF_ZERO,
      wallTopY: DEFAULT_WALL_TOP_Y,
      spawnAccumulator: 0,
      eliminated: false,
      eliminatedAtSec: null,
      clearedAtSec: null,
      totalBallCount: BF_ZERO,
      maxBallValue: BF_ZERO,
      totalOutputPower: BF_ZERO,
    };
    populateUpcomingWalls(laneState, isEndless);
    refreshLaneStats(laneState);
    return laneState;
  });

  recordTelemetrySample(state);
  return state;
}

function pushFloatText(
  state: InternalSimState,
  laneIndex: number,
  x: number,
  y: number,
  text: string,
  kind: "hit" | "gate" | "break" | "sabotage" | "jackpot",
  enableVisuals: boolean
) {
  if (!enableVisuals) return;
  if (state.floatTexts.length > 48 && kind === "hit") return;
  if (state.floatTexts.length > 90) {
    state.floatTexts.shift();
  }
  state.floatTexts.push({
    id: state.nextEntityId++,
    laneIndex,
    x,
    y,
    text,
    kind,
    age: 0,
    ttl: kind === "break" || kind === "jackpot" ? 0.95 : 0.55,
  });
}

function spawnWallBreakParticles(
  state: InternalSimState,
  laneIndex: number,
  wallY: number,
  enableVisuals: boolean
) {
  if (!enableVisuals) return;
  if (state.particles.length > 180) return;
  for (let i = 0; i < 14; i++) {
    const rx = 20 + nextVisualRand(state) * (LANE_WIDTH - 40);
    const vx = (nextVisualRand(state) - 0.5) * 200;
    const vy = -60 - nextVisualRand(state) * 180;
    state.particles.push({
      id: state.nextEntityId++,
      laneIndex,
      x: rx,
      y: wallY + 10,
      vx,
      vy,
      size: 2.5 + nextVisualRand(state) * 3.5,
      age: 0,
      ttl: 0.45 + nextVisualRand(state) * 0.35,
    });
  }
}

function multiplyOrAddBallsOnEntity(
  state: InternalSimState,
  lane: LaneRuntimeState,
  ball: BallEntity,
  op: MathOp,
  operand: number,
  newlySpawnedBuffer: BallEntity[]
) {
  let targetStack = ball.stackCount;
  if (op === "add") {
    targetStack = bfAdd(ball.stackCount, bf(Math.max(0, operand)));
  } else if (op === "mul") {
    targetStack = bfMulNum(ball.stackCount, Math.max(0, operand));
  } else if (op === "pow") {
    targetStack = bfPowNum(ball.stackCount, Math.max(0.1, operand));
  }

  if (bfCmp(targetStack, BF_ONE) < 0) {
    ball.stackCount = BF_ONE;
    return;
  }

  // Can we spawn real physical clones for visual spectacle?
  const currentEntityTotal = lane.balls.length + newlySpawnedBuffer.length;
  const freeSlots = MAX_PHYSICAL_BALLS_PER_LANE - currentEntityTotal;

  if (freeSlots > 0 && bfGt(targetStack, ball.stackCount)) {
    const delta = bfSubClampZero(targetStack, ball.stackCount);
    const desiredClones = Math.min(
      freeSlots,
      Math.min(8, Math.floor(bfToNumber(delta)))
    );

    if (desiredClones >= 1) {
      const totalGroupCount = targetStack;
      const groupSize = desiredClones + 1;
      const eachStack = bfMax(BF_ONE, bfDivNum(totalGroupCount, groupSize));
      ball.stackCount = bfSubClampZero(
        totalGroupCount,
        bfMulNum(eachStack, desiredClones)
      );
      if (bfCmp(ball.stackCount, BF_ONE) < 0) {
        ball.stackCount = BF_ONE;
      }

      const baseSpeed = Math.hypot(ball.vx, ball.vy);
      const baseAngle = Math.atan2(ball.vy, ball.vx);

      for (let k = 0; k < desiredClones; k++) {
        const spread = ((k + 1) * (k % 2 === 0 ? 1 : -1) * 0.16) + (nextRng(state) - 0.5) * 0.08;
        const nextAngle = baseAngle + spread;
        const clamped = clampSpeedVector(
          Math.cos(nextAngle) * baseSpeed,
          Math.sin(nextAngle) * baseSpeed
        );
        newlySpawnedBuffer.push({
          id: state.nextEntityId++,
          x: Math.max(
            ball.radius + 2,
            Math.min(LANE_WIDTH - ball.radius - 2, ball.x + (k % 2 === 0 ? 4 : -4))
          ),
          y: ball.y,
          vx: clamped.vx,
          vy: clamped.vy,
          radius: ball.radius,
          value: ball.value,
          stackCount: eachStack,
          wallHits: ball.wallHits,
          boundaryHits: ball.boundaryHits,
          aliveSec: ball.aliveSec,
          gateCooldowns: { ...ball.gateCooldowns },
        });
      }
      return;
    }
  }

  ball.stackCount = targetStack;
}

function executeTriggerOnBall(
  state: InternalSimState,
  lane: LaneRuntimeState,
  ball: BallEntity,
  trig: GrowthTriggerConfig,
  newlySpawnedBuffer: BallEntity[]
) {
  if (trig.target === "ball_value") {
    ball.value = bfMax( bf(0.01), applyMathOp(ball.value, trig.op, trig.operand));
  } else if (trig.target === "ball_count") {
    multiplyOrAddBallsOnEntity(
      state,
      lane,
      ball,
      trig.op,
      trig.operand,
      newlySpawnedBuffer
    );
  } else if (trig.target === "ball_speed") {
    const pctBoost =
      trig.op === "mul"
        ? Math.max(0.2, trig.operand)
        : 1 + Math.max(-0.5, trig.operand / 100);
    const clamped = clampSpeedVector(ball.vx * pctBoost, ball.vy * pctBoost);
    ball.vx = clamped.vx;
    ball.vy = clamped.vy;
  }
}

function applyGateSlotToBall(
  state: InternalSimState,
  lane: LaneRuntimeState,
  ball: BallEntity,
  slot: GateSlotConfig,
  newlySpawnedBuffer: BallEntity[],
  enableVisuals: boolean
) {
  const op = slot.op;
  const operand = slot.operand;

  switch (op) {
    case "add":
      ball.value = bfMax(bf(0.01), bfAdd(ball.value, bf(operand)));
      break;
    case "sub":
      ball.value = bfMax(bf(0.01), bfSub(ball.value, bf(operand)));
      break;
    case "mul":
      ball.value = bfMax(bf(0.01), bfMulNum(ball.value, Math.max(0.001, operand)));
      break;
    case "div":
      ball.value = bfMax(bf(0.01), bfDivNum(ball.value, Math.max(0.001, operand)));
      break;
    case "pow":
      ball.value = bfMax(bf(0.01), bfPowNum(ball.value, Math.max(0.05, operand)));
      break;
    case "sqrt":
      ball.value = bfMax(bf(0.01), bfSqrt(ball.value));
      break;
    case "split_merge": {
      const factor = Math.max(0.05, operand);
      if (factor >= 1) {
        ball.value = bfMax(bf(0.01), bfDivNum(ball.value, factor));
        multiplyOrAddBallsOnEntity(
          state,
          lane,
          ball,
          "mul",
          factor,
          newlySpawnedBuffer
        );
      } else {
        const inv = 1 / factor;
        ball.value = bfMulNum(ball.value, inv);
        ball.stackCount = bfMax(BF_ONE, bfDivNum(ball.stackCount, inv));
      }
      break;
    }
    case "threshold_mul": {
      const th = bf(slot.threshold ?? 100);
      if (bfGte(ball.value, th)) {
        ball.value = bfMulNum(ball.value, Math.max(0.01, operand));
      } else {
        return; // Did not meet threshold
      }
      break;
    }
  }

  pushFloatText(
    state,
    lane.laneIndex,
    ball.x,
    ball.y - 10,
    formatGateSlotLabel(slot),
    "gate",
    enableVisuals
  );
  if (enableVisuals && state.pendingSounds.length < 16) {
    state.pendingSounds.push({
      type: "gate",
      laneIndex: lane.laneIndex,
      intensity: 0.5,
    });
  }
}

function handleWallShatterSideEffects(
  state: InternalSimState,
  lane: LaneRuntimeState,
  brokenWall: ActiveWallLayer,
  newlySpawnedBuffer: BallEntity[],
  enableVisuals: boolean
) {
  const coupling = state.config.coupling;

  // 1. Cross-lane sabotage transfer: add X% of shattered wall's initial HP to opponents
  if (coupling.sabotageTransferPct > 0) {
    const transferAmt = bfMulNum(
      brokenWall.initialValue,
      coupling.sabotageTransferPct
    );
    if (!bfIsZero(transferAmt)) {
      for (const other of state.lanes) {
        if (
          other.laneIndex !== lane.laneIndex &&
          !other.eliminated &&
          other.frontWall
        ) {
          other.frontWall.currentHp = bfAdd(
            other.frontWall.currentHp,
            transferAmt
          );
          if (bfGt(other.frontWall.currentHp, other.frontWall.maxHp)) {
            other.frontWall.maxHp = other.frontWall.currentHp;
          }
          pushFloatText(
            state,
            other.laneIndex,
            LANE_WIDTH * 0.5,
            other.wallTopY - 8,
            `+${formatBigFloat(transferAmt)} 转嫁`,
            "sabotage",
            enableVisuals
          );
        }
      }
    }
  }

  // 2. Shared milestone pool jackpot claim
  if (
    coupling.sharedPoolEnabled &&
    coupling.poolMilestoneEveryLayers > 0 &&
    lane.brokenLayers > 0 &&
    lane.brokenLayers % coupling.poolMilestoneEveryLayers === 0
  ) {
    const milestone = lane.brokenLayers;
    if (state.claimedMilestones[milestone] === undefined) {
      state.claimedMilestones[milestone] = lane.laneIndex;
      const prize = state.sharedPoolValue;
      state.sharedPoolValue = bf(Math.max(1, coupling.poolInitial));

      if (!bfIsZero(prize) && lane.balls.length > 0) {
        for (const b of lane.balls) {
          b.value = bfAdd(b.value, prize);
        }
      }
      pushFloatText(
        state,
        lane.laneIndex,
        LANE_WIDTH * 0.5,
        lane.wallTopY - 26,
        `夺池 +${formatBigFloat(prize)}!`,
        "jackpot",
        enableVisuals
      );
      if (enableVisuals && state.pendingSounds.length < 20) {
        state.pendingSounds.push({
          type: "jackpot",
          laneIndex: lane.laneIndex,
          intensity: 1,
        });
      }
    }
  }

  // 3. Fire "wall_breaks" triggers on all balls in this lane
  for (const trig of lane.config.ball.triggers) {
    if (
      trig.when === "wall_breaks" &&
      trig.every > 0 &&
      lane.brokenLayers % Math.max(1, Math.round(trig.every)) === 0
    ) {
      for (const b of lane.balls) {
        executeTriggerOnBall(state, lane, b, trig, newlySpawnedBuffer);
      }
    }
  }

  // 4. In push_elimination, breaking a wall pushes the stack slightly back down for breathing room
  if (state.config.rules.winRule === "push_elimination") {
    lane.wallTopY = Math.min(DEFAULT_WALL_TOP_Y + 24, lane.wallTopY + 18);
  }
}

/**
 * Exact mathematical settlement of a physical ball (value V, stack ×N) hitting frontWall,
 * respecting per-single-ball damage caps AND overflow penetration across layers.
 */
function settleBallWallImpact(
  state: InternalSimState,
  lane: LaneRuntimeState,
  ball: BallEntity,
  newlySpawnedBuffer: BallEntity[],
  enableVisuals: boolean
) {
  if (!lane.frontWall) return;

  const isEndless = state.config.rules.winRule === "endless_timed";
  const wallCfg = lane.config.wall;
  const penetration = Math.max(0, Math.min(1, lane.config.ball.overflowPenetration));

  let remainingStack = ball.stackCount;
  let carryOverPool = BF_ZERO;
  let useCarryPool = false;
  let layersBrokenThisHit = 0;
  let totalDealtThisHit = BF_ZERO;
  const MAX_LAYERS_PER_IMPACT = 60;

  while (
    lane.frontWall &&
    layersBrokenThisHit < MAX_LAYERS_PER_IMPACT &&
    (useCarryPool ? !bfIsZero(carryOverPool) : !bfIsZero(remainingStack))
  ) {
    const fw = lane.frontWall;

    // Compute per-single-ball effective damage against THIS wall layer
    let singleBallEffective = ball.value;
    if (wallCfg.capMode === "fixed") {
      singleBallEffective = bfMin(ball.value, bf(Math.max(0.01, wallCfg.capValue)));
    } else if (wallCfg.capMode === "max_pct") {
      const pct = Math.max(0.0001, Math.min(1, wallCfg.capValue));
      const capAmt = bfMulNum(fw.maxHp, pct);
      singleBallEffective = bfMin(ball.value, capAmt);
    }

    let availableDamage: BigFloat;
    if (useCarryPool) {
      // Carryover pool from overkill penetration is still subject to new wall's single-hit cap if capped
      if (wallCfg.capMode !== "none") {
        const totalCapForStack = bfMul(ball.stackCount, singleBallEffective);
        availableDamage = bfMin(carryOverPool, totalCapForStack);
      } else {
        availableDamage = carryOverPool;
      }
    } else {
      availableDamage = bfMul(remainingStack, singleBallEffective);
    }

    if (bfCmp(availableDamage, fw.currentHp) < 0) {
      // Wall survives
      fw.currentHp = bfSubClampZero(fw.currentHp, availableDamage);
      totalDealtThisHit = bfAdd(totalDealtThisHit, availableDamage);
      break;
    } else {
      // Wall shatters!
      const absorbed = fw.currentHp;
      const overkill = bfSubClampZero(availableDamage, absorbed);
      totalDealtThisHit = bfAdd(totalDealtThisHit, absorbed);

      const brokenLayerCopy = fw;
      lane.brokenLayers += 1;
      layersBrokenThisHit += 1;
      lane.frontWall = null;

      populateUpcomingWalls(lane, isEndless);
      handleWallShatterSideEffects(
        state,
        lane,
        brokenLayerCopy,
        newlySpawnedBuffer,
        enableVisuals
      );

      spawnWallBreakParticles(state, lane.laneIndex, lane.wallTopY, enableVisuals);
      if (enableVisuals && state.pendingSounds.length < 20) {
        state.pendingSounds.push({
          type: "wall_break",
          laneIndex: lane.laneIndex,
          intensity: lane.brokenLayers,
        });
      }

      if (penetration <= 0 || bfIsZero(overkill) || !lane.frontWall) {
        if (!lane.frontWall && lane.clearedAtSec === null && !isEndless) {
          lane.clearedAtSec = state.elapsedSec;
        }
        break;
      }

      carryOverPool = bfMulNum(overkill, penetration);
      useCarryPool = true;
    }
  }

  lane.totalDamageDealt = bfAdd(lane.totalDamageDealt, totalDealtThisHit);

  if (layersBrokenThisHit > 0) {
    pushFloatText(
      state,
      lane.laneIndex,
      ball.x,
      lane.wallTopY - 12,
      layersBrokenThisHit > 1
        ? `连破 ${layersBrokenThisHit} 层!`
        : `击破 #${lane.brokenLayers}`,
      "break",
      enableVisuals
    );
  } else if (!bfIsZero(totalDealtThisHit)) {
    pushFloatText(
      state,
      lane.laneIndex,
      ball.x,
      lane.wallTopY - 8,
      `-${formatBigFloat(totalDealtThisHit)}`,
      "hit",
      enableVisuals
    );
    if (enableVisuals && state.pendingSounds.length < 14) {
      state.pendingSounds.push({
        type: "hit",
        laneIndex: lane.laneIndex,
        intensity: 0.25,
      });
    }
  }
}

function computeLaneProgressScore(lane: LaneRuntimeState): number {
  let frac = 0;
  if (lane.frontWall && !bfIsZero(lane.frontWall.maxHp)) {
    const ratioLog =
      bfLog10Safe(lane.frontWall.maxHp, -6) -
      bfLog10Safe(lane.frontWall.currentHp, -6);
    if (ratioLog > 3) {
      frac = 0.999;
    } else {
      const curNum = bfToNumber(
        bfDiv(lane.frontWall.currentHp, lane.frontWall.maxHp)
      );
      frac = Math.max(0, Math.min(0.999, 1 - curNum));
    }
  } else if (!lane.frontWall) {
    frac = 1;
  }
  return lane.brokenLayers + frac;
}

function rankLanes(state: SimulationState): number[] {
  const indices = state.lanes.map((_, idx) => idx);
  indices.sort((a, b) => {
    const la = state.lanes[a];
    const lb = state.lanes[b];

    // Cleared all finite walls first (earlier clear time wins)
    if (la.clearedAtSec !== null || lb.clearedAtSec !== null) {
      if (la.clearedAtSec !== null && lb.clearedAtSec === null) return -1;
      if (lb.clearedAtSec !== null && la.clearedAtSec === null) return 1;
      if (la.clearedAtSec !== lb.clearedAtSec) {
        return (la.clearedAtSec ?? 0) - (lb.clearedAtSec ?? 0);
      }
    }

    // Non-eliminated beats eliminated
    if (la.eliminated !== lb.eliminated) {
      return la.eliminated ? 1 : -1;
    }
    if (la.eliminated && lb.eliminated) {
      const ta = la.eliminatedAtSec ?? 0;
      const tb = lb.eliminatedAtSec ?? 0;
      if (Math.abs(ta - tb) > 1e-4) return tb - ta; // survived longer wins
    }

    // Compare broken layers + current wall damage fraction
    const scoreA = computeLaneProgressScore(la);
    const scoreB = computeLaneProgressScore(lb);
    if (Math.abs(scoreA - scoreB) > 1e-5) {
      return scoreB - scoreA;
    }

    // Tie-breaker: total damage dealt
    return bfCmp(lb.totalDamageDealt, la.totalDamageDealt);
  });
  return indices;
}

function checkMatchTermination(
  state: InternalSimState,
  enableVisuals: boolean
): boolean {
  const rule = state.config.rules.winRule;
  const timeLimit = Math.max(5, state.config.rules.timeLimitSec || 45);

  // 1. Check finite wall full breakthrough (applies to breakthrough_timed, breakthrough_untimed, push_elimination)
  if (rule !== "endless_timed") {
    const clearedLanes = state.lanes.filter((l) => l.clearedAtSec !== null);
    if (clearedLanes.length > 0) {
      const ranking = rankLanes(state);
      const winIdx = ranking[0];
      const winner = state.lanes[winIdx];
      state.status = "finished";
      state.winnerLaneIndex = winIdx;
      state.ranking = ranking;
      state.winReason = `${winner.config.name} 在 ${state.elapsedSec.toFixed(2)}s 率先击穿全部 ${winner.brokenLayers} 层数字墙！`;
      if (enableVisuals) {
        state.pendingSounds.push({
          type: "finish",
          laneIndex: winIdx,
          intensity: 1,
        });
      }
      return true;
    }
  }

  // 2. Check push_elimination survival victory
  if (rule === "push_elimination") {
    const alive = state.lanes.filter((l) => !l.eliminated);
    if (alive.length <= 1) {
      const ranking = rankLanes(state);
      const winIdx = ranking[0];
      const winner = state.lanes[winIdx];
      state.status = "finished";
      state.winnerLaneIndex = winIdx;
      state.ranking = ranking;
      state.winReason =
        alive.length === 1
          ? `对手已被推线淘汰，${winner.config.name} 存活至 ${state.elapsedSec.toFixed(2)}s 获胜！`
          : `全员触顶淘汰，${winner.config.name} 以击碎 ${winner.brokenLayers} 层领先获胜！`;
      if (enableVisuals) {
        state.pendingSounds.push({
          type: "finish",
          laneIndex: winIdx,
          intensity: 1,
        });
      }
      return true;
    }
  }

  // 3. Check time limit for timed modes
  if (
    (rule === "breakthrough_timed" || rule === "endless_timed") &&
    state.elapsedSec >= timeLimit
  ) {
    const ranking = rankLanes(state);
    const winIdx = ranking[0];
    const winner = state.lanes[winIdx];
    state.status = "finished";
    state.winnerLaneIndex = winIdx;
    state.ranking = ranking;
    state.winReason =
      rule === "endless_timed"
        ? `${timeLimit}s 无限冲刺结束：${winner.config.name} 以累计击碎 ${winner.brokenLayers} 层夺冠！`
        : `${timeLimit}s 倒计时结束（未破底兜底判定）：${winner.config.name} 以击碎 ${winner.brokenLayers} 层领先获胜！`;
    if (enableVisuals) {
      state.pendingSounds.push({
        type: "finish",
        laneIndex: winIdx,
        intensity: 1,
      });
    }
    return true;
  }

  // 4. Safety check: if all lanes have 0 balls and spawnPerSec === 0, end match gracefully
  const anyActiveBallsOrSpawners = state.lanes.some(
    (l) => !l.eliminated && (l.balls.length > 0 || l.config.ball.spawnPerSec > 0)
  );
  if (!anyActiveBallsOrSpawners || state.elapsedSec >= 600) {
    const ranking = rankLanes(state);
    const winIdx = ranking[0];
    const winner = state.lanes[winIdx];
    state.status = "finished";
    state.winnerLaneIndex = winIdx;
    state.ranking = ranking;
    state.winReason = `球体全部耗尽，${winner.config.name} 以击碎 ${winner.brokenLayers} 层获胜！`;
    if (enableVisuals) {
      state.pendingSounds.push({
        type: "finish",
        laneIndex: winIdx,
        intensity: 1,
      });
    }
    return true;
  }
  return false;
}

/**
 * Advance simulation by exactly 1 fixed physics step (DT = 1/120s)
 */
export function stepSimulationOnce(
  rawState: SimulationState,
  enableVisuals = true
): void {
  const state = rawState as InternalSimState;
  if (state.status === "finished") return;
  if (state.status === "ready") {
    state.status = "running";
  }

  state.stepCount += 1;
  state.elapsedSec = state.stepCount * SIM_DT;

  // Grow shared jackpot pool
  if (
    state.config.coupling.sharedPoolEnabled &&
    state.config.coupling.poolCompoundPerSec > 1
  ) {
    const factor = Math.pow(state.config.coupling.poolCompoundPerSec, SIM_DT);
    state.sharedPoolValue = bfMulNum(state.sharedPoolValue, factor);
  }

  const isPushMode = state.config.rules.winRule === "push_elimination";
  const pushSpeed = Math.max(2, state.config.rules.pushSpeedPxPerSec || 12);

  for (const lane of state.lanes) {
    if (lane.eliminated) continue;

    // 1. Wall compound growth & upward push
    if (lane.frontWall && lane.config.wall.compoundPerSec > 1) {
      const factor = Math.pow(lane.config.wall.compoundPerSec, SIM_DT);
      lane.frontWall.currentHp = bfMulNum(lane.frontWall.currentHp, factor);
      if (bfGt(lane.frontWall.currentHp, lane.frontWall.maxHp)) {
        lane.frontWall.maxHp = lane.frontWall.currentHp;
      }
    }

    if (isPushMode && lane.frontWall) {
      lane.wallTopY -= pushSpeed * SIM_DT;
      if (lane.wallTopY <= SPAWN_LINE_Y + 22) {
        lane.wallTopY = SPAWN_LINE_Y + 22;
        lane.eliminated = true;
        lane.eliminatedAtSec = state.elapsedSec;
        lane.balls = [];
        refreshLaneStats(lane);
        continue;
      }
    }

    // 2. Continuous top ball spawning (waterfall mode when spawnPerSec > 0)
    if (lane.config.ball.spawnPerSec > 0) {
      lane.spawnAccumulator += lane.config.ball.spawnPerSec * SIM_DT;
      if (lane.spawnAccumulator >= 1) {
        const countToEmit = Math.floor(lane.spawnAccumulator);
        lane.spawnAccumulator -= countToEmit;
        const initVal = bf(Math.max(0.01, lane.config.ball.initialValue));

        if (lane.balls.length < MAX_PHYSICAL_BALLS_PER_LANE) {
          const spawned = createSpawnedBalls(
            state,
            lane.config,
            countToEmit,
            initVal
          );
          lane.balls.push(...spawned);
        } else if (lane.balls.length > 0) {
          // Arena at physical ball cap: merge newly emitted count into existing balls proportionally
          const targetIdx = state.stepCount % lane.balls.length;
          const targetBall = lane.balls[targetIdx];
          targetBall.stackCount = bfAdd(targetBall.stackCount, bf(countToEmit));
        }
      }
    }

    // Precompute current gate rects for this lane
    const gateGroups = lane.config.gates.map((row) => ({
      row,
      boxes: getGateRowBoxes(row, state.elapsedSec),
    }));

    const newlySpawnedBuffer: BallEntity[] = [];
    const survivingBalls: BallEntity[] = [];

    for (const ball of lane.balls) {
      const prevAlive = ball.aliveSec;
      ball.aliveSec += SIM_DT;

      // Decrement gate cooldowns
      for (const gid of Object.keys(ball.gateCooldowns)) {
        ball.gateCooldowns[gid] -= SIM_DT;
        if (ball.gateCooldowns[gid] <= 0) {
          delete ball.gateCooldowns[gid];
        }
      }

      // Time-based growth triggers
      for (const trig of lane.config.ball.triggers) {
        if (trig.when === "time_sec" && trig.every > 0) {
          if (
            Math.floor(prevAlive / trig.every) <
            Math.floor(ball.aliveSec / trig.every)
          ) {
            executeTriggerOnBall(state, lane, ball, trig, newlySpawnedBuffer);
          }
        }
      }

      // Move ball
      ball.x += ball.vx * SIM_DT;
      ball.y += ball.vy * SIM_DT;

      let touchedBoundary = false;

      // Left / Right wall bounce
      if (ball.x - ball.radius < 0) {
        ball.x = ball.radius;
        ball.vx = Math.abs(ball.vx);
        touchedBoundary = true;
      } else if (ball.x + ball.radius > LANE_WIDTH) {
        ball.x = LANE_WIDTH - ball.radius;
        ball.vx = -Math.abs(ball.vx);
        touchedBoundary = true;
      }

      // Top ceiling bounce
      const ceilingY = SPAWN_LINE_Y;
      if (ball.y - ball.radius < ceilingY) {
        ball.y = ceilingY + ball.radius;
        ball.vy = Math.abs(ball.vy);
        touchedBoundary = true;
      }

      // Pachinko Pin elastic collisions
      if (lane.pins.length > 0) {
        for (const pin of lane.pins) {
          const dx = ball.x - pin.x;
          const dy = ball.y - pin.y;
          const minDist = ball.radius + pin.radius;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDist * minDist && distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            const nx = dx / dist;
            const ny = dy / dist;
            // Push out of overlap
            ball.x = pin.x + nx * (minDist + 0.3);
            ball.y = pin.y + ny * (minDist + 0.3);
            // Reflect velocity across normal with deterministic tiny micro-deflection
            const dot = ball.vx * nx + ball.vy * ny;
            if (dot < 0) {
              const rx = ball.vx - 2 * dot * nx;
              const ry = ball.vy - 2 * dot * ny;
              const clamped = clampSpeedVector(rx, ry);
              ball.vx = clamped.vx;
              ball.vy = clamped.vy;
            }
          }
        }
      }

      // Mid-lane Math Gate pass-through check
      for (const { row, boxes } of gateGroups) {
        if (ball.gateCooldowns[row.id] !== undefined) continue;
        for (const box of boxes) {
          if (
            ball.x >= box.x &&
            ball.x <= box.x + box.width &&
            ball.y + ball.radius >= box.y &&
            ball.y - ball.radius <= box.y + box.height
          ) {
            ball.gateCooldowns[row.id] = 0.28;
            applyGateSlotToBall(
              state,
              lane,
              ball,
              box.slot,
              newlySpawnedBuffer,
              enableVisuals
            );
            break;
          }
        }
      }

      // Bottom Number Wall collision
      const wallSurfaceY = lane.frontWall ? lane.wallTopY : LANE_HEIGHT - 12;
      let consumedByLifespan = false;

      if (ball.y + ball.radius >= wallSurfaceY) {
        ball.y = wallSurfaceY - ball.radius;
        // Slight deterministic angle perturbation on bounce so closed trajectories explore gates
        const speed = Math.hypot(ball.vx, ball.vy);
        const perturb = (nextRng(state) - 0.5) * 0.14;
        const angle = Math.atan2(-Math.abs(ball.vy), ball.vx) + perturb;
        const clamped = clampSpeedVector(
          Math.cos(angle) * speed,
          -Math.abs(Math.sin(angle) * speed)
        );
        ball.vx = clamped.vx;
        ball.vy = -Math.abs(clamped.vy);

        touchedBoundary = true;

        if (lane.frontWall) {
          ball.wallHits += 1;

          settleBallWallImpact(
            state,
            lane,
            ball,
            newlySpawnedBuffer,
            enableVisuals
          );

          // Check wall_hits triggers
          for (const trig of lane.config.ball.triggers) {
            if (
              trig.when === "wall_hits" &&
              trig.every > 0 &&
              ball.wallHits % Math.max(1, Math.round(trig.every)) === 0
            ) {
              executeTriggerOnBall(state, lane, ball, trig, newlySpawnedBuffer);
            }
          }

          // Check ball lifespan consumption
          if (
            lane.config.ball.maxHitsPerBall > 0 &&
            ball.wallHits >= lane.config.ball.maxHitsPerBall
          ) {
            consumedByLifespan = true;
          }
        }
      }

      if (touchedBoundary) {
        ball.boundaryHits += 1;
        for (const trig of lane.config.ball.triggers) {
          if (
            trig.when === "boundary_hits" &&
            trig.every > 0 &&
            ball.boundaryHits % Math.max(1, Math.round(trig.every)) === 0
          ) {
            executeTriggerOnBall(state, lane, ball, trig, newlySpawnedBuffer);
          }
        }
      }

      if (!consumedByLifespan) {
        survivingBalls.push(ball);
      }
    }

    if (newlySpawnedBuffer.length > 0) {
      for (const nb of newlySpawnedBuffer) {
        if (survivingBalls.length < MAX_PHYSICAL_BALLS_PER_LANE) {
          survivingBalls.push(nb);
        } else if (survivingBalls.length > 0) {
          survivingBalls[0].stackCount = bfAdd(
            survivingBalls[0].stackCount,
            nb.stackCount
          );
        }
      }
    }

    lane.balls = survivingBalls;
    refreshLaneStats(lane);
  }

  // Update visual float texts & shatter particles
  if (enableVisuals) {
    for (let i = state.floatTexts.length - 1; i >= 0; i--) {
      const ft = state.floatTexts[i];
      ft.age += SIM_DT;
      ft.y -= 26 * SIM_DT;
      if (ft.age >= ft.ttl) {
        state.floatTexts.splice(i, 1);
      }
    }
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.age += SIM_DT;
      p.x += p.vx * SIM_DT;
      p.y += p.vy * SIM_DT;
      p.vy += 380 * SIM_DT;
      if (p.age >= p.ttl) {
        state.particles.splice(i, 1);
      }
    }
  }

  // Telemetry sampling every 0.25s
  state.telemetryAccumulator += SIM_DT;
  if (state.telemetryAccumulator >= 0.25) {
    state.telemetryAccumulator -= 0.25;
    recordTelemetrySample(state);
  }

  if (checkMatchTermination(state, enableVisuals)) {
    recordTelemetrySample(state);
  }
}

export function runHeadlessSimulation(
  config: MatchConfig,
  maxSeconds = 90
): SimulationState {
  const sim = createSimulation(config);
  const maxSteps = Math.ceil(maxSeconds * SIM_HZ);
  for (let i = 0; i < maxSteps && sim.status !== "finished"; i++) {
    stepSimulationOnce(sim, false);
  }
  if (sim.status !== "finished") {
    sim.ranking = rankLanes(sim);
    sim.winnerLaneIndex = sim.ranking[0];
  }
  return sim;
}
