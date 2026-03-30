import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const priceId = PRICES[priceType] ?? PRICES.early_bird;

    // Determine the base URL for redirects
    const origin = req.headers.get("origin") ?? "https://slscourse.lovable.app";

    // Create Stripe Checkout Session
    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("line_items[0][price]", priceId);
    params.append("line_items[0][quantity]", "1");
    params.append("success_url", `${origin}/success?session_id={CHECKOUT_SESSION_ID}`);
    params.append("cancel_url", `${origin}/`);
    params.append("payment_method_types[0]", "card");

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
      JSON.stringify({ url: checkoutSession.url }),
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
