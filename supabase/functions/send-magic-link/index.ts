import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_ORIGIN = "https://slscourse.lovable.app";

const ADMIN_EMAILS = [
  "sls25trading@gmail.com",
  "emaildonovin@gmail.com",
  "donovinsims@gmail.com",
];

// Simple rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 3; // 3 requests per minute per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please wait a minute and try again." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const baseUrl = req.headers.get("origin") ?? DEFAULT_ORIGIN;

    // Check if user exists in auth
    const { data: users } = await adminClient.auth.admin.listUsers();
    const existingUser = users?.users?.find(
      (u) => u.email?.toLowerCase() === cleanEmail
    );

    const isAdmin = ADMIN_EMAILS.includes(cleanEmail);

    if (!existingUser) {
      if (isAdmin) {
        // Admin emails always get an auth account created if one doesn't exist
        try {
          await adminClient.auth.admin.createUser({
            email: cleanEmail,
            email_confirm: true,
          });
        } catch (_e) {
          console.log("Admin user creation failed, may already exist");
        }
      } else {
        // Check if they have a customer record (purchased but no auth user yet)
        const { data: customer } = await adminClient
          .from("customers")
          .select("course_access")
          .eq("email", cleanEmail)
          .maybeSingle();

        if (customer?.course_access) {
          // Create auth user for existing customer
          try {
            await adminClient.auth.admin.createUser({
              email: cleanEmail,
              email_confirm: true,
            });
          } catch (_e) {
            console.log("User creation failed, may already exist");
          }
        } else {
          // No account, no purchase, and not an admin — send a generic response
          // to avoid email enumeration, but don't actually send a link
          return new Response(
            JSON.stringify({ success: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Generate magic link
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: cleanEmail,
      options: {
        redirectTo: `${baseUrl}/portal`,
      },
    });

    if (linkError) {
      console.error("generateLink error:", linkError);
      return new Response(
        JSON.stringify({ error: "Failed to generate login link." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const magicLinkUrl = linkData?.properties?.action_link ?? `${baseUrl}/login`;

    // Send via Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@mail.sheaslegacyscalping.com";

    if (resendApiKey) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: resendFrom,
            to: cleanEmail,
            subject: "Your SLS Vault Login Link",
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <h1 style="color: #1a1a1a; font-size: 24px;">Sign In to SLS Vault</h1>
                <p style="color: #444; line-height: 1.6;">Click the button below to sign in to your course dashboard:</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${magicLinkUrl}" style="background: #c9a84c; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Sign In to Your Course</a>
                </div>
                <p style="color: #888; font-size: 14px;">This link expires in 1 hour. If it doesn't work, visit <a href="${baseUrl}/login" style="color: #c9a84c;">${baseUrl}/login</a> and request a new one.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
                <p style="color: #aaa; font-size: 12px;">SLS Vault — Shea's Legacy Scalping</p>
              </div>
            `,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error("Resend error:", res.status, errText);
        }
      } catch (emailErr) {
        console.error("Email send error:", emailErr);
      }
    } else {
      console.error("RESEND_API_KEY not configured");
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-magic-link error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
