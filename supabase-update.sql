-- =====================================================================
-- Task Message — database update for the phone apps
-- Adds: notification device tokens, reports, and the "new message"
-- trigger that asks the push function to send notifications.
--
-- Nothing to edit. Just paste and Run. Safe to run more than once.
-- =====================================================================

-- 1) Read rule: add devices (only your own) and reports (only your own)
create or replace function public.doc_can_read(p text, c text, d jsonb)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me    text   := (auth.uid())::text;
  parts text[] := string_to_array(p, '/');
begin
  if me is null then return false; end if;
  if c in ('team', 'keys', 'contacts', 'meta') then return true; end if;
  if c = 'devices' then return parts[2] = me; end if;
  if c = 'reports' then return d ->> 'by' = me; end if;
  if c = 'channels' then return d -> 'members' ? me; end if;
  if c like 'channels/%/messages' then return public.is_chan_member(parts[2]); end if;
  if c like 'voice/%/parts' then return true; end if;
  if c = 'tasks' then return public.can_see_task(d); end if;
  if c = 'teams' then return d -> 'members' ? me or d ->> 'owner' = me; end if;
  if c = 'status' then return d ->> 'by' = me or public.is_mutual(d ->> 'by'); end if;
  if c = 'calls' then return d -> 'members' ? me; end if;
  if c like 'data/users/%' then return parts[3] = me; end if;
  return false;
end;
$$;

-- 2) Write rule: devices (only your own), reports (only as yourself)
create or replace function public.doc_can_write(p text, c text, d jsonb)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me    text   := (auth.uid())::text;
  parts text[] := string_to_array(p, '/');
begin
  if me is null then return false; end if;
  if c in ('team', 'keys', 'contacts', 'devices') then return parts[2] = me; end if;
  if c = 'reports' then return d ->> 'by' = me; end if;
  if c = 'meta' then return true; end if;
  if c = 'channels' then return d -> 'members' ? me; end if;
  if c like 'channels/%/messages' then return public.is_chan_member(parts[2]); end if;
  if c like 'voice/%/parts' then return true; end if;
  if c = 'tasks' then return d ->> 'createdBy' = me or public.can_see_task(d); end if;
  if c = 'teams' then return d -> 'members' ? me or d ->> 'owner' = me; end if;
  if c = 'status' then return d ->> 'by' = me or public.is_mutual(d ->> 'by'); end if;
  if c = 'calls' then return d -> 'members' ? me; end if;
  if c like 'data/users/%' then return parts[3] = me; end if;
  return false;
end;
$$;

-- 3) New message → ask the "push" function to send notifications
--    (never blocks a message; the address is filled in during the notifications step)
create extension if not exists pg_net;

-- Where the push function lives (filled in later, in the notifications step)
create table if not exists public.push_settings (
  id  int primary key default 1 check (id = 1),
  url text
);
alter table public.push_settings enable row level security;   -- not reachable from the app

create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  u text;
begin
  select rtrim(trim(url), '/') into u from public.push_settings where id = 1;
  if u is null or u !~ '^https://' then
    return new;                        -- notifications not set up yet: just save the message
  end if;
  begin
    perform net.http_post(
      url     := u || '/functions/v1/push',
      body    := jsonb_build_object('path', new.path),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  exception when others then
    null;                              -- never block a message because of a notification problem
  end;
  return new;
end;
$$;

drop trigger if exists on_new_message on public.docs;
create trigger on_new_message
  after insert on public.docs
  for each row
  when (new.col like 'channels/%/messages')
  execute function public.notify_new_message();

-- Done. You should see "Success. No rows returned".
