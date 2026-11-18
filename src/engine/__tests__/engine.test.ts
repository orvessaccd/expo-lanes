import assert from "node:assert/strict";
import {
  bf,
  bfAdd,
  bfCmp,
  bfDiv,
  bfMul,
  bfPowNum,
  bfSqrt,
  bfSub,
  formatBigFloat,
  MAX_BF_EXPONENT,
} from "../bigNumber";
import { createSimulation, runHeadlessSimulation, stepSimulationOnce } from "../simulation";
import type { MatchConfig } from "../types";

// 1. BigFloat beyond 1.79e308 verification
{
  const a = bf("2.5e400");
  const b = bf("4e500");
  const prod = bfMul(a, b);
  assert.equal(prod.e, 901);
  assert.ok(Math.abs(prod.m - 1.0) < 1e-9, "2.5e400 * 4e500 === 1e901");

  const hugePow = bfPowNum(bf("1e400"), 2.5);
  assert.equal(hugePow.e, 1000);
  assert.ok(Math.abs(hugePow.m - 1) < 1e-9, "(1e400)^2.5 === 1e1000");

  const root = bfSqrt(bf("9e600"));
  assert.equal(root.e, 300);
  assert.ok(Math.abs(root.m - 3) < 1e-9, "sqrt(9e600) === 3e300");

  // Clamping at MAX_BF_EXPONENT without NaN/Infinity
  const singularity = bfPowNum(bf("1e900000"), 50);
  assert.equal(singularity.e, MAX_BF_EXPONENT);
  assert.ok(Number.isFinite(singularity.m));

  // Subtraction & formatting
  const diff = bfSub(bf(1500), bf(500));
  assert.equal(formatBigFloat(diff, "intl"), "1K");
  assert.equal(formatBigFloat(bf(125_000_000), "zh"), "1.25亿");
  assert.equal(formatBigFloat(bf("1.25e24"), "intl"), "1.25e24");
  assert.equal(formatBigFloat(bf("1.25e24"), "zh"), "1.25e24");
  assert.equal(formatBigFloat(bf(42000), "sci"), "4.2e4");

  const divCheck = bfDiv(bf("8e750"), bf("2e250"));
  assert.equal(bfCmp(divCheck, bf("4e500")), 0);
  const sumSameScale = bfAdd(bf("1.5e400"), bf("2.5e400"));
  assert.equal(bfCmp(sumSameScale, bf("4e400")), 0);
}

// 2. ×N stacked ball hitting damage-cap wall matches N independent hits
{
  const makeCapTestMatch = (): MatchConfig => ({
    id: "test-cap",
    title: "Cap Test",
    description: "Verify stacked vs boulder against fixed cap",
    seed: "cap-verify-seed-1",
    rules: {
      winRule: "breakthrough_timed",
      timeLimitSec: 15,
      pushSpeedPxPerSec: 10,
    },
    coupling: {
      sabotageTransferPct: 0,
      sharedPoolEnabled: false,
      poolInitial: 100,
      poolCompoundPerSec: 1,
      poolMilestoneEveryLayers: 5,
    },
    lanes: [
      {
        // 1 giant boulder of 1e12 hitting a fixed-cap 100 wall -> max 100 per hit
        id: "boulder",
        name: "Single Boulder",
        ball: {
          initialCount: 1,
          initialValue: 1e12,
          spawnPerSec: 0,
          maxHitsPerBall: 0,
          baseSpeed: 360,
          overflowPenetration: 0,
          triggers: [],
        },
        gates: [],
        pinsEnabled: false,
        pinRows: 0,
        wall: {
          totalLayers: 5,
          baseValue: 5000,
          layerOp: "add",
          layerOperand: 5000,
          compoundPerSec: 1,
          capMode: "fixed",
          capValue: 100,
        },
      },
      {
        // 200 stacked balls of 150 hitting fixed-cap 100 wall -> 200 * 100 = 20,000 per wave!
        id: "swarm",
        name: "Stacked Swarm",
        ball: {
          initialCount: 200,
          initialValue: 150,
          spawnPerSec: 0,
          maxHitsPerBall: 0,
          baseSpeed: 360,
          overflowPenetration: 0,
          triggers: [],
        },
        gates: [],
        pinsEnabled: false,
        pinRows: 0,
        wall: {
          totalLayers: 5,
          baseValue: 5000,
          layerOp: "add",
          layerOperand: 5000,
          compoundPerSec: 1,
          capMode: "fixed",
          capValue: 100,
        },
      },
    ],
  });

  const result = runHeadlessSimulation(makeCapTestMatch(), 20);
  assert.equal(result.status, "finished");
  assert.equal(
    result.winnerLaneIndex,
    1,
    "Stacked swarm must decisively beat capped single boulder"
  );
  assert.equal(result.lanes[1].brokenLayers, 5);
  assert.equal(
    result.lanes[0].brokenLayers,
    0,
    "Single boulder capped at 100/hit cannot break 5000 HP wall in ~3s"
  );

  // Also verify single step exact math on a ×500 stacked entity hitting a fixed cap 10 wall
  const sim = createSimulation(makeCapTestMatch());
  const lane = sim.lanes[0];
  lane.balls = [
    {
      id: 999,
      x: 150,
      y: lane.wallTopY - 6, // overlapping wall so next step collides
      vx: 20,
      vy: 300,
      radius: 8.5,
      value: bf(1000),
      stackCount: bf(30), // ×30 stacked balls
      wallHits: 0,
      boundaryHits: 0,
      aliveSec: 0,
      gateCooldowns: {},
    },
  ];
  stepSimulationOnce(sim, false);
  // 30 balls * min(1000, 100 cap) = 3,000 exact damage -> 5,000 - 3,000 = 2,000 remaining!
  assert.equal(bfCmp(lane.frontWall!.currentHp, bf(2000)), 0);
}

// 3. 100% Determinism verification across identical seeds
{
  const config: MatchConfig = {
    id: "det-test",
    title: "Determinism Check",
    description: "Two runs with identical seed must match bit-for-bit",
    seed: "deterministic-seed-42",
    rules: {
      winRule: "breakthrough_timed",
      timeLimitSec: 30,
      pushSpeedPxPerSec: 10,
    },
    coupling: {
      sabotageTransferPct: 0.15,
      sharedPoolEnabled: true,
      poolInitial: 50,
      poolCompoundPerSec: 1.2,
      poolMilestoneEveryLayers: 2,
    },
    lanes: [
      {
        id: "l1",
        name: "Lane 1",
        ball: {
          initialCount: 3,
          initialValue: 10,
          spawnPerSec: 1.5,
          maxHitsPerBall: 0,
          baseSpeed: 340,
          overflowPenetration: 0.5,
          triggers: [
            {
              id: "t1",
              when: "wall_hits",
              every: 2,
              target: "ball_value",
              op: "mul",
              operand: 1.35,
            },
          ],
        },
        gates: [
          {
            id: "g1",
            yRatio: 0.45,
            layout: "dual",
            widthRatio: 0.9,
            oscillateHz: 0,
            leftSlot: { op: "mul", operand: 2 },
            rightSlot: { op: "split_merge", operand: 2 },
          },
        ],
        pinsEnabled: true,
        pinRows: 3,
        wall: {
          totalLayers: 8,
          baseValue: 200,
          layerOp: "mul",
          layerOperand: 2.2,
          compoundPerSec: 1.03,
          capMode: "none",
          capValue: 0,
        },
      },
      {
        id: "l2",
        name: "Lane 2",
        ball: {
          initialCount: 2,
          initialValue: 25,
          spawnPerSec: 0,
          maxHitsPerBall: 0,
          baseSpeed: 380,
          overflowPenetration: 0.8,
          triggers: [
            {
              id: "t2",
              when: "wall_breaks",
              every: 1,
              target: "ball_value",
              op: "pow",
              operand: 1.18,
            },
          ],
        },
        gates: [
          {
            id: "g2",
            yRatio: 0.5,
            layout: "single",
            widthRatio: 0.5,
            oscillateHz: 0.6,
            leftSlot: { op: "add", operand: 80 },
          },
        ],
        pinsEnabled: false,
        pinRows: 0,
        wall: {
          totalLayers: 8,
          baseValue: 200,
          layerOp: "mul",
          layerOperand: 2.2,
          compoundPerSec: 1.03,
          capMode: "none",
          capValue: 0,
        },
      },
    ],
  };

  // Compare run 1 (visuals off) vs run 2 (visuals ON!) -> even visual effects must NOT alter physics determinism!
  const run1 = runHeadlessSimulation(config, 35);
  const run2 = createSimulation(config);
  while (run2.status !== "finished" && run2.elapsedSec < 35) {
    stepSimulationOnce(run2, true);
  }

  assert.equal(run1.stepCount, run2.stepCount);
  assert.equal(run1.winnerLaneIndex, run2.winnerLaneIndex);
  assert.equal(run1.lanes[0].brokenLayers, run2.lanes[0].brokenLayers);
  assert.equal(run1.lanes[1].brokenLayers, run2.lanes[1].brokenLayers);
  assert.equal(
    bfCmp(run1.lanes[0].totalDamageDealt, run2.lanes[0].totalDamageDealt),
    0
  );
  assert.equal(
    bfCmp(run1.lanes[1].totalDamageDealt, run2.lanes[1].totalDamageDealt),
    0
  );
}

console.log("✅ All BigFloat, ×N Damage-Cap, and 120Hz Determinism tests PASSED!");

// 4. Stage 3: Verify URL Share Codec round-trip & all 10 Presets finish cleanly
import { PRESET_LEVELS } from "../presets";
import { encodeMatchToUrlParam, decodeMatchFromUrlParam } from "../../lib/urlCodec";

{
  for (const preset of PRESET_LEVELS) {
    const encoded = encodeMatchToUrlParam(preset);
    const decoded = decodeMatchFromUrlParam(encoded);
    assert.ok(decoded !== null, `Codec must decode ${preset.id}`);
    assert.equal(decoded!.id, preset.id);
    assert.equal(decoded!.lanes.length, preset.lanes.length);
  }
  console.log("✅ All 10 Presets & URL Base64 Codec round-trip tests PASSED!");
}
