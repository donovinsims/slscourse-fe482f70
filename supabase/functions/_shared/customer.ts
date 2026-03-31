import { normalizeEmail } from "./admin.ts";

export interface LinkedCustomer {
  id: string;
  email: string;
  course_access: boolean;
  auth_user_id: string | null;
}

interface RpcCapableClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: LinkedCustomer[] | LinkedCustomer | null; error: unknown }>;
}

export async function claimCustomerForAuthUser(
  client: RpcCapableClient,
  authUserId: string | null | undefined,
  email: string | null | undefined
) {
  const normalizedEmail = normalizeEmail(email);
  if (!authUserId || !normalizedEmail) return null;

  const { data, error } = await client.rpc("claim_customer_for_auth_user", {
    p_auth_user_id: authUserId,
    p_email: normalizedEmail,
  });

  if (error) {
    console.error("[customer] Failed to claim customer for auth user:", error);
    return null;
  }

  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  return data ?? null;
}
