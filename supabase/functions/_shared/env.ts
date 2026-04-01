export function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseUrl() {
  return requireEnv("SUPABASE_URL");
}

export function getSupabaseAnonKey() {
  return requireEnv("SUPABASE_ANON_KEY");
}

export function getSupabaseServiceKey() {
  return Deno.env.get("SB_SERVICE_KEY") ?? requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}
