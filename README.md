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
  PhonePe screenshot, for example). **Stalls** lists stall types, each with its own name, size in metres,
  price and number available; **Memberships** lists plans with a price, how long they last and their
  benefits. Both are added and edited in a popup, can be closed for sale, and each has its own payment QR and
  link whose note names the item. They are paid to the delegate-pass UPI account unless given their own.
  Names must be unique, ignoring case. Both lists live in the `settings` table, so no migration is needed.
- `/admin/event-setup` sets the event date and time (shown in the hero, countdown and ticket emails), and the
  gates (unique names), halls and sessions, meals and certificate rules.

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

## Floor maps: plan → 3D → QR

`/admin/floor-maps` turns a floor plan image into a 3D map that visitors open by scanning a QR. No sign-in is needed to view it.

1. **Upload** a plan (PNG, JPG, WebP, SVG or iPhone HEIC). The browser shrinks it to at most 4096 px (the largest
   texture phones accept) and the server checks the bytes before storing it in R2 under `floor-maps/<id>/`.
   **Add sample stall map** creates a ready-made 32-stall hall (`static/floor-maps/sample-stall-floor-plan.svg`,
   traced in [src/lib/floor-map/sample.ts](src/lib/floor-map/sample.ts)) to try everything without uploading.
2. **Analyse (automatic).** Right after upload the plan is analysed and saved as a draft, so the walls already stand
   in 3D: full-height, open-topped (no roof), with door gaps left open. With `ANTHROPIC_API_KEY` set, Claude reads a copy
   (at most 2576 px) and returns walls, rooms, each stall with its printed number, entrances and exits, and the scale
   ([floor-map-ai.ts](src/lib/server/floor-map-ai.ts)). Without a key, or if the AI call fails, the browser finds long,
   thick, straight walls (short pieces between doorways too) and drops strokes outside the building (scale bar,
   legend). Rooms are segmented from the plan's pixels: open space is eroded until doorways close (the depth that
   separates the most rooms is picked automatically), each room grows back to its own walls, and the outside,
   corridors and corridor pieces cut off at doors are left out ([detect.ts](src/lib/floor-map/detect.ts)). **Detect walls & rooms** and **Find
   rooms** (after fixing walls by hand) run it again; rooms already named or described keep their text.
3. **Edit** in the 2D editor ([FloorMapEditor.svelte](src/lib/components/floor-map/FloorMapEditor.svelte)): walls,
   rectangles or any-shape areas (stalls are numbered A1, A2… automatically), markers, and
   **Calibrate** (click two points, type the real distance). Snap to a 0.5 m grid and 45° angles, undo/redo, duplicate,
   arrow-key nudging. The 3D preview beside it updates live.
4. **Publish.** Drafts are never public: publishing copies the draft to `published_layout`, which is all
   `/map/<token>` serves. **Unpublish** makes the QR show "not available". The token never changes, so printed QRs keep
   working through edits.
5. **QR**: download a print poster (PNG), or the bare QR as PNG or SVG.

**Room descriptions.** Every room, area and stall has a description (up to 600 characters), edited in the
**Rooms & descriptions** panel or below the editor when a zone is selected. Visitors who scan the QR first see the
plan, an **Explore in 3D** button and a card for each room with its description; tapping a card opens the 3D view,
flies to that room, highlights it and shows the description. Tapping a room in 3D shows it too.

The viewer ([FloorMap3D.svelte](src/lib/components/floor-map/FloorMap3D.svelte), Three.js) turns the venue slowly until
someone touches it. Drag to rotate, pinch or scroll to zoom towards the pointer, two fingers or right-drag to move
(the view cannot be dragged off the floor); buttons rotate 45° at a time, zoom in and out, pause the turning and reset
the view. Tapping a room title (or the room) shows its description. It renders only while something moves, caps the
pixel ratio at 2, releases GPU memory when closed, and shows the flat plan where WebGL is unavailable. The `floor_maps` table is in [db/schema.sql](db/schema.sql), and is also
created on first use.

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
