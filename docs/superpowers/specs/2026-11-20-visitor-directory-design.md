# Visitors directory and messaging: design

Date: 20 November 2026
Status: approved by the organiser on 23 November 2026

## Why

The visitor card goes to print with a QR on the back that opens
`https://conclave.midtownevents.in/visitorDirectory`. That address returns 404 today. Delegates
pick up the card at the registration counter on the day (Saturday 28 November 2026, Salem). When
they scan it, they should find everyone else who is attending and be able to reach them, without
first swapping phone numbers.

Success means three things:

- The QR lands on a working page from the first scan.
- A delegate can find a person by name or company and send them a message.
- The person they wrote to finds out about it promptly, on their phone.

The printed URL cannot change, so the route must be exactly `/visitorDirectory`.

## What the organiser decided

- `/visitorDirectory` lists the people registered for the event. Each person has a message button.
- Messages are sent and read on the event website.
- A new message triggers an in-browser (Web Push) notification for people who turn notifications on.
- An email also goes out as a backup.
- **Launch doesn't wait for push.** If push notifications aren't working on real phones by
  Wednesday 25 November, launch with the backup email and the unread count, and add push once it
  works. So:
  - build the directory, messaging and email first, and push after them;
  - put everything the delegate sees of push (the banner, the iPhone steps, subscribing) behind
    one switch, so the site can go live with it off.

## What the organiser approved from my proposal and mockup

The mockup is at `.superpowers/brainstorm/9176-1795190682/content/directory.html`. It's a local
file, not committed. It has three phone screens: the list, a conversation, and the signed-out page.

- **Only signed-in delegates can open it.** "Signed in" means the existing participant cookie
  (`mbc_me`, set by the "Open my pass" link in the ticket/pass email, see `src/routes/me/[access]/+server.ts`).
  This is the same check the networking Connect flow uses.
- **A phone the site doesn't recognise** sees a short page. It asks the visitor to tap
  **Open my pass** in their ticket email on this phone, and offers to email the link again.
- **What each person shows:** name, designation and company only. No photo, industry, city, phone or
  email. The registration consent ("…share my name, designation and company with other
  delegates") is mandatory at registration and covers exactly this.
- **The list** is sorted A–Z by name, with one search box matching name or company.
- **Two tabs:** People and Messages. Messages lists conversations newest first and shows an unread count.
- **Conversations** are one per pair of people, text only, a simple back-and-forth.
- **The backup email** says who wrote (name, designation, company) and links to the conversation.
  It never contains the message text.
- **People stay in control.** Each delegate can:
  - hide themselves from the list;
  - stop receiving messages;
  - block a specific person.
  The consent covered being listed, not being messaged by strangers.
- **The directory stays open for about two weeks after the event**, then closes.
- **On an iPhone**, "Turn on notifications" first walks the person through Add to Home Screen.
  iOS only allows Web Push for sites opened from a Home Screen icon (iOS 16.4 and later), never in
  a Safari tab.

## Goals

1. The card QR opens a working page, whether or not the phone is signed in.
2. A signed-in delegate can browse and search everyone listed, and start or continue a conversation.
3. A recipient learns about a new message through a push notification, an email, or both.
4. Every delegate can opt out of the list, opt out of messages, and block individuals.
5. Live in production and tested on real phones by **Wednesday 25 November**. That leaves time to
   fix problems before the 28th. Push may follow later (see above).

## Non-goals

- Group chats, photos, files, voice notes, link previews, read receipts, typing indicators.
- Real-time sockets. Polling is enough at this scale (about 400 delegates).
- Showing more profile detail than name, designation and company. Scanning someone's pass QR
  already shows more.
- Organiser broadcasts or announcements through this channel.
- Organisers reading delegates' messages, or a report-and-review queue.
- A native app.

## Anti-goals: failure even if it technically works

- **Leaking contact details.** Phone or email must never appear in the directory, in a message
  screen, or in a notification. Phone and email are only shared through the existing Connect flow.
- **Listing the wrong people.** Never list anyone who isn't a confirmed delegate:
  `registrations.status = 'paid'`, the same rule as `publicProfile()` in
  `src/lib/server/ops/networking.ts`.
- **Message text leaving the site.** It must not appear in an email or a lock-screen
  notification.
- **One person spamming hundreds of delegates.**
- **Notifications that nag.** The browser permission prompt appears only after the person taps
  "Turn on", never on page load.
- **Errors on event day.** Venue Wi-Fi will be slow and crowded. The page must load quickly and
  degrade gracefully: if push or email fails, the message is still saved and shown.

## Who is listed

- Registrations for the current event with `status = 'paid'`, minus anyone who has hidden themselves.
- The viewer doesn't see themselves in the list.
- People who block each other don't see each other in the list.
- Event handlers, admins and stall exhibitors aren't listed unless they also hold a paid
  registration. Stall bookings aren't registrations. *My call.*

## Screens

### 1. Directory (People tab)

- **Header:** "Visitors directory" with a count, e.g. "412 people registered". The count is of
  listed people.
- **Notification banner:** "Know when someone messages you. Turn on notifications." with a
  **Turn on** button. It hides once this browser has a working subscription. If the person has
  blocked notifications, it becomes a one-line note on how to allow them again.
- **Search:** one box matching name or company, case-insensitive, filtered on the phone.
  About 400 rows is small enough to send in one go.
- **Rows:** initials avatar, name, then "Designation · Company" on the second line, and a message
  icon button. For people not taking messages, the button is shown disabled with a short label.
  *My call:* a disabled button, rather than a missing one.

### 2. Messages tab

- Conversations, newest activity first.
- Each row shows the other person's name, "Designation · Company", the time of the last message,
  and an unread dot.
- On this signed-in screen only, a row may show the first line of the last message.

### 3. Conversation

- **Header:** back arrow, the other person's name, "Designation · Company".
- A quiet note at the top: "Your phone number and email stay private."
- Message bubbles with times, then a compose box and a send button.
- A menu in the header with **Block** (and **Unblock**).
- **Message limits:** 1–1000 characters, plain text. Links show as plain, non-clickable text.
  *My call:* this reduces phishing.
- **Updates:** poll for new messages about every 10 seconds while a conversation is open and the
  tab is visible. Slow to every 30 seconds after two minutes with nothing new. On the other tabs,
  poll about every 30 seconds. Stop polling when the tab is hidden, and check once as soon as it's
  visible again. *My call:* this keeps requests within a free hosting plan (see Constraints).
  *Builder may tune.*

### 4. Signed out

- **Title:** "Open your pass on this phone first."
- **Explanation:** tap **Open my pass** in the ticket email on this phone.
- **Field:** "Email you registered with", with an **Email me my pass link** button.
  - The reply is always "If that email is registered, we've sent your link". It never reveals
    whether an address is registered.
  - The email sent is the existing pass/"Open my pass" email, or a short version of it.
  - Rate-limit per IP and per address.
- After signing in through the link, the delegate lands back on `/visitorDirectory`, not `/me`.

### 5. Turning on notifications

- **Android Chrome and desktop browsers:** tap **Turn on**, then the browser's permission prompt,
  then subscribe. Save the subscription against the signed-in registration.
- **iPhone in a Safari tab:** tap **Turn on**, then a short sheet with the steps:
  1. Tap Share.
  2. Tap Add to Home Screen. Leave "Open as Web App" on.
  3. Open the site from the new icon and tap **Turn on** there.
- Inside the Home Screen app, the flow is the same as on Android.
- This needs a web app manifest: `start_url: /visitorDirectory`, `display: standalone`, name, and
  192 px and 512 px PNG icons made from the MBC logo. It also needs a service worker that shows
  pushes and opens the right conversation when a notification is tapped.

## Notifications and email

### Push

- Web Push with VAPID keys. Payloads are encrypted, as browsers require.
- **Text:** "New message from Priya Raman", body "Tap to read and reply". No message text.
  Tapping opens that conversation.
- **When:** on every new message to a recipient with at least one subscription. A person can have
  several devices.
- **Dead subscriptions:** delete a subscription when the push service answers 404 or 410.
- Sending must not slow the sender's request. Do it after the response, using the platform's
  `waitUntil`.

### Backup email

- **When:** sent whether or not the recipient has push. At most one email per conversation until
  the recipient opens it.
  - The next message in that conversation sends no email while an emailed message is still unread.
  - Once they've read it, the next new message can email again.
  - *My call:* this keeps an active chat from flooding their inbox.
- **Content:**
  - Subject: "Priya Raman sent you a message · Midtown Business Conclave".
  - Body: the sender's name, designation and company, plus a **Read and reply** button.
  - It uses the existing email `layout()` in `src/lib/server/email.ts`.
- **The button** uses the recipient's own private "Open my pass" access link, extended to return
  them to the conversation. It works even on a phone that isn't signed in yet. *My call:* this
  has the same forwarding risk as the ticket email today.
- **Daily cap.** *My call.* The organiser hasn't confirmed the Resend plan. The free plan allows
  100 emails a day, shared with ticket emails and re-sent pass links.
  - Count backup emails per day (India time) in the database.
  - Once the day's count reaches the cap, send no more backup emails that day. The message is
    still saved, and it still shows in the unread count and in a push notification.
  - Re-sent pass links never wait on this cap, only on their own rate limits.
  - Keep the cap in the `settings` table, starting at 50, so the organiser can raise it after an
    upgrade.

## Abuse limits

All of these are *my call*.

- **Until the other person replies,** a sender can send at most 3 messages in that conversation.
- **New conversations:** a delegate can start at most 30 per day. Count these in the database, not
  in memory. The in-memory limiter in `src/lib/server/rate-limit.ts` works per server instance,
  so it slows abuse but doesn't stop it.
- **Blocking:**
  - The blocked person can't message the blocker, and isn't told they've been blocked.
  - The conversation disappears from the blocker's Messages tab.
  - Each disappears from the other's list.
- **"Stop receiving messages":** messaging is off for this person in both directions.
  - No one can start a new conversation with them, and they can't start new ones either.
  - Their existing conversations become read-only for both sides.
  - Turning it back on restores everything.
  - *My call:* an on/off switch for receiving only would be confusing.
- **What a blocked person sees:** exactly what they'd see if the blocker had turned messages off.
- **"Hide me from the directory":** removes the person from the list. They can still message
  others, and people they've written to can reply.
- **Organiser switches.** These are for complaints made in person at the venue, so they target the
  person complained about. *My call.*
  - Two switches on the admin registration screen: **Hide from directory** and **Stop messaging**.
  - They're stored separately from the delegate's own settings and override them. The delegate
    can't undo them from `/me`.
  - **Stop messaging** blocks sending as well as receiving, and makes that person's conversations
    read-only.
  - The delegate sees a plain note: "Messaging has been turned off for your pass. Speak to the
    registration desk."
  - The organiser cannot read messages.
- Record block, hide and organiser actions with the existing `audit()` helper.

## Where the controls live

- **On `/me` (the delegate's pass page):**
  - a "Visitors directory" link with the unread count;
  - "Show me in the directory" on/off;
  - "Let delegates message me" on/off;
  - the list of people they've blocked, with Unblock.
- **In a conversation:** Block.

## Closing after the event

- The directory and messaging are open from launch until the end of **Saturday 12 December 2026,
  India time**. Store this with the other event settings (`settings` table) so the organiser can
  change it.
- After that, `/visitorDirectory` shows "The visitors directory has closed. Thank you for joining
  us." No new messages can be sent.
- Messages are deleted 30 days after closing. *My call; the organiser may prefer a different
  period.* There's no scheduler, so the clean-up runs the next time the site handles a request
  after that date.

## Constraints

- **Stack:**
  - SvelteKit 3, Svelte 5 and TypeScript.
  - Neon Postgres over the HTTP driver (`src/lib/server/db.ts`): one round trip per query and no
    long-lived connections.
  - No WebSockets, hence the polling.
- **Hosting:** production is on **Vercel**. The live site answers with `server: Vercel`, and
  `vite.config.ts` picks `adapter-vercel` with the `nodejs24.x` runtime whenever `VERCEL` is set.
  The repo also builds for Cloudflare Pages (`wrangler.toml`), but that isn't what serves
  `conclave.midtownevents.in`.
- **Push library:** functions run on Node.js, so the standard `web-push` npm package can be used.
  Keep the push code behind one small module so a WebCrypto version could replace it if the site
  ever moves to Cloudflare.
- **Background work:** send pushes and emails after the response is returned, using Vercel's
  `waitUntil` (`@vercel/functions`). If that proves awkward under SvelteKit, await the sends but
  keep them short.
- **Secrets:** new VAPID keys go in the Vercel project's environment variables like the existing
  secrets, and are listed in `.env.example`.
- **Request budget:** polling multiplies requests. Make the poll a single cheap query that answers
  "anything new since X?" and returns no data when nothing changed. Stop polling while the tab is
  hidden. Polling serves the same functions as the gate, hall and meal desks, so it must never
  crowd them out on event day.
- **Plan limits.** *My call.* The organiser hasn't confirmed the Vercel or Resend plans, so the
  design must work on the free plans; a paid plan only raises the numbers. That is why the email
  cap and the polling intervals above exist. Make it easy to raise both later.
- **Schema:**
  - Changes go in `db/schema.sql`, which is idempotent and rerun by the organiser in the Neon SQL
    editor.
  - Follow the existing style: `create table if not exists`, plus the pair ordering
    `a_id < b_id` used by `participant_connections`.
  - The organiser must rerun the schema before launch. Say so in `README.md`.
- **Reuse, don't duplicate:**
  - `readParticipant()`, `accessPath()`, `verifyAccess()` and `participantCookie()` in
    `src/lib/server/ops/passes.ts`;
  - `send()` and `layout()` in `src/lib/server/email.ts`;
  - `audit()` and `getDefaultEvent()` in `src/lib/server/ops/event.ts`.
- **Look:** follow the site's design tokens (`design/tokens.css`, `src/app.css`): paper and ink
  grounds, gold accents, Inter for text, Playfair Display for titles.
- **Phones first:** the layout should also work on desktop.
- **Route:** `/visitorDirectory` exactly. Redirect lowercase `/visitordirectory` to it.
- **Testing:** the repo has no test runner, only `npm run check` (svelte-check).
  - Build and test against a Neon branch with test delegates, deployed as a Vercel preview.
  - Never create fake delegates in production. They would appear in the real directory and in the
    ticket-email queue.
  - Verify end to end:
    - with two delegates on Android Chrome;
    - with desktop Chrome;
    - with an iPhone added to the Home Screen (push and email both arrive, tapping opens the
      conversation);
    - and check that the signed-out page and the re-send link work.
  - Do the final production check with two real registrations from the organiser's team.
    *My call.*
- **Sign-in redirect:** the "Open my pass" link takes a same-site `next` path so it can return
  the delegate to `/visitorDirectory` or a conversation. Reject anything that isn't a local path.

## Risks the builder should check early

- **iPhone Home Screen sign-in.** Safari copies its cookies into a Home Screen web app when it's
  added (iOS 17 and later). After that the two are separate. Check that a delegate signed in in
  Safari is still signed in inside the Home Screen app. Also check what happens when the pass link
  is opened from email, which opens Safari, not the app. If sign-in is lost, add a fallback that
  works inside the app, such as a 6-digit code in the re-sent email.
- **Email volume.** About 400 delegates messaging on one day could want many hundreds of backup
  emails. On the free plan the daily cap will be reached, so most people will hear about new
  messages from push or the unread count. Tell the organiser before launch if that's likely.
- **Push on real phones.** Prove one push reaches a real Android phone and an iPhone Home Screen
  app early. If it isn't working by Wednesday 25 November, go live with push switched off.
- **Hosting plan.** If the Vercel project is on the Hobby plan, check its limits and terms before
  event day, since the gate, hall and meal desks share the same functions.

## Left to the builder

- Exact tables and columns, indexes, and how unread state is stored.
- Polling intervals within the ranges above.
- How the push module wraps the `web-push` package.
- Service worker setup (SvelteKit's `src/service-worker.ts` or a static file).
- Icon generation.
- Component structure.
- Exact wording, in the site's plain, friendly tone.
