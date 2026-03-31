import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface StripeCheckoutSession {
  id?: string;
  payment_status?: string;
  customer?: string | null;
  payment_intent?: string | { id?: string | null } | null;
  customer_details?: {
    email?: string | null;
  } | null;
}

type FulfillmentStatus = "processing" | "fulfilled" | "failed";

interface FulfillmentRow {
  status: FulfillmentStatus;
  customer_email: string;
  failure_reason: string | null;
  access_granted_at: string | null;
  magic_link_generated_at: string | null;
  welcome_email_sent_at: string | null;
}

// Simple in-memory rate limiter
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      console.error("STRIPE_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Payment verification is not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );

    if (!stripeRes.ok) {
      const errBody = await stripeRes.text();
      console.error("Stripe API error:", stripeRes.status, errBody);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid checkout session." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const session = (await stripeRes.json()) as StripeCheckoutSession;
    if (session.payment_status !== "paid") {
      return new Response(
        JSON.stringify({ success: false, error: "Payment not completed." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customerEmail = session.customer_details?.email?.toLowerCase();
    if (!customerEmail) {
      return new Response(
        JSON.stringify({ success: false, error: "No email found in session." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SB_SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: fulfillment, error: fulfillmentError } = await adminClient
      .from("stripe_checkout_fulfillments")
      .select("status, customer_email, failure_reason, access_granted_at, magic_link_generated_at, welcome_email_sent_at")
      .eq("stripe_session_id", sessionId)
      .maybeSingle<FulfillmentRow>();

    if (fulfillmentError) {
      console.error("[verify-purchase] Failed to load fulfillment status:", fulfillmentError);
      return new Response(
        JSON.stringify({ success: false, error: "Could not load purchase status." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!fulfillment) {
      const { data: customer, error: customerError } = await adminClient
        .from("customers")
        .select("course_access")
        .eq("email", customerEmail)
        .maybeSingle();

      if (customerError) {
        console.error("[verify-purchase] Failed to load fallback customer status:", customerError);
      }

      if (customer?.course_access) {
        return new Response(
          JSON.stringify({
            success: true,
            status: "fulfilled",
            email: customerEmail,
            accessGranted: true,
            emailSent: false,
            magicLinkGenerated: false,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: "processing",
          email: customerEmail,
          accessGranted: false,
          emailSent: false,
          magicLinkGenerated: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessGranted = Boolean(fulfillment.access_granted_at);
    const normalizedStatus =
      fulfillment.status === "processing" && accessGranted ? "fulfilled" : fulfillment.status;

    return new Response(
      JSON.stringify({
        success: true,
        status: normalizedStatus,
        email: fulfillment.customer_email,
        accessGranted,
        emailSent: Boolean(fulfillment.welcome_email_sent_at),
        magicLinkGenerated: Boolean(fulfillment.magic_link_generated_at),
        failureReason: fulfillment.failure_reason ?? undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[verify-purchase] Unexpected error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
