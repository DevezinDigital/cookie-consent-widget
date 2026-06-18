-- db/schema.sql
--
-- Database schema for the cookie-consent compliance log (Neon Postgres).
-- Run this once in the Neon SQL Editor after creating the project.
--
-- consent_logs is append-only from the API's perspective, except for
-- GDPR erasure (api/consent-deletion.js), which nulls out the PII columns
-- and stamps deleted_at, keeping the record shell as compliance proof.

-- Registry of sites allowed to log consent events (checked by lib/auth.js).
-- To register a site, generate a token with `openssl rand -hex 24`, then:
--
--   insert into site_tokens (domain, token, notes)
--   values ('example.com', '<token>', 'My example site');
--
-- and set the same token as NEXT_PUBLIC_SITE_CONSENT_TOKEN in that site.
-- Domains are bare hostnames: lowercase, no protocol, no "www." prefix.
-- Set active = false to cut a site off without deleting its row.
create table if not exists site_tokens (
  domain      text primary key,
  token       text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  notes       text
);

create table if not exists consent_logs (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null unique,
  created_at       timestamptz not null default now(),
  schema_version   text,

  -- site
  site_domain      text not null,
  page_url         text,

  -- user (PII — nulled by erasure)
  session_id       text,
  user_id          text,
  ip_hash          text,
  user_agent       text,

  -- consent
  action           text not null check (action in ('granted', 'updated', 'withdrawn')),
  method           text,
  consent_version  text,
  categories       jsonb not null,

  -- compliance
  regulation       text,
  jurisdiction     text,
  legal_basis      text,

  -- erasure bookkeeping
  deleted_at       timestamptz,
  deletion_reason  text
);

create index if not exists consent_logs_session_id_idx
  on consent_logs (session_id) where session_id is not null;
create index if not exists consent_logs_user_id_idx
  on consent_logs (user_id) where user_id is not null;
create index if not exists consent_logs_site_created_idx
  on consent_logs (site_domain, created_at desc);

-- Audit trail of erasure requests — proof that GDPR deletion requests
-- were honored, without retaining the erased PII itself.
create table if not exists deletion_requests (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  user_id          text,
  session_id       text,
  requesting_ip    text, -- sha256 hash, never the raw IP
  status           text not null,
  completed_at     timestamptz,
  records_deleted  integer,
  requested_by     text -- operator/ticket that authorized the erasure (audit)
);

-- For existing databases, add the audit column:
--   alter table deletion_requests add column if not exists requested_by text;
