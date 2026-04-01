import { normalizeEmail } from "./admin.ts";

interface CustomerRecord {
  id: string;
  email: string;
  course_access: boolean;
}

interface CustomerLookupResult {
  data: CustomerRecord | null;
  error: unknown;
}

interface CustomerLookupClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<CustomerLookupResult>;
      };
    };
  };
}

export async function claimCustomerForAuthUser(
  adminClient: CustomerLookupClient,
  _authUserId: string,
  email: string | null | undefined
) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const { data, error } = await adminClient
    .from("customers")
    .select("id, email, course_access")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    console.error("[customer] Failed to resolve customer access:", error);
    return null;
  }

  return data;
}
