import {
  database,
  requireWorkspace,
  readJson,
  json,
  errorResponse,
} from "@/lib/http";
import { addNote } from "@/lib/service";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const db = database(),
      workspace = await requireWorkspace(request, db),
      { id } = await context.params,
      body = await readJson(request);
    return json({ events: await addNote(db, workspace, id, body) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
