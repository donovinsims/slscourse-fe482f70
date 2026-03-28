import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_ORIGIN = "https://slscourse1.lovable.app";

// ── Simple in-memory rate limiter ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 10;

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
      JSON.stringify({ success: false, error: "Too many requests. Please try again shortly." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { sessionId } = await req.json();
    if (!sessionId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing session ID" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      console.error("STRIPE_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Payment verification is not configured." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 1. Verify checkout session with Stripe ──
    const stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}?expand[]=line_items`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );

    if (!stripeRes.ok) {
      const errBody = await stripeRes.text();
      console.error("Stripe API error:", stripeRes.status, errBody);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid checkout session." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const session = await stripeRes.json();

    if (session.payment_status !== "paid") {
      return new Response(
        JSON.stringify({ success: false, error: "Payment not completed." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customerEmail = session.customer_details?.email?.toLowerCase();
    if (!customerEmail) {
      return new Response(
        JSON.stringify({ success: false, error: "No email found in session." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Supabase admin client ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // ── 3. Idempotency: check if already processed ──
    const { data: existing } = await adminClient
      .from("customers")
      .select("id, course_access, stripe_customer_id")
      .eq("email", customerEmail)
      .maybeSingle();

    if (existing?.course_access && existing?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ success: true, alreadyProcessed: true, email: customerEmail }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Upsert customer with access ──
    const { error: upsertError } = await adminClient.from("customers").upsert(
      {
        email: customerEmail,
        stripe_customer_id: session.customer ?? null,
        course_access: true,
        purchased_at: new Date().toISOString(),
      },
      { onConflict: "email" }
    );

    if (upsertError) {
      console.error("Customer upsert error:", upsertError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to save customer record." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 5. Create auth user if needed + generate magic link ──
    const baseUrl = req.headers.get("origin") ?? DEFAULT_ORIGIN;
    let magicLinkUrl = `${baseUrl}/login`;

    // Try to create user (will fail silently if exists)
    try {
      await adminClient.auth.admin.createUser({
        email: customerEmail,
        email_confirm: true,
      });
    } catch (_e) {
      console.log("User may already exist, continuing...");
    }

    // Generate a magic link
    try {
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: customerEmail,
        options: {
          redirectTo: `${baseUrl}/portal`,
        },
      });

      if (linkError) {
        console.error("generateLink error:", linkError);
      } else if (linkData?.properties?.action_link) {
        magicLinkUrl = linkData.properties.action_link;
      }
    } catch (linkErr) {
      console.error("Magic link generation error:", linkErr);
    }

    // ── 6. Send ONE email via Resend with the magic link ──
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@mail.sheaslegacyscalping.com";
    const adminEmail = Deno.env.get("RESEND_ADMIN_EMAIL") ?? "donovinsims@gmail.com";

    if (resendApiKey) {
      const lineItems = session.line_items?.data ?? [];
      const productNames = lineItems.map((li: any) => li.description || "SLS Vault Course").join(", ");
      const amountPaid = (session.amount_total / 100).toFixed(2);

      // Single buyer email with magic link
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: resendFrom,
            to: customerEmail,
            subject: "Welcome to SLS Vault — Your Course Access is Ready!",
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <h1 style="color: #1a1a1a; font-size: 24px;">Welcome to SLS Vault! 🎉</h1>
                <p style="color: #444; line-height: 1.6;">Your purchase of <strong>${productNames}</strong> ($${amountPaid}) was successful.</p>
                <p style="color: #444; line-height: 1.6;">Your course access is now active. Click the button below to sign in instantly:</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${magicLinkUrl}" style="background: #c9a84c; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Access Your Course</a>
                </div>
                <p style="color: #888; font-size: 14px;">This link will sign you in automatically. If it expires, visit <a href="${baseUrl}/login" style="color: #c9a84c;">${baseUrl}/login</a> and request a new magic link using ${customerEmail}.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
                <p style="color: #aaa; font-size: 12px;">SLS Vault — Shea's Legacy Scalping</p>
              </div>
            `,
          }),
        });
      } catch (emailErr) {
        console.error("Buyer email error:", emailErr);
      }

      // Admin notification
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: resendFrom,
            to: adminEmail,
            subject: `💰 New Sale: ${customerEmail} — $${amountPaid}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <h1 style="color: #1a1a1a; font-size: 24px;">New Course Sale! 💰</h1>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                  <tr><td style="padding: 8px 0; color: #888;">Customer</td><td style="padding: 8px 0; font-weight: 600;">${customerEmail}</td></tr>
                  <tr><td style="padding: 8px 0; color: #888;">Amount</td><td style="padding: 8px 0; font-weight: 600;">$${amountPaid}</td></tr>
                  <tr><td style="padding: 8px 0; color: #888;">Product</td><td style="padding: 8px 0;">${productNames}</td></tr>
                  <tr><td style="padding: 8px 0; color: #888;">Stripe Session</td><td style="padding: 8px 0; font-size: 12px;">${sessionId}</td></tr>
                  <tr><td style="padding: 8px 0; color: #888;">Access</td><td style="padding: 8px 0; color: green; font-weight: 600;">✅ Auto-granted</td></tr>
                </table>
              </div>
            `,
          }),
        });
      } catch (emailErr) {
        console.error("Admin email error:", emailErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, alreadyProcessed: false, email: customerEmail }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-purchase error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
