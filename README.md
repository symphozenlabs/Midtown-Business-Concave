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
5. An organiser checks the bank or UPI app at `/admin` and clicks **Mark as paid**, which emails the ticket
   with the poster attached; or **Reject**, which emails a short note. A rejected delegate can register again
   with the same email and keeps their registration number.

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
4. **Cloudflare Pages** — connect the repository with build command `npm run build` and output
   directory `.svelte-kit/cloudflare`, then add every variable from `.env.example` as an encrypted
   environment variable (Settings → Environment variables). Use a long, unique `ADMIN_PASSWORD`.

The ticket price and the UPI details behind the payment QR are changed from the dashboard (defaults:
₹500 to MOULISHWAR G, `gmouly1@oksbi`). Registrations keep the price they were shown.

## How it fits together

- [src/routes/api/register/+server.ts](src/routes/api/register/+server.ts) validates the form with the
  same rules as the browser ([src/lib/registration.ts](src/lib/registration.ts)), checks the photo's
  bytes, uploads it to R2 and inserts the row into Neon. One registration per email address.
- [src/lib/poster/renderer.ts](src/lib/poster/renderer.ts) is a port of the client-approved
  `MBC2026-IAmAttending-PosterMaker.html` "final" template. It renders pixel-identically to the original;
  keep coordinates in sync if the approved poster maker changes. Artwork lives in `static/poster/` and
  the exact poster fonts in `static/fonts/`.
- [src/routes/api/payment/+server.ts](src/routes/api/payment/+server.ts) records the UPI transaction ID;
  each ID can be claimed by one registration only.
- [src/routes/admin](src/routes/admin) is the organiser dashboard, signed in with `ADMIN_EMAIL` /
  `ADMIN_PASSWORD` (an HMAC-signed, HTTP-only cookie; changing the password signs everyone out).
- The photo framing each delegate chose (zoom and position) is saved in `poster_framing`, so the
  organisers can regenerate any poster.
