import { renderHook, waitFor } from "@testing-library/react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccessState } from "./use-access-state";

const { invokeMock, signOutMock, useAuthMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  signOutMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

describe("useAccessState", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    signOutMock.mockReset();
    signOutMock.mockResolvedValue(undefined);
    useAuthMock.mockReturnValue({
      user: { email: "member@example.com" },
      loading: false,
      signOut: signOutMock,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signs the user out when get-access-state returns 401", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response("Unauthorized", { status: 401 })),
    });

    const { result } = renderHook(() => useAccessState());

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.accessState).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
