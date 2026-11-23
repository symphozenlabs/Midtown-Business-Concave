# Visitors Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/visitorDirectory`, the page the printed visitor card's QR opens. Signed-in paid delegates can find each other and exchange text messages on the site. Recipients learn of a message by a backup email and, once it's proven on real phones, by a Web Push notification.

**Architecture:**
- **Rules:** a dependency-free rules module (`src/lib/directory/rules.ts`) holds every permission and limit decision and is unit-tested.
- **Data and notifications:** server modules under `src/lib/server/directory/` handle Neon queries, the daily email cap and push. They reuse the existing participant cookie, pass links, `audit()`, `send()` and `layout()`.
- **Pages:** SvelteKit pages under `src/routes/visitorDirectory/`. They poll a cheap JSON endpoint while visible.
- **Background work:** email and push are sent after the response, through Vercel's `waitUntil`.

**Tech Stack:**
- SvelteKit 3, Svelte 5 runes, TypeScript.
- Neon Postgres (HTTP driver).
- Resend through the existing `send()`.
- `web-push` (Node) and `@vercel/functions`.
- Vitest, new, for the rules module only.

**Spec:** `docs/superpowers/specs/2026-11-20-visitor-directory-design.md`. Executors read it alongside this plan.

**Schedule:**
- Today is Monday 23 November.
- Tasks 1–6 by end of today.
- Tasks 7–9 and the preview tests on Tuesday 24.
- Production by Wednesday 25 November.
- If push (Task 9) isn't proven by Wednesday, ship with its switch off. The organiser approved that.

## Global Constraints

**URL:**
- The route is `/visitorDirectory` exactly.
- Any other casing (e.g. `/visitordirectory/...`) redirects to it with 308.

**Who's listed and what's shown:**
- Only registrations with `status = 'paid'` are listed or can use the directory.
- Show name, designation and company only. Never phone, email, photo, industry or city on any directory screen, email or notification.

**Messages:**
- 1–1000 characters, plain text.
- Render as text (`{body}` with `white-space: pre-wrap`). Never `{@html}`, never auto-linked.

**Notification and email copy:**
- Notification: title `New message from <full name>`, body `Tap to read and reply`. No message text.
- Backup email subject: `<full name> sent you a message · Midtown Business Conclave`. No message text in the email.

**Limits:**
- At most 3 messages to someone until they reply.
- At most 30 new conversations per delegate per India day, counted in the database.

**Backup email:**
- Sent for every message, but at most one per conversation until the recipient has opened it.
- Daily cap: setting `emailCapPerDay`, default 50, counted per India day.
- Re-sent pass links never wait on the cap.

**Closing and clean-up:**
- The directory closes at `2026-12-12T23:59:59+05:30` by default. It's stored in the `settings` row `directory` and the organiser can change it.
- Messages are deleted 30 days after closing, on the first request after that date.

**Polling:**
- Every 10 s in an open conversation; every 30 s after 2 minutes with nothing new, and on other screens.
- No polling while the tab is hidden; poll once immediately when it becomes visible.

**Push:**
- Push is behind one switch: setting `pushEnabled`, default `false`.
- The browser permission prompt appears only after the delegate taps **Turn on notifications**.

**Code style:**
- Follow the repo:
  - tabs;
  - `#lib/...ts` imports with the `.ts` extension;
  - `$app/env` and `$app/env/private` for environment;
  - `ops.css` classes and `PublicShell` for participant pages;
  - `@lucide/svelte` icons;
  - British spelling (organiser);
  - plain, friendly copy.
- Mockup to match: `.superpowers/brainstorm/9176-1795190682/content/directory.html`, a local file that isn't committed.

**Testing:**
- Never create fake delegates in the production database.
- Test on a schema-only Neon branch, locally and on a Vercel preview.

**Git:**
- Work on branch `feature/visitor-directory`.
- Commit messages are one plain sentence, like the repo's history ("Add a website agenda managed from Event setup"), and end with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never push, open a PR, merge or touch the production database without the organiser's go-ahead in chat.

## Review Focus

The spec implies these situations, but no test covers them.

1. **Patchy venue Wi-Fi resends a message.**
   - Cause: a double tap, or a retried form post.
   - Expected: exactly one message appears.
   - Pinned by `isDuplicateSend` tests (Task 1), its use in the send action (Task 5), and the send button disabling while pending (Task 5 manual check).
2. **A stale conversation screen after being blocked or switched off.**
   - Cause: the other person blocks you, or the organiser stops your messaging, while your screen is open.
   - Expected: Send fails with the plain blocker sentence, never a 500 error, and the compose box is replaced on the next load.
   - Checked in Task 5 Step 9 and Task 8 Step 4.
3. **A phone still holding the cookie of a reissued pass.**
   - Expected: it sees the signed-out page with "Email me my pass link", not an error.
   - Checked in Task 4 Step 7.
4. **Tamil text, emoji and very long names or companies.**
   - Expected: messages and rows wrap without horizontal scrolling. A 1000-letter Tamil message is accepted, because database and JavaScript lengths agree for it.
   - Pinned by the `cleanBody` Tamil test (Task 1) and the 375 px checks (Task 4 Step 6, Task 5 Step 9).
5. **A message arrives while the tab is in the background.**
   - Expected: when the delegate comes back to the tab, the unread dot and the new message appear within a second, not after a full interval.
   - Checked in Task 5 Step 9.

---

### Task 1: Branch, test runner and directory rules

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/directory/rules.ts`
- Create: `src/lib/directory/rules.test.ts`
- Modify: `package.json` (script `"test": "vitest run"`, devDependency `vitest`)
- Modify: `.gitignore` (add `.superpowers/`)

**Interfaces:**
- Consumes: nothing. The rules module imports nothing from `$app` or the server.
- Produces (exported from `src/lib/directory/rules.ts`):
  ```ts
  export const DIRECTORY_PATH = '/visitorDirectory';
  export const MESSAGE_MAX = 1000;
  export const UNANSWERED_LIMIT = 3;
  export const NEW_CONVERSATIONS_PER_DAY = 30;
  export const PURGE_AFTER_DAYS = 30;

  export interface DirectorySettings { closesAt: string; emailCapPerDay: number; pushEnabled: boolean }
  export const DEFAULT_DIRECTORY_SETTINGS: DirectorySettings; // { closesAt: '2026-12-12T23:59:59+05:30', emailCapPerDay: 50, pushEnabled: false }
  export function parseDirectorySettings(value: unknown): DirectorySettings; // per field: keep valid values, default the rest; cap is an integer clamped to 0–1000

  export type Blocker = 'closed' | 'admin-off' | 'self-off' | 'you-blocked' | 'unavailable' | 'daily-limit' | 'wait-for-reply';
  export interface PersonFacts { paid: boolean; hidden: boolean; adminHidden: boolean; messagesOff: boolean; adminMessagesOff: boolean }
  export interface MessageFacts {
  	closed: boolean;
  	me: { messagesOff: boolean; adminMessagesOff: boolean; startedToday: number };
  	other: PersonFacts | null; // null: no such registration
  	iBlocked: boolean;
  	theyBlocked: boolean;
  	conversation: { mySent: number; theirSent: number } | null; // null: none yet
  }
  export function messageBlocker(f: MessageFacts): Blocker | null;
  export const BLOCKER_TEXT: Record<Blocker, string>;
  export function cleanBody(raw: string): string | null;
  export function isDuplicateSend(last: { body: string; at: string } | null, body: string, now: Date): boolean;
  export function shouldEmail(s: { emailedAt: Date | null; readAt: Date | null }): boolean;
  export function indiaDay(now: Date): string; // 'YYYY-MM-DD' in Asia/Kolkata
  export function isClosed(now: Date, closesAt: string): boolean;
  export function purgeDue(now: Date, closesAt: string): boolean;
  export function safeNext(next: string | null | undefined): string | null;
  export function canonicalDirectoryPath(pathname: string): string | null;
  export function pollDelay(s: { inConversation: boolean; quietMs: number }): number;
  export function matchesSearch(p: { fullName: string; companyName: string }, query: string): boolean;
  ```

- [ ] **Step 1: Create the branch and commit the spec and plan**

```bash
git switch -c feature/visitor-directory
printf '\n# Brainstorming companion files (local only)\n.superpowers/\n' >> .gitignore
git add .gitignore docs/superpowers/specs/2026-11-20-visitor-directory-design.md docs/superpowers/plans/2026-11-23-visitor-directory.md
git commit -m "Add the visitors directory design and build plan"
```

Expected: `git status --short` no longer lists `.superpowers/`.

- [ ] **Step 2: Install Vitest and add the config**

Run `npm view vitest@latest peerDependencies` and confirm its `vite` range includes 8. If it doesn't, use the newest version whose range does. Then run `npm install -D vitest@<that version>`.

Next, write `vitest.config.ts`, using `defineConfig` from `vitest/config`:
- `test.include` is `['src/**/*.test.ts']`.
- Use no SvelteKit plugin. The rules module needs none, and `#lib/*` resolves through `package.json` `imports`.

Finally, add `"test": "vitest run"` to `scripts`.

- [ ] **Step 3: Write the failing tests in `src/lib/directory/rules.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
	BLOCKER_TEXT, DEFAULT_DIRECTORY_SETTINGS, canonicalDirectoryPath, cleanBody, indiaDay, isClosed, isDuplicateSend,
	matchesSearch, messageBlocker, parseDirectorySettings, pollDelay, purgeDue, safeNext, shouldEmail, type MessageFacts
} from './rules.ts';

const person = { paid: true, hidden: false, adminHidden: false, messagesOff: false, adminMessagesOff: false };
const me = { messagesOff: false, adminMessagesOff: false, startedToday: 0 };
const base: MessageFacts = { closed: false, me, other: person, iBlocked: false, theyBlocked: false, conversation: null };
const f = (patch: Partial<MessageFacts>): MessageFacts => ({ ...base, ...patch });

describe('messageBlocker', () => {
	it('lets a paid delegate start a conversation', () => expect(messageBlocker(base)).toBeNull());
	it('stops everything once closed', () => expect(messageBlocker(f({ closed: true }))).toBe('closed'));
	it('puts the organiser switch before the delegate’s own', () =>
		expect(messageBlocker(f({ me: { ...me, messagesOff: true, adminMessagesOff: true } }))).toBe('admin-off'));
	it('stops sending when I turned messages off', () =>
		expect(messageBlocker(f({ me: { ...me, messagesOff: true } }))).toBe('self-off'));
	it('treats unknown and unpaid people as unavailable', () => {
		expect(messageBlocker(f({ other: null }))).toBe('unavailable');
		expect(messageBlocker(f({ other: { ...person, paid: false } }))).toBe('unavailable');
	});
	it('tells the blocker they blocked this person', () => expect(messageBlocker(f({ iBlocked: true }))).toBe('you-blocked'));
	it('shows being blocked exactly like messages off', () => {
		expect(messageBlocker(f({ theyBlocked: true }))).toBe('unavailable');
		expect(messageBlocker(f({ other: { ...person, messagesOff: true } }))).toBe('unavailable');
		expect(messageBlocker(f({ other: { ...person, adminMessagesOff: true } }))).toBe('unavailable');
	});
	it('makes existing conversations read-only when the other side is off', () =>
		expect(messageBlocker(f({ other: { ...person, messagesOff: true }, conversation: { mySent: 1, theirSent: 1 } }))).toBe('unavailable'));
	it('lets nobody start with a hidden person, but lets them get replies', () => {
		expect(messageBlocker(f({ other: { ...person, hidden: true } }))).toBe('unavailable');
		expect(messageBlocker(f({ other: { ...person, adminHidden: true } }))).toBe('unavailable');
		expect(messageBlocker(f({ other: { ...person, hidden: true }, conversation: { mySent: 0, theirSent: 1 } }))).toBeNull();
	});
	it('allows 30 new conversations a day, and replies beyond that', () => {
		expect(messageBlocker(f({ me: { ...me, startedToday: 29 } }))).toBeNull();
		expect(messageBlocker(f({ me: { ...me, startedToday: 30 } }))).toBe('daily-limit');
		expect(messageBlocker(f({ me: { ...me, startedToday: 30 }, conversation: { mySent: 1, theirSent: 1 } }))).toBeNull();
	});
	it('allows 3 messages until the other person replies', () => {
		expect(messageBlocker(f({ conversation: { mySent: 2, theirSent: 0 } }))).toBeNull();
		expect(messageBlocker(f({ conversation: { mySent: 3, theirSent: 0 } }))).toBe('wait-for-reply');
		expect(messageBlocker(f({ conversation: { mySent: 9, theirSent: 1 } }))).toBeNull();
	});
	it('uses the organiser’s wording for admin-off', () =>
		expect(BLOCKER_TEXT['admin-off']).toBe('Messaging has been turned off for your pass. Speak to the registration desk.'));
});

describe('cleanBody', () => {
	it('trims and keeps line breaks', () => expect(cleanBody('  hi\r\nthere  ')).toBe('hi\nthere'));
	it('rejects empty text', () => expect(cleanBody(' \n ')).toBeNull());
	it('accepts 1000 characters and rejects 1001', () => {
		expect(cleanBody('a'.repeat(1000))).toBe('a'.repeat(1000));
		expect(cleanBody('a'.repeat(1001))).toBeNull();
	});
	it('accepts 1000 Tamil letters', () => expect(cleanBody('அ'.repeat(1000))).not.toBeNull());
});

describe('isDuplicateSend', () => {
	const now = new Date('2026-11-28T10:00:10Z');
	it('catches the same text within 10 seconds', () =>
		expect(isDuplicateSend({ body: 'Hello', at: '2026-11-28T10:00:02Z' }, 'Hello', now)).toBe(true));
	it('allows the same text later, or different text', () => {
		expect(isDuplicateSend({ body: 'Hello', at: '2026-11-28T09:59:59Z' }, 'Hello', now)).toBe(false);
		expect(isDuplicateSend({ body: 'Hello', at: '2026-11-28T10:00:09Z' }, 'Hi', now)).toBe(false);
		expect(isDuplicateSend(null, 'Hello', now)).toBe(false);
	});
});

describe('shouldEmail', () => {
	const t = (s: string) => new Date(`2026-11-28T${s}:00Z`);
	it('emails the first time', () => expect(shouldEmail({ emailedAt: null, readAt: null })).toBe(true));
	it('waits while an emailed message is unread', () => {
		expect(shouldEmail({ emailedAt: t('10:00'), readAt: null })).toBe(false);
		expect(shouldEmail({ emailedAt: t('10:00'), readAt: t('09:00') })).toBe(false);
	});
	it('emails again once they have read it', () => expect(shouldEmail({ emailedAt: t('10:00'), readAt: t('10:05') })).toBe(true));
});

describe('dates', () => {
	it('counts days in India time', () => {
		expect(indiaDay(new Date('2026-11-27T18:29:59Z'))).toBe('2026-11-27');
		expect(indiaDay(new Date('2026-11-27T18:30:00Z'))).toBe('2026-11-28');
	});
	it('closes after the end of 12 December in India', () => {
		const closes = DEFAULT_DIRECTORY_SETTINGS.closesAt;
		expect(isClosed(new Date('2026-12-12T18:29:58Z'), closes)).toBe(false);
		expect(isClosed(new Date('2026-12-12T18:30:00Z'), closes)).toBe(true);
	});
	it('purges 30 days after closing', () => {
		const closes = DEFAULT_DIRECTORY_SETTINGS.closesAt;
		expect(purgeDue(new Date('2027-01-11T18:29:00Z'), closes)).toBe(false);
		expect(purgeDue(new Date('2027-01-11T18:31:00Z'), closes)).toBe(true);
	});
});

describe('parseDirectorySettings', () => {
	it('defaults everything when missing', () => expect(parseDirectorySettings(undefined)).toEqual(DEFAULT_DIRECTORY_SETTINGS));
	it('keeps valid fields and repairs bad ones', () =>
		expect(parseDirectorySettings({ closesAt: 'soon', emailCapPerDay: 2000.7, pushEnabled: true })).toEqual({
			closesAt: DEFAULT_DIRECTORY_SETTINGS.closesAt,
			emailCapPerDay: 1000,
			pushEnabled: true
		}));
});

describe('safeNext', () => {
	it('keeps local paths', () => {
		expect(safeNext('/visitorDirectory/0b6f6a9e-1c1e-4c1a-9d1e-2b8e0a7f1c33')).toBe('/visitorDirectory/0b6f6a9e-1c1e-4c1a-9d1e-2b8e0a7f1c33');
		expect(safeNext('/me')).toBe('/me');
	});
	it('rejects anything that could leave the site', () => {
		for (const bad of [null, undefined, '', 'visitorDirectory', 'https://evil.example', '//evil.example', '/\\evil.example', '/a\nb'])
			expect(safeNext(bad)).toBeNull();
	});
});

describe('canonicalDirectoryPath', () => {
	it('fixes the casing', () => {
		expect(canonicalDirectoryPath('/visitordirectory')).toBe('/visitorDirectory');
		expect(canonicalDirectoryPath('/VISITORDIRECTORY/abc')).toBe('/visitorDirectory/abc');
	});
	it('leaves correct and unrelated paths alone', () => {
		expect(canonicalDirectoryPath('/visitorDirectory/abc')).toBeNull();
		expect(canonicalDirectoryPath('/visitordirectoryx')).toBeNull();
		expect(canonicalDirectoryPath('/me')).toBeNull();
	});
});

describe('pollDelay', () => {
	it('polls fast in an active conversation, then slows', () => {
		expect(pollDelay({ inConversation: true, quietMs: 60_000 })).toBe(10_000);
		expect(pollDelay({ inConversation: true, quietMs: 120_000 })).toBe(30_000);
		expect(pollDelay({ inConversation: false, quietMs: 0 })).toBe(30_000);
	});
});

describe('matchesSearch', () => {
	const p = { fullName: 'Priya Raman', companyName: 'Kaveri Textiles' };
	it('matches name or company, any case', () => {
		expect(matchesSearch(p, ' priya ')).toBe(true);
		expect(matchesSearch(p, 'TEXT')).toBe(true);
		expect(matchesSearch(p, '')).toBe(true);
		expect(matchesSearch(p, 'salem')).toBe(false);
	});
});
```

- [ ] **Step 4: Run the tests and see them fail**

Run: `npm test`
Expected: FAIL, because `./rules.ts` doesn't exist.

- [ ] **Step 5: Implement `src/lib/directory/rules.ts`**

**`messageBlocker`** checks in this order and returns the first that applies:
1. `closed` → `'closed'`
2. `me.adminMessagesOff` → `'admin-off'`
3. `me.messagesOff` → `'self-off'`
4. `!other || !other.paid` → `'unavailable'`
5. `iBlocked` → `'you-blocked'`
6. `theyBlocked || other.messagesOff || other.adminMessagesOff` → `'unavailable'`
7. With no conversation:
   - `other.hidden || other.adminHidden` → `'unavailable'`;
   - `me.startedToday >= 30` → `'daily-limit'`.
8. With a conversation where `theirSent === 0 && mySent >= 3` → `'wait-for-reply'`.
9. Otherwise `null`.

**`BLOCKER_TEXT`** copy (exact):
- `closed`: "The visitors directory has closed. Thank you for joining us."
- `admin-off`: "Messaging has been turned off for your pass. Speak to the registration desk."
- `self-off`: "You've turned messages off. Turn them back on in My pass to send and receive messages."
- `you-blocked`: "You blocked this person. Unblock them to send a message."
- `unavailable`: "Not taking messages."
- `daily-limit`: "You've started 30 conversations today. You can start more tomorrow."
- `wait-for-reply`: "You can send more once they reply."

**Other functions:**
- `indiaDay` uses `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })`.
- `safeNext` accepts only strings that:
  - start with `/`;
  - don't start with `//`;
  - contain no `\` and no control characters;
  - are at most 300 characters long.
- `canonicalDirectoryPath` matches `^/visitordirectory(/|$)` case-insensitively. It returns `'/visitorDirectory' + rest` unless the path already starts with `/visitorDirectory` exactly.

- [ ] **Step 6: Run the tests and see them pass**

Run: `npm test && npm run check`
Expected: all tests pass, and svelte-check reports 0 errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/directory/rules.ts src/lib/directory/rules.test.ts
git commit -m "Add the visitors directory rules with unit tests"
```

---

### Task 2: Database tables, settings and test data

**Files:**
- Modify: `db/schema.sql` (append the section below)
- Modify: `src/lib/server/store.ts` (export the existing private `readSetting` and `writeSetting`)
- Create: `src/lib/server/directory/settings.ts`
- Create: `db/directory-test-seed.sql`

**Interfaces:**
- Consumes: `parseDirectorySettings` and `DirectorySettings` (Task 1); `readSetting`, `writeSetting` (store.ts); `opsReady` (ops/event.ts).
- Produces:
  ```ts
  // src/lib/server/directory/settings.ts
  export async function directoryReady(): Promise<boolean>; // opsReady() and to_regclass('public.directory_messages') is not null; caches only a true answer, like opsReady
  export async function getDirectorySettings(): Promise<DirectorySettings>; // parseDirectorySettings(await readSetting('directory'))
  export async function saveDirectorySettings(s: DirectorySettings, by: string): Promise<void>;
  ```

- [ ] **Step 1: Append the directory tables to `db/schema.sql`**

```sql
-- ============================================================================
-- Visitors directory (/visitorDirectory): paid delegates find each other and
-- exchange text messages on the site. Pairs are stored once (a_id < b_id), as in
-- participant_connections. Closing time, daily email cap and the push switch are
-- the "directory" row in settings.
-- ============================================================================

-- The delegate's own choices, and the organiser's overrides (the delegate cannot
-- undo those). No row means all false.
create table if not exists directory_members (
  registration_id    uuid primary key references registrations (id) on delete cascade,
  hidden             boolean not null default false,
  messages_off       boolean not null default false,
  admin_hidden       boolean not null default false,
  admin_messages_off boolean not null default false,
  updated_at         timestamptz not null default now()
);

create table if not exists directory_blocks (
  blocker_id uuid not null references registrations (id) on delete cascade,
  blocked_id uuid not null references registrations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists directory_blocks_blocked_idx on directory_blocks (blocked_id);

-- One conversation per pair. <side>_read_at: when that side last opened it.
-- <side>_emailed_at: when that side was last sent a backup email for it; no new
-- email goes while that is later than their read_at.
create table if not exists directory_conversations (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events (id) on delete cascade,
  a_id            uuid not null references registrations (id) on delete cascade,
  b_id            uuid not null references registrations (id) on delete cascade,
  started_by      uuid not null references registrations (id) on delete cascade,
  last_sender_id  uuid references registrations (id) on delete set null,
  last_message_at timestamptz not null default now(),
  a_read_at       timestamptz,
  b_read_at       timestamptz,
  a_emailed_at    timestamptz,
  b_emailed_at    timestamptz,
  created_at      timestamptz not null default now(),
  check (a_id < b_id),
  unique (event_id, a_id, b_id)
);
create index if not exists directory_conversations_b_idx on directory_conversations (event_id, b_id);
create index if not exists directory_conversations_started_idx on directory_conversations (started_by, created_at);

create table if not exists directory_messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references directory_conversations (id) on delete cascade,
  sender_id       uuid not null references registrations (id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 1000),
  created_at      timestamptz not null default now()
);
create index if not exists directory_messages_conversation_idx on directory_messages (conversation_id, id);

-- Backup emails sent per India date, for the daily cap.
create table if not exists directory_email_days (
  day  date primary key,
  sent int not null default 0
);

-- Browsers that turned on notifications; removed when the push service answers 404 or 410.
create table if not exists push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations (id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  created_at      timestamptz not null default now()
);
create index if not exists push_subscriptions_registration_idx on push_subscriptions (registration_id);
```

- [ ] **Step 2: Implement `settings.ts` and export the two store helpers**

Follow `opsReady()` in `src/lib/server/ops/event.ts` for the readiness check and its caching. Until the schema is rerun, `directoryReady()` is `false` and the page shows "The visitors directory opens soon." (Task 4).

- [ ] **Step 3: Write `db/directory-test-seed.sql`**

This file is for the test branch only, and its header comment says so.

- Insert 6 `status = 'paid'` registrations. Each needs values that pass the `registrations` constraints in `db/schema.sql` lines 4–92:
  - codes `MBC-DTEST1` … `MBC-DTEST6`;
  - phones `+919000000001` … `+919000000006`;
  - `photo_key` `'test/none.jpg'`;
  - 1–5 interests;
  - `consent` true.
- Include one name of 40 characters and one company name of 44 characters.
- Include one Tamil name.
- Use emails `TEAM_EMAIL_1` … `TEAM_EMAIL_6` as literal placeholders. The executor substitutes team-controlled addresses supplied by the organiser when running it. Never commit real addresses.
- Guard at the top: a `do $$ … $$` block that raises an exception if `registrations` already has any row whose code doesn't start with `MBC-DTEST`. So it can never run against a database with real delegates.

- [ ] **Step 4: Create the test branch and run the schema and seed there**

This needs the organiser.
- Ask them to create a **schema-only** Neon branch named `directory-test` (Neon console → Branches → New branch → "Schema only"), or ask permission to create it with the Neon tools.
- On that branch only: run `db/schema.sql`, then the seed with placeholders replaced.

Put the branch connection string in `.env.development.local`, which is gitignored by `.env.*`, along with:
- `RESEND_API_KEY=` and `EMAIL_FROM=` set empty, so dev prints emails to the terminal;
- `PASS_SECRET=` set empty, so the dev secret is used.

Check: `grep DATABASE_URL .env.development.local | sed 's/:[^:@]*@/:***@/'`. It must show the branch's endpoint host, which is different from the one in `.env`.

Expected: `select count(*) from registrations` on the branch returns 6.

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql db/directory-test-seed.sql src/lib/server/store.ts src/lib/server/directory/settings.ts
git commit -m "Add the visitors directory tables and settings"
```

---

### Task 3: Sign-in links that return to the directory, plus request plumbing

**Files:**
- Modify: `src/lib/server/ops/passes.ts` (`accessPath` gets `next`; add `signInLink`)
- Modify: `src/routes/me/[access]/+server.ts` (honour `next`)
- Modify: `src/hooks.server.ts` (casing redirect; `no-store` and `noindex` for `/visitorDirectory`)
- Modify: `src/lib/server/email.ts` (add `sendSignInEmail`)
- Create: `src/lib/server/background.ts`
- Modify: `package.json` (dependency `@vercel/functions`)

**Interfaces:**
- Consumes: `safeNext`, `canonicalDirectoryPath`, `DIRECTORY_PATH` (Task 1).
- Produces:
  ```ts
  // passes.ts
  export async function accessPath(code: string, registrationId: string, version: number, next?: string): Promise<string>; // appends ?next=<encoded> when given
  export async function signInLink(reg: { id: string; code: string }, origin: string, next: string): Promise<string | null>; // null when passes aren't set up; uses getDefaultEvent + ensurePass
  // email.ts
  export async function sendSignInEmail(reg: Registration, link: string): Promise<string>;
  // background.ts
  export function background(event: RequestEvent, task: () => Promise<unknown>): void;
  ```

- [ ] **Step 1: Add `next` to `accessPath` and create `signInLink`**

Existing callers pass three arguments and keep working unchanged.

- [ ] **Step 2: Make `/me/[access]` redirect to `safeNext(url.searchParams.get('next')) ?? '/me'`**

The invalid-link redirect stays `/me?link=invalid`.

- [ ] **Step 3: Add the casing redirect and headers in `hooks.server.ts`**

- At the top of `handle`: if `canonicalDirectoryPath(pathname)` returns a path, `redirect(308, path + event.url.search)`.
- Add `pathname.startsWith(DIRECTORY_PATH)` to the list that sets `cache-control: no-store` and `x-robots-tag: noindex`.

- [ ] **Step 4: Write `sendSignInEmail` using `layout()`**

- Subject: `Your link to the visitors directory · ${EVENT.name}`
- Title: `Open the visitors directory`
- Body: one paragraph, "Tap the button on the phone you want to use. It signs you in to your pass and the visitors directory."
- Gold button: **Open the visitors directory**, linking to `link`. Copy the button style from `passHtml`.
- Small print: "Keep this link to yourself: it signs you in to your pass."
- Plain-text version: the same sentences with the link written out.

- [ ] **Step 5: Install `@vercel/functions` and write `background()`**

1. Run `npm install @vercel/functions`.
2. `background()` starts `task()` and attaches a `.catch` that logs `[background]` plus the error.
3. It hands the promise to `waitUntil` from `@vercel/functions`, which does nothing outside Vercel.
4. It also hands it to `(event.platform as any)?.context?.waitUntil` when that exists (Cloudflare).
5. It never throws.

- [ ] **Step 6: Verify**

Run: `npm test && npm run check`. Expected: pass, 0 errors.

Run: `npm run dev`, then open `http://localhost:5173/VisitorDirectory`. Expected: a 308 to `/visitorDirectory`. That page is still a 404 until Task 4.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/ops/passes.ts "src/routes/me/[access]/+server.ts" src/hooks.server.ts src/lib/server/email.ts src/lib/server/background.ts package.json package-lock.json
git commit -m "Let pass links return delegates to the visitors directory"
```

---

### Task 4: The directory page: guards, sign-in by email and the People list

**Files:**
- Create: `src/lib/server/directory/people.ts`
- Create: `src/lib/server/directory/viewer.ts`
- Create: `src/routes/visitorDirectory/+page.server.ts`
- Create: `src/routes/visitorDirectory/+page.svelte`
- Create: `src/lib/components/directory/PersonRow.svelte`

**Interfaces:**
- Consumes:
  - `directoryReady`, `getDirectorySettings` (Task 2);
  - `signInLink`, `sendSignInEmail` (Task 3);
  - `isClosed`, `matchesSearch` (Task 1);
  - `readParticipant`, `PARTICIPANT_COOKIE` (passes.ts);
  - `findByEmail`, `getRegistration` (store.ts);
  - `allow` (rate-limit.ts);
  - `publicOrigin` (site.ts).
- Produces:
  ```ts
  // people.ts
  export interface MemberFlags { hidden: boolean; messagesOff: boolean; adminHidden: boolean; adminMessagesOff: boolean }
  export interface DirectoryPerson { id: string; fullName: string; designation: string; companyName: string; takesMessages: boolean }
  export async function memberFlags(registrationId: string): Promise<MemberFlags>; // all false when no row
  export async function listPeople(me: string): Promise<DirectoryPerson[]>;
  // viewer.ts
  export interface Member { id: string; code: string; fullName: string; designation: string; companyName: string; flags: MemberFlags }
  export type Viewer =
  	| { state: 'not-ready' } | { state: 'signed-out' } | { state: 'unpaid' }
  	| { state: 'closed'; settings: DirectorySettings }
  	| { state: 'open'; eventId: string; me: Member; settings: DirectorySettings };
  export async function directoryViewer(cookies: Cookies): Promise<Viewer>;
  ```

- [ ] **Step 1: Implement `listPeople(me)`, one query**

- Paid registrations, excluding:
  - `me`;
  - anyone with `hidden` or `admin_hidden` set;
  - anyone in a `directory_blocks` row with `me` in either direction.
- Order by `lower(full_name)`.
- `takesMessages` is `not (messages_off or admin_messages_off)`.
- Select only `id, full_name, designation, company_name` plus the flags. Never select phone or email.

- [ ] **Step 2: Implement `directoryViewer(cookies)`**

Check in order:
1. `!(await directoryReady())` → `not-ready`
2. no `readParticipant` → `signed-out`
3. registration missing → `signed-out`
4. not paid → `unpaid`
5. `isClosed(new Date(), settings.closesAt)` → `closed`
6. otherwise `open`, with `getDefaultEvent().id`.

- [ ] **Step 3: Write the load and the `sendLink` action in `+page.server.ts`**

**Load:**
- Call `depends('directory:list')`.
- Return the viewer state, plus for `open`: `me` and `people`. Task 5 adds `conversations` and `unread`; Task 9 adds `push`.

**`sendLink` action (form field `email`):**
- Rate limits: `allow('dirlink:ip:' + getClientAddress(), 10, 600_000)` and `allow('dirlink:email:' + email.toLowerCase(), 3, 1_800_000)`. When limited, return `fail(429, { message: 'Too many requests. Try again in a few minutes.' })`.
- If `findByEmail` finds a paid registration and `signInLink(reg, publicOrigin(url), '/visitorDirectory')` returns a link, send it inside `background(event, …)`.
- Always return `{ sent: true }`. The page then shows "If that email is registered, we've sent your link." It never reveals whether an address is registered.

- [ ] **Step 4: Build `+page.svelte` and `PersonRow.svelte`**

Wrap the page in `PublicShell subtitle="Visitors directory"`.

**What each state shows:**
- `not-ready`: "The visitors directory opens soon."
- `signed-out`: Screen 4 of the spec:
  - title "Open your pass on this phone first.";
  - text: tap **Open my pass** in your ticket email on this phone;
  - field "Email you registered with" and button **Email me my pass link**.
- `unpaid`: "Your payment isn't confirmed yet. The directory opens once it is."
- `closed`: `BLOCKER_TEXT.closed`.
- `open`: Screen 1 of the spec:
  - header "Visitors directory" with "{n} people registered";
  - one search box, filtered on the phone with `matchesSearch`;
  - rows of initials avatar, name, then "Designation · Company" on the second line, and a message icon link to `/visitorDirectory/{id}`;
  - when `!takesMessages`, a disabled button labelled "Not taking messages".

**Tabs:**
- People and Messages are links to `?tab=people` and `?tab=messages`, so the Back button works.
- The Messages tab stays empty until Task 5.

**Layout:** long text wraps with `overflow-wrap: anywhere`.

- [ ] **Step 5: Verify against the test branch**

Run: `npm run check`. Expected: 0 errors.

Then run `npm run dev` and work through these:
- Open `/visitorDirectory`. Expected: the signed-out page.
- Submit a seeded email. Expected: the terminal prints the sign-in email.
- Open its link. Expected: you land on `/visitorDirectory`, signed in, and see 5 people (not yourself), sorted A–Z.
- Search matches by name and by company.

- [ ] **Step 6: Check the 375 px layout**

Use the browser pane at 375 × 812 (`resize_window` preset `mobile`). Expected:
- the 40-character name and 44-character company wrap;
- there's no horizontal scroll;
- the Tamil name renders.

Reset with preset `desktop`.

- [ ] **Step 7: Check a stale cookie**

Run `update participant_qr_tokens set revoked_at = now()` for your test delegate on the branch, then reload. Expected: the signed-out page, not an error.

Re-sign in through **Email me my pass link**. `ensurePass` issues a new version.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/directory/people.ts src/lib/server/directory/viewer.ts src/routes/visitorDirectory src/lib/components/directory/PersonRow.svelte
git commit -m "Add the visitors directory list with email sign-in"
```

---

### Task 5: Conversations, the Messages tab and polling

**Files:**
- Create: `src/lib/server/directory/messages.ts`
- Create: `src/routes/visitorDirectory/[person]/+page.server.ts`
- Create: `src/routes/visitorDirectory/[person]/+page.svelte`
- Create: `src/routes/api/directory/poll/+server.ts`
- Create: `src/lib/directory/poller.svelte.ts`
- Modify: `src/routes/visitorDirectory/+page.server.ts` and `+page.svelte` (Messages tab, unread count)
- Modify: `src/lib/server/directory/people.ts` (add `block`, `unblock`)

**Interfaces:**
- Consumes:
  - `messageBlocker`, `BLOCKER_TEXT`, `cleanBody`, `isDuplicateSend`, `shouldEmail`, `indiaDay`, `pollDelay`, `purgeDue` (Task 1);
  - `directoryViewer`, `Member`, `DirectoryPerson`, `memberFlags` (Task 4);
  - `audit` (event.ts);
  - `allow`.
- Produces:
  ```ts
  // messages.ts
  export interface ChatMessage { id: number; mine: boolean; body: string; at: string }
  export interface ConversationSummary { personId: string; fullName: string; designation: string; companyName: string; lastAt: string; preview: string; unread: boolean }
  export interface Thread {
  	person: DirectoryPerson | null; // null when not a paid registration
  	facts: MessageFacts;
  	conversationId: string | null;
  	myLast: { body: string; at: string } | null;
  }
  export async function loadThread(eventId: string, me: Member, otherId: string, closed: boolean): Promise<Thread>;
  export async function sendMessage(eventId: string, me: string, otherId: string, body: string): Promise<{ message: ChatMessage; conversationId: string; emailDue: boolean }>;
  export async function messagesIn(conversationId: string, me: string, afterId?: number): Promise<ChatMessage[]>; // ascending, at most the last 200; [] unless `me` is a_id or b_id
  export async function markRead(conversationId: string, me: string): Promise<void>; // sets my side's read_at; no-op unless I'm in it
  export async function listConversations(eventId: string, me: string): Promise<ConversationSummary[]>;
  export async function unreadCount(eventId: string, me: string): Promise<number>;
  export async function pollState(eventId: string, me: string): Promise<{ unread: number; latest: string | null }>;
  export async function purgeIfDue(settings: DirectorySettings): Promise<void>;
  // people.ts additions
  export async function block(eventId: string, me: string, other: string): Promise<void>;   // audit action 'directory.block'
  export async function unblock(eventId: string, me: string, other: string): Promise<void>; // audit action 'directory.unblock'
  // poller.svelte.ts
  export function startPolling(opts: { inConversation: boolean; tick: () => Promise<boolean /* something new */> }): () => void; // returns stop()
  ```

- [ ] **Step 1: Implement `loadThread`**

It fills `MessageFacts` from at most two queries:
- the other registration's paid status and name fields;
- both people's `directory_members` flags;
- blocks in both directions;
- the conversation (looked up by `pair(me, other)` ordering), with message counts per sender;
- `myLast`;
- `startedToday`: conversations with `started_by = me` and `created_at >= (<indiaDay> || 'T00:00:00+05:30')::timestamptz`.

- [ ] **Step 2: Implement `sendMessage`**

1. Upsert the conversation: on conflict, update `last_message_at = now()` and `last_sender_id = me`, and set the sender's `<side>_read_at = now()`.
2. Insert the message.
3. Return `emailDue = shouldEmail({ emailedAt: recipient emailed_at, readAt: recipient read_at })`, read from the upserted row.

Two round trips are fine. Copy the pair ordering from `pair()` in `networking.ts`. Don't export it from there.

- [ ] **Step 3: Implement the remaining queries**

- **`listConversations`:**
  - Newest `last_message_at` first.
  - Exclude people I've blocked.
  - `preview` is the first line of the last message, cut to 80 characters.
  - `unread` is `last_sender_id <> me and last_message_at > coalesce(my read_at, '-infinity')`.
- **`unreadCount`** counts those rows.
- **`pollState`** returns the same count and `max(last_message_at)`. It's a single query on the conversation indexes.
- **`purgeIfDue`**, once per server instance after `purgeDue` is true: delete all rows from `directory_messages`, `directory_conversations`, `push_subscriptions` and `directory_email_days`. Then `audit` the action `'directory.purge'` with actor type `'system'`.

- [ ] **Step 4: Write the conversation page server**

**Load:**
- Only `open` viewers. Otherwise return the viewer state; the page reuses the directory's state screens.
- Reject an invalid `params.person` UUID with 404. Return 404 when `loadThread` gives `person: null`, or when the person has blocked me and there's no conversation.
- Call `markRead` when a conversation exists.
- Return: `person`, `messages`, `blocker = messageBlocker(facts)`, `iBlocked`, `conversationId`.

**Actions:**
- **`send`** (field `body`), in order:
  1. `allow('dirsend:' + me, 20, 60_000)`;
  2. `cleanBody`;
  3. `loadThread`;
  4. `messageBlocker`, failing with `fail(409, { message: BLOCKER_TEXT[blocker] })`;
  5. `isDuplicateSend(myLast, body, new Date())`, which returns success without inserting;
  6. `sendMessage`.

  Task 6 hooks notifications onto the result.
- **`block`** and **`unblock`**: these redirect to `/visitorDirectory?tab=messages` after blocking, and back to the conversation after unblocking.

In the directory page's load (`src/routes/visitorDirectory/+page.server.ts`), when `viewer.state === 'closed'`, call `background(event, () => purgeIfDue(viewer.settings))`.

- [ ] **Step 5: Build the conversation page**

This is Screen 3 of the spec.

**Header and notes:**
- A back arrow to `/visitorDirectory?tab=messages`.
- The person's name and "Designation · Company".
- A menu with **Block**, or **Unblock** when `iBlocked`.
- A quiet note at the top: "Your phone number and email stay private."

**Messages:** bubbles with times in India time.

**Compose box:**
- A `textarea` with `maxlength=1000` and a Send button.
- Submit with `use:enhance`. Disable the button while the request is pending. Clear the box only on success.
- When `blocker` is set, replace the compose box with `BLOCKER_TEXT[blocker]`. For `you-blocked`, add an Unblock button.

**Link the conversation from the list:** the message icon in `PersonRow` and each Messages row both go to `/visitorDirectory/{personId}`.

- [ ] **Step 6: Write the poll endpoint and the poller**

**`GET /api/directory/poll`:**
- Non-`open` viewers get `json({ message: 'Sign in again.' }, { status: 401 })`.
- Otherwise it returns `pollState`.
- With `?conversation=<uuid>&after=<id>`, it also returns `messages` from `messagesIn`, and calls `markRead` when there are any.
- The conversation page gets `conversationId` from its load. After the first message, the form action's automatic `invalidateAll` reloads it.

**`startPolling`:**
- Waits `pollDelay({ inConversation, quietMs })` between ticks, resetting `quietMs` whenever `tick()` returns true.
- Stops while `document.visibilityState === 'hidden'`.
- Ticks immediately on `visibilitychange` to visible.
- Never runs two ticks at once.

**Using it:**
- The conversation page appends new messages.
- The directory page calls `invalidate('directory:list')` when `latest` changes, which updates the unread dot and the Messages list.

- [ ] **Step 7: Fill in the Messages tab**

- The directory load adds `conversations` and `unread`.
- The tab label shows the unread count.
- Rows show: name, "Designation · Company", last time, preview, and an unread dot.

- [ ] **Step 8: Verify the basics**

Run: `npm test && npm run check`. Expected: pass, 0 errors.

- [ ] **Step 9: Verify with two browsers**

Use `npm run dev` against the branch, with two browser profiles signed in as two seeded delegates.

**Sending and receiving:**
- A sends; B's Messages tab shows the unread dot within 30 s.
- Hide B's tab for a minute, then show it. Expected: the dot appears within a second.

**Limits:**
- A sends 3 messages without a reply; the fourth shows "You can send more once they reply."
- Double-clicking Send stores one message.

**Blocking:**
- B blocks A. Expected:
  - A's open screen fails the next send with "Not taking messages." and no error page;
  - A disappears from B's list and Messages tab;
  - B disappears from A's list.
- Unblocking restores both.

**Layout:** check at 375 px that a 1000-character Tamil message wraps.

- [ ] **Step 10: Commit**

```bash
git add src/lib/server/directory src/routes/visitorDirectory src/routes/api/directory src/lib/directory/poller.svelte.ts
git commit -m "Add visitors directory conversations with polling"
```

---

### Task 6: Backup email with the daily cap

**Files:**
- Create: `src/lib/server/directory/notify.ts`
- Modify: `src/lib/server/email.ts` (add `sendMessageEmail`)
- Modify: `src/lib/server/directory/messages.ts` (add `markEmailed`)
- Modify: `src/routes/visitorDirectory/[person]/+page.server.ts` (call `notifyRecipient` in `background`)

**Interfaces:**
- Consumes:
  - `sendMessage` result (Task 5);
  - `signInLink` (Task 3);
  - `getRegistration`;
  - `indiaDay`;
  - `background` (Task 3).
- Produces:
  ```ts
  // email.ts
  export async function sendMessageEmail(to: string, from: { fullName: string; designation: string; companyName: string }, link: string): Promise<string>;
  // messages.ts
  export async function markEmailed(conversationId: string, recipientId: string): Promise<void>; // sets the recipient side's emailed_at = now()
  // notify.ts
  export async function takeEmailSlot(cap: number, now?: Date): Promise<boolean>;
  export async function notifyRecipient(n: {
  	origin: string; sender: Member; recipientId: string; conversationId: string; emailDue: boolean; settings: DirectorySettings;
  }): Promise<void>;
  ```

- [ ] **Step 1: Write `sendMessageEmail` with `layout()`**

- Subject: `${from.fullName} sent you a message · ${EVENT.name}`
- Title: `You have a new message`
- Body: "{fullName}, {designation} at {companyName}, sent you a message in the visitors directory."
- Gold button: **Read and reply**, linking to `link`.
- Small print: "Your phone number and email stay private. We won't email you about this conversation again until you've read it."
- Plain-text version with the link written out.
- Escape every value with `escape()`.
- No message text anywhere.

- [ ] **Step 2: Implement `takeEmailSlot`**

1. Return `false` when `cap <= 0`.
2. Otherwise run one statement:
   `insert into directory_email_days (day, sent) values (<indiaDay(now)>, 1) on conflict (day) do update set sent = directory_email_days.sent + 1 where directory_email_days.sent < <cap> returning sent`.
3. Return `true` when a row comes back.

- [ ] **Step 3: Implement `notifyRecipient`**

1. If `emailDue` and `takeEmailSlot(settings.emailCapPerDay)`:
   - load the recipient;
   - build the link with `signInLink(recipient, origin, '/visitorDirectory/' + sender.id)`;
   - call `sendMessageEmail(recipient.email, sender, link)`;
   - call `markEmailed`.
2. Catch and log every failure. Never throw, because the message is already saved.

Task 9 adds push to this same function.

- [ ] **Step 4: Call it after a successful send**

Inside the `send` action: `background(event, () => notifyRecipient({ origin: publicOrigin(url), … }))`.

- [ ] **Step 5: Verify with dev and two browsers**

Use `npm run dev`. Resend isn't configured, so emails print to the terminal.

**One email until read:**
- A sends twice. Expected: one email printed for B. The subject has A's name; there's no message text.
- Open the email's link in B's browser. Expected: you land on the conversation with A.
- A sends again. Expected: a second email.

**The cap:**
- On the branch, run: `update settings set value = jsonb_set(coalesce(value,'{}'), '{emailCapPerDay}', '1') where key = 'directory'`. If there's no row, insert `{"emailCapPerDay":1}`.
- A new conversation sends no email, and the message still arrives in B's Messages tab.
- Reset afterwards: `delete from directory_email_days`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/directory/notify.ts src/lib/server/directory/messages.ts src/lib/server/email.ts "src/routes/visitorDirectory/[person]/+page.server.ts"
git commit -m "Email delegates when they get a directory message"
```

---

### Task 7: Delegate controls on My pass

**Files:**
- Modify: `src/lib/server/directory/people.ts` (add `setOwnFlags`, `listBlocked`)
- Modify: `src/routes/me/+page.server.ts` (load and actions)
- Modify: `src/routes/me/+page.svelte` (a "Visitors directory" card)

**Interfaces:**
- Consumes: `directoryReady`, `memberFlags`, `unblock`, `unreadCount`, `getDefaultEvent`.
- Produces:
  ```ts
  export async function setOwnFlags(eventId: string, me: string, flags: { hidden: boolean; messagesOff: boolean }): Promise<void>; // upsert; audit 'directory.settings'
  export async function listBlocked(me: string): Promise<{ id: string; fullName: string; companyName: string }[]>;
  ```

- [ ] **Step 1: Add the directory data to the `/me` load**

- When `directoryReady()` and the delegate is paid, add `directory: { unread, flags, blocked }`. Otherwise `directory: null`.
- Add actions:
  - `directorySettings`: checkbox fields `listed` and `messages`, stored inverted as `hidden` and `messagesOff`;
  - `unblockPerson`: field `other`, a UUID checked like `isUuid`.
- Both use `participant(cookies)` like the existing actions.

- [ ] **Step 2: Add the "Visitors directory" card after the Connect section**

- A link to `/visitorDirectory` with the unread count, e.g. "Open the visitors directory (2 unread)".
- Switches:
  - "Show me in the directory";
  - "Let delegates message me", with the hint "Turning this off also stops you sending, and makes your conversations read-only."
- When `flags.adminHidden` or `flags.adminMessagesOff` is set, show the matching switch disabled with "Messaging has been turned off for your pass. Speak to the registration desk." The delegate's own values are kept and apply again when the organiser switch is cleared.
- The blocked list, with **Unblock** buttons.

- [ ] **Step 3: Verify**

Run `npm run check` (expected: 0 errors), then check in dev:
- Turning "Let delegates message me" off for B:
  - A sees B's row disabled with "Not taking messages";
  - B's own conversations show the self-off sentence;
  - turning it back on restores everything.
- "Show me in the directory" off hides B from A's list, but A can still reply in an existing conversation.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/directory/people.ts src/routes/me/+page.server.ts src/routes/me/+page.svelte
git commit -m "Add visitors directory controls to My pass"
```

---

### Task 8: Organiser controls

**Files:**
- Modify: `src/lib/server/directory/people.ts` (add `setAdminFlags`, `adminFlagsFor`)
- Modify: `src/routes/admin/+page.server.ts` and `src/routes/admin/+page.svelte` (switches in the registration details)
- Modify: `src/routes/admin/event-setup/+page.server.ts` and `+page.svelte` (a "Visitors directory" panel)

**Interfaces:**
- Consumes: `getDirectorySettings`, `saveDirectorySettings`, `directoryReady`, `audit`, `getDefaultEvent`.
- Produces:
  ```ts
  export async function setAdminFlags(eventId: string, registrationId: string, flags: { adminHidden: boolean; adminMessagesOff: boolean }, by: string): Promise<void>; // upsert; audit actorType 'admin', action 'directory.admin_flags'
  export async function adminFlagsFor(ids: string[]): Promise<Record<string, { adminHidden: boolean; adminMessagesOff: boolean }>>;
  ```

- [ ] **Step 1: Add the registration switches to the dashboard**

- The admin load adds `directoryFlags: await adminFlagsFor(table.rows.map((r) => r.id))` when `directoryReady()`, and `null` otherwise.
- New action `directoryFlags`: fields `id`, `hide`, `stop`; requires `locals.admin`; success message "Saved the visitors directory switches for {name}."
- In the details panel of a paid registration, just above `.delete-zone`, add a small form titled "Visitors directory". It has two checkboxes, **Hide from directory** and **Stop messaging**, and a Save button, using the existing `act()` and `working()` helpers.
- Add a note under it: "For complaints at the venue. Organisers can't read messages."

- [ ] **Step 2: Add the directory panel to Event setup**

The load adds `directory: { ...await getDirectorySettings(), pushConfigured: isPushConfigured }` when ready. `isPushConfigured` is `false` until Task 9; use a local `const` until then.

New action `saveDirectory`:
- Fields: `closeDate` and `closeTime`, combined with the page's existing `at()` helper; `emailCap`, an integer 0–1000; and `push`, a checkbox.
- Calls `saveDirectorySettings`.
- Audits with action `'directory.settings'`.

New `ops-panel` section, "Visitors directory":
- Closes on (date) at (time), India time.
- "Backup emails per day", with the hint "Resend's free plan allows 100 emails a day in total, including tickets and pass links."
- "Push notifications" on/off. It's disabled, with "Needs the VAPID keys (see README)", when `!pushConfigured`.

- [ ] **Step 3: Verify the basics**

Run: `npm run check`. Expected: 0 errors.

- [ ] **Step 4: Check the organiser switches in dev**

- **Stop messaging** on A:
  - A's open conversation fails the next send with the admin-off sentence;
  - A's My pass shows the switch locked with that sentence;
  - B sees A as "Not taking messages".
- **Hide from directory** on A removes A from B's list.
- Clearing both restores A's own earlier choices.

- [ ] **Step 5: Check the close date in dev**

Set it to 5 minutes from now. Expected: after that, `/visitorDirectory` and every conversation show the closed sentence, and sending fails with it.

Put it back to 12 December 23:59.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/directory/people.ts src/routes/admin/+page.server.ts src/routes/admin/+page.svelte src/routes/admin/event-setup
git commit -m "Add organiser controls for the visitors directory"
```

---

### Task 9: Push notifications (behind the switch)

**Files:**
- Modify: `src/env.ts` and `.env.example` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)
- Modify: `package.json` (dependencies `web-push`, devDependency `@types/web-push`)
- Create: `src/lib/server/push.ts`
- Create: `src/routes/api/directory/push/+server.ts`
- Create: `static/directory-sw.js`
- Create: `static/visitor-directory.webmanifest`
- Create: `static/icons/directory-192.png`, `static/icons/directory-512.png`, `static/icons/directory-180.png`
- Create: `src/lib/directory/push-client.ts`
- Create: `src/lib/components/directory/NotifyBanner.svelte`
- Modify: `src/lib/server/directory/notify.ts`, both directory pages (head links, banner), `src/routes/visitorDirectory/+page.server.ts` (`push` in data), `src/routes/admin/event-setup/+page.server.ts` (real `isPushConfigured`)

**Interfaces:**
- Consumes: `notifyRecipient` (Task 6); `settings.pushEnabled` (Task 8); `directoryViewer`.
- Produces:
  ```ts
  // push.ts
  export const isPushConfigured: boolean;
  export const vapidPublicKey: string | null;
  export interface PushPayload { title: string; body: string; url: string }
  export async function saveSubscription(registrationId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void>; // upsert on endpoint; a shared phone moves to the new owner
  export async function removeSubscription(registrationId: string, endpoint: string): Promise<void>;
  export async function pushTo(registrationId: string, payload: PushPayload): Promise<number>; // number delivered; deletes subscriptions answered with 404/410
  // push-client.ts
  export type PushState = 'unsupported' | 'ios-home-screen' | 'denied' | 'off' | 'on';
  export async function pushState(): Promise<PushState>;
  export async function turnOnPush(publicKey: string): Promise<PushState>;
  ```

- [ ] **Step 1: Generate keys and wire up the environment**

1. Run `npm install web-push` and `npm install -D @types/web-push`.
2. Run `npx web-push generate-vapid-keys`.
3. Put the keys in `.env.development.local`, with `VAPID_SUBJECT=mailto:` plus the organiser's sending address. Ask the organiser for the address; don't guess it.
4. Declare all three variables in `src/env.ts` with the `optional` schema and a description.
5. Add them to `.env.example`, commented "Visitors directory push notifications (npx web-push generate-vapid-keys)".

- [ ] **Step 2: Implement `push.ts`**

- Use `await import('web-push')` inside `pushTo` only.
- Set `setVapidDetails` once.
- Send with `sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: 'high' })`.
- On an error with `statusCode` 404 or 410, delete that endpoint.

- [ ] **Step 3: Write the subscribe endpoint**

`POST /api/directory/push` (JSON subscription) and `DELETE` (JSON `{ endpoint }`):
- Only `open` viewers, otherwise 401.
- Validate:
  - `endpoint` is an `https:` URL of at most 1000 characters;
  - `p256dh` and `auth` match `^[A-Za-z0-9_-]+$`, at most 200 characters each.
- `allow('dirpush:' + me, 10, 60_000)`.
- Return 404 when `!settings.pushEnabled || !isPushConfigured`.

- [ ] **Step 4: Write `static/directory-sw.js`**

- `install` calls `skipWaiting()`; `activate` calls `clients.claim()`.
- `push` shows `showNotification(data.title, { body: data.body, icon: '/icons/directory-192.png', data: { url: data.url }, tag: data.url })`. Fall back to "New message" / "Tap to read and reply" / `/visitorDirectory`. Always show a notification, because iOS revokes subscriptions that don't.
- `notificationclick` closes the notification. It then focuses an open window and navigates it to `data.url`, or `clients.openWindow(data.url)`.

- [ ] **Step 5: Add the manifest and icons**

`static/visitor-directory.webmanifest`:
- `name` "MBC Visitors directory", `short_name` "MBC Directory";
- `start_url` "/visitorDirectory", `scope` "/", `display` "standalone";
- `background_color` and `theme_color` "#0c1730";
- icons 192 and 512, `purpose` "any".

Make the icons from `static/poster/mbc.webp` with macOS `sips`:
1. Convert to PNG.
2. Fit the logo within 80% of the width.
3. Pad to a square with `--padColor 0C1730`.

Output 512, 192 and 180 px versions. Open each PNG to check the logo is centred and readable.

Both directory pages add to `<svelte:head>`:
- `<link rel="manifest" href="/visitor-directory.webmanifest">`;
- `<link rel="apple-touch-icon" href="/icons/directory-180.png">`.

- [ ] **Step 6: Write the client and the banner**

**`pushState()`:**
- `'ios-home-screen'` on iPhone or iPad when not standalone. Detect iPhone/iPad with the user agent, or `MacIntel` plus `maxTouchPoints > 1`. Detect standalone with `matchMedia('(display-mode: standalone)')` or `navigator.standalone`.
- `'unsupported'` without `serviceWorker`, `PushManager` or `Notification`.
- `'denied'` from `Notification.permission`.
- Otherwise `'on'` if `navigator.serviceWorker.getRegistration('/')` has a subscription, and `'off'` if not.

**`turnOnPush()`:**
1. Register `/directory-sw.js` with scope `/`.
2. `Notification.requestPermission()`, only here.
3. `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
4. POST to the endpoint.

**`NotifyBanner.svelte`:**
- Renders only when `data.push.enabled`.
- `off`: "Know when someone messages you." with a **Turn on notifications** button.
- `ios-home-screen`: the same button opens a sheet titled "Add the directory to your Home Screen":
  1. Tap Share.
  2. Tap Add to Home Screen. Leave "Open as Web App" on.
  3. Open the directory from the new icon and tap **Turn on notifications** there.
- `denied`: "Notifications are blocked for this site. Allow them in your browser's site settings to get message alerts."
- `on` and `unsupported`: hidden.

**Directory load:** adds `push: { enabled: settings.pushEnabled && isPushConfigured, publicKey: vapidPublicKey }`.

- [ ] **Step 7: Send pushes**

In `notifyRecipient`, before the email, when `settings.pushEnabled && isPushConfigured`:
`pushTo(recipientId, { title: 'New message from ' + sender.fullName, body: 'Tap to read and reply', url: '/visitorDirectory/' + sender.id })`.

- [ ] **Step 8: Verify locally**

Run: `npm test && npm run check`. Expected: pass, 0 errors.

Then, with dev and desktop Chrome, and the push switch on in Event setup:
- Turn on as B, then send from A. Expected: a notification "New message from …" with "Tap to read and reply".
- Clicking it opens the conversation.
- The permission prompt never appears before tapping the button.

- [ ] **Step 9: Commit**

```bash
git add src/env.ts .env.example package.json package-lock.json src/lib/server/push.ts src/routes/api/directory/push static/directory-sw.js static/visitor-directory.webmanifest static/icons src/lib/directory/push-client.ts src/lib/components/directory/NotifyBanner.svelte src/lib/server/directory/notify.ts src/routes/visitorDirectory src/routes/admin/event-setup/+page.server.ts
git commit -m "Add push notifications to the visitors directory"
```

---

### Task 10: README, preview tests on phones, and launch

Each step that pushes, deploys, sets Vercel variables or touches production needs the organiser's go-ahead in chat first.

**Files:**
- Modify: `README.md` (new section "Visitors directory", after "Event day: one QR, six desks")

**Interfaces:**
- Consumes: everything above.
- Produces: the live directory.

- [ ] **Step 1: Write the README section**

Cover:
- what the directory is;
- that the organiser must rerun `db/schema.sql` before launch;
- the three VAPID variables and how to generate them;
- the Event setup panel (closing time, email cap, push switch);
- the dashboard switches;
- "Organisers can't read messages";
- how testing works (schema-only Neon branch plus `db/directory-test-seed.sql`, never fake delegates in production).

Commit it:
```bash
git add README.md
git commit -m "Document the visitors directory"
```

- [ ] **Step 2: Deploy a preview**

With the organiser's OK:
1. Push the branch.
2. In Vercel, add **Preview** environment variables scoped to the git branch `feature/visitor-directory`:
   - `DATABASE_URL` = the `directory-test` Neon branch;
   - the three VAPID variables.

   Keep Resend configured, so real email to the seeded team addresses is tested.
3. Wait for the preview deployment.

If the preview is behind Vercel Authentication, the organiser shares a bypass link for the test phones.

- [ ] **Step 3: Check the preview on real phones**

These are the spec's checks.

**Basics:**
- Two delegates on Android Chrome: sign in by "Email me my pass link", message, unread dot, backup email arrives at the team inbox, and the email button opens the conversation.
- Desktop Chrome: the same.
- `/visitordirectory` redirects to `/visitorDirectory`.

**iPhone:**
1. Sign in in Safari, then Add to Home Screen.
2. Open from the icon.
3. Expected: still signed in. If it isn't, report this to the organiser right away; it's the spec's first risk, and a sign-in fallback is a new decision.
4. Turn on notifications.
5. Send from Android. Expected: a push arrives, tapping it opens the conversation, and the backup email also arrives.

**Background sending:** if emails or pushes never arrive on the preview but do in dev, `waitUntil` isn't wired up. Make `background()` await the task instead, then redeploy.

- [ ] **Step 4: Decide on push with the organiser**

If push worked on Android and the iPhone Home Screen app, push goes live. Otherwise launch with the switch off, as approved.

Also tell the organiser two things from the spec's risks, so they can decide before event day:
- With the 50-email cap on Resend's free plan, a busy day means most people learn of messages from push or the unread count, not email. Say how many emails the preview tests used.
- If the Vercel project is on the Hobby plan, they should check its limits and terms, because the gate, hall and meal desks share the same functions.

- [ ] **Step 5: Launch**

With the organiser's go-ahead:
1. Open the PR and merge it.
2. The organiser reruns `db/schema.sql` on the production database in the Neon SQL editor.
3. Set the three VAPID variables for Production in Vercel.
4. Confirm the production deployment.
5. Do the final check with two real registrations from the organiser's team, signed in through their own pass emails:
   - message each other;
   - email arrives;
   - push arrives, if switched on;
   - block and unblock work.
6. In Event setup, confirm the close date is 12 December 23:59 and the email cap is 50, and set the push switch as decided.
7. Delete the `directory-test` Neon branch only when the organiser says so.
