-- =====================================================================
-- Concept — database setup for Supabase
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.
-- =====================================================================

-- 1) One table holds every record. "path" works like a file path:
--    team/<user>, channels/<chat>, channels/<chat>/messages/<msg>,
--    tasks/<task>, status/<status>, calls/<call>, keys/<user>, ...
create table if not exists public.docs (
  path        text primary key,
  col         text not null,                       -- the folder part of the path
  data        jsonb not null default '{}'::jsonb,  -- the record itself
  updated_at  timestamptz not null default now()
);
create index if not exists docs_col_idx on public.docs (col);
create index if not exists docs_updated_idx on public.docs (updated_at);

alter table public.docs enable row level security;

-- 2) Helper checks used by the security rules -------------------------

-- Is the signed-in person a member of this chat?
create or replace function public.is_chan_member(cid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.docs
    where path = 'channels/' || cid
      and data -> 'members' ? (auth.uid())::text
  );
$$;

-- Can the signed-in person see this task?
-- (they created it, it's assigned to them, or they're on its team and the
--  team lets everyone see all tasks — the team owner always sees everything)
create or replace function public.can_see_task(d jsonb)
returns boolean language sql stable security definer set search_path = public as $$
  select
    d ->> 'createdBy' = (auth.uid())::text
    or d ->> 'assignee' = (auth.uid())::text
    or exists (
      select 1 from public.docs t
      where t.path = 'teams/' || coalesce(d ->> 'team', '')
        and t.data -> 'members' ? (auth.uid())::text
        and (coalesce(t.data ->> 'visibility', 'all') = 'all'
             or t.data ->> 'owner' = (auth.uid())::text)
    );
$$;

-- Have both people saved each other as contacts? (needed to see statuses)
create or replace function public.is_mutual(other text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.docs a
                 where a.path = 'contacts/' || (auth.uid())::text
                   and a.data -> 'ids' ? other)
     and exists (select 1 from public.docs b
                 where b.path = 'contacts/' || other
                   and b.data -> 'ids' ? (auth.uid())::text);
$$;

-- Read rule for every kind of record
create or replace function public.doc_can_read(p text, c text, d jsonb)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me    text   := (auth.uid())::text;
  parts text[] := string_to_array(p, '/');
begin
  if me is null then return false; end if;
  if c in ('team', 'keys', 'contacts', 'meta') then return true; end if;
  if c = 'channels' then return d -> 'members' ? me; end if;
  if c like 'channels/%/messages' then return public.is_chan_member(parts[2]); end if;
  if c like 'voice/%/parts' then return true; end if;           -- chat audio is end-to-end encrypted
  if c = 'tasks' then return public.can_see_task(d); end if;
  if c = 'teams' then return d -> 'members' ? me or d ->> 'owner' = me; end if;
  if c = 'status' then return d ->> 'by' = me or public.is_mutual(d ->> 'by'); end if;
  if c = 'calls' then return d -> 'members' ? me; end if;
  if c like 'data/users/%' then return parts[3] = me; end if;   -- private per person
  return false;
end;
$$;

-- Write rule (create / change) for every kind of record
create or replace function public.doc_can_write(p text, c text, d jsonb)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me    text   := (auth.uid())::text;
  parts text[] := string_to_array(p, '/');
begin
  if me is null then return false; end if;
  if c in ('team', 'keys', 'contacts') then return parts[2] = me; end if;  -- only your own
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

-- 3) Security rules on the table --------------------------------------
drop policy if exists docs_select on public.docs;
drop policy if exists docs_insert on public.docs;
drop policy if exists docs_update on public.docs;
drop policy if exists docs_delete on public.docs;

create policy docs_select on public.docs for select to authenticated
  using (public.doc_can_read(path, col, data));

create policy docs_insert on public.docs for insert to authenticated
  with check (public.doc_can_write(path, col, data));

create policy docs_update on public.docs for update to authenticated
  using (public.doc_can_read(path, col, data))
  with check (public.doc_can_write(path, col, data));

create policy docs_delete on public.docs for delete to authenticated
  using (public.doc_can_write(path, col, data));

-- 4) Merge a few fields into an existing record (used for edits) ------
create or replace function public.doc_merge(p_path text, p_patch jsonb)
returns void language sql security invoker set search_path = public as $$
  update public.docs
     set data = data || p_patch, updated_at = now()
   where path = p_path;
$$;
grant execute on function public.doc_merge(text, jsonb) to authenticated;

-- 5) Live updates (new messages appear instantly) ----------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- 6) File storage for photos and videos --------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)            -- 50 MB per file
on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists media_upload_own on storage.objects;
drop policy if exists media_delete_own on storage.objects;

create policy media_upload_own on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy media_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (auth.uid())::text);

-- Done. You should see "Success. No rows returned".
