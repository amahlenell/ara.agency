-- Phase 1 only. Existing public enquiries are deliberately untouched.
create schema if not exists ara_studio_private;
revoke all on schema ara_studio_private from public, anon, authenticated;
grant usage on schema ara_studio_private to authenticated;

create table public.studio_users (
 id uuid primary key default gen_random_uuid(),
 auth_user_id uuid not null unique references auth.users(id) on delete restrict,
 display_name text not null check(char_length(display_name) between 1 and 180),
 role text not null check(role in ('admin','editor')),
 active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.studio_prospects (
 id uuid primary key default gen_random_uuid(), business_name text not null check(char_length(business_name) between 2 and 180),
 website_url text not null check(char_length(website_url)<=2048), normalized_domain text not null unique,
 industry text not null check(char_length(industry) between 2 and 120),country text not null check(char_length(country) between 2 and 80),
 city text not null default '' check(char_length(city)<=120),contact_name text not null default '' check(char_length(contact_name)<=180),
 contact_email text not null default '' check(char_length(contact_email)<=254),contact_phone text not null default '' check(char_length(contact_phone)<=60),
 social_links jsonb not null default '[]' check(jsonb_typeof(social_links)='array' and jsonb_array_length(social_links)<=10),
 business_description text not null default '' check(char_length(business_description)<=4000),source text not null default '' check(char_length(source)<=300),
 priority text not null default 'normal' check(priority in ('low','normal','high')),
 lifecycle_status text not null default 'discovered' check(lifecycle_status in ('discovered','researching','audited','demo_in_progress','demo_ready','contacted','replied','meeting_booked','proposal_sent','won','lost','archived')),
 assigned_to uuid references public.studio_users(id) on delete restrict,notes text not null default '' check(char_length(notes)<=8000),follow_up_at timestamptz,
 created_by uuid not null references public.studio_users(id) on delete restrict,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index studio_prospects_stage_updated on public.studio_prospects(lifecycle_status,updated_at desc,id);
create index studio_prospects_follow_up on public.studio_prospects(follow_up_at) where lifecycle_status not in ('archived','won','lost');
create index studio_prospects_assigned on public.studio_prospects(assigned_to);
create table public.studio_activity_log (
 id uuid primary key default gen_random_uuid(),entity_type text not null check(entity_type in ('prospect','staff')),
 entity_id uuid not null,action text not null,actor_user_id uuid references public.studio_users(id) on delete restrict,
 previous_state jsonb,new_state jsonb,metadata jsonb not null default '{}',created_at timestamptz not null default now()
);
create index studio_activity_entity on public.studio_activity_log(entity_type,entity_id,created_at desc);
create index studio_activity_recent on public.studio_activity_log(created_at desc);
create table ara_studio_private.write_limits(actor uuid primary key,window_start timestamptz not null,attempts integer not null);
alter table ara_studio_private.write_limits enable row level security;

-- The membership lookup intentionally bypasses membership-table RLS to avoid
-- recursive policies. It accepts no user ID, returns only the current staff ID,
-- checks the signed-in identity and session, and lives in an unexposed schema.
create function ara_studio_private.staff_id() returns uuid language sql stable security definer set search_path='' as $$
 select member.id from public.studio_users member
 where auth.uid() is not null and member.auth_user_id=auth.uid() and member.active
 and coalesce(auth.jwt()->>'is_anonymous','false')<>'true'
 and exists(select 1 from auth.sessions session where session.user_id=auth.uid() and session.id::text=auth.jwt()->>'session_id')
$$;
create function ara_studio_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.studio_users where id=ara_studio_private.staff_id() and role='admin')
$$;
revoke all on function ara_studio_private.staff_id(),ara_studio_private.is_admin() from public,anon,authenticated;
grant execute on function ara_studio_private.staff_id(),ara_studio_private.is_admin() to authenticated;

create function ara_studio_private.consume_write() returns void language plpgsql security definer set search_path='' as $$
declare current_actor uuid:=ara_studio_private.staff_id(); total integer;
begin
 if current_actor is null then raise exception 'active_staff_required' using errcode='42501';end if;
 insert into ara_studio_private.write_limits values(current_actor,clock_timestamp(),1)
 on conflict(actor) do update set
 attempts=case when ara_studio_private.write_limits.window_start<clock_timestamp()-interval '1 minute' then 1 else ara_studio_private.write_limits.attempts+1 end,
 window_start=case when ara_studio_private.write_limits.window_start<clock_timestamp()-interval '1 minute' then clock_timestamp() else ara_studio_private.write_limits.window_start end
 returning attempts into total;
 if total>60 then raise exception 'write_rate_limited' using errcode='P0002';end if;
end $$;
revoke all on function ara_studio_private.consume_write() from public,anon,authenticated;

create function ara_studio_private.guard_prospect() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=ara_studio_private.staff_id();hostname text;allowed text[];
begin
 perform ara_studio_private.consume_write();
 new.business_name=btrim(new.business_name);new.industry=btrim(new.industry);new.country=btrim(new.country);
 if new.website_url !~ '^https?://[^/@[:space:]]+([/?#]|$)' or new.website_url~'^https?://[^/]*@' then raise exception 'invalid_website' using errcode='23514';end if;
 hostname=lower(substring(new.website_url from '^https?://([^/:?#]+)'));
 hostname=regexp_replace(hostname,'\.$','');
 if hostname is null or hostname !~ '^[a-z0-9.-]+$' or hostname not like '%.%' or hostname~'(^|\.)(localhost|local|internal|test|invalid|example)$'
 or hostname~'^(0\.|10\.|127\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.(168|0|2)\.|198\.(18|19|51)\.|203\.0\.113\.|22[4-9]\.|2[3-5][0-9]\.)'
 or new.website_url~'^https?://[^/]*:((?!80([/?#]|$)|443([/?#]|$))[0-9]+)' then raise exception 'public_website_required' using errcode='23514';end if;
 new.normalized_domain=regexp_replace(hostname,'^www\.','');
 if new.contact_email<>'' and new.contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_email' using errcode='23514';end if;
 if exists(select 1 from jsonb_array_elements(new.social_links) link where jsonb_typeof(link)<>'string' or length(link#>>'{}')>2048 or (link#>>'{}')!~'^https?://') then raise exception 'invalid_social_links' using errcode='23514';end if;
 if new.assigned_to is not null and not exists(select 1 from public.studio_users where id=new.assigned_to and active) then raise exception 'inactive_assignee' using errcode='23514';end if;
 if tg_op='INSERT' then
  if new.lifecycle_status<>'discovered' then raise exception 'initial_stage_must_be_discovered' using errcode='23514';end if;
  new.created_by=actor;new.created_at=clock_timestamp();
 else
  if new.id<>old.id or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'immutable_prospect_fields' using errcode='23514';end if;
  if old.lifecycle_status<>new.lifecycle_status then
   allowed=case old.lifecycle_status
    when 'discovered' then array['researching','archived'] when 'researching' then array['discovered','audited','archived']
    when 'audited' then array['researching','demo_in_progress','archived'] when 'demo_in_progress' then array['audited','demo_ready','archived']
    when 'demo_ready' then array['demo_in_progress','contacted','archived'] when 'contacted' then array['replied','lost','archived']
    when 'replied' then array['meeting_booked','proposal_sent','lost','archived'] when 'meeting_booked' then array['replied','proposal_sent','lost','archived']
    when 'proposal_sent' then array['meeting_booked','won','lost','archived'] when 'won' then array['archived'] when 'lost' then array['researching','archived'] when 'archived' then array['discovered'] end;
   if not new.lifecycle_status=any(allowed) then raise exception 'invalid_lifecycle_transition' using errcode='23514';end if;
  end if;
 end if;
 new.updated_at=clock_timestamp();return new;
end $$;
revoke all on function ara_studio_private.guard_prospect() from public,anon,authenticated;
create trigger studio_guard_prospect before insert or update on public.studio_prospects for each row execute function ara_studio_private.guard_prospect();

create function ara_studio_private.log_change() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid;previous jsonb;current_state jsonb;changed jsonb;
begin
 select id into actor from public.studio_users where auth_user_id=auth.uid();
 if tg_table_name='studio_prospects' then
  -- Keep contact details and free-text notes out of immutable history snapshots.
  current_state=jsonb_build_object('business_name',new.business_name,'lifecycle_status',new.lifecycle_status,'priority',new.priority,'assigned_to',new.assigned_to,'follow_up_at',new.follow_up_at);
  if tg_op='UPDATE' then previous=jsonb_build_object('business_name',old.business_name,'lifecycle_status',old.lifecycle_status,'priority',old.priority,'assigned_to',old.assigned_to,'follow_up_at',old.follow_up_at);end if;
 else
  current_state=jsonb_build_object('display_name',new.display_name,'role',new.role,'active',new.active);
  if tg_op='UPDATE' then previous=jsonb_build_object('display_name',old.display_name,'role',old.role,'active',old.active);end if;
 end if;
 if tg_op='UPDATE' then select coalesce(jsonb_agg(key order by key),'[]') into changed from jsonb_object_keys(to_jsonb(new)) key where key<>'updated_at' and to_jsonb(new)->key is distinct from to_jsonb(old)->key;else changed='[]';end if;
 insert into public.studio_activity_log(entity_type,entity_id,action,actor_user_id,previous_state,new_state,metadata)
 values(case when tg_table_name='studio_prospects' then 'prospect' else 'staff' end,new.id,
 case when tg_op='INSERT' then 'created' when tg_table_name='studio_prospects' and previous->>'lifecycle_status' is distinct from current_state->>'lifecycle_status' then 'stage_changed' else 'updated' end,
 actor,previous,current_state,jsonb_build_object('changed_fields',changed));
 return new;
end $$;
revoke all on function ara_studio_private.log_change() from public,anon,authenticated;
create trigger studio_log_prospect after insert or update on public.studio_prospects for each row execute function ara_studio_private.log_change();
create trigger studio_log_staff after insert or update on public.studio_users for each row execute function ara_studio_private.log_change();

create function ara_studio_private.manage_staff(target_id uuid,new_role text,new_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare target public.studio_users;
begin
 perform pg_advisory_xact_lock(hashtextextended('ara-studio-staff-admin',0));
 if not ara_studio_private.is_admin() then raise exception 'admin_required' using errcode='42501';end if;
 perform ara_studio_private.consume_write();
 if new_role not in ('admin','editor') or new_role is null or new_active is null then raise exception 'invalid_staff_change' using errcode='23514';end if;
 select * into target from public.studio_users where id=target_id for update;
 if not found then raise exception 'unknown_staff_member' using errcode='23514';end if;
 if target.role='admin' and target.active and (new_role<>'admin' or not new_active)
 and not exists(select 1 from public.studio_users where role='admin' and active and id<>target_id) then raise exception 'retain_last_admin' using errcode='23514';end if;
 update public.studio_users set role=new_role,active=new_active,updated_at=clock_timestamp() where id=target_id;
end $$;
revoke all on function ara_studio_private.manage_staff(uuid,text,boolean) from public,anon,authenticated;
grant execute on function ara_studio_private.manage_staff(uuid,text,boolean) to authenticated;
create function public.studio_set_staff(target_id uuid,new_role text,new_active boolean) returns void language sql security invoker set search_path='' as $$select ara_studio_private.manage_staff(target_id,new_role,new_active)$$;
revoke all on function public.studio_set_staff(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.studio_set_staff(uuid,text,boolean) to authenticated;

alter table public.studio_users enable row level security;
alter table public.studio_prospects enable row level security;
alter table public.studio_activity_log enable row level security;
revoke all on public.studio_users,public.studio_prospects,public.studio_activity_log from public,anon,authenticated;
grant select on public.studio_users,public.studio_activity_log to authenticated;
grant select,insert,update on public.studio_prospects to authenticated;
grant select,insert,update on public.studio_users to service_role;
create policy studio_staff_read on public.studio_users for select to authenticated using(ara_studio_private.staff_id() is not null);
create policy studio_prospects_read on public.studio_prospects for select to authenticated using(ara_studio_private.staff_id() is not null);
create policy studio_prospects_insert on public.studio_prospects for insert to authenticated with check(ara_studio_private.staff_id() is not null and created_by=ara_studio_private.staff_id());
create policy studio_prospects_update on public.studio_prospects for update to authenticated using(ara_studio_private.staff_id() is not null) with check(ara_studio_private.staff_id() is not null);
create policy studio_activity_read on public.studio_activity_log for select to authenticated using(ara_studio_private.staff_id() is not null);

create function public.studio_dashboard() returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if ara_studio_private.staff_id() is null then raise exception 'active_staff_required' using errcode='42501';end if;
 return(select jsonb_build_object('total',count(*),'active',count(*) filter(where lifecycle_status not in ('archived','won','lost')),
 'archived',count(*) filter(where lifecycle_status='archived'),'followups_due',count(*) filter(where follow_up_at<=now() and lifecycle_status not in ('archived','won','lost'))) from public.studio_prospects);
end $$;
revoke all on function public.studio_dashboard() from public,anon,authenticated;
grant execute on function public.studio_dashboard() to authenticated;
