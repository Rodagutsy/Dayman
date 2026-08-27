/* Dayman — Edge Function: weekly leaderboard.
   POST /functions/v1/weekly-leaderboard

   Actions:
     { action: "sync", userId }             — compute & upsert caller's weekly XP, return leaderboard
     { action: "leaderboard", userId, topN } — return top N + caller's rank
*/

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// ---------- XP formula (mirrors js/gamification.js) ----------

function isDone(t: any): boolean {
  return typeof t.done === "boolean" ? t.done : (t.actual || 0) > 0;
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoOf(d: Date): string {
  return d.getUTCFullYear() + "-" +
    String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
    String(d.getUTCDate()).padStart(2, "0");
}

function currentWeekStart(): string {
  const now = new Date();
  const dow = (now.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  now.setUTCDate(now.getUTCDate() - dow);
  return isoOf(now);
}

function streakOf(history: Record<string, any>, endIso: string): number {
  const dayActive = (rec: any) => {
    const tasks = rec?.tasks || [];
    return tasks.filter(isDone).length > 0;
  };
  let cur = endIso;
  if (!history[cur] || !dayActive(history[cur])) {
    cur = shiftIso(cur, -1);
    if (!history[cur] || !dayActive(history[cur])) return 0;
  }
  let n = 0;
  while (history[cur] && dayActive(history[cur])) {
    n++;
    cur = shiftIso(cur, -1);
  }
  return n;
}

function xpForDay(rec: any, streakDays: number): number {
  const tasks = rec?.tasks || [];
  const completed = tasks.filter(isDone).length;
  const minutes = Math.max(0, Math.round(rec.focus || 0));
  const taskXp = completed * 10;
  const minXp = minutes * 1;
  const bonus = tasks.length > 0 && completed === tasks.length ? 25 : 0;
  const streakXp = completed > 0 && streakDays > 0 ? Math.min(50, streakDays * 5) : 0;
  return taskXp + minXp + bonus + streakXp;
}

function computeWeeklyStats(history: Record<string, any>, weekStart: string) {
  let xp = 0, tasksCompleted = 0, focusMinutes = 0, activeDays = 0;
  for (let i = 0; i < 7; i++) {
    const day = shiftIso(weekStart, i);
    const rec = history[day];
    if (!rec) continue;
    const dayTasks = (rec.tasks || []).filter(isDone).length;
    tasksCompleted += dayTasks;
    focusMinutes += Math.max(0, Math.round(rec.focus || 0));
    if (dayTasks > 0) activeDays++;
    xp += xpForDay(rec, streakOf(history, day));
  }
  return { xp, tasks_completed: tasksCompleted, focus_minutes: focusMinutes, active_days: activeDays };
}

// ---------- Handler ----------

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  try {
    const { action, userId, topN = 10 } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify JWT matches the claimed userId
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user || user.id !== userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders(origin),
      });
    }

    const weekStart = currentWeekStart();

    // ---- SYNC: compute weekly XP and upsert ----
    if (action === "sync") {
      const { data: ud } = await supabase
        .from("user_data")
        .select("data")
        .eq("user_id", userId)
        .single();

      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .single();

      const history = ud?.data?.history || {};
      const stats = computeWeeklyStats(history, weekStart);

      await supabase.from("weekly_scores").upsert({
        user_id: userId,
        week_start: weekStart,
        xp: stats.xp,
        tasks_completed: stats.tasks_completed,
        focus_minutes: stats.focus_minutes,
        active_days: stats.active_days,
        display_name: prof?.display_name || "",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,week_start" });
    }

    // ---- LEADERBOARD: top N + caller's rank ----
    const { data: topRows } = await supabase
      .from("weekly_scores")
      .select("user_id, xp, display_name, tasks_completed, focus_minutes, active_days")
      .eq("week_start", weekStart)
      .order("xp", { ascending: false })
      .limit(topN);

    const { data: me } = await supabase
      .from("weekly_scores")
      .select("user_id, xp, display_name, tasks_completed, focus_minutes, active_days")
      .eq("week_start", weekStart)
      .eq("user_id", userId)
      .single();

    let myRank = 0;
    let totalPlayers = 0;
    if (me) {
      const { count: higher } = await supabase
        .from("weekly_scores")
        .select("user_id", { count: "exact", head: true })
        .eq("week_start", weekStart)
        .gt("xp", me.xp);

      const { count: total } = await supabase
        .from("weekly_scores")
        .select("user_id", { count: "exact", head: true })
        .eq("week_start", weekStart);

      myRank = (higher || 0) + 1;
      totalPlayers = total || 0;
    }

    const topList = (topRows || []).filter((r) => r.user_id !== userId);

    return new Response(JSON.stringify({
      week_start: weekStart,
      top: topList,
      me: me || null,
      my_rank: myRank,
      total_players: totalPlayers,
    }), {
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
});
