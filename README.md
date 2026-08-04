# Studio — Music Management Platform

A multi-client music management web app. Manage songs, tour, content scheduling, royalties, banking splits, and works catalog — all in one place.

---

## Project structure

```
studio/
├── src/
│   ├── app/                  ← Next.js pages (the URLs)
│   ├── components/
│   │   ├── StudioApp.tsx     ← Root component — wires everything together
│   │   ├── layout/           ← Header, subnav
│   │   ├── dashboard/        ← Client roster + add/edit modals
│   │   ├── songs/            ← Track list, stage advancement
│   │   ├── tour/             ← Shows, venue details
│   │   ├── content/          ← Calendar, Studio view, Lab
│   │   └── business/         ← Royalties, Banking, Catalog
│   ├── lib/
│   │   ├── store.ts          ← ALL app state + actions live here (Zustand)
│   │   ├── demo-data.ts      ← Starting demo data (3 artists)
│   │   ├── utils.ts          ← Shared helpers (fmt, initials, calendar, etc.)
│   │   └── cn.ts             ← Tiny classname helper
│   └── types/
│       └── index.ts          ← TypeScript types for every data structure
└── README.md
```

The most important file: **`src/lib/store.ts`** — every button press calls a function defined there.

---

## Running it locally

### Step 1 — Install Node.js (one-time setup)

Download from https://nodejs.org (click the "LTS" version).

Verify it worked — open Terminal (Mac) or Command Prompt (Windows):
```
node --version
```
You should see something like `v20.x.x`.

### Step 2 — Open the project folder in Terminal

```bash
cd /path/to/studio
```
Tip: On Mac, open Terminal and drag the studio folder into it to auto-fill the path.

### Step 3 — Install dependencies

```bash
npm install
```
Downloads all the code libraries. Takes ~30 seconds.

### Step 4 — Start the app

```bash
npm run dev
```

Open your browser to: **http://localhost:3000**

You'll see the Studio dashboard with 3 demo clients. Data saves automatically in your browser.

---

## Deploying it live (anyone can use it via a real URL)

### Option A — Vercel (recommended, free to start)

1. Create a free account at https://github.com and push this folder as a repository
2. Go to https://vercel.com, sign up with GitHub
3. Click "Add New Project" → select your studio repo → click "Deploy"

That's it. You'll get a live URL like `studio-yourname.vercel.app` in about 2 minutes.
Every time you push code changes to GitHub, Vercel auto-deploys.

---

## Roadmap: turning this into a sellable SaaS

### Phase 1 — What you have now ✅
- Full working app, all sections functional
- Multi-client dashboard
- Add / edit / remove clients
- Data persists in the browser (localStorage)
- Deployable to Vercel right now

### Phase 2 — Real user accounts (Supabase)
Each customer gets their own login and their own data.

```bash
npm install @supabase/supabase-js
```

- Create a free project at https://supabase.com
- Replace the `localStorage` calls in `store.ts` with Supabase database queries
- Add a login/signup page at `src/app/login/page.tsx`
- The rest of the app stays identical — only the data layer changes

**Cost:** Free up to 500MB + 50,000 users

### Phase 3 — Subscription payments (Stripe)
Customers pay monthly, you get paid automatically.

```bash
npm install stripe @stripe/stripe-js
```

- Create an account at https://stripe.com
- Add a `/pricing` page with your plans
- Add an `/api/checkout` route that starts a Stripe checkout
- Add a webhook to unlock access after successful payment

**Suggested pricing:**
| Plan       | Price/mo | Clients |
|------------|----------|---------|
| Solo       | $49      | Up to 5 |
| Agency     | $99      | Up to 20|
| Label      | $199     | Unlimited|

### Phase 4 — Polish & growth
- Custom domain (e.g. `usestudio.io`)
- Artist-facing login (clients log in to see only their own data)
- Email notifications (Resend.com — free tier)
- Mobile layout

---

## How to add a new feature

**1. Define the data** in `src/types/index.ts`

**2. Add actions** in `src/lib/store.ts`:
```typescript
addNote: (trackId: string, text: string) => {
  const { data, clientId } = get()
  // update data immutably, then:
  saveData(updated)
  set({ data: updated })
}
```

**3. Build the UI** component in the relevant folder under `src/components/`

**4. Wire it in** `src/components/StudioApp.tsx`

---

## Tech stack (handoff notes for a developer)

| Layer     | Technology  | Why                                  |
|-----------|-------------|--------------------------------------|
| Framework | Next.js 14  | Industry standard React framework    |
| Language  | TypeScript  | Catches bugs before they ship        |
| Styling   | Tailwind v4 | Utility-first, easy to customize     |
| State     | Zustand     | Simple global state, zero boilerplate|
| Database* | Supabase    | Postgres + Auth + storage, free tier |
| Payments* | Stripe      | Industry standard subscriptions      |
| Hosting   | Vercel      | One-click deploy, auto-scales        |

*Not yet integrated — see Phase 2 & 3 above.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `command not found: npm` | Install Node.js from nodejs.org |
| `Module not found` error | Run `npm install` again |
| Blank page in browser | Press F12, check the Console tab for red errors |
| Changes not showing | Make sure `npm run dev` is still running |
