import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAdminEmail, normalizeEmail } from "../_shared/admin.ts";
import { getAppOrigin } from "../_shared/origin.ts";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SB_SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const normalizedEmail = normalizeEmail(user?.email);
    const isAdmin = await isAdminEmail(adminClient, normalizedEmail);

    if (authError || !user?.email || !isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, customerId, email } = await req.json();

    if (action === "list") {
      const { data: customers, error } = await adminClient
        .from("customers")
        .select("id, email, course_access, purchased_at, stripe_customer_id")
        .order("purchased_at", { ascending: false, nullsFirst: false });

      if (error) throw error;

      return new Response(JSON.stringify({ customers }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "grant") {
      if (!customerId || !email) {
        return new Response(
          JSON.stringify({ error: "Missing customerId or email" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Idempotent: check if already granted
      const { data: existing } = await adminClient
        .from("customers")
        .select("course_access")
        .eq("id", customerId)
        .maybeSingle();

      if (existing?.course_access) {
        return new Response(
          JSON.stringify({ success: true, note: "Access already granted." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Grant access
      const { error: updateError } = await adminClient
        .from("customers")
        .update({ course_access: true })
        .eq("id", customerId);

      if (updateError) throw updateError;

      // Create auth user if needed + generate magic link
      const baseUrl = getAppOrigin(req);
      const customerEmailLower = email.toLowerCase();
      let magicLinkUrl = `${baseUrl}/login`;

      try {
        await adminClient.auth.admin.createUser({
          email: customerEmailLower,
          email_confirm: true,
        });
      } catch (_e) {
        console.log("User may already exist, continuing...");
      }

      try {
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: "magiclink",
          email: customerEmailLower,
          options: { redirectTo: `${baseUrl}/portal` },
        });

        if (linkError) {
          console.error("generateLink error:", linkError);
        } else if (linkData?.properties?.action_link) {
          magicLinkUrl = linkData.properties.action_link;
        }
      } catch (linkErr) {
        console.error("Magic link generation error:", linkErr);
      }

      // Send ONE email via Resend with magic link
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@mail.sheaslegacyscalping.com";
      if (resendApiKey) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: resendFrom,
              to: customerEmailLower,
              subject: "Your SLS Vault Course Access Has Been Activated!",
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                  <h1 style="color: #1a1a1a; font-size: 24px;">Your Access is Ready! 🎉</h1>
                  <p style="color: #444; line-height: 1.6;">Your SLS Vault course access has been activated by our team.</p>
                  <p style="color: #444; line-height: 1.6;">Click the button below to sign in instantly:</p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${magicLinkUrl}" style="background: #c9a84c; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Access Your Course</a>
                  </div>
                  <p style="color: #888; font-size: 14px;">If the link expires, visit <a href="${baseUrl}/login" style="color: #c9a84c;">${baseUrl}/login</a> and request a new magic link.</p>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
                  <p style="color: #aaa; font-size: 12px;">SLS Vault — Shea's Legacy Scalping</p>
                </div>
              `,
            }),
          });
        } catch (emailErr) {
          console.error("Grant access email error:", emailErr);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
