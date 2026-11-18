import {
  computeDynamicOdds,
  isUpstashConfigured,
  listPublicLevels,
  saveCustomLevel,
} from "@/lib/storage";
import type { MatchConfig } from "@/engine/types";

export async function GET() {
  const records = await listPublicLevels();
  const levels = records.map((rec) => ({
    ...rec,
    oddsSummary: computeDynamicOdds(rec.laneBets, rec.config.lanes.length),
  }));
  return Response.json({
    levels,
    storageBackend: isUpstashConfigured() ? "upstash" : "memory",
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      config?: MatchConfig;
      author?: string;
    };

    if (
      !body?.config ||
      !Array.isArray(body.config.lanes) ||
      body.config.lanes.length < 2 ||
      body.config.lanes.length > 3
    ) {
      return Response.json(
        { error: "关卡配置无效（需要 2~3 条赛道）" },
        { status: 400 }
      );
    }

    const saved = await saveCustomLevel(
      body.config,
      body.author ?? "匿名出题人"
    );
    return Response.json({
      level: {
        ...saved,
        oddsSummary: computeDynamicOdds(
          saved.laneBets,
          saved.config.lanes.length
        ),
      },
    });
  } catch {
    return Response.json({ error: "保存自定义关卡失败" }, { status: 500 });
  }
}
