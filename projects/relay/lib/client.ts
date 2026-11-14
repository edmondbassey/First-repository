export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("The service could not be reached. Try again.");
  }
  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "The request could not be completed.";
    throw new ApiError(message, response.status);
  }
  return data as T;
}
