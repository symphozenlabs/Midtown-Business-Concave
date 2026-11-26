# Midtown Business Conclave 2026 — registration

Delegate registration for the Midtown Business Conclave (Saturday, 28 November 2026, Salem): a live
"I am attending" poster preview, UPI payment, and an organiser dashboard that verifies payments and emails
each delegate their 4K poster as their ticket.

SvelteKit 3 · Svelte 5 · TypeScript · Neon Postgres · Cloudflare R2 · Resend · Cloudflare Pages

## How registration works

1. The delegate fills in four steps; the poster previews live beside the form.
2. **Continue to payment** registers them (status *awaiting payment*) and uploads their photo and the 4K poster.
3. The payment step shows a UPI QR unique to them: payee, amount and their registration number in the note.
4. They enter the 12-digit UPI transaction ID and tap **Complete** (status *needs review*).
5. An organiser checks the bank or UPI app at `/admin` and clicks **Mark paid** (or ticks several rows and
   marks them together). Marking paid does not email anyone: the ticket joins a queue, and the
   **n emails waiting to be sent** button emails every queued ticket, with the poster attached, in one click.
   **Reject** emails a short note straight away. A rejected delegate can register again with the same email
   and keeps their registration number.

## Organiser dashboard

- `/admin` lists participants in a table (delegate, email, UPI transaction ID, amount, status) with summary
  counts, status tabs and search. **Mark paid** works in one click from the row; **Select** adds checkboxes for
  marking many at once. Each row expands smoothly to show the rest of the registration, the poster and the
  reject form. The send button sends up to 25 tickets per click (Resend allows about two emails a second);
  click again if more are waiting.
- **Ticket delivery.** Every ticket email keeps Resend's email id. **Check delivery** (also run quietly when
  the dashboard opens) asks Resend's `GET /emails/:id` what happened, and the *Ticket email* column shows
  *Not sent*, *Sent*, *Delivered* or *Failed* (bounced, marked as spam, suppressed…). The chips above the
  table filter by that state, and **Resend n failed emails** sends the ticket again to everyone whose email
  did not arrive. Reading email status needs a Resend API key with **Full access**; a *Sending access* key
  can send but not check. Run [db/schema.sql](db/schema.sql) again to add the delivery columns.
- `/admin/payments` has three tabs. **Delegate pass** sets the event fee and UPI ID (**Generate QR** saves
  both and regenerates the QR and payment link the registration form uses); it shows the current QR and the
  `upi://pay` link mobile users tap, and can read the payee out of an uploaded QR image (a Google Pay or
  PhonePe screenshot, for example). **Stalls** lists stall types, each with its own name, size in feet,
  price and number available; **Memberships** lists plans with a price, how long they last and their
  benefits. Both are added and edited in a popup, can be closed for sale, and each has its own payment QR and
  link whose note names the item. They are paid to the delegate-pass UPI account unless given their own.
  Names must be unique, ignoring case. Both lists live in the `settings` table, so no migration is needed.
- `/admin/event-setup` sets the event date and time (shown in the hero, countdown and ticket emails), and the
  gates (unique names), halls and sessions, meals and certificate rules.

## Stall booking and sponsors

- **Book a stall** (homepage, after delegate registration): name, business name, email, mobile, a preferred
  stall number picked from the floor layout (`static/floor/stall-layout.jpg`; the layout has no stalls 25 and 35),
  and an optional promo code. The note says the stall number is only a preference. Stalls already confirmed for
  someone else are crossed out and refused by the server. The exhibitor then pays by UPI and enters the transaction
  ID, as delegates do. Bookings are numbered `STL-XXXXXX`.
- **Enlarge** opens the layout full screen: zoom 100–400% (buttons, wheel, pinch, double tap), drag to pan, and the
  page behind stays still. Hovering a stall names its exhibitor; tapping a confirmed stall offers **Message**, and an
  open one **Choose as preferred**.
- **Price**: the stall types open for sale under `/admin/payments` → Stalls; with none set up, a standard
  6 ft × 6 ft stall at ₹7,500.
- **Promo code SEFMEMBER** (25% off stalls) is added to the vouchers the first time the site needs it, and is
  edited, limited or closed under `/admin/payments` → Stalls like any other voucher.
- `/admin/stalls` lists bookings: **Mark paid and email** needs the final stall and locks it. The confirmation email
  (same template) gives the stall number, the stall login with Open my messages / Open my leads links, and the stall QR (attached). **Reject** with a
  note, or **Delete booking** (removes it with its messages and leads and frees the stall; no email). For exhibitors
  confirmed before these existed, the **n stall QR + login emails waiting to be sent** button emails them in one
  click; **Resend stall QR + login** in a confirmed booking's Manage sends one again.
- **Sponsorship** section with the three packages from the poster and a **Become a sponsor** form. Each request
  gets a thank-you email and appears at `/admin/sponsors`, where organisers set its status and a private note.
- Tables `stall_bookings` and `sponsor_requests` are created automatically on first use (also in
  [db/schema.sql](db/schema.sql)).

## Agenda

- **Salem Entrepreneurs Awards** (presented by the Salem Entrepreneurs Forum) at `/awards` (served as **awards.midtownevents.in** once that domain is added to the Vercel project):
  a poster page and a free **Apply for Business Awards** form with a dropdown of 75 business categories plus **Others**. Applications land in
  **Admin → Awards**, where organisers filter, shortlist, mark winners, add notes, download a CSV, and open or close applications.
  Table `award_applications` is created automatically on first use (also in `db/schema.sql`).
- The homepage **Agenda** (between the story map and Sponsors & partners) is built from **Event setup → Halls and
  sessions**, so organisers change it without code. Each session has a hall, title, start and end time, and an
  optional speaker and short description. Sessions that start together are shown side by side (parallel tracks),
  in the order they were added.
- **Show on the website agenda** (on by default) hides a session from the website without removing it from the hall
  desks. Unticking **Counts towards the attendance %** marks openings, tea and lunch: they are shown more quietly.
- The hero's **View agenda** link and the section appear only when there is at least one session to show. The site
  reads the agenda from `/api/agenda` (cached for about 30 seconds).
- The speaker, description and show-on-agenda columns are added to `conference_sessions` automatically on first use
  (also in [db/schema.sql](db/schema.sql)).

## Event day: one QR, six desks

Every paid delegate has **one QR pass** (`/pass/<token>`, nothing personal in it). It works at six kinds of desk,
and what a scan does depends on the signed-in handler's assigned category:

| Desk | What a scan does |
| --- | --- |
| Ticket validation | Shows registration, payment and approval status. Changes nothing. |
| Gate check-in | Records entry once (re-entry only if allowed under Event setup). |
| Hall attendance | Records attendance for the handler's hall or session, once per session. |
| Food redemption | Serves a meal up to its per-delegate limit, at any counter. |
| Certificates | Checks eligibility, issues (if permitted) and verifies certificates. |
| Networking | Shows the professional profile; can introduce two delegates. |

- **Organiser.** `/admin/handlers` creates handler accounts (there is no public sign-up): name, username,
  optional email and mobile, the event, and one or more categories with their gate, hall/session, meal and counter.
  A temporary password is generated; the handler must replace it at first sign-in. The organiser can always look up
  and copy each handler's username and current password (kept encrypted with `PASS_SECRET`, besides the one-way hash
  used for sign-in); passwords set before this was added show as not stored until reset. The organiser can edit, reset
  passwords, deactivate, sign out every device, change categories, and delete (archive, if the handler has scan
  history). `/admin/event-setup` holds gates, halls and sessions, meals (times, servings per delegate, who may
  collect), the re-entry rule, certificate rules and **Reissue QR** (revokes a lost or shared pass).
  `/admin/activity` shows totals by category and handler, filterable scan history, CSV export and the audit log.
- **Handlers** sign in at `/login` (the same page as the organiser) with their username or email; `/handler/login`
  also works. One category opens its desk straight away; several show a choice. Tap
  **Start scanning**: the camera reads passes (rear or front camera, torch where the phone has one), each result
  fills the screen in green, amber or red with its own sound and vibration, and scanning resumes after a delay
  the handler chooses. **Manual lookup** finds a delegate by registration number or name when a QR will not scan.
- **Desk rules are enforced on the server**: every handler page and `/api/ops/*` call checks the assignment, so
  typing another desk's address is refused and logged. Each duplicate rule is a unique index (one gate entry, one
  attendance per session, one row per meal serving, one certificate, one connection per pair), so two phones
  scanning the same pass at the same moment cannot both succeed. A retried request carries the same scan id and
  gets the first answer back.
- **Offline.** Hall attendance scanned without a connection is kept on the phone and sent when it reconnects.
  Gate entry, meals and certificates are never confirmed offline: the screen says *No connection, not recorded*.
- **Delegates.** The ticket email attaches the ID card front and back with an **Open my pass** link (private: it signs
  that phone in). The front is the poster made at registration; the back, drawn in the organiser's browser from the
  same artwork when the payment is marked paid, carries the QR, photo, name, role, company and registration number.
  Its key includes the QR version, so a reissued QR gets a fresh back. Scanning the QR with any camera shows the
  details the delegate registered with (never phone or email).
  On their pass they see the QR, connection requests and their certificate. Scanning another delegate's QR with
  any camera opens that delegate's card with **Connect**; phone and email are shared only once both accept, and
  either can withdraw. Delegates whose ticket went out earlier get their pass from the **event passes to send**
  button on the dashboard. Certificates are checked publicly at `/certificate/<number>`, which also prints them.

Set `PASS_SECRET` once (`openssl rand -base64 48`) before sending passes: it signs every QR, so changing it later
means reissuing every pass. Run [db/schema.sql](db/schema.sql) again to add the event-operations tables.

To try the desks locally without touching the live database, point `DATABASE_URL` at a local Neon HTTP proxy
(e.g. `postgresql://user:pass@localhost:4444/db`); `db.ts` sends local hosts to `http://localhost:4444/sql`.

## Visitors directory

The QR on the back of the printed visitor card opens **`/visitorDirectory`** (any other casing redirects there; the
address must never change). Paid delegates signed in on that phone see everyone else who is listed (name,
designation and company only, A–Z, with search) and can message them on the site. Phone numbers and emails never
appear in the directory, its emails or its notifications.

- **Signing in.** It uses the same "Open my pass" sign-in as `/me`. A phone that isn't signed in shows **Email me my
  pass link**, which sends a sign-in link that returns to the directory (it never says whether an address is
  registered).
- **Messages.** One text-only conversation per pair (1–1000 characters, links not clickable). A delegate can send 3
  messages until the other person replies, and start 30 new conversations a day. Phones check for news every 10
  seconds in an open conversation (30 seconds when quiet or on other screens) and never while the page is hidden.
- **Alerts.** The recipient gets a backup email ("Name sent you a message", never the text), at most one per
  conversation until they have read it, up to the daily cap. With push switched on, they also get a notification
  ("New message from Name" / "Tap to read and reply") on browsers where they tapped **Turn on notifications**; on
  iPhone that works only from the Home Screen icon, and the page shows the steps.
- **Delegates' controls** on `/me`: *Show me in the directory*, *Let delegates message me* (off also stops them
  sending and makes their conversations read-only), and their blocked list. **Block** is in each conversation's menu;
  the blocked person isn't told.
- **Organiser's controls.** On the dashboard, a paid registration's details have **Hide from directory** and **Stop
  messaging**, for complaints at the venue. They override the delegate's own settings. **Organisers can't read
  messages.** Under **Event setup → Visitors directory**: the closing time (default the end of 12 December 2026, India
  time), backup emails per day (default 50; Resend's free plan allows 100 emails a day in total, including tickets and
  pass links) and the push switch. After closing, the directory says it has closed; messages are deleted 30 days later
  by the first request after that date.

Before launch, rerun [db/schema.sql](db/schema.sql) on the live database (it adds the `directory_*` and
`push_subscriptions` tables; until then the page says the directory opens soon). For push notifications, generate keys
once with `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (a
`mailto:` address or the site URL) in Vercel; then the push switch in Event setup can be turned on.

**Testing** happens on a separate, empty Neon project with made-up delegates, never with fake delegates in the live
database (they would appear in the real directory and the ticket queue). Run `db/schema.sql` there, then
[db/directory-test-seed.sql](db/directory-test-seed.sql), which refuses to run on a database with real registrations.
`npm test` runs the directory's rules (Vitest).

## Stall directory

There is no public stall page. The stalls are the **Stalls** tab of the visitors directory
(`/visitorDirectory?tab=stalls`), so only signed-in delegates see them: every confirmed stall in a list laid out like
People (business, contact name, stall number; never phone or email), searchable by business, name or stall number,
with a **Floor map** above it that stays closed until the delegate opens it (tap a gold stall to open that stall). Old
`/stallDirectory` and `/stallDirectory/<booking id>` links redirect there.

- **Delegates message a stall** from its page (`/visitorDirectory/stalls/<booking id>`), signed in with the "Open my
  pass" cookie. Stall conversations appear in the directory's Messages tab with the people ones. The same limits apply (3 unanswered messages, 30 new conversations a day,
  the delegate's own and the organiser's messaging switches, the closing time).
- **Exhibitors sign in** at the same `/login` page as organisers and event handlers, with the email they booked with as the login and their 10-digit
  mobile number as the password. Their email has **Open my messages** and **Open my leads** buttons
  (`/login?next=…`), which land straight in that tab after signing in. Every confirmed booking under that email and phone is one exhibitor. Their area has
  **Messages** (reply, or block a delegate without telling them, with their stall QR beside it), **Leads** (scan a
  delegate's pass QR at the stall, or type the `MBC-` number, to save their contact card, add a note, and download a
  CSV) and **Stalls** (the other stalls and the floor map, without leaving their area).
- **Stall QR**, shared the way delegates share their pass: it opens `/stallDirectory/card/<code>.<signature>` with the
  business, contact name, phone and email, **Save contact** (vCard) and **Message this stall**. The signature keeps the
  link unguessable, so the phone and email reach only people shown the QR. It goes with the confirmation email and is
  in the exhibitor's area to show or download.
- **Notifications** follow the visitors directory: a backup email per conversation until it is read (never the
  message text, counted in the same daily cap), and a push to the delegate when push is on.
- The tables (`stall_conversations`, `stall_messages`, `stall_leads`, and `stall_bookings.login_emailed_at`) are in
  [db/schema.sql](db/schema.sql) and are also created on first use. Messaging needs the visitors directory tables.

## Run locally

```sh
npm install
npm run dev
```

Organisers sign in at `http://localhost:5173/login` with an account in the `admin_users` table in Neon
(see below). Without the service keys, development uses an in-memory stand-in (data resets when the dev server restarts) and prints
emails in the terminal.

## Set up the services

1. **Neon** — create a project, open the SQL editor and run [db/schema.sql](db/schema.sql).
   Copy the connection string into `DATABASE_URL`, then add the organiser's sign-in (run it again to reset
   the password; it signs out their open sessions):
   `node --env-file=.env db/set-admin.ts admin@example.com 'a-long-password'`
2. **Cloudflare R2** — create a bucket (keep it private). Copy its **S3 API** URL from the bucket's
   settings into `R2_S3_API_URL`, then create an R2 API token with *Object Read & Write* on that bucket
   for `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Photos are stored as `registrations/2026/<uuid>.<ext>`.
3. **Resend** — add and verify your sending domain, create an API key for `RESEND_API_KEY`, and set
   `EMAIL_FROM`, e.g. `Midtown Business Conclave <tickets@yourdomain.com>`.
4. **Hosting** — either works; the build picks the adapter itself (see `vite.config.ts`).
   - **Vercel**: import the repository with the SvelteKit framework preset and leave Output Directory empty.
     Add every variable from `.env.example` under Settings → Environment Variables, then redeploy.
   - **Cloudflare Pages** — connect the repository with build command `npm run build` and output
   directory `.svelte-kit/cloudflare`, then add every variable from `.env.example` as an encrypted
   environment variable (Settings → Environment variables).

The ticket price and the UPI details behind the payment QR are changed at `/admin/payments`, and the event date
and time at `/admin/event-setup` (defaults: ₹500 to MOULISHWAR G, `gmouly1@oksbi`; 28 November 2026, 10 am – 6 pm) and
stored in the `settings` table. A new fee or UPI ID also applies to delegates who registered but have not paid:
their payment page picks up the new amount and QR within 30 seconds (or as soon as they return to the tab).
Anyone who has already entered a UPI transaction ID keeps the amount they paid. The poster artwork carries its
own printed date, so changing the date does not redraw posters.

## How it fits together

- [src/routes/api/register/+server.ts](src/routes/api/register/+server.ts) validates the form with the
  same rules as the browser ([src/lib/registration.ts](src/lib/registration.ts)), checks the photo's
  bytes, uploads it to R2 and inserts the row into Neon. One registration per email address.
- [src/lib/poster/renderer.ts](src/lib/poster/renderer.ts) is a port of the client-approved
  `MBC2026-IAmAttending-PosterMaker.html` "final" template. It renders pixel-identically to the original;
  keep coordinates in sync if the approved poster maker changes. Artwork lives in `static/poster/` and
  the exact poster fonts in `static/fonts/`.
- [src/lib/components/StoryMap.svelte](src/lib/components/StoryMap.svelte) is the scroll-driven chapter
  between the hero and the form: a pinned stage whose animations are paused Web Animations scrubbed by
  scroll progress (transforms, opacity and stroke drawing only, so nothing reflows). The branch cities
  come from [src/lib/story.ts](src/lib/story.ts).
- [src/lib/geo/tamil-nadu.ts](src/lib/geo/tamil-nadu.ts) is generated from Natural Earth 1:10m data
  (public domain): state and neighbour boundaries, rivers, urban footprints and roads, projected with Web
  Mercator. The gold routes are shortest paths over the real highway network; the one gap in that data,
  the Salem–Trichy NH 38, is added by hand through Rasipuram and Namakkal. Regenerate with the
  `build-geo.mjs` script described in the file header if the cities change.
- `src/lib/story/satellite.webp` (and a smaller copy for phones) is the ground under that map: NASA imagery (public domain) stitched to the
  same frame: the VIIRS Black Marble night-lights composite, Blue Marble Next Generation colour and the
  ASTER GDEM shaded relief (a product of METI and NASA), fetched as GIBS tiles. The chapter credits NASA
  in small print under the map. The images are imported rather than kept in `static/`, so their URLs are
  content-hashed and a regenerated image is never served from a stale cache.
- [src/routes/api/payment/+server.ts](src/routes/api/payment/+server.ts) records the UPI transaction ID;
  each ID can be claimed by one registration only.
- [src/routes/admin](src/routes/admin) is the organiser dashboard, signed in with an
  `admin_users` account in Neon (an HMAC-signed, HTTP-only cookie; resetting the password signs everyone out).
- The photo framing each delegate chose (zoom and position) is saved in `poster_framing`, so the
  organisers can regenerate any poster.
- Event operations live in [src/lib/server/ops](src/lib/server/ops): `scan.ts` is the one scan engine every desk
  uses (identify the pass, run the desk's operation as a single SQL statement, log the transaction),
  `handlers.ts` holds accounts, PBKDF2 passwords, database-backed sessions and lockout, `passes.ts` signs QR
  tokens and "My pass" links, `networking.ts` keeps each side's consent. The camera scanner is
  [src/lib/components/ops/QrScanner.svelte](src/lib/components/ops/QrScanner.svelte), using the same
  BarcodeDetector-then-jsQR decoding as the configuration page.
