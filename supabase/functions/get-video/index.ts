import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADMIN_EMAILS = ["sls25trading@gmail.com", "emaildonovin@gmail.com", "donovinsims@gmail.com"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { videoId, fingerprint } = await req.json();
    if (!videoId) {
      return new Response(JSON.stringify({ error: "Missing videoId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const email = user.email?.toLowerCase() ?? "";
    const isAdmin = ADMIN_EMAILS.includes(email);

    if (!isAdmin) {
      const { data: customer } = await adminClient
        .from("customers")
        .select("id, course_access")
        .eq("email", email)
        .maybeSingle();

      if (!customer?.course_access) {
        return new Response(JSON.stringify({ error: "No course access" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let customerId: string;
    if (isAdmin) {
      const { data: cust } = await adminClient
        .from("customers")
        .upsert({ email, course_access: true }, { onConflict: "email" })
        .select("id")
        .single();
      customerId = cust!.id;
    } else {
      const { data: cust } = await adminClient
        .from("customers")
        .select("id")
        .eq("email", email)
        .single();
      customerId = cust!.id;
    }

    // Fetch video including transcript and summary
    const { data: video, error: videoError } = await adminClient
      .from("videos")
      .select("id, title, description, youtube_id, transcript, summary")
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
      return new Response(JSON.stringify({ error: "Video not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    await adminClient
      .from("video_sessions")
      .update({ used: true })
      .eq("customer_id", customerId)
      .eq("video_id", videoId)
      .eq("used", false);

    const sessionToken = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 90 * 60 * 1000);

    await adminClient.from("video_sessions").insert({
      customer_id: customerId,
      video_id: videoId,
      session_token: sessionToken,
      ip_address: ip,
      device_fingerprint: fingerprint ?? null,
      expires_at: expiresAt.toISOString(),
    });

    await adminClient.from("activity_log").insert({
      customer_id: customerId,
      video_id: videoId,
      ip_address: ip,
      event_type: "watch",
    });

    if (fingerprint) {
      const { data: activeSessions } = await adminClient
        .from("video_sessions")
        .select("device_fingerprint")
        .eq("customer_id", customerId)
        .eq("used", false)
        .gt("expires_at", now.toISOString());

      const distinctFingerprints = new Set(
        (activeSessions ?? []).map((s) => s.device_fingerprint).filter(Boolean)
      );

      if (distinctFingerprints.size >= 2) {
        await adminClient.from("activity_log").insert({
          customer_id: customerId,
          video_id: videoId,
          ip_address: ip,
          event_type: "suspicious_sharing",
        });
      }
    }

    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const { data: recentLogs } = await adminClient
      .from("activity_log")
      .select("ip_address")
      .eq("customer_id", customerId)
      .eq("event_type", "watch")
      .gte("watched_at", twentyFourHoursAgo.toISOString());

    const distinctIPs = new Set((recentLogs ?? []).map((l) => l.ip_address).filter(Boolean));
    if (distinctIPs.size >= 3) {
      await adminClient.from("activity_log").insert({
        customer_id: customerId,
        video_id: videoId,
        ip_address: ip,
        event_type: "ip_flag",
      });
    }

    const embedUrl = `https://www.youtube.com/embed/${video.youtube_id}?rel=0&modestbranding=1`;

    return new Response(
      JSON.stringify({
        embedUrl,
        title: video.title,
        description: video.description,
        transcript: video.transcript,
        summary: video.summary,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
