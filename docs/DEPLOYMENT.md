# Deployment runbook — Emojigram on Vercel

This is the step-by-step path from a local checkout to a live, shareable
Emojigram URL: GitHub → Vercel (Hobby) → Neon Postgres + Upstash Redis
(Marketplace integrations) + a spend-capped Anthropic API key.

Each step is labeled:

- **[you]** — something only you can do in a browser or account dashboard.
- **[automated]** — a CLI command you (or an agent on your behalf) can run.

Run the steps in order. Steps 3–5 happen inside the Vercel dashboard for the
same project, so it's easiest to keep that browser tab open while you work
through them.

---

### 1. [you] Create the Vercel account

Go to [vercel.com](https://vercel.com) and click **"Continue with GitHub"**.
This uses your existing GitHub identity — there's no separate email signup,
and it's what makes step 3's "Import Git Repository" flow see your repos.

---

### 2. [automated] Push the repo to GitHub

From the repo root:

    gh auth status                # confirms you're logged in
    gh auth login                 # only if the above says you're not

    gh repo create emojigram --public --source . --push

This creates a public GitHub repo named `emojigram` from the current
directory and pushes the current branch. (If you're deploying from a feature
branch, merge to `main` first — Vercel's auto-deploy in step 7 tracks
`main`.)

---

### 3. [you] Import the project into Vercel

In the Vercel dashboard: **Add New… → Project**, then **Import** the
`emojigram` repo from the list (Vercel already sees it via your GitHub
login from step 1).

Framework preset: **Next.js** — Vercel detects this automatically from
`package.json`, no changes needed.

**Do not click Deploy yet.** The build will fail without `DATABASE_URL`,
`REDIS_URL`, and `ANTHROPIC_API_KEY` set, so finish steps 4–5 (adding
integrations and env vars) first, then deploy in step 7.

---

### 4. [you] Add Neon (Postgres) and Upstash (Redis) via the Marketplace

Still inside the imported project, before deploying:

**Neon:** Project → **Storage** (or **Integrations**) → **Marketplace** →
find **Neon** → add it, accepting the defaults (new Neon project, same
region as your Vercel deployment is fine). After it finishes provisioning,
open **Settings → Environment Variables** and confirm `DATABASE_URL` was
injected. Neon typically exposes both a pooled and a direct connection
string — if you see separate variables (e.g. `DATABASE_URL` vs.
`DATABASE_URL_UNPOOLED` / a `-pooler` host in the value), **use the pooled
variant** for `DATABASE_URL` — serverless functions open/close connections
per invocation and the pooled endpoint is built for that.

**Upstash Redis:** same **Marketplace** panel → find **Upstash** → add
Redis, accepting the defaults. After provisioning, go back to **Settings →
Environment Variables** and look for a `rediss://` connection string.

- If it's already named `REDIS_URL`, you're done.
- If the integration injected it under a different name — Upstash's
  Vercel integration commonly uses `KV_URL`, `UPSTASH_REDIS_URL`, or
  similar — **copy that value** and manually add a new environment
  variable named exactly `REDIS_URL` with the same `rediss://…` value.
  The app's code reads `REDIS_URL` specifically; it won't discover
  differently-named variables on its own.

Apply both integrations to at least the **Production** environment (Preview
too, if you want preview deploys to work against the same data).

---

### 5. [you] Create a spend-capped Anthropic API key

Go to the Anthropic console at [platform.claude.com](https://platform.claude.com)
→ **API keys** → **Create key**.

- Name it `emojigram-prod` (keeps it distinguishable from any local/dev
  key you already use).
- Set a **monthly spend limit** on the key or its workspace — about **$5**
  is comfortable headroom for `claude-haiku-4-5` translation traffic on a
  demo app and caps worst-case exposure.

Back in the Vercel project: **Settings → Environment Variables** → add
`ANTHROPIC_API_KEY` with the key value you just created, scoped to
**Production** (add Preview too if you'll test preview deploys).

If this key is ever left unset, the app still works — translations fall
back to the built-in word→emoji dictionary and messages get a 🤖💤 "rough
translation" marker instead of failing.

---

### 6. [automated, one-time] Push schema and seed data to Neon

This runs once, from your local machine, against the live Neon database —
Vercel's build step never touches the schema (see the build script in
`package.json`: `prisma generate && next build`, no `db push`).

Use the **direct/unpooled** Neon connection string for this step, not the
pooled one from step 4 — Prisma's schema engine needs a direct connection
for schema pushes (advisory locks and prepared statements) and can fail
with lock or prepared-statement errors when run through Neon's PgBouncer
pooler. In the Vercel dashboard, find it under **Settings → Environment
Variables**: either the `DATABASE_URL_UNPOOLED` variable the Neon
integration adds, or open the Neon project's connection details and copy
the string with **"Pooled connection" unchecked** (a host without the
`-pooler` suffix). The pooled `DATABASE_URL` from step 4 is unaffected and
stays as the Vercel runtime env var.

    # PowerShell
    $env:DATABASE_URL = "postgresql://<neon-direct-unpooled-connection-string>"
    npx prisma db push
    npx prisma db seed
    Remove-Item Env:DATABASE_URL

    # bash
    export DATABASE_URL="postgresql://<neon-direct-unpooled-connection-string>"
    npx prisma db push && npx prisma db seed
    unset DATABASE_URL

**Never commit the Neon URL** — set it only in the shell session above, and
unset it immediately after. Your local `.env` should keep pointing at the
Docker Postgres container for day-to-day development.

---

### 7. [you] Deploy

Back in the Vercel dashboard, click **Deploy**. Vercel runs
`prisma generate && next build` (the build script from step 1 of the repo
setup) against the Neon + Upstash env vars from steps 4–5, then serves the
result at a `*.vercel.app` URL.

From here on, every push to `main` on GitHub triggers an automatic
redeploy — no further manual steps for future changes.

---

### 8. Smoke checklist (post-deploy)

Verify the live deployment with **two browsers** — ideally one of them on
your phone, off wifi (cellular data), to confirm cross-network realtime
actually works and isn't just same-machine websocket/localhost luck:

1. Open the live URL in both browsers; join with two different display
   names.
2. Both join the **same room**.
3. From browser A, send a message: `pizza tonight?`
4. Confirm the emoji translation resolves in **both** browsers, and that
   it's an AI translation (no 🤖💤 "rough translation" marker) — this
   confirms `ANTHROPIC_API_KEY` is live and working.
5. Tap the message bubble in either browser — the original text should be
   revealed.
6. Confirm the presence strip shows **both** avatars in both browsers.
7. Send two messages within 2 seconds of each other from the same
   browser — the second should get the rate-limit ("slow down") error,
   confirming the Redis-backed rate limiter is active.
8. Leave one browser idle for **6+ minutes**, then send a message from the
   other browser. The idle browser should catch the new message on its own
   shortly after — without a manual refresh — once its SSE connection
   reconnects and refetches (this is the client's existing reconnect-refill
   behavior covering Vercel's periodic SSE connection cycling).

If all eight checks pass, the deployment is healthy end-to-end: Postgres,
Redis pub/sub, Redis presence, Redis rate limiting, and the Claude
translation path are all confirmed live.

---

### 9. Troubleshooting

**Build fails, mentioning Prisma / "did you forget to run prisma
generate?"**
Check that the Vercel project's build command is using the repo's
`npm run build` (the default) and that `package.json`'s `build` script is
`prisma generate && next build`. Prisma 7 does not auto-generate the
client during `npm install` on Vercel — the generate step has to be part
of the build command itself.

**Realtime (presence, live message delivery) is dead in production, but
sending a message still returns success:**
This is the signature of the app running on the in-memory hub instead of
the Redis hub — almost always because `REDIS_URL` isn't set, or is set to
a value under a different name (see step 4's naming trap: `KV_URL`,
`UPSTASH_REDIS_URL`, etc., instead of `REDIS_URL`). Check
**Settings → Environment Variables** in Vercel and confirm a variable
literally named `REDIS_URL` exists with a `rediss://` value, applied to
Production, then redeploy.

**Translations always show the 🤖💤 "rough translation" marker in
production:**
This means the app is falling back to the built-in dictionary instead of
calling Claude — either `ANTHROPIC_API_KEY` isn't set in Vercel's
Production environment (check **Settings → Environment Variables**), or
the key exists but has hit its monthly spend cap from step 5 (check the
key's usage in the Anthropic console and raise the cap or wait for the
next billing cycle).
