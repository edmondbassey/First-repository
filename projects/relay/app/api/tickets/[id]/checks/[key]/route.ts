import {
  database,
  requireWorkspace,
  readJson,
  json,
  errorResponse,
} from "@/lib/http";
import { setCheck } from "@/lib/checks";
import { listEvents } from "@/lib/service";
export const dynamic = "force-dynamic";
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; key: string }> },
) {
  try {
    const db = database(),
      workspace = await requireWorkspace(request, db),
      { id, key } = await context.params,
      body = await readJson(request);
    return json({
      checks: await setCheck(db, workspace, id, key, body),
      events: await listEvents(db, workspace, id),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
