import { getAppOrigin } from "../_shared/origin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Price IDs from Stripe
const PRICES: Record<string, string> = {
  early_bird: "price_1TEBYp4Fv76iWH7ToEEsVh21",
  regular: "price_1TEBZY4Fv76iWH7TxiNgWHAl",
};

const REGULAR_PRICE_START = new Date("2026-04-01T00:00:00-05:00");

function resolvePriceType(priceType: unknown) {
  if (Date.now() >= REGULAR_PRICE_START.getTime()) {
    return "regular";
  }

  return priceType === "regular" ? "regular" : "early_bird";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe is not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { priceType } = await req.json();
    const resolvedPriceType = resolvePriceType(priceType);
    const priceId = PRICES[resolvedPriceType];

    // Determine the base URL for redirects
    const origin = getAppOrigin(req);

    // Create Stripe Checkout Session
    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("customer_creation", "always");
    params.append("line_items[0][price]", priceId);
    params.append("line_items[0][quantity]", "1");
    params.append("metadata[product]", "course");
    params.append("metadata[price_type]", resolvedPriceType);
    params.append("success_url", `${origin}/success?session_id={CHECKOUT_SESSION_ID}`);
    params.append("cancel_url", `${origin}/`);

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!stripeRes.ok) {
      const errBody = await stripeRes.text();
      console.error("Stripe checkout error:", stripeRes.status, errBody);
      return new Response(
        JSON.stringify({ error: "Failed to create checkout session." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const checkoutSession = await stripeRes.json();

    return new Response(
      JSON.stringify({ url: checkoutSession.url, priceType: resolvedPriceType }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-checkout error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
