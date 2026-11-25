-- Midtown Business Conclave 2026 — delegate registrations and UPI payments.
-- Run in the Neon SQL editor (or psql). Safe to run again: it only adds what is missing.

create table if not exists registrations (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  full_name        text not null check (char_length(full_name) between 2 and 40),
  email            text not null check (char_length(email) <= 120),
  phone            text not null check (phone ~ '^\+91[6-9][0-9]{9}$'),
  photo_key        text not null,
  company_name     text not null check (char_length(company_name) between 2 and 44),
  designation      text not null check (char_length(designation) between 2 and 40),
  industry         text not null check (char_length(industry) between 2 and 36),
  about            text check (char_length(about) <= 200),
  website          text check (char_length(website) <= 200),
  city             text not null check (char_length(city) between 2 and 60),
  interests        text[] not null check (cardinality(interests) between 1 and 5),
  heard_from       text check (char_length(heard_from) <= 60),
  consent          boolean not null check (consent),
  whatsapp_updates boolean not null default false,
  poster_framing   jsonb,
  created_at       timestamptz not null default now()
);

-- Earlier versions had organisation, company_size and looking_for; the form no longer asks.
alter table registrations drop column if exists organisation;
alter table registrations drop column if exists company_size;
alter table registrations drop column if exists looking_for;
alter table registrations add column if not exists about text check (char_length(about) <= 200);

-- Payment and ticket workflow:
--   pending_payment → payment_submitted (delegate entered a UPI transaction ID)
--   → paid (admin verified; ticket emailed) or rejected (admin could not verify)
alter table registrations add column if not exists poster_key           text;
alter table registrations add column if not exists status               text not null default 'pending_payment';
alter table registrations add column if not exists amount_rupees        numeric(10, 2) not null default 500;
alter table registrations add column if not exists upi_txn_id           text;
alter table registrations add column if not exists payment_submitted_at timestamptz;
alter table registrations add column if not exists reviewed_at          timestamptz;
alter table registrations add column if not exists reviewed_by          text;
alter table registrations add column if not exists rejection_reason     text;
alter table registrations add column if not exists ticket_emailed_at    timestamptz;
alter table registrations add column if not exists updated_at           timestamptz not null default now();
-- Back of the ID card (QR and details), made when the organisers confirm payment.
alter table registrations add column if not exists ticket_back_key      text;
-- Square (1:1) post cut from the ID card front, emailed with the ticket.
alter table registrations add column if not exists post_key             text;

-- Delegate-pass voucher applied on the payment step (the voucher list itself is the
-- "vouchers" row in settings). amount_rupees is the fee less discount_rupees.
alter table registrations add column if not exists voucher_code    text;
alter table registrations add column if not exists discount_rupees numeric(10, 2) not null default 0;
create index if not exists registrations_voucher_idx on registrations (voucher_code) where voucher_code is not null;

-- Ticket bought: the Delegate pass or the Visitor ticket. Both get the same pass and
-- perks; only the label and price differ. Vouchers apply to the delegate pass only.
alter table registrations add column if not exists ticket_type text not null default 'delegate';
do $$ begin
  alter table registrations add constraint registrations_ticket_type_check
    check (ticket_type in ('delegate', 'visitor'));
exception when duplicate_object then null;
end $$;

-- Optional LinkedIn profile, shown on the delegate's scan page and contact card.
alter table registrations add column if not exists linkedin text check (char_length(linkedin) <= 200);

-- Ticket email delivery, as reported by Resend (GET /emails/:id, needs a Full access API key):
--   ticket_email_id     Resend's id for the last ticket email
--   ticket_email_event  Resend's last_event (sent, delivered, bounced, delivery_delayed, …)
--   ticket_email_status sent | delivered | failed, reduced from that event
alter table registrations add column if not exists ticket_email_id         text;
alter table registrations add column if not exists ticket_email_event      text;
alter table registrations add column if not exists ticket_email_status     text;
alter table registrations add column if not exists ticket_email_checked_at timestamptz;

do $$ begin
  alter table registrations add constraint registrations_ticket_email_status_check
    check (ticket_email_status is null or ticket_email_status in ('sent', 'delivered', 'failed'));
exception when duplicate_object then null;
end $$;

create index if not exists registrations_ticket_email_idx
  on registrations (ticket_email_status, ticket_email_checked_at) where status = 'paid';

do $$ begin
  alter table registrations add constraint registrations_status_check
    check (status in ('pending_payment', 'payment_submitted', 'paid', 'rejected'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table registrations add constraint registrations_upi_txn_id_check
    check (upi_txn_id is null or upi_txn_id ~ '^[0-9]{12}$');
exception when duplicate_object then null;
end $$;

-- One registration per email address, pass codes never repeat, and a UPI
-- transaction ID can only be claimed once.
create unique index if not exists registrations_email_key on registrations (lower(email));
create unique index if not exists registrations_code_key on registrations (code);
create unique index if not exists registrations_upi_txn_id_key on registrations (upi_txn_id) where upi_txn_id is not null;
create index if not exists registrations_created_at_idx on registrations (created_at desc);
create index if not exists registrations_status_idx on registrations (status, payment_submitted_at desc);

-- Admin-editable settings: ticket price and the UPI details behind the payment QR.
create table if not exists settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into settings (key, value)
values ('payment', '{"priceRupees": 2000, "visitorPriceRupees": 499, "vpa": "gmouly1@oksbi", "payeeName": "MOULISHWAR G"}')
on conflict (key) do nothing;

-- Organiser accounts for /login → /admin. Passwords are pbkdf2-sha256 hashes
-- (src/lib/server/crypto.ts). Add one or reset its password with:
--   node --env-file=.env db/set-admin.ts <email> <password>
create table if not exists admin_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null check (char_length(email) between 3 and 120),
  -- pbkdf2-sha256$<iterations>$<salt>$<hash>
  password_hash text not null,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists admin_users_email_key on admin_users (lower(email));

-- ============================================================================
-- Event operations: one QR per participant, used at six kinds of desk.
-- Participants are the registrations above. Handlers (gate staff, food counters…)
-- are created by the organiser at /admin/handlers and only reach the desks they
-- are assigned to. Every desk action is its own row, never a column on the
-- registration, and each duplicate rule is a unique index, so two phones scanning
-- the same pass at the same moment cannot both succeed.
-- ============================================================================

create table if not exists events (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  allow_reentry     boolean not null default false,
  certificate_rules jsonb not null default '{"requirePaid": true, "requireCheckin": true, "minAttendancePct": 0, "requiredSessionIds": []}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

insert into events (slug, name) values ('mbc-2026', 'Midtown Business Conclave 2026')
on conflict (slug) do nothing;

create table if not exists handler_categories (
  code  text primary key,
  label text not null,
  sort  int not null
);

insert into handler_categories (code, label, sort) values
  ('ticket', 'Ticket validation', 1),
  ('gate', 'Gate check-in', 2),
  ('hall', 'Hall / session attendance', 3),
  ('food', 'Food / lunch redemption', 4),
  ('certificate', 'Certificate management', 5),
  ('networking', 'Participant networking', 6)
on conflict (code) do update set label = excluded.label, sort = excluded.sort;

create table if not exists event_gates (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);
create unique index if not exists event_gates_name_key on event_gates (event_id, lower(name));

create table if not exists conference_sessions (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references events (id) on delete cascade,
  hall                  text not null check (char_length(hall) between 1 and 60),
  title                 text not null check (char_length(title) between 2 and 120),
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  counts_for_attendance boolean not null default true,
  created_at            timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists conference_sessions_event_idx on conference_sessions (event_id, starts_at);
-- Website agenda: optional speaker and description; show_on_agenda = false keeps a
-- session off the public agenda while it still works at the hall desks.
alter table conference_sessions add column if not exists speaker text;
alter table conference_sessions add column if not exists description text;
alter table conference_sessions add column if not exists show_on_agenda boolean not null default true;

create table if not exists meal_categories (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references events (id) on delete cascade,
  name                text not null check (char_length(name) between 2 and 40),
  starts_at           timestamptz,
  ends_at             timestamptz,
  max_per_participant int not null default 1 check (max_per_participant between 1 and 10),
  -- paid: every confirmed delegate; checked_in: only delegates who came through a gate
  eligibility         text not null default 'paid' check (eligibility in ('paid', 'checked_in')),
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create unique index if not exists meal_categories_name_key on meal_categories (event_id, lower(name));

create table if not exists event_handlers (
  id                   uuid primary key default gen_random_uuid(),
  full_name            text not null check (char_length(full_name) between 2 and 80),
  username             text not null check (username ~ '^[a-z0-9._-]{3,32}$'),
  email                text check (email is null or char_length(email) <= 120),
  mobile               text check (mobile is null or mobile ~ '^\+91[6-9][0-9]{9}$'),
  -- pbkdf2-sha256$<iterations>$<salt>$<hash>
  password_hash        text not null,
  must_change_password boolean not null default true,
  status               text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  failed_logins        int not null default 0,
  locked_until         timestamptz,
  last_login_at        timestamptz,
  password_changed_at  timestamptz,
  created_by           text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index if not exists event_handlers_username_key on event_handlers (lower(username));
-- The current password, encrypted (AES-GCM, key from PASS_SECRET), so organisers can look it up.
alter table event_handlers add column if not exists password_vault text;
create unique index if not exists event_handlers_email_key on event_handlers (lower(email)) where email is not null;

-- What a handler may do, per event. The context columns narrow a desk: a gate, a
-- hall or one session, a meal and counter, or the right to issue certificates.
create table if not exists handler_assignments (
  id                     uuid primary key default gen_random_uuid(),
  handler_id             uuid not null references event_handlers (id) on delete cascade,
  event_id               uuid not null references events (id) on delete cascade,
  category               text not null references handler_categories (code),
  gate_id                uuid references event_gates (id) on delete set null,
  hall                   text,
  session_id             uuid references conference_sessions (id) on delete set null,
  meal_id                uuid references meal_categories (id) on delete set null,
  counter_name           text check (counter_name is null or char_length(counter_name) <= 40),
  can_issue_certificates boolean not null default false,
  created_at             timestamptz not null default now(),
  unique (handler_id, event_id, category)
);
create index if not exists handler_assignments_event_idx on handler_assignments (event_id, category);

-- Assignments with the names of their event, gate, session and meal, for sign-in and the admin list.
create or replace view handler_assignment_details as
select a.id, a.handler_id, a.event_id, e.name as event_name, a.category, c.sort as category_sort,
  a.gate_id, g.name as gate_name, a.hall, a.session_id, cs.title as session_title, cs.hall as session_hall,
  a.meal_id, m.name as meal_name, a.counter_name, a.can_issue_certificates
from handler_assignments a
join events e on e.id = a.event_id
join handler_categories c on c.code = a.category
left join event_gates g on g.id = a.gate_id
left join conference_sessions cs on cs.id = a.session_id
left join meal_categories m on m.id = a.meal_id;

-- Sessions live in the database so the organiser can sign a handler out everywhere.
create table if not exists handler_sessions (
  id           uuid primary key default gen_random_uuid(),
  handler_id   uuid not null references event_handlers (id) on delete cascade,
  token_hash   text not null unique,
  remember     boolean not null default false,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index if not exists handler_sessions_handler_idx on handler_sessions (handler_id) where revoked_at is null;

create table if not exists handler_password_resets (
  id         uuid primary key default gen_random_uuid(),
  handler_id uuid not null references event_handlers (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- The participant's one QR. It carries /pass/<token>; only a SHA-256 of the token
-- is stored. Reissuing revokes the old row and adds the next version.
create table if not exists participant_qr_tokens (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events (id) on delete cascade,
  registration_id uuid not null references registrations (id) on delete cascade,
  token_hash      text not null unique,
  version         int not null default 1,
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  revoked_by      text,
  unique (event_id, registration_id, version)
);
create unique index if not exists participant_qr_tokens_active_key
  on participant_qr_tokens (event_id, registration_id) where revoked_at is null;

alter table registrations add column if not exists pass_emailed_at timestamptz;

create table if not exists gate_checkins (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events (id) on delete cascade,
  registration_id uuid not null references registrations (id) on delete cascade,
  gate_id         uuid references event_gates (id) on delete set null,
  handler_id      uuid references event_handlers (id) on delete set null,
  kind            text not null default 'entry' check (kind in ('entry', 'reentry')),
  checked_in_at   timestamptz not null default now()
);
-- Single entry: one 'entry' row per participant. Re-entries, when allowed, are extra rows.
create unique index if not exists gate_checkins_entry_key on gate_checkins (event_id, registration_id) where kind = 'entry';
create index if not exists gate_checkins_time_idx on gate_checkins (event_id, checked_in_at desc);

create table if not exists session_attendance (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events (id) on delete cascade,
  session_id      uuid not null references conference_sessions (id) on delete cascade,
  registration_id uuid not null references registrations (id) on delete cascade,
  handler_id      uuid references event_handlers (id) on delete set null,
  source          text not null default 'scan' check (source in ('scan', 'offline_sync')),
  recorded_at     timestamptz not null default now(),
  unique (session_id, registration_id)
);
create index if not exists session_attendance_participant_idx on session_attendance (event_id, registration_id);

-- seq counts a participant's servings of one meal, 1 … max_per_participant. With the
-- usual limit of one, the unique index allows exactly one row per participant and meal.
create table if not exists meal_redemptions (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events (id) on delete cascade,
  meal_id         uuid not null references meal_categories (id) on delete cascade,
  registration_id uuid not null references registrations (id) on delete cascade,
  handler_id      uuid references event_handlers (id) on delete set null,
  counter_name    text,
  seq             int not null default 1 check (seq >= 1),
  redeemed_at     timestamptz not null default now(),
  unique (meal_id, registration_id, seq)
);

create table if not exists certificates (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references events (id) on delete cascade,
  registration_id   uuid not null references registrations (id) on delete cascade,
  certificate_no    text not null unique,
  issued_at         timestamptz not null default now(),
  issued_by_handler uuid references event_handlers (id) on delete set null,
  issued_by_admin   text,
  revoked_at        timestamptz,
  revoked_reason    text,
  unique (event_id, registration_id)
);

-- One row per pair (a_id < b_id). Each side has its own consent; contact details
-- are shared only while both are 'accepted'. An introduction made at a networking
-- desk starts with both sides pending.
create table if not exists participant_connections (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references events (id) on delete cascade,
  a_id                  uuid not null references registrations (id) on delete cascade,
  b_id                  uuid not null references registrations (id) on delete cascade,
  a_status              text not null check (a_status in ('pending', 'accepted', 'declined')),
  b_status              text not null check (b_status in ('pending', 'accepted', 'declined')),
  introduced_by_handler uuid references event_handlers (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (a_id < b_id),
  unique (event_id, a_id, b_id)
);
create index if not exists participant_connections_b_idx on participant_connections (event_id, b_id);

-- Every scan, successful or not. client_scan_id makes a retried request return the
-- first answer instead of acting twice.
create table if not exists scan_transactions (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events (id) on delete cascade,
  handler_id      uuid references event_handlers (id) on delete set null,
  category        text not null references handler_categories (code),
  registration_id uuid references registrations (id) on delete set null,
  result          text not null check (result in ('success', 'duplicate', 'rejected')),
  code            text not null,
  message         text not null,
  context         jsonb,
  response        jsonb,
  client_scan_id  uuid,
  created_at      timestamptz not null default now()
);
create unique index if not exists scan_transactions_client_key
  on scan_transactions (handler_id, client_scan_id) where client_scan_id is not null;
create index if not exists scan_transactions_time_idx on scan_transactions (event_id, created_at desc);
create index if not exists scan_transactions_handler_idx on scan_transactions (handler_id, created_at desc);

create table if not exists audit_logs (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid references events (id) on delete set null,
  actor_type  text not null check (actor_type in ('admin', 'handler', 'participant', 'system')),
  actor       text not null,
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_time_idx on audit_logs (created_at desc);

-- Stall bookings from the website (src/lib/server/bookings.ts creates these on first use too).
--   pending_payment → payment_submitted (UPI transaction ID entered) → paid (organiser allots the stall) or rejected
-- preferred_stall is the exhibitor's wish; allotted_stall is the organisers' decision.
create table if not exists stall_bookings (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  full_name        text not null check (char_length(full_name) between 2 and 60),
  business_name    text not null check (char_length(business_name) between 2 and 80),
  email            text not null check (char_length(email) <= 120),
  phone            text not null check (phone ~ '^\+91[6-9][0-9]{9}$'),
  preferred_stall  int check (preferred_stall between 1 and 39),
  allotted_stall   int check (allotted_stall between 1 and 39),
  stall_type       text not null,
  price_rupees     numeric(10, 2) not null,
  voucher_code     text,
  discount_rupees  numeric(10, 2) not null default 0,
  amount_rupees    numeric(10, 2) not null,
  payee_vpa        text not null,
  payee_name       text not null,
  status           text not null default 'pending_payment'
                   check (status in ('pending_payment', 'payment_submitted', 'paid', 'rejected')),
  upi_txn_id       text check (upi_txn_id is null or upi_txn_id ~ '^[0-9]{12}$'),
  payment_submitted_at timestamptz,
  reviewed_at      timestamptz,
  reviewed_by      text,
  rejection_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists stall_bookings_upi_txn_id_key on stall_bookings (upi_txn_id) where upi_txn_id is not null;
create index if not exists stall_bookings_voucher_idx on stall_bookings (voucher_code) where voucher_code is not null;

-- "Become a sponsor" requests; the organisers follow up from /admin/sponsors.
create table if not exists sponsor_requests (
  id            uuid primary key default gen_random_uuid(),
  contact_name  text not null check (char_length(contact_name) between 2 and 60),
  company_name  text not null check (char_length(company_name) between 2 and 80),
  email         text not null check (char_length(email) <= 120),
  phone         text not null check (phone ~ '^\+91[6-9][0-9]{9}$'),
  tier          text not null,
  message       text check (char_length(message) <= 600),
  status        text not null default 'new' check (status in ('new', 'contacted', 'confirmed', 'declined')),
  admin_note    text check (char_length(admin_note) <= 300),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    text
);

-- The SEFMEMBER promo code (25% off stalls) is added to the "vouchers" setting the first
-- time the site needs it; organisers can edit or close it under Payments → Stalls.

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
-- Set by the sender's phone for each draft: a resent post (patchy Wi-Fi, a second tap)
-- carries the same key and is stored once.
alter table directory_messages add column if not exists client_key uuid;
create unique index if not exists directory_messages_client_key on directory_messages (sender_id, client_key) where client_key is not null;

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

-- ============================================================================
-- Stall directory (/stallDirectory): anyone sees the confirmed stalls on the floor
-- map; signed-in delegates message a stall and the exhibitor replies after signing
-- in with the booking email and mobile number. Exhibitors scan delegates' passes to
-- collect leads. src/lib/server/stall-directory/store.ts also creates these on first use.
-- ============================================================================

-- When the exhibitor was emailed their stall directory login.
alter table stall_bookings add column if not exists login_emailed_at timestamptz;

-- One conversation per delegate and stall; the delegate always starts it.
-- <side>_read_at / <side>_emailed_at follow the visitors directory's backup-email rule.
create table if not exists stall_conversations (
  id                   uuid primary key default gen_random_uuid(),
  stall_booking_id     uuid not null references stall_bookings (id) on delete cascade,
  registration_id      uuid not null references registrations (id) on delete cascade,
  last_sender          text not null check (last_sender in ('delegate', 'exhibitor')),
  last_message_at      timestamptz not null default now(),
  delegate_read_at     timestamptz,
  exhibitor_read_at    timestamptz,
  delegate_emailed_at  timestamptz,
  exhibitor_emailed_at timestamptz,
  exhibitor_blocked    boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (stall_booking_id, registration_id)
);
create index if not exists stall_conversations_registration_idx on stall_conversations (registration_id, created_at);

create table if not exists stall_messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references stall_conversations (id) on delete cascade,
  sender          text not null check (sender in ('delegate', 'exhibitor')),
  body            text not null check (char_length(body) between 1 and 1000),
  client_key      uuid,
  created_at      timestamptz not null default now()
);
create index if not exists stall_messages_conversation_idx on stall_messages (conversation_id, id);
create unique index if not exists stall_messages_client_key on stall_messages (client_key) where client_key is not null;

-- Delegates whose pass QR an exhibitor scanned at the stall.
create table if not exists stall_leads (
  stall_booking_id uuid not null references stall_bookings (id) on delete cascade,
  registration_id  uuid not null references registrations (id) on delete cascade,
  note             text check (char_length(note) <= 300),
  scanned_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (stall_booking_id, registration_id)
);

-- Business award applications from awards.midtownevents.in (Admin → Awards). Also created
-- automatically on first use. The Open/Closed switch is the "awards" row in settings.
create table if not exists award_applications (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  full_name       text not null check (char_length(full_name) between 2 and 60),
  designation     text not null check (char_length(designation) between 2 and 60),
  email           text not null check (char_length(email) <= 120),
  phone           text not null check (phone ~ '^\+91[6-9][0-9]{9}$'),
  city            text not null check (char_length(city) between 2 and 60),
  business_name   text not null check (char_length(business_name) between 2 and 100),
  category_id     text not null,
  other_category  text check (char_length(other_category) <= 60),
  year_started    int not null check (year_started between 1850 and 2100),
  team_size       text not null,
  website         text check (char_length(website) <= 260),
  about           text not null check (char_length(about) <= 600),
  achievements    text not null check (char_length(achievements) <= 1000),
  logo_key        text,
  status          text not null default 'new' check (status in ('new', 'shortlisted', 'winner', 'rejected')),
  admin_note      text check (char_length(admin_note) <= 300),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      text
);
create unique index if not exists award_applications_once_key
  on award_applications (phone, lower(business_name), category_id, lower(coalesce(other_category, '')));
create index if not exists award_applications_created_idx on award_applications (created_at desc);
