import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAppOrigin } from "../_shared/origin.ts";

// ── Stripe webhook secret from env ──
// Set via: supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface StripeLineItem {
  description?: string | null;
}

interface StripeCheckoutSession {
  id?: string;
  mode?: string;
  payment_status?: string;
  customer?: string | null;
  customer_details?: {
    email?: string | null;
  } | null;
  amount_total?: number | null;
  line_items?: {
    data?: StripeLineItem[];
  } | null;
}

interface StripeEvent {
  type?: string;
  data?: {
    object?: StripeCheckoutSession;
  } | null;
}

// ── Stripe signature verification (no SDK needed) ──
async function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return false;
  }

  const parts = signatureHeader.split(",");
  const sigParts: Record<string, string> = {};
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k && v) sigParts[k.trim()] = v.trim();
  }

  const timestamp = sigParts["t"];
  const v1Signature = sigParts["v1"];

  if (!timestamp || !v1Signature) {
    console.error("Malformed stripe-signature header");
    return false;
  }

  // Tolerance: 5 minutes
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Date.now() / 1000 - ts > 300) {
    console.error("Stripe signature timestamp too old or invalid");
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const payloadData = encoder.encode(signedPayload);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, payloadData);
  const expectedSig = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (expectedSig.length !== v1Signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    diff |= expectedSig.charCodeAt(i) ^ v1Signature.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const signatureHeader = req.headers.get("stripe-signature") ?? "";
  if (!signatureHeader) {
    return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Read raw body — must be text for signature verification
  const rawBody = await req.text();

  const isValid = await verifyStripeSignature(rawBody, signatureHeader, STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Only handle completed checkout sessions
  if (event.type !== "checkout.session.completed") {
    // Acknowledge unhandled events gracefully
    return new Response(JSON.stringify({ received: true, type: event.type }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const session = event.data?.object;
  if (!session) {
    return new Response(JSON.stringify({ error: "Missing session object" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Ignore non-payment or unpaid sessions
  if (session.mode !== "payment" || session.payment_status !== "paid") {
    return new Response(JSON.stringify({ received: true, status: "unpaid" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const customerEmail = session.customer_details?.email?.toLowerCase();
  if (!customerEmail) {
    console.error("No customer email in checkout session:", session.id);
    return new Response(JSON.stringify({ error: "No email in session" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SB_SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // ── Idempotency: skip if already processed ──
    const { data: existing } = await adminClient
      .from("customers")
      .select("id, course_access, stripe_customer_id")
      .eq("email", customerEmail)
      .maybeSingle();

    if (existing?.course_access && existing?.stripe_customer_id) {
      console.log(`[stripe-webhook] Already processed: ${customerEmail}`);
      return new Response(JSON.stringify({ received: true, alreadyProcessed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Grant course access ──
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
      console.error("[stripe-webhook] Customer upsert error:", upsertError);
      // Return 200 to prevent Stripe retries for permanent failures,
      // but log for investigation.
      return new Response(JSON.stringify({ received: true, upsertFailed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[stripe-webhook] Access granted for: ${customerEmail}`);

    // ── Create auth user if needed ──
    try {
      await adminClient.auth.admin.createUser({
        email: customerEmail,
        email_confirm: true,
      });
    } catch (_e) {
      // User may already exist — that's fine
    }

    // ── Send emails via Resend ──
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@mail.sheaslegacyscalping.com";
    const defaultOrigin = getAppOrigin(req);

    if (resendApiKey) {
      const lineItems = session.line_items?.data ?? [];
      const productNames = lineItems
        .map((li: StripeLineItem) => li.description || "SLS Vault Course")
        .join(", ");
      const amountPaid = ((session.amount_total ?? 0) / 100).toFixed(2);

      // Admin emails
      const adminEmailsEnv = Deno.env.get("RESEND_ADMIN_EMAIL") ?? "";
      const { data: adminUsers } = await adminClient
        .from("admin_users")
        .select("email");
      const adminEmails = [
        ...new Set([
          ...(adminUsers ?? []).map((entry) => entry.email),
          ...adminEmailsEnv.split(",").map((e: string) => e.trim()).filter(Boolean),
        ]),
      ];

      const adminHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #1a1a1a; font-size: 24px;">New Course Sale (Webhook) 💰</h1>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px 0; color: #888;">Customer</td><td style="padding: 8px 0; font-weight: 600;">${customerEmail}</td></tr>
            <tr><td style="padding: 8px 0; color: #888;">Amount</td><td style="padding: 8px 0; font-weight: 600;">$${amountPaid}</td></tr>
            <tr><td style="padding: 8px 0; color: #888;">Product</td><td style="padding: 8px 0;">${productNames}</td></tr>
            <tr><td style="padding: 8px 0; color: #888;">Stripe Session</td><td style="padding: 8px 0; font-size: 12px;">${session.id}</td></tr>
            <tr><td style="padding: 8px 0; color: #888;">Access</td><td style="padding: 8px 0; color: green; font-weight: 600;">✅ Auto-granted</td></tr>
          </table>
        </div>
      `;

      for (const adminEmail of adminEmails) {
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
              subject: `💰 New Sale (Webhook): ${customerEmail} — $${amountPaid}`,
              html: adminHtml,
            }),
          });
        } catch (emailErr) {
          console.error(`[stripe-webhook] Admin email error for ${adminEmail}:`, emailErr);
        }
      }

      // Buyer confirmation email with magic link
      let magicLinkUrl = `${defaultOrigin}/login`;
      try {
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: "magiclink",
          email: customerEmail,
          options: { redirectTo: `${defaultOrigin}/portal` },
        });
        if (!linkError && linkData?.properties?.action_link) {
          magicLinkUrl = linkData.properties.action_link;
        }
      } catch (linkErr) {
        console.error("[stripe-webhook] Magic link generation error:", linkErr);
      }

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
                <p style="color: #888; font-size: 14px;">This link will sign you in automatically. If it expires, visit <a href="${defaultOrigin}/login" style="color: #c9a84c;">${defaultOrigin}/login</a> and request a new magic link using ${customerEmail}.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
                <p style="color: #aaa; font-size: 12px;">SLS Vault — Shea's Legacy Scalping</p>
              </div>
            `,
          }),
        });
      } catch (buyerEmailErr) {
        console.error("[stripe-webhook] Buyer email error:", buyerEmailErr);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[stripe-webhook] Unhandled error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
