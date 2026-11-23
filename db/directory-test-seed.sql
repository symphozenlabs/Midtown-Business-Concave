-- TEST BRANCH ONLY. Never run this on the live database.
--
-- Six paid test delegates for trying the visitors directory on a schema-only Neon
-- branch (run db/schema.sql there first). Replace TEAM_EMAIL_1 … TEAM_EMAIL_6 with
-- addresses the team controls before running; never commit real addresses here.
-- Locally, with Resend not configured, emails are printed in the terminal instead,
-- so example.test addresses are fine there.

do $$ begin
  if exists (select 1 from registrations where code not like 'MBC-DTEST%') then
    raise exception 'This database has real registrations. The directory test seed only runs on an empty test branch.';
  end if;
end $$;

insert into registrations
  (code, full_name, email, phone, photo_key, company_name, designation, industry, city, interests, consent, status, reviewed_at, reviewed_by)
values
  ('MBC-DTEST1', 'Priya Raman', 'TEAM_EMAIL_1', '+919000000001', 'test/none.jpg', 'Kaveri Textiles', 'Managing Director', 'Textiles', 'Salem', array['networking'], true, 'paid', now(), 'test seed'),
  ('MBC-DTEST2', 'Arun Kumar', 'TEAM_EMAIL_2', '+919000000002', 'test/none.jpg', 'Arun Steel Fabricators', 'Founder', 'Manufacturing', 'Erode', array['networking', 'b2b-stalls'], true, 'paid', now(), 'test seed'),
  -- 40 characters: the longest name the form allows.
  ('MBC-DTEST3', 'Venkatanarayanan Sundararajan Ramalingam', 'TEAM_EMAIL_3', '+919000000003', 'test/none.jpg', 'Sri Lakshmi Agro', 'Partner', 'Agriculture', 'Namakkal', array['private-meetings'], true, 'paid', now(), 'test seed'),
  -- 44 characters: the longest company the form allows.
  ('MBC-DTEST4', 'Meena Krishnan', 'TEAM_EMAIL_4', '+919000000004', 'test/none.jpg', 'Coimbatore Precision Engineering Works India', 'Chief Executive Officer', 'Engineering', 'Coimbatore', array['workshops'], true, 'paid', now(), 'test seed'),
  ('MBC-DTEST5', 'கார்த்திக் செல்வம்', 'TEAM_EMAIL_5', '+919000000005', 'test/none.jpg', 'Selvam Traders', 'Proprietor', 'Retail', 'Salem', array['networking'], true, 'paid', now(), 'test seed'),
  ('MBC-DTEST6', 'Divya Shankar', 'TEAM_EMAIL_6', '+919000000006', 'test/none.jpg', 'Shankar Digital', 'Designer', 'IT services', 'Madurai', array['networking'], true, 'paid', now(), 'test seed');
