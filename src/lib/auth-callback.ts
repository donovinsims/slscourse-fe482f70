import type { SupabaseClient } from "@supabase/supabase-js";

const EMAIL_OTP_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const;

export type SupportedEmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

export interface AuthCallbackState {
  code: string | null;
  tokenHash: string | null;
  type: SupportedEmailOtpType | null;
  accessToken: string | null;
  refreshToken: string | null;
  hasImplicitTokens: boolean;
  hasError: boolean;
}

export const AUTH_CALLBACK_ERROR_KEY = "sls-auth-callback-error";

const isSupportedEmailOtpType = (value: string | null): value is SupportedEmailOtpType =>
  Boolean(value && EMAIL_OTP_TYPES.includes(value as SupportedEmailOtpType));

export const getAuthCallbackState = (href: string): AuthCallbackState => {
  const url = new URL(href);
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const type = url.searchParams.get("type") ?? hashParams.get("type");
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  return {
    code: url.searchParams.get("code"),
    tokenHash: url.searchParams.get("token_hash"),
    type: isSupportedEmailOtpType(type) ? type : null,
    accessToken,
    refreshToken,
    hasImplicitTokens: Boolean(accessToken && refreshToken),
    hasError:
      Boolean(url.searchParams.get("error")) ||
      Boolean(url.searchParams.get("error_description")) ||
      hashParams.has("error") ||
      hashParams.has("error_description"),
  };
};

export const hasAuthCallbackParams = (href: string) => {
  const state = getAuthCallbackState(href);
  return Boolean(
    state.code ||
      (state.tokenHash && state.type) ||
      state.hasImplicitTokens ||
      state.hasError
  );
};

export const stripAuthCallbackParams = (href: string) => {
  const url = new URL(href);

  url.searchParams.delete("code");
  url.searchParams.delete("token_hash");
  url.searchParams.delete("type");
  url.searchParams.delete("error");
  url.searchParams.delete("error_code");
  url.searchParams.delete("error_description");

  url.hash = "";

  return `${url.pathname}${url.search}${url.hash}`;
};

interface AuthCompletionResult {
  handled: boolean;
  error: string | null;
}

export const completeAuthFromUrl = async (
  supabase: SupabaseClient,
  href: string,
  replaceUrl: (nextUrl: string) => void
): Promise<AuthCompletionResult> => {
  const state = getAuthCallbackState(href);
  const cleanedUrl = stripAuthCallbackParams(href);

  try {
    if (state.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(state.code);
      replaceUrl(cleanedUrl);
      return {
        handled: true,
        error: error?.message ?? null,
      };
    }

    if (state.tokenHash && state.type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: state.tokenHash,
        type: state.type,
      });
      replaceUrl(cleanedUrl);
      return {
        handled: true,
        error: error?.message ?? null,
      };
    }

    if (state.accessToken && state.refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: state.accessToken,
        refresh_token: state.refreshToken,
      });
      replaceUrl(cleanedUrl);
      return {
        handled: true,
        error: error?.message ?? null,
      };
    }

    if (state.hasError) {
      replaceUrl(cleanedUrl);
      return {
        handled: true,
        error: "Your sign-in link is invalid or has expired. Request a fresh login link and try again.",
      };
    }

    return {
      handled: false,
      error: null,
    };
  } catch (error) {
    replaceUrl(cleanedUrl);
    return {
      handled: true,
      error:
        error instanceof Error
          ? error.message
          : "Your sign-in link is invalid or expired. Request a fresh login link and try again.",
    };
  }
};
