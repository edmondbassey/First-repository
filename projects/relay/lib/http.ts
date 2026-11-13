import { env } from "cloudflare:workers";
import { AppError } from "./domain.ts";
import { workspaceExists } from "./service.ts";
import { sessionId } from "./request.ts";
import type { Database } from "./service.ts";
export { sessionId, protectWrite, readJson } from "./request.ts";
export function database(): Database {
  if (!env.DB) throw new Error("Database binding unavailable");
  return env.DB as unknown as Database;
}
export async function requireWorkspace(request: Request, db: Database) {
  const id = sessionId(request);
  if (!id || !(await workspaceExists(db, id)))
    throw new AppError(401, "Start a demo workspace first.");
  return id;
}
export function json(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return json({ error: error.message }, error.status);
  console.error(
    "Relay request failed",
    error instanceof Error ? error.message : "Unknown error",
  );
  return json(
    { error: "Something went wrong while saving. Please try again." },
    500,
  );
}
