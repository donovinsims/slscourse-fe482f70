import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAdminEmail, normalizeEmail } from "../_shared/admin.ts";
import { claimCustomerForAuthUser } from "../_shared/customer.ts";
import { getSupabaseAnonKey, getSupabaseServiceKey, getSupabaseUrl } from "../_shared/env.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = getSupabaseUrl();
    const supabaseServiceKey = getSupabaseServiceKey();
    const supabaseAnonKey = getSupabaseAnonKey();

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user?.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = normalizeEmail(user.email);
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const isAdmin = await isAdminEmail(adminClient, email);
    const customer = await claimCustomerForAuthUser(adminClient, user.id, email);
    const hasCourseAccess = Boolean(customer?.course_access);

    if (isAdmin) {
      return new Response(
        JSON.stringify({
          email,
          isAdmin: true,
          hasCourseAccess: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        email,
        isAdmin: false,
        hasCourseAccess,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[get-access-state] Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
