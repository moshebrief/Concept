-- Task Message — team invites by phone number
create or replace function public.my_phone()
returns text language sql stable security definer set search_path = public, auth as $$
  select regexp_replace(coalesce((select phone from auth.users where id = auth.uid()), ''), '\D', '', 'g');
$$;

create or replace function public.is_team_member(tid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.docs
                 where path = 'teams/' || tid
                   and (data -> 'members' ? (auth.uid())::text or data ->> 'owner' = (auth.uid())::text));
$$;

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
  if c = 'invites' then
    return d ->> 'by' = me
        or public.is_team_member(d ->> 'team')
        or (public.my_phone() <> '' and regexp_replace(coalesce(d ->> 'phone', ''), '\D', '', 'g') = public.my_phone());
  end if;
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

create or replace function public.doc_can_write(p text, c text, d jsonb)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me    text   := (auth.uid())::text;
  parts text[] := string_to_array(p, '/');
begin
  if me is null then return false; end if;
  if c in ('team', 'keys', 'contacts', 'devices') then return parts[2] = me; end if;
  if c = 'reports' then return d ->> 'by' = me; end if;
  if c = 'invites' then return d ->> 'by' = me and public.is_team_member(d ->> 'team'); end if;
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

-- The invited person accepts or declines. Checks the invite really is for their phone number.
create or replace function public.respond_invite(p_path text, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  me  text := (auth.uid())::text;
  inv jsonb;
  tid text;
begin
  if me is null then raise exception 'not signed in'; end if;
  select data into inv from public.docs where path = p_path and col = 'invites';
  if inv is null or inv ? 'status' then return null; end if;
  if public.my_phone() = '' or regexp_replace(coalesce(inv ->> 'phone', ''), '\D', '', 'g') <> public.my_phone() then
    raise exception 'this invite is for a different phone number';
  end if;
  tid := inv ->> 'team';
  if p_accept then
    update public.docs
       set data = jsonb_set(data, '{members}', coalesce(data -> 'members', '[]'::jsonb) || to_jsonb(me)), updated_at = now()
     where path = 'teams/' || tid and not (coalesce(data -> 'members', '[]'::jsonb) ? me);
  end if;
  update public.docs set data = data || jsonb_build_object('status', case when p_accept then 'accepted' else 'declined' end, 'answeredAt', (extract(epoch from now()) * 1000)::bigint), updated_at = now() where path = p_path;
  return case when p_accept then tid else null end;
end;
$$;

grant execute on function public.my_phone() to authenticated;
grant execute on function public.is_team_member(text) to authenticated;
grant execute on function public.respond_invite(text, boolean) to authenticated;
