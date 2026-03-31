import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeEmail } from "../_shared/admin.ts";
import { claimCustomerForAuthUser } from "../_shared/customer.ts";
import { getAppOrigin } from "../_shared/origin.ts";

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type FulfillmentStatus = "processing" | "fulfilled" | "failed";

interface StripeCheckoutSession {
  id?: string;
  mode?: string;
  payment_status?: string;
  customer?: string | null;
  customer_email?: string | null;
  amount_total?: number | null;
  payment_intent?: string | { id?: string | null } | null;
  customer_details?: {
    email?: string | null;
  } | null;
  metadata?: Record<string, string | undefined> | null;
}

interface StripeEvent {
  id?: string;
  type?: string;
  data?: {
    object?: StripeCheckoutSession;
  } | null;
}

interface FulfillmentRecord {
  status: FulfillmentStatus;
  access_granted_at: string | null;
  welcome_email_sent_at: string | null;
  magic_link_generated_at: string | null;
  auth_user_id: string | null;
  customer_id: string | null;
}

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

  const timestamp = sigParts.t;
  const v1Signature = sigParts.v1;

  if (!timestamp || !v1Signature) {
    console.error("Malformed stripe-signature header");
    return false;
  }

  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts) || Date.now() / 1000 - ts > 300) {
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
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  if (expectedSig.length !== v1Signature.length) return false;

  let diff = 0;
  for (let index = 0; index < expectedSig.length; index++) {
    diff |= expectedSig.charCodeAt(index) ^ v1Signature.charCodeAt(index);
  }

  return diff === 0;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getPaymentIntentId(session: StripeCheckoutSession) {
  if (typeof session.payment_intent === "string") return session.payment_intent;
  return session.payment_intent?.id ?? null;
}

function getProductLabel(session: StripeCheckoutSession) {
  const priceType = session.metadata?.price_type;
  if (priceType === "regular") return "SLS Vault Course";
  if (priceType === "early_bird") return "SLS Vault Course (Early Bird)";
  return "SLS Vault Course";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const signatureHeader = req.headers.get("stripe-signature") ?? "";
  if (!signatureHeader) {
    return jsonResponse({ error: "Missing stripe-signature header" }, 400);
  }

  const rawBody = await req.text();
  const isValid = await verifyStripeSignature(rawBody, signatureHeader, STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    return jsonResponse({ error: "Invalid signature" }, 400);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (event.type !== "checkout.session.completed") {
    return jsonResponse({ received: true, type: event.type });
  }

  const session = event.data?.object;
  if (!session?.id) {
    return jsonResponse({ error: "Missing session object" }, 400);
  }

  if (session.mode !== "payment" || session.payment_status !== "paid") {
    return jsonResponse({ received: true, status: "unpaid" });
  }

  const customerEmail = normalizeEmail(
    session.customer_details?.email ?? session.customer_email
  );
  if (!customerEmail) {
    console.error("[stripe-webhook] No customer email in checkout session:", session.id);
    return jsonResponse({ error: "No email in session" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey =
    Deno.env.get("SB_SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[stripe-webhook] Missing Supabase configuration");
    return jsonResponse({ error: "Webhook is not configured." }, 500);
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const defaultOrigin = getAppOrigin(req);
  const paymentIntentId = getPaymentIntentId(session);
  const amountPaid = ((session.amount_total ?? 0) / 100).toFixed(2);
  const productLabel = getProductLabel(session);
  const sessionId = session.id;

  const persistFulfillment = async (
    status: FulfillmentStatus,
    overrides: Record<string, unknown> = {}
  ) =>
    adminClient.from("stripe_checkout_fulfillments").upsert(
      {
        stripe_session_id: sessionId,
        stripe_event_id: event.id ?? null,
        payment_intent_id: paymentIntentId,
        stripe_customer_id: session.customer ?? null,
        customer_email: customerEmail,
        status,
        updated_at: new Date().toISOString(),
        ...overrides,
      },
      { onConflict: "stripe_session_id" }
    );

  try {
    const { data: existingFulfillment, error: existingError } = await adminClient
      .from("stripe_checkout_fulfillments")
      .select(
        "status, access_granted_at, welcome_email_sent_at, magic_link_generated_at, auth_user_id, customer_id"
      )
      .eq("stripe_session_id", sessionId)
      .maybeSingle<FulfillmentRecord>();

    if (existingError) {
      console.error("[stripe-webhook] Failed to load fulfillment state:", existingError);
      return jsonResponse({ error: "Failed to load fulfillment state" }, 500);
    }

    if (existingFulfillment?.status === "fulfilled" && existingFulfillment.access_granted_at) {
      return jsonResponse({ received: true, alreadyProcessed: true });
    }

    const { error: processingError } = await persistFulfillment("processing", {
      failure_reason: null,
    });

    if (processingError) {
      console.error("[stripe-webhook] Failed to persist processing state:", processingError);
      return jsonResponse({ error: "Failed to persist fulfillment state" }, 500);
    }

    const accessGrantedAt = new Date().toISOString();

    const { data: customer, error: customerError } = await adminClient
      .from("customers")
      .upsert(
        {
          email: customerEmail,
          stripe_customer_id: session.customer ?? null,
          course_access: true,
          purchased_at: accessGrantedAt,
        },
        { onConflict: "email" }
      )
      .select("id, auth_user_id")
      .single();

    if (customerError || !customer) {
      console.error("[stripe-webhook] Failed to grant course access:", customerError);
      await persistFulfillment("failed", {
        failure_reason: "Failed to grant course access.",
      });
      return jsonResponse({ error: "Failed to grant access" }, 500);
    }

    let customerId = customer.id;
    let authUserId = customer.auth_user_id ?? existingFulfillment?.auth_user_id ?? null;
    let magicLinkGeneratedAt = existingFulfillment?.magic_link_generated_at ?? null;
    let welcomeEmailSentAt = existingFulfillment?.welcome_email_sent_at ?? null;
    let magicLinkUrl = `${defaultOrigin}/login`;

    const { error: accessPersistError } = await persistFulfillment("processing", {
      customer_id: customerId,
      auth_user_id: authUserId,
      access_granted_at: accessGrantedAt,
      failure_reason: null,
    });

    if (accessPersistError) {
      console.error("[stripe-webhook] Failed to persist granted access state:", accessPersistError);
    }

    if (!authUserId) {
      try {
        const { data: createdUser, error: createUserError } =
          await adminClient.auth.admin.createUser({
            email: customerEmail,
            email_confirm: true,
          });

        if (createUserError) {
          console.error("[stripe-webhook] Auth user creation error:", createUserError);
        } else {
          authUserId = createdUser.user?.id ?? null;
        }
      } catch (createUserErr) {
        console.error("[stripe-webhook] Auth user creation failed:", createUserErr);
      }
    }

    if (authUserId) {
      const linkedCustomer = await claimCustomerForAuthUser(adminClient, authUserId, customerEmail);
      if (linkedCustomer) {
        customerId = linkedCustomer.id;
        authUserId = linkedCustomer.auth_user_id ?? authUserId;
      }
    }

    try {
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: customerEmail,
        options: { redirectTo: `${defaultOrigin}/portal` },
      });

      if (linkError) {
        console.error("[stripe-webhook] Magic link generation error:", linkError);
      } else if (linkData?.properties?.action_link) {
        magicLinkUrl = linkData.properties.action_link;
        magicLinkGeneratedAt = new Date().toISOString();
      }
    } catch (linkErr) {
      console.error("[stripe-webhook] Magic link generation failed:", linkErr);
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom =
      Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@mail.sheaslegacyscalping.com";

    if (resendApiKey) {
      const adminEmailsEnv = Deno.env.get("RESEND_ADMIN_EMAIL") ?? "";
      const { data: adminUsers } = await adminClient.from("admin_users").select("email");
      const adminEmails = [
        ...new Set([
          ...(adminUsers ?? []).map((entry) => entry.email),
          ...adminEmailsEnv
            .split(",")
            .map((email) => email.trim())
            .filter(Boolean),
        ]),
      ];

      const adminHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #1a1a1a; font-size: 24px;">New Course Sale 💰</h1>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px 0; color: #888;">Customer</td><td style="padding: 8px 0; font-weight: 600;">${customerEmail}</td></tr>
            <tr><td style="padding: 8px 0; color: #888;">Amount</td><td style="padding: 8px 0; font-weight: 600;">$${amountPaid}</td></tr>
            <tr><td style="padding: 8px 0; color: #888;">Product</td><td style="padding: 8px 0;">${productLabel}</td></tr>
            <tr><td style="padding: 8px 0; color: #888;">Stripe Session</td><td style="padding: 8px 0; font-size: 12px;">${sessionId}</td></tr>
            <tr><td style="padding: 8px 0; color: #888;">Access</td><td style="padding: 8px 0; color: green; font-weight: 600;">Active</td></tr>
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
              subject: `New Sale: ${customerEmail} - $${amountPaid}`,
              html: adminHtml,
            }),
          });
        } catch (adminEmailErr) {
          console.error(`[stripe-webhook] Admin email error for ${adminEmail}:`, adminEmailErr);
        }
      }

      const welcomeHtml = magicLinkGeneratedAt
        ? `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px;">Welcome to SLS Vault</h1>
            <p style="color: #444; line-height: 1.6;">Your purchase of <strong>${productLabel}</strong> ($${amountPaid}) was successful.</p>
            <p style="color: #444; line-height: 1.6;">Your course access is active. Use the button below to sign in instantly.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${magicLinkUrl}" style="background: #c9a84c; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Access Your Course</a>
            </div>
            <p style="color: #888; font-size: 14px;">If the link expires, visit <a href="${defaultOrigin}/login" style="color: #c9a84c;">${defaultOrigin}/login</a> and request a new login email with ${customerEmail}.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
            <p style="color: #aaa; font-size: 12px;">SLS Vault — Shea's Legacy Scalping</p>
          </div>
        `
        : `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px;">Welcome to SLS Vault</h1>
            <p style="color: #444; line-height: 1.6;">Your purchase of <strong>${productLabel}</strong> ($${amountPaid}) was successful.</p>
            <p style="color: #444; line-height: 1.6;">Your course access is active. If the instant sign-in link is unavailable, visit <a href="${defaultOrigin}/login" style="color: #c9a84c;">${defaultOrigin}/login</a> and request a fresh login email using ${customerEmail}.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${defaultOrigin}/login" style="background: #c9a84c; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Open Login Page</a>
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
            <p style="color: #aaa; font-size: 12px;">SLS Vault — Shea's Legacy Scalping</p>
          </div>
        `;

      try {
        const welcomeResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: resendFrom,
            to: customerEmail,
            subject: "Welcome to SLS Vault - Your Course Access Is Ready",
            html: welcomeHtml,
          }),
        });

        if (!welcomeResponse.ok) {
          const responseText = await welcomeResponse.text();
          console.error(
            "[stripe-webhook] Buyer email error:",
            welcomeResponse.status,
            responseText
          );
        } else {
          welcomeEmailSentAt = new Date().toISOString();
        }
      } catch (buyerEmailErr) {
        console.error("[stripe-webhook] Buyer email request failed:", buyerEmailErr);
      }
    } else {
      console.warn("[stripe-webhook] RESEND_API_KEY not configured; skipping webhook emails.");
    }

    const { error: fulfilledError } = await persistFulfillment("fulfilled", {
      customer_id: customerId,
      auth_user_id: authUserId,
      access_granted_at: accessGrantedAt,
      magic_link_generated_at: magicLinkGeneratedAt,
      welcome_email_sent_at: welcomeEmailSentAt,
      failure_reason: null,
    });

    if (fulfilledError) {
      console.error("[stripe-webhook] Failed to persist fulfilled state:", fulfilledError);
    }

    return jsonResponse({
      received: true,
      fulfilled: true,
      emailSent: Boolean(welcomeEmailSentAt),
    });
  } catch (err) {
    console.error("[stripe-webhook] Unhandled error:", err);
    await persistFulfillment("failed", {
      failure_reason: "Unexpected webhook error.",
    });
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
