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
- `/admin/configuration` sets the event fee and UPI ID (**Generate QR** saves both and regenerates the QR and
  payment link the registration form uses), and the event date and time (shown in the hero, countdown and
  ticket emails). The page shows the current QR and the `upi://pay` link that mobile users tap, and can read
  the payee out of an uploaded QR image (a Google Pay or PhonePe screenshot, for example).

## Run locally

```sh
npm install
npm run dev
```

Fill in `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` to sign in at `http://localhost:5173/admin`. Without the
service keys, development uses an in-memory stand-in (data resets when the dev server restarts) and prints
emails in the terminal.

## Set up the services

1. **Neon** — create a project, open the SQL editor and run [db/schema.sql](db/schema.sql).
   Copy the connection string into `DATABASE_URL`.
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
   environment variable (Settings → Environment variables). Use a long, unique `ADMIN_PASSWORD`.

The ticket price, the event date and time, and the UPI details behind the payment QR are changed at
`/admin/configuration` (defaults: ₹500 to MOULISHWAR G, `gmouly1@oksbi`; 28 November 2026, 10 am – 6 pm) and
stored in the `settings` table. Registrations keep the price they were shown. The poster artwork carries its
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
- [src/routes/admin](src/routes/admin) is the organiser dashboard, signed in with `ADMIN_EMAIL` /
  `ADMIN_PASSWORD` (an HMAC-signed, HTTP-only cookie; changing the password signs everyone out).
- The photo framing each delegate chose (zoom and position) is saved in `poster_framing`, so the
  organisers can regenerate any poster.
