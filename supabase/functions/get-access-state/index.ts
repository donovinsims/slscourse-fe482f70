import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAdminEmail, normalizeEmail } from "../_shared/admin.ts";

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey =
      Deno.env.get("SB_SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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
    const { data: customer, error: customerError } = await userClient
      .from("customers")
      .select("course_access")
      .eq("email", email)
      .maybeSingle();

    if (customerError) {
      console.error("[get-access-state] Failed to load customer:", customerError);
      return new Response(JSON.stringify({ error: "Failed to load access state" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let isAdmin = false;

    if (!supabaseServiceKey) {
      console.warn("[get-access-state] Service role key unavailable, skipping admin lookup.");
    } else {
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      isAdmin = await isAdminEmail(adminClient, email);
    }

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
        hasCourseAccess: Boolean(customer?.course_access),
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
