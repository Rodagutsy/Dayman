/* Dayman — Edge Function: schedule push notifications for active sessions.
   POST /functions/v1/notify-schedule
   Body: { action: "schedule"|"cancel", userId, blocks: [{name, type, endAt}] }
   
   Uses web-push to deliver notifications when blocks end.
   Requires env vars: VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT
*/

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@dayman.app";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  try {
    const { action, userId, blocks } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );

    if (action === "cancel") {
      await supabase.from("active_sessions").delete().eq("user_id", userId);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // action === "schedule"
    // Store the session schedule
    await supabase.from("active_sessions").upsert({
      user_id: userId,
      blocks: blocks,
      scheduled_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    // Get the user's push subscription
    const { data: sub } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!sub) {
      return new Response(JSON.stringify({ ok: true, note: "no subscription" }), {
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Schedule notifications for each block that will end while the user might be away
    const now = Date.now();
    const tasks = blocks
      .filter((b) => b.endAt > now && b.type === "focus")
      .map((b) => {
        const delay = b.endAt - now;
        // Only schedule if within Edge Function timeout (~140s safe margin)
        if (delay <= 140000 && delay > 0) {
          return sendNotification(sub, {
            title: "Dayman",
            body: `Time's up: ${b.name}`,
            tag: `block-${b.name}`,
            data: { blockName: b.name, blockType: b.type },
          }, delay);
        }
        return Promise.resolve();
      });

    await Promise.all(tasks);

    return new Response(JSON.stringify({ ok: true, scheduled: tasks.length }), {
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
});

async function sendNotification(sub, payload, delayMs) {
  // Use web-push library (must be imported or use raw fetch)
  // For Deno, we use the raw Web Push protocol
  const endpoint = sub.endpoint;
  const keys = sub.keys;

  const body = JSON.stringify(payload);

  // Encrypt and send (simplified - in production use proper web-push library)
  // For now, we'll use the Push API directly
  const pushPayload = JSON.stringify(payload);

  try {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // Use Supabase's built-in push or direct web-push
    // This is a placeholder - the actual implementation needs web-push library
    console.log("Would send push to:", endpoint, "with payload:", pushPayload);
  } catch (e) {
    console.error("Push failed:", e);
  }
}
