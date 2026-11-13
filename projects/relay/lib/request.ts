import { AppError } from "./domain.ts";
export function sessionId(request: Request) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("relay_session="))
    ?.slice(14);
  return value && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)
    ? value
    : null;
}
export function protectWrite(request: Request) {
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new AppError(403, "This request must come from the application.");
}
export async function readJson(request: Request) {
  protectWrite(request);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError(415, "Use application/json.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Send a JSON body.");
  let bytes = 0,
    body = "";
  const decoder = new TextDecoder();
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 16000) {
      await reader.cancel();
      throw new AppError(413, "This request is too large.");
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  body += decoder.decode();
  try {
    return JSON.parse(body);
  } catch {
    throw new AppError(400, "The request body is not valid JSON.");
  }
}
