// Concept — "push" Edge Function
// Sends a notification to everyone in a chat (except the sender) when a new message arrives.
// Called by the database trigger in supabase-update.sql.
// Needs the secret FCM_SERVICE_ACCOUNT (the Firebase service account JSON).
// Deploy with "Verify JWT" turned OFF.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type Doc = { path: string; data: Record<string, any>; updated_at?: string };

// ---------- Google sign-in for Firebase Cloud Messaging ----------
const SA = (() => { try { return JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "{}"); } catch { return {}; } })();
let cached = { token: "", exp: 0 };

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlText = (s: string) => b64url(new TextEncoder().encode(s));

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function googleToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached.token && cached.exp - 60 > now) return cached.token;
  const head = b64urlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64urlText(JSON.stringify({
    iss: SA.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToDer(SA.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`)));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${claim}.${b64url(sig)}`,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("Google sign-in failed: " + JSON.stringify(json));
  cached = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return cached.token;
}

const TONES = ["note", "chime", "pop", "bell", "glass", "pulse", "bamboo", "ripple", "bright", "none"];
const okTone = (t: unknown, d: string) => (typeof t === "string" && TONES.includes(t) ? t : d);

async function sendFcm(token: string, title: string, body: string, cid: string, tone: string): Promise<"ok" | "gone" | "error"> {
  const silent = tone === "none";
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${SA.project_id}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${await googleToken()}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data: { cid },
        android: {
          priority: "HIGH",
          notification: {
            channel_id: `msg_${tone}`, tag: cid, icon: "ic_stat_notify", color: "#007AFF",
            ...(silent ? {} : { sound: `tone_${tone}` }),
          },
        },
        apns: {
          headers: { "apns-priority": "10" },
          payload: { aps: { ...(silent ? {} : { sound: `tone_${tone}.wav` }), "thread-id": cid } },
        },
      },
    }),
  });
  if (res.ok) return "ok";
  const text = await res.text();
  if (res.status === 404 || /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT/.test(text)) return "gone";
  console.error("FCM error", res.status, text);
  return "error";
}

// ---------- what the notification says ----------
function label(msg: Record<string, any>, chan: Record<string, any>): string {
  const last = chan.last && chan.last.at === msg.at ? chan.last : {};
  if (msg.kind === "voice") return "🎤 Voice note";
  if (msg.kind === "media") return last.sub === "video" ? "🎥 Video" : last.sub === "file" ? "📄 Document" : (last.n > 1 ? `📷 ${last.n} photos` : "📷 Photo");
  if (msg.kind === "contact") return "👤 Contact";
  if (msg.kind === "location") return "📍 Location";
  if (msg.text && !msg.enc) return String(msg.text).slice(0, 140); // only when the message wasn't encrypted
  return "New message";
}

Deno.serve(async (req) => {
  try {
    if (!SA.private_key) return new Response("FCM_SERVICE_ACCOUNT secret is missing", { status: 500 });
    const { path } = await req.json().catch(() => ({}));
    const m = /^channels\/([^/]+)\/messages\/([^/]+)$/.exec(path ?? "");
    if (!m) return new Response("ignored");
    const cid = m[1];

    // Re-read everything from the database — never trust the request body.
    const { data: row } = await sb.from("docs").select("path,data,updated_at").eq("path", path).maybeSingle<Doc>();
    if (!row) return new Response("missing");
    const msg = row.data;
    if (Date.now() - Date.parse(row.updated_at ?? "") > 120_000) return new Response("too old");

    const { data: chRow } = await sb.from("docs").select("data").eq("path", `channels/${cid}`).maybeSingle<Doc>();
    if (!chRow) return new Response("no chat");
    const chan = chRow.data;
    const sender: string = msg.by;
    const recips: string[] = (chan.members ?? []).filter((u: string) => u && u !== sender);
    if (!recips.length) return new Response("nobody");

    const paths = [`team/${sender}`, ...recips.map((u) => `data/users/${u}/prefs`), ...recips.map((u) => `devices/${u}`)];
    if (chan.kind === "task" && chan.taskId) paths.push(`tasks/${chan.taskId}`);
    const { data: rows } = await sb.from("docs").select("path,data").in("path", paths);
    const byPath = new Map((rows ?? []).map((r: Doc) => [r.path, r.data]));
    const senderName = byPath.get(`team/${sender}`)?.name || "Someone";
    const task = chan.kind === "task" ? byPath.get(`tasks/${chan.taskId}`) : null;

    const what = label(msg, chan);
    const isGroup = chan.kind !== "dm";
    const chatTitle = chan.kind === "task" ? (task ? `CN-${task.num} · ${task.title}` : chan.name || "Task") : chan.name || "Group";

    let sent = 0;
    for (const u of recips) {
      const prefs = byPath.get(`data/users/${u}/prefs`) ?? {};
      if ((prefs.blocked ?? []).includes(sender)) continue;           // they blocked the sender
      const mute = prefs.mute ?? {};
      const mutedNow = (id?: string) => {
        if (!id || !(id in mute)) return false;
        const until = mute[id];
        return until === 0 || (typeof until === "number" && until > Date.now());
      };
      if (mutedNow(cid) || (chan.kind === "task" && mutedNow(chan.parent))) continue; // they muted this chat (or its group)
      if ((prefs.muted ?? []).includes(cid)) continue;
      const tones = prefs.tones ?? {};
      const fallback = chan.kind === "dm" ? okTone(prefs.tone, "note") : okTone(prefs.groupTone, "chime");
      const tone = okTone(tones[cid] ?? (chan.parent ? tones[chan.parent] : undefined), fallback);
      const dev = byPath.get(`devices/${u}`);
      if (!dev || !dev.tokens) continue;
      const tokens = Object.entries<any>(dev.tokens);
      if (!tokens.length) continue;
      const mentioned = (msg.mentions ?? []).includes(u);
      const title = isGroup ? chatTitle : senderName;
      const body = isGroup ? `${senderName}${mentioned ? " mentioned you" : ""}: ${what}` : what;
      let changed = false;
      for (const [k, v] of tokens) {
        const r = await sendFcm(v.t, title, body, cid, tone);
        if (r === "ok") sent++;
        if (r === "gone") { delete dev.tokens[k]; changed = true; }
      }
      if (changed) await sb.from("docs").update({ data: dev, updated_at: new Date().toISOString() }).eq("path", `devices/${u}`);
    }
    return new Response(JSON.stringify({ sent }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
});
