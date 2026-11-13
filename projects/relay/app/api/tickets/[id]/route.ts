import {
  database,
  requireWorkspace,
  readJson,
  json,
  errorResponse,
} from "@/lib/http";
import { getTicket, listEvents, updateTicket } from "@/lib/service";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const db = database(),
      workspace = await requireWorkspace(request, db),
      { id } = await context.params;
    return json({
      ticket: await getTicket(db, workspace, id),
      events: await listEvents(db, workspace, id),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const db = database(),
      workspace = await requireWorkspace(request, db),
      { id } = await context.params,
      body = await readJson(request);
    return json({
      ticket: await updateTicket(db, workspace, id, body),
      events: await listEvents(db, workspace, id),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
