// Concept — "delete-account" Edge Function
// Permanently deletes the signed-in user's account (required by the App Store and Google Play).
// Deploy with "Verify JWT" turned ON (the default).
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await sb.auth.getUser(jwt);
    if (!user) return reply({ error: "Not signed in" }, 401);
    const uid = user.id;
    const stamp = new Date().toISOString();

    // 1) Leave every chat (delete chats that would be left empty)
    const { data: chans } = await sb.from("docs").select("path,data").eq("col", "channels").contains("data", { members: [uid] });
    for (const c of chans ?? []) {
      const members = (c.data.members ?? []).filter((m: string) => m !== uid);
      if (!members.length) await sb.from("docs").delete().eq("path", c.path);
      else await sb.from("docs").update({ data: { ...c.data, members }, updated_at: stamp }).eq("path", c.path);
    }

    // 2) Leave every team (hand ownership to the next member)
    const { data: teams } = await sb.from("docs").select("path,data").eq("col", "teams").contains("data", { members: [uid] });
    for (const t of teams ?? []) {
      const members = (t.data.members ?? []).filter((m: string) => m !== uid);
      if (!members.length) await sb.from("docs").delete().eq("path", t.path);
      else await sb.from("docs").update({ data: { ...t.data, members, owner: t.data.owner === uid ? members[0] : t.data.owner }, updated_at: stamp }).eq("path", t.path);
    }

    // 3) Delete the person's own records
    await sb.from("docs").delete().in("path", [`team/${uid}`, `keys/${uid}`, `contacts/${uid}`, `devices/${uid}`]);
    await sb.from("docs").delete().like("col", `data/users/${uid}%`);

    // 4) Delete their uploaded files
    for (;;) {
      const { data: files } = await sb.storage.from("media").list(uid, { limit: 100 });
      if (!files || !files.length) break;
      await sb.storage.from("media").remove(files.map((f) => `${uid}/${f.name}`));
      if (files.length < 100) break;
    }

    // 5) Delete the sign-in account itself
    const { error } = await sb.auth.admin.deleteUser(uid);
    if (error) return reply({ error: error.message }, 500);
    return reply({ deleted: true });
  } catch (e) {
    console.error(e);
    return reply({ error: "Something went wrong" }, 500);
  }
});
