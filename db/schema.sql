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
  organisation     text check (char_length(organisation) <= 120),
  industry         text not null check (char_length(industry) between 2 and 36),
  company_size     text not null check (company_size in ('solo', '2-10', '11-50', '51-200', '200+')),
  website          text check (char_length(website) <= 200),
  city             text not null check (char_length(city) between 2 and 60),
  interests        text[] not null check (cardinality(interests) between 1 and 5),
  looking_for      text check (char_length(looking_for) <= 300),
  heard_from       text check (char_length(heard_from) <= 60),
  consent          boolean not null check (consent),
  whatsapp_updates boolean not null default false,
  poster_framing   jsonb,
  created_at       timestamptz not null default now()
);

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
values ('payment', '{"priceRupees": 500, "vpa": "gmouly1@oksbi", "payeeName": "MOULISHWAR G"}')
on conflict (key) do nothing;
