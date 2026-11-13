import {
  database,
  sessionId,
  protectWrite,
  json,
  errorResponse,
} from "@/lib/http";
import { createWorkspace, workspaceExists } from "@/lib/service";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    protectWrite(request);
    const db = database(),
      existing = sessionId(request);
    if (existing && (await workspaceExists(db, existing)))
      return json({ ready: true });
    const id = await createWorkspace(db);
    return json({ ready: true }, 201, {
      "set-cookie":
        "relay_session=" +
        id +
        "; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000" +
        (new URL(request.url).protocol === "https:" ? "; Secure" : ""),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
