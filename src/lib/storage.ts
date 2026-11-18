import fs from "node:fs";
import { Redis } from "@upstash/redis";
import { PRESET_LEVELS, getPresetById } from "@/engine/presets";
import type { MatchConfig } from "@/engine/types";
import { bf, bfCmp, formatBigFloat } from "@/engine/bigNumber";

export interface StoredLevelRecord {
  id: string;
  config: MatchConfig;
  author: string;
  createdAt: string;
  isPreset: boolean;
  laneBets: number[];
  plays: number;
}

export interface OddsSummary {
  laneBets: number[];
  totalBets: number;
  shares: number[]; // 0 ~ 1
  odds: number[]; // e.g. [1.38, 3.45]
}

export interface LeaderboardEntry {
  id: string;
  nickname: string;
  /** Stored as BigFloat scientific string e.g. "4.82e15" or "125000" so chips beyond 1e308 still rank! */
  chipsRaw: string;
  chipsFormatted: string;
  maxStreak: number;
  updatedAt: string;
}

interface LocalFallbackData {
  customLevels: Record<string, StoredLevelRecord>;
  betCounts: Record<string, number[]>;
  leaderboard: LeaderboardEntry[];
}

const LOCAL_STORE_PATH = "/tmp/expo-lanes-fallback-store.json";

/**
 * Realistic crowd-bias initial bets on presets (most players intuitively bet on flashy initial numbers
 * or ^power gates, creating juicy underdog odds on the true mathematical dark horse!)
 */
const INITIAL_PRESET_BETS: Record<string, number[]> = {
  "preset-linear-vs-expo": [148, 64],
  "preset-cap-wall-trap": [162, 95, 48],
  "preset-gate-gamble": [72, 54, 184],
  "preset-sabotage-war": [136, 88, 62],
  "preset-push-survival": [128, 59, 112],
  "preset-endless-sprint": [86, 118, 94],
  "preset-threshold-awakening": [154, 51],
  "preset-penetration-paradox": [176, 84, 52],
  "preset-regen-dps-check": [168, 49],
  "preset-hyper-singularity": [92, 108, 134],
};

const SEED_LEADERBOARD: LeaderboardEntry[] = [
  {
    id: "seed-1",
    nickname: "Euler_e^x",
    chipsRaw: "2.84e14",
    chipsFormatted: formatBigFloat(bf("2.84e14"), "intl"),
    maxStreak: 14,
    updatedAt: "2026-11-17T18:20:00.000Z",
  },
  {
    id: "seed-2",
    nickname: "Ramanujan_1729",
    chipsRaw: "9.15e10",
    chipsFormatted: formatBigFloat(bf("9.15e10"), "intl"),
    maxStreak: 11,
    updatedAt: "2026-11-17T19:05:00.000Z",
  },
  {
    id: "seed-3",
    nickname: "Kelly_Criterion",
    chipsRaw: "4.6e8",
    chipsFormatted: formatBigFloat(bf("4.6e8"), "intl"),
    maxStreak: 9,
    updatedAt: "2026-11-17T20:12:00.000Z",
  },
  {
    id: "seed-4",
    nickname: "Noether_Invariant",
    chipsRaw: "1.28e7",
    chipsFormatted: formatBigFloat(bf("1.28e7"), "intl"),
    maxStreak: 7,
    updatedAt: "2026-11-17T21:00:00.000Z",
  },
  {
    id: "seed-5",
    nickname: "Gauss_Prime",
    chipsRaw: "385000",
    chipsFormatted: formatBigFloat(bf("385000"), "intl"),
    maxStreak: 5,
    updatedAt: "2026-11-17T21:30:00.000Z",
  },
];

let cachedRedis: Redis | null | undefined;

function getRedisClient(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    cachedRedis = new Redis({ url, token });
  } else {
    cachedRedis = null;
  }
  return cachedRedis;
}

export function isUpstashConfigured(): boolean {
  return getRedisClient() !== null;
}

declare global {
  var __expoLanesMemStore: LocalFallbackData | undefined;
}

function getLocalStore(): LocalFallbackData {
  if (globalThis.__expoLanesMemStore) {
    return globalThis.__expoLanesMemStore;
  }

  let initial: LocalFallbackData = {
    customLevels: {},
    betCounts: structuredClone(INITIAL_PRESET_BETS),
    leaderboard: structuredClone(SEED_LEADERBOARD),
  };

  try {
    if (fs.existsSync(LOCAL_STORE_PATH)) {
      const raw = fs.readFileSync(LOCAL_STORE_PATH, "utf-8");
      const parsed = JSON.parse(raw) as Partial<LocalFallbackData>;
      if (parsed && typeof parsed === "object") {
        initial = {
          customLevels: parsed.customLevels ?? {},
          betCounts: {
            ...structuredClone(INITIAL_PRESET_BETS),
            ...(parsed.betCounts ?? {}),
          },
          leaderboard:
            Array.isArray(parsed.leaderboard) && parsed.leaderboard.length > 0
              ? parsed.leaderboard
              : structuredClone(SEED_LEADERBOARD),
        };
      }
    }
  } catch {
    // Ignore read errors on ephemeral/serverless filesystems
  }

  globalThis.__expoLanesMemStore = initial;
  return initial;
}

function persistLocalStore(store: LocalFallbackData): void {
  try {
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(store), "utf-8");
  } catch {
    // Safe no-op on read-only serverless fs
  }
}

export function computeDynamicOdds(
  rawBets: number[],
  laneCount: number
): OddsSummary {
  const laneBets = Array.from({ length: laneCount }, (_, i) =>
    Math.max(0, Math.floor(rawBets[i] ?? 0))
  );
  const totalBets = laneBets.reduce((acc, v) => acc + v, 0);

  // Laplace smoothing (+4 virtual tickets per lane) so brand-new custom levels have fair balanced odds
  const smoothing = 4;
  const smoothed = laneBets.map((b) => b + smoothing);
  const smoothedSum = smoothed.reduce((acc, v) => acc + v, 0);

  const shares = smoothed.map((s) => Number((s / smoothedSum).toFixed(4)));
  // Arcade parimutuel pool with 0.98 return factor, clamped to [1.12, 8.80]
  const odds = smoothed.map((s) => {
    const rawOdd = (smoothedSum * 0.98) / s;
    return Number(Math.min(8.8, Math.max(1.12, rawOdd)).toFixed(2));
  });

  return {
    laneBets,
    totalBets,
    shares,
    odds,
  };
}

function generateShortId(): string {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  let id = "";
  for (let i = 0; i < 7; i++) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
}

export async function listPublicLevels(): Promise<StoredLevelRecord[]> {
  const redis = getRedisClient();
  const presetRecords: StoredLevelRecord[] = PRESET_LEVELS.map((cfg) => ({
    id: cfg.id,
    config: cfg,
    author: "数字实验室官方",
    createdAt: "2026-11-17T00:00:00.000Z",
    isPreset: true,
    laneBets: [...(INITIAL_PRESET_BETS[cfg.id] ?? cfg.lanes.map(() => 20))],
    plays: (INITIAL_PRESET_BETS[cfg.id] ?? [20, 20]).reduce((a, b) => a + b, 0),
  }));

  if (!redis) {
    const store = getLocalStore();
    for (const rec of presetRecords) {
      if (store.betCounts[rec.id]) {
        rec.laneBets = [...store.betCounts[rec.id]];
        rec.plays = rec.laneBets.reduce((a, b) => a + b, 0);
      }
    }
    const customs = Object.values(store.customLevels).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    return [...customs, ...presetRecords];
  }

  try {
    // Load preset bet overrides from Redis
    const betKeys = presetRecords.map((p) => `expo:bets:${p.id}`);
    const betValues = await redis.mget<number[][]>(...betKeys);
    presetRecords.forEach((rec, i) => {
      const saved = betValues?.[i];
      if (Array.isArray(saved) && saved.length === rec.config.lanes.length) {
        rec.laneBets = saved;
        rec.plays = saved.reduce((a, b) => a + b, 0);
      }
    });

    const customIds = await redis.lrange<string>("expo:custom_level_ids", 0, 29);
    let customRecords: StoredLevelRecord[] = [];
    if (customIds && customIds.length > 0) {
      const levelKeys = customIds.map((id) => `expo:level:${id}`);
      const fetched = await redis.mget<StoredLevelRecord[]>(...levelKeys);
      customRecords = (fetched ?? []).filter(
        (item): item is StoredLevelRecord => Boolean(item && item.config)
      );
    }
    return [...customRecords, ...presetRecords];
  } catch {
    return presetRecords;
  }
}

export async function getLevelRecordById(
  id: string
): Promise<StoredLevelRecord | null> {
  const preset = getPresetById(id);
  const redis = getRedisClient();

  if (preset) {
    const defaultBets = [
      ...(INITIAL_PRESET_BETS[id] ?? preset.lanes.map(() => 20)),
    ];
    if (!redis) {
      const store = getLocalStore();
      const bets = store.betCounts[id] ?? defaultBets;
      return {
        id,
        config: preset,
        author: "数字实验室官方",
        createdAt: "2026-11-17T00:00:00.000Z",
        isPreset: true,
        laneBets: [...bets],
        plays: bets.reduce((a, b) => a + b, 0),
      };
    }
    try {
      const savedBets = await redis.get<number[]>(`expo:bets:${id}`);
      const bets =
        Array.isArray(savedBets) && savedBets.length === preset.lanes.length
          ? savedBets
          : defaultBets;
      return {
        id,
        config: preset,
        author: "数字实验室官方",
        createdAt: "2026-11-17T00:00:00.000Z",
        isPreset: true,
        laneBets: bets,
        plays: bets.reduce((a, b) => a + b, 0),
      };
    } catch {
      return {
        id,
        config: preset,
        author: "数字实验室官方",
        createdAt: "2026-11-17T00:00:00.000Z",
        isPreset: true,
        laneBets: defaultBets,
        plays: defaultBets.reduce((a, b) => a + b, 0),
      };
    }
  }

  // Custom level lookup
  if (!redis) {
    const store = getLocalStore();
    const rec = store.customLevels[id];
    if (!rec) return null;
    const bets = store.betCounts[id] ?? rec.laneBets;
    return {
      ...rec,
      laneBets: [...bets],
      plays: bets.reduce((a, b) => a + b, 0),
    };
  }

  try {
    const rec = await redis.get<StoredLevelRecord>(`expo:level:${id}`);
    if (!rec) return null;
    const savedBets = await redis.get<number[]>(`expo:bets:${id}`);
    const bets =
      Array.isArray(savedBets) && savedBets.length === rec.config.lanes.length
        ? savedBets
        : rec.laneBets;
    return {
      ...rec,
      laneBets: bets,
      plays: bets.reduce((a, b) => a + b, 0),
    };
  } catch {
    return null;
  }
}

export async function saveCustomLevel(
  config: MatchConfig,
  author: string
): Promise<StoredLevelRecord> {
  const shortId = `c-${generateShortId()}`;
  const cleanAuthor = (author || "匿名出题人").trim().slice(0, 24) || "匿名出题人";
  const normalizedConfig: MatchConfig = {
    ...config,
    id: shortId,
    title: (config.title || "玩家自制数学局").trim().slice(0, 48),
    description: (
      config.description || "纯数字指数碰撞挑战，猜猜哪条赛道率先突围？"
    )
      .trim()
      .slice(0, 180),
  };

  const initialBets = normalizedConfig.lanes.map(() => 1);
  const record: StoredLevelRecord = {
    id: shortId,
    config: normalizedConfig,
    author: cleanAuthor,
    createdAt: new Date().toISOString(),
    isPreset: false,
    laneBets: initialBets,
    plays: initialBets.length,
  };

  const redis = getRedisClient();
  if (!redis) {
    const store = getLocalStore();
    store.customLevels[shortId] = record;
    store.betCounts[shortId] = [...initialBets];
    persistLocalStore(store);
    return record;
  }

  try {
    await redis.set(`expo:level:${shortId}`, record);
    await redis.set(`expo:bets:${shortId}`, initialBets);
    await redis.lpush("expo:custom_level_ids", shortId);
    await redis.ltrim("expo:custom_level_ids", 0, 99);
  } catch {
    const store = getLocalStore();
    store.customLevels[shortId] = record;
    store.betCounts[shortId] = [...initialBets];
    persistLocalStore(store);
  }

  return record;
}

export async function recordLaneBet(
  levelId: string,
  laneIndex: number,
  laneCount = 2
): Promise<OddsSummary> {
  const existing = await getLevelRecordById(levelId);
  const effectiveLaneCount = existing ? existing.config.lanes.length : laneCount;
  const safeLane = Math.max(0, Math.min(effectiveLaneCount - 1, Math.floor(laneIndex)));

  const currentBets = existing
    ? [...existing.laneBets]
    : Array.from({ length: effectiveLaneCount }, () => 5);
  currentBets[safeLane] = (currentBets[safeLane] ?? 0) + 1;

  const redis = getRedisClient();
  if (!redis) {
    const store = getLocalStore();
    store.betCounts[levelId] = currentBets;
    if (store.customLevels[levelId]) {
      store.customLevels[levelId].laneBets = [...currentBets];
      store.customLevels[levelId].plays = currentBets.reduce((a, b) => a + b, 0);
    }
    persistLocalStore(store);
    return computeDynamicOdds(currentBets, effectiveLaneCount);
  }

  try {
    await redis.set(`expo:bets:${levelId}`, currentBets);
  } catch {
    const store = getLocalStore();
    store.betCounts[levelId] = currentBets;
    persistLocalStore(store);
  }

  return computeDynamicOdds(currentBets, effectiveLaneCount);
}

function sortByChipsDesc(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => bfCmp(bf(b.chipsRaw), bf(a.chipsRaw)));
}

function sortByStreakDesc(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.maxStreak !== a.maxStreak) return b.maxStreak - a.maxStreak;
    return bfCmp(bf(b.chipsRaw), bf(a.chipsRaw));
  });
}

export async function getLeaderboards(): Promise<{
  topChips: LeaderboardEntry[];
  topStreaks: LeaderboardEntry[];
  storageBackend: "upstash" | "memory";
}> {
  const redis = getRedisClient();
  if (!redis) {
    const store = getLocalStore();
    return {
      topChips: sortByChipsDesc(store.leaderboard).slice(0, 20),
      topStreaks: sortByStreakDesc(store.leaderboard).slice(0, 20),
      storageBackend: "memory",
    };
  }

  try {
    const list = await redis.get<LeaderboardEntry[]>("expo:leaderboard:entries");
    const merged =
      Array.isArray(list) && list.length > 0 ? list : SEED_LEADERBOARD;
    return {
      topChips: sortByChipsDesc(merged).slice(0, 20),
      topStreaks: sortByStreakDesc(merged).slice(0, 20),
      storageBackend: "upstash",
    };
  } catch {
    const store = getLocalStore();
    return {
      topChips: sortByChipsDesc(store.leaderboard).slice(0, 20),
      topStreaks: sortByStreakDesc(store.leaderboard).slice(0, 20),
      storageBackend: "memory",
    };
  }
}

export async function submitLeaderboardRecord(input: {
  nickname: string;
  chipsRaw: string;
  maxStreak: number;
}): Promise<{
  topChips: LeaderboardEntry[];
  topStreaks: LeaderboardEntry[];
}> {
  const cleanName =
    (input.nickname || "匿名数学家").trim().slice(0, 20) || "匿名数学家";
  const parsedChips = bf(input.chipsRaw || "1000");
  const safeChipsRaw =
    parsedChips.sign <= 0
      ? "0"
      : `${parsedChips.m.toFixed(4)}e${parsedChips.e}`;
  const safeStreak = Math.max(0, Math.min(9999, Math.floor(input.maxStreak || 0)));

  const updateList = (existingList: LeaderboardEntry[]): LeaderboardEntry[] => {
    const list = [...existingList];
    const idx = list.findIndex(
      (e) => e.nickname.toLowerCase() === cleanName.toLowerCase()
    );
    if (idx >= 0) {
      const prev = list[idx];
      const bestChips =
        bfCmp(parsedChips, bf(prev.chipsRaw)) >= 0
          ? parsedChips
          : bf(prev.chipsRaw);
      const bestRaw = `${bestChips.m.toFixed(4)}e${bestChips.e}`;
      list[idx] = {
        ...prev,
        nickname: cleanName,
        chipsRaw: bestRaw,
        chipsFormatted: formatBigFloat(bestChips, "intl"),
        maxStreak: Math.max(prev.maxStreak, safeStreak),
        updatedAt: new Date().toISOString(),
      };
    } else {
      list.push({
        id: `p-${Date.now().toString(36)}`,
        nickname: cleanName,
        chipsRaw: safeChipsRaw,
        chipsFormatted: formatBigFloat(parsedChips, "intl"),
        maxStreak: safeStreak,
        updatedAt: new Date().toISOString(),
      });
    }
    return sortByChipsDesc(list).slice(0, 60);
  };

  const redis = getRedisClient();
  if (!redis) {
    const store = getLocalStore();
    store.leaderboard = updateList(store.leaderboard);
    persistLocalStore(store);
    return {
      topChips: sortByChipsDesc(store.leaderboard).slice(0, 20),
      topStreaks: sortByStreakDesc(store.leaderboard).slice(0, 20),
    };
  }

  try {
    const current =
      (await redis.get<LeaderboardEntry[]>("expo:leaderboard:entries")) ??
      SEED_LEADERBOARD;
    const updated = updateList(current);
    await redis.set("expo:leaderboard:entries", updated);
    return {
      topChips: sortByChipsDesc(updated).slice(0, 20),
      topStreaks: sortByStreakDesc(updated).slice(0, 20),
    };
  } catch {
    const store = getLocalStore();
    store.leaderboard = updateList(store.leaderboard);
    persistLocalStore(store);
    return {
      topChips: sortByChipsDesc(store.leaderboard).slice(0, 20),
      topStreaks: sortByStreakDesc(store.leaderboard).slice(0, 20),
    };
  }
}
