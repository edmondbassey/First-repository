import { database, requireWorkspace, json, errorResponse } from "@/lib/http";
import { listEvents } from "@/lib/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const db = database(),
      workspace = await requireWorkspace(request, db);
    return json({ events: await listEvents(db, workspace) });
  } catch (error) {
    return errorResponse(error);
  }
}
