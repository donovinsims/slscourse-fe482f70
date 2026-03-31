export const normalizeEmail = (email: string | null | undefined) =>
  email?.trim().toLowerCase() ?? "";

interface AdminLookupResult {
  data: { email: string } | null;
  error: unknown;
}

interface AdminLookupClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<AdminLookupResult>;
      };
    };
  };
}

export async function isAdminEmail(
  adminClient: AdminLookupClient,
  email: string | null | undefined
) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;

  const { data, error } = await adminClient
    .from("admin_users")
    .select("email")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    console.error("[admin] Failed to resolve admin status:", error);
    return false;
  }

  return Boolean(data);
}
