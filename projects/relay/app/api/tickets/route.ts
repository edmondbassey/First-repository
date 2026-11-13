import {
  database,
  requireWorkspace,
  readJson,
  json,
  errorResponse,
} from "@/lib/http";
import { listTickets, addTicket } from "@/lib/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const db = database(),
      workspace = await requireWorkspace(request, db);
    return json({ tickets: await listTickets(db, workspace) });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const db = database(),
      workspace = await requireWorkspace(request, db),
      body = await readJson(request);
    return json({ ticket: await addTicket(db, workspace, body) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
