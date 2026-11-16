// Task Message — "link" Edge Function: link a computer to your account by scanning a QR code, like WhatsApp.
//  approve (from your phone, signed in): makes a one-time sign-in key for your account, locks it so only the
//           computer that showed the QR code can open it, and leaves it waiting for that computer.
//  poll    (from the computer): picks the locked key up once (it's deleted right away).
//  logout  (from your phone): signs a linked computer out.
// Verify JWT is OFF: approve/logout check the caller's sign-in themselves; poll returns only locked data.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, apikey, x-client-info", "access-control-allow-methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "content-type": "application/json" } });
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const ID = /^[A-Za-z0-9_-]{16,64}$/;
const TTL = 3 * 60_000;

async function caller(req: Request) {
  const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!tok) return null;
  const { data } = await sb.auth.getUser(tok);
  return data?.user ?? null;
}
// lock the sign-in key so only the computer holding the matching private key can read it
async function lockFor(pub: { x: string; y: string }, text: string) {
  const theirs = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: pub.x, y: pub.y, ext: true }, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const mine = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "ECDH", public: theirs }, mine.privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
  const epk = await crypto.subtle.exportKey("jwk", mine.publicKey);
  return { epk: { x: epk.x, y: epk.y }, iv: b64(iv), ct: b64(ct) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const act = body.act;

    if (act === "poll") {
      const id = String(body.id ?? ""); if (!ID.test(id)) return json({ error: "bad id" }, 400);
      const { data: row } = await sb.from("docs").select("data,updated_at").eq("path", `links/${id}`).maybeSingle();
      if (!row) return json({ ready: false });
      await sb.from("docs").delete().eq("path", `links/${id}`);
      if (Date.now() - Date.parse(row.updated_at) > TTL) return json({ ready: false, expired: true });
      return json({ ready: true, ...row.data });
    }

    const user = await caller(req);
    if (!user) return json({ error: "Sign in on your phone first." }, 401);
    const uid = user.id;

    if (act === "approve") {
      const id = String(body.id ?? ""), pub = body.pub ?? {};
      if (!ID.test(id) || typeof pub.x !== "string" || typeof pub.y !== "string") return json({ error: "This QR code isn't from Task Message." }, 400);
      // a hidden address that can never receive mail (".invalid" can't be registered by anyone); it's only
      // used to make the one-time sign-in key, because the sign-in service makes those only for email addresses
      let email = user.email;
      if (!email) {
        email = `${uid}@link.task-message.invalid`;
        const { error } = await sb.auth.admin.updateUserById(uid, { email, email_confirm: true });
        if (error) { console.error("set email", error); return json({ error: "Couldn't link right now. Try again." }, 500); }
      }
      const { data: lk, error: le } = await sb.auth.admin.generateLink({ type: "magiclink", email });
      if (le || !lk?.properties?.hashed_token) { console.error("link", le); return json({ error: "Couldn't link right now. Try again." }, 500); }
      const locked = await lockFor(pub, JSON.stringify({ th: lk.properties.hashed_token, uid }));
      const now = Date.now();
      await sb.from("docs").upsert({ path: `links/${id}`, col: "links", data: { ...locked, at: now }, updated_at: new Date(now).toISOString() });
      // the computer shows up in Linked devices right away
      const name = String(body.name ?? "Computer").slice(0, 60);
      const p = `data/users/${uid}/linked`;
      const { data: cur } = await sb.from("docs").select("data").eq("path", p).maybeSingle();
      const devices = { ...((cur?.data as any)?.devices ?? {}), [id]: { name, at: now, seen: now } };
      await sb.from("docs").upsert({ path: p, col: `data/users/${uid}`, data: { devices }, updated_at: new Date(now).toISOString() });
      return json({ ok: true });
    }

    if (act === "logout") {
      const id = String(body.id ?? ""); if (!ID.test(id)) return json({ error: "bad id" }, 400);
      const p = `data/users/${uid}/linked`;
      const { data: cur } = await sb.from("docs").select("data").eq("path", p).maybeSingle();
      const devices = { ...((cur?.data as any)?.devices ?? {}) };
      const d = devices[id];
      if (d?.sid) await sb.rpc("revoke_session", { p_uid: uid, p_sid: d.sid });
      delete devices[id];
      await sb.from("docs").upsert({ path: p, col: `data/users/${uid}`, data: { devices }, updated_at: new Date().toISOString() });
      return json({ ok: true });
    }
    return json({ error: "unknown" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});
