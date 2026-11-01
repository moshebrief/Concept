# Task Message

Chat with anyone, and turn any message into a task.

- WhatsApp-style chats, groups, voice notes, replies, reactions, forwarding, @mentions
- End-to-end encrypted messages (keys stay on each device)
- Swipe left on a message to make a task · tasks with stages, subtasks, photos, voice memos
- Status updates (text, photo, video up to 5 minutes) shared between mutual contacts
- Calls (open in a call tab for now) and a phone keypad
- Sign in with your phone number (texted code)

## Files

| File | What it is |
|---|---|
| `index.html` | The page that loads the app |
| `styles.css` | All the design |
| `app.js` | All the app logic |
| `config.js` | **Your Supabase URL and publishable key go here** |
| `supabase.js`, `591.supabase.js` | The Supabase library (v2.45.4), included so the app works offline-first |
| `schema.sql` | Database setup — paste into Supabase → SQL Editor and run |
| `manifest.json`, `icon.svg`, `icon-192.png`, `icon-512.png` | App name and icons for "Add to Home Screen" |

No build step: the app is plain HTML, CSS and JavaScript.

## Setup (short version)

1. **Supabase → SQL Editor → New query**: paste all of `schema.sql`, tap **Run**.
2. **Supabase → Authentication → Sign In / Providers → Phone**: turn on, connect an SMS provider
   (or add test numbers while developing).
3. **Supabase → Project Settings → API Keys**: copy the Project URL and the Publishable key into `config.js`.
4. **Render → New → Static Site**: pick this repo, leave Build Command empty, Publish Directory `.`.
5. Open the Render link on your phone, sign in with your number.

If `config.js` still has the placeholders, the app opens in preview mode with example data.

## Security notes

- Never put the Supabase **Secret / service_role** key in this repo.
- Messages and chat voice notes are encrypted on the device before upload; the server only stores ciphertext.
- Who can see what is enforced by database rules in `schema.sql` (chat members only, task visibility, statuses only between mutual contacts).
- Photos and videos go to a public storage bucket under random file names.
