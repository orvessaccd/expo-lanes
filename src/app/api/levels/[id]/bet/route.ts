import { recordLaneBet } from "@/lib/storage";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      laneIndex?: number;
      laneCount?: number;
    };
    const laneIndex = Number(body?.laneIndex ?? 0);
    const laneCount = Math.min(3, Math.max(2, Number(body?.laneCount ?? 2)));
    const oddsSummary = await recordLaneBet(id, laneIndex, laneCount);
    return Response.json({ oddsSummary });
  } catch {
    return Response.json({ error: "押注统计更新失败" }, { status: 500 });
  }
}
