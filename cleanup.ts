// Task Message — "cleanup" Edge Function (runs every 15 minutes from the database scheduler)
// WhatsApp-style storage: a message is removed from the server once every member of the chat has
// saved it on their own device (s_<user> marker), or after 30 days. Voice notes go with their message;
// uploaded photo/video files are removed after 30 days. Deploy with "Verify JWT" OFF.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const DAY = 86_400_000, KEEP_MIN = 10 * 60_000, MAX_AGE = 30 * DAY;

async function allRows(col: string) {
  const out: { path: string; data: any; updated_at: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("docs").select("path,data,updated_at").eq("col", col).range(from, from + 999);
    if (error || !data) break; out.push(...data); if (data.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  try {
    const { data: cfg } = await sb.from("push_settings").select("cron_secret").eq("id", 1).maybeSingle();
    if (!cfg?.cron_secret || req.headers.get("x-cron-secret") !== cfg.cron_secret) return new Response("forbidden", { status: 403 });
    const now = Date.now();
    let removed = 0, voices = 0, files = 0;

    for (const ch of await allRows("channels")) {
      const cid = ch.path.split("/")[1];
      const members: string[] = (ch.data.members ?? []).filter(Boolean);
      if (!members.length) continue;
      const savedByAll = Math.min(...members.map((m) => Number(ch.data["s_" + m] ?? 0)));
      const msgs = await allRows(`channels/${cid}/messages`);
      const gone: string[] = [], voiceCols: string[] = [];
      for (const m of msgs) {
        const at = Number(m.data.at ?? 0), touched = Date.parse(m.updated_at);
        if (now - touched < KEEP_MIN) continue;                          // let fresh edits/reactions settle
        if ((at && at <= savedByAll) || now - at > MAX_AGE) {
          gone.push(m.path);
          if (m.data.kind === "voice" && m.data.voice?.id) voiceCols.push(`voice/${m.data.voice.id}/parts`);
        }
      }
      for (let i = 0; i < gone.length; i += 200) { await sb.from("docs").delete().in("path", gone.slice(i, i + 200)); }
      for (let i = 0; i < voiceCols.length; i += 200) { await sb.from("docs").delete().in("col", voiceCols.slice(i, i + 200)); }
      removed += gone.length; voices += voiceCols.length;
    }

    // uploaded media files older than 30 days
    const { data: folders } = await sb.storage.from("media").list("", { limit: 1000 });
    for (const f of folders ?? []) {
      if (f.id) continue; // a file at the top level, not a user folder
      for (let off = 0; ; off += 1000) {
        const { data: items } = await sb.storage.from("media").list(f.name, { limit: 1000, offset: off });
        const old = (items ?? []).filter((x) => x.created_at && now - Date.parse(x.created_at) > MAX_AGE).map((x) => `${f.name}/${x.name}`);
        if (old.length) { await sb.storage.from("media").remove(old); files += old.length; }
        if (!items || items.length < 1000) break;
      }
    }
    return new Response(JSON.stringify({ removed, voices, files }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
});
