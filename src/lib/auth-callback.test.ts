import { describe, expect, it, vi } from "vitest";
import { completeAuthFromUrl, hasAuthCallbackParams } from "./auth-callback";

function createClient() {
  return {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      setSession: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}

describe("auth callback helpers", () => {
  it("detects auth callback params in search or hash", () => {
    expect(hasAuthCallbackParams("https://example.com/portal?code=test")).toBe(true);
    expect(
      hasAuthCallbackParams("https://example.com/portal#access_token=token&refresh_token=refresh"),
    ).toBe(true);
    expect(hasAuthCallbackParams("https://example.com/portal")).toBe(false);
  });

  it("exchanges PKCE auth codes and strips callback params", async () => {
    const client = createClient();
    const replaceUrl = vi.fn();

    const result = await completeAuthFromUrl(
      client,
      "https://example.com/portal?code=abc123&type=magiclink",
      replaceUrl,
    );

    expect(result).toEqual({ handled: true, error: null });
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(replaceUrl).toHaveBeenCalledWith("/portal");
  });

  it("sets a session from implicit-flow hash fragments", async () => {
    const client = createClient();
    const replaceUrl = vi.fn();

    const result = await completeAuthFromUrl(
      client,
      "https://example.com/portal#access_token=token&refresh_token=refresh&type=magiclink",
      replaceUrl,
    );

    expect(result).toEqual({ handled: true, error: null });
    expect(client.auth.setSession).toHaveBeenCalledWith({
      access_token: "token",
      refresh_token: "refresh",
    });
    expect(replaceUrl).toHaveBeenCalledWith("/portal");
  });
});
