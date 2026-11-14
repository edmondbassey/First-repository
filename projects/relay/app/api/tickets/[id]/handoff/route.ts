import { database, requireWorkspace, errorResponse } from "@/lib/http";
import { getTicket, listEvents } from "@/lib/service";
import { listChecks } from "@/lib/checks";
import { handoffMarkdown } from "@/lib/incidents";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const db = database(),
      workspace = await requireWorkspace(request, db),
      { id } = await context.params,
      ticket = await getTicket(db, workspace, id);
    const body = handoffMarkdown(
      ticket,
      await listEvents(db, workspace, id),
      await listChecks(db, workspace, id),
    );
    return new Response(body, {
      headers: {
        "content-type": "text/markdown;charset=utf-8",
        "content-disposition":
          'attachment; filename="relay-' + ticket.number + '-handoff.md"',
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
