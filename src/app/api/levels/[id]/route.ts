import { computeDynamicOdds, getLevelRecordById } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const record = await getLevelRecordById(id);
  if (!record) {
    return Response.json({ error: "未找到该挑战关卡" }, { status: 404 });
  }
  return Response.json({
    level: {
      ...record,
      oddsSummary: computeDynamicOdds(
        record.laneBets,
        record.config.lanes.length
      ),
    },
  });
}
