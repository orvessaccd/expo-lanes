import { getLeaderboards, submitLeaderboardRecord } from "@/lib/storage";

export async function GET() {
  const data = await getLeaderboards();
  return Response.json(data);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      nickname?: string;
      chipsRaw?: string;
      maxStreak?: number;
    };
    if (!body?.nickname || !body.nickname.trim()) {
      return Response.json({ error: "请输入排行榜昵称" }, { status: 400 });
    }
    const updated = await submitLeaderboardRecord({
      nickname: body.nickname,
      chipsRaw: String(body.chipsRaw ?? "1000"),
      maxStreak: Number(body.maxStreak ?? 0),
    });
    return Response.json(updated);
  } catch {
    return Response.json({ error: "提交排行榜成绩失败" }, { status: 500 });
  }
}
