const FALLBACK_ORIGIN = "http://localhost:5173";

export function getAppOrigin(req?: Request) {
  const configuredOrigin = Deno.env.get("EDGE_FUNCTION_DEFAULT_ORIGIN")?.trim();
  if (configuredOrigin) return configuredOrigin;

  const requestOrigin = req?.headers.get("origin")?.trim();
  if (requestOrigin) return requestOrigin;

  return FALLBACK_ORIGIN;
}
