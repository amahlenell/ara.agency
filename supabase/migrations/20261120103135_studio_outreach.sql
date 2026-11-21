-- Phase 4: evidence-based drafts and manual contact records. No sending service.
create function ara_studio_private.outreach_valid(doc jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb;
begin
 if doc is null or pg_column_size(doc)>18000 or not ara_studio_private.redesign_keys(doc,array['channel','recipient','subject','body','finding_ids']) then return false;end if;
 if not ara_studio_private.redesign_text(doc,'channel',1,20) or doc->>'channel' not in ('email','manual')
  or not ara_studio_private.redesign_text(doc,'recipient',0,254) or not ara_studio_private.redesign_text(doc,'subject',3,180)
  or not ara_studio_private.redesign_text(doc,'body',0,8000) then return false;end if;
 if concat(doc->>'recipient',doc->>'subject',doc->>'body') ~* '/preview/[a-f0-9-]{36}#[A-Za-z0-9_-]{43}' then return false;end if;
 if jsonb_typeof(doc->'finding_ids') is distinct from 'array' then return false;end if;
 if jsonb_array_length(doc->'finding_ids') not between 1 and 3 then return false;end if;
 for item in select * from jsonb_array_elements(doc->'finding_ids') loop
  if jsonb_typeof(item)<>'string' or (item#>>'{}') !~ '^[a-z0-9_-]{1,80}$' then return false;end if;
 end loop;
 return (select count(distinct value)=jsonb_array_length(doc->'finding_ids') from jsonb_array_elements_text(doc->'finding_ids'));
end $$;
create function ara_studio_private.outreach_ready(doc jsonb) returns boolean language sql immutable set search_path='' as $$
 select case when ara_studio_private.outreach_valid(doc) then char_length(btrim(doc->>'body'))>=40 and
 case when doc->>'channel'='email' then doc->>'recipient' ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' else char_length(btrim(doc->>'recipient'))>=3 end else false end
$$;
revoke all on function ara_studio_private.outreach_valid(jsonb),ara_studio_private.outreach_ready(jsonb) from public,anon,authenticated;

create table public.studio_outreach (
 id uuid primary key default gen_random_uuid(),prospect_id uuid not null references public.studio_prospects(id) on delete restrict,
 source_audit_id uuid not null references public.studio_audits(id) on delete restrict,
 reply_to_id uuid references public.studio_outreach(id) on delete restrict,
 content jsonb not null check(ara_studio_private.outreach_valid(content)),evidence jsonb not null,
 revision integer not null default 1 check(revision>0),status text not null default 'draft' check(status in ('draft','in_review','approved','sent','cancelled')),
 review_note text not null default '' check(char_length(review_note)<=1000),
 created_by uuid not null references public.studio_users(id) on delete restrict,
 approved_by uuid references public.studio_users(id) on delete restrict,approved_at timestamptz,approved_revision integer,
 sent_by uuid references public.studio_users(id) on delete restrict,sent_recorded_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check(jsonb_typeof(evidence)='array' and jsonb_array_length(evidence) between 1 and 3 and pg_column_size(evidence)<=20000),
 check((status in ('approved','sent') and approved_by is not null and approved_at is not null and approved_revision=revision)
  or(status not in ('approved','sent') and approved_by is null and approved_at is null and approved_revision is null)),
 check((status='sent' and sent_by is not null and sent_recorded_at is not null) or(status<>'sent' and sent_by is null and sent_recorded_at is null))
);
create index studio_outreach_prospect on public.studio_outreach(prospect_id,updated_at desc);
create index studio_outreach_status on public.studio_outreach(status,updated_at desc,id);
create index studio_outreach_updated on public.studio_outreach(updated_at desc,id);
create index studio_outreach_audit on public.studio_outreach(source_audit_id);
create index studio_outreach_reply on public.studio_outreach(reply_to_id);
create index studio_outreach_creator on public.studio_outreach(created_by);
create index studio_outreach_approver on public.studio_outreach(approved_by);
create index studio_outreach_sender on public.studio_outreach(sent_by);
create index studio_outreach_sent on public.studio_outreach(prospect_id,sent_recorded_at desc) where status='sent';
create table public.studio_outreach_preferences (
 prospect_id uuid primary key references public.studio_prospects(id) on delete restrict,
 blocked boolean not null,reason text not null check(char_length(btrim(reason)) between 3 and 1000),revision integer not null check(revision>0),
 updated_by uuid not null references public.studio_users(id) on delete restrict,updated_at timestamptz not null default clock_timestamp()
);
create index studio_outreach_preferences_actor on public.studio_outreach_preferences(updated_by);
alter table public.studio_outreach enable row level security;
alter table public.studio_outreach_preferences enable row level security;
revoke all on public.studio_outreach,public.studio_outreach_preferences from public,anon,authenticated;
grant select on public.studio_outreach,public.studio_outreach_preferences to authenticated;
create policy studio_outreach_read on public.studio_outreach for select to authenticated using((select ara_studio_private.staff_id()) is not null);
create policy studio_outreach_preferences_read on public.studio_outreach_preferences for select to authenticated using((select ara_studio_private.staff_id()) is not null);

create function ara_studio_private.outreach_evidence(p_audit uuid,p_ids jsonb,p_prospect public.studio_prospects) returns jsonb
language plpgsql set search_path='' as $$
declare source public.studio_audits;item jsonb;found_item jsonb;result jsonb:='[]';
begin
 select * into source from public.studio_audits where id=p_audit;
 if not found or source.status<>'completed' or source.report is null or source.prospect_id<>p_prospect.id or source.website_url<>p_prospect.website_url then raise exception 'current_audit_required' using errcode='P4001';end if;
 for item in select * from jsonb_array_elements(p_ids) loop
  select value into found_item from jsonb_array_elements(source.report->'findings') where value->>'id'=item#>>'{}' and value->>'status'='warning';
  if not found then raise exception 'observed_warning_required' using errcode='P4001';end if;
  result=result||jsonb_build_array(jsonb_build_object('id',found_item->>'id','title',found_item->>'title','evidence',found_item->>'evidence','recommendation',found_item->>'recommendation'));
 end loop;
 return result;
end $$;
create function ara_studio_private.outreach_result(target public.studio_outreach,prospect public.studio_prospects) returns jsonb language sql set search_path='' as $$
 select jsonb_build_object('outreach',to_jsonb(target),'prospect',jsonb_build_object('id',prospect.id,'lifecycle_status',prospect.lifecycle_status,'follow_up_at',prospect.follow_up_at,'updated_at',prospect.updated_at))
$$;
create function ara_studio_private.outreach_log(target public.studio_outreach,event text) returns void language sql set search_path='' as $$
 insert into public.studio_activity_log(entity_type,entity_id,action,actor_user_id,new_state,metadata)
 values('prospect',target.prospect_id,'outreach_'||event,ara_studio_private.staff_id(),jsonb_build_object('business_name',(select business_name from public.studio_prospects where id=target.prospect_id),'outreach_status',target.status,'revision',target.revision),jsonb_build_object('outreach_id',target.id,'revision',target.revision))
$$;
revoke all on function ara_studio_private.outreach_evidence(uuid,jsonb,public.studio_prospects),ara_studio_private.outreach_result(public.studio_outreach,public.studio_prospects),ara_studio_private.outreach_log(public.studio_outreach,text) from public,anon,authenticated;

create function ara_studio_private.outreach_command(p_id uuid,p_action text,p_revision integer,p_content jsonb default null,p_audit uuid default null,p_reply_to uuid default null,p_note text default '',p_confirmed boolean default false,p_follow_up timestamptz default null,p_prospect_version timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=ara_studio_private.staff_id();target public.studio_outreach;prospect public.studio_prospects;parent_id uuid;observations jsonb;
begin
 if actor is null then raise exception 'active_staff_required' using errcode='42501';end if;
 if p_action is distinct from 'copy' then perform ara_studio_private.consume_write();end if;
 if p_action='create' then parent_id=p_id;else select prospect_id into parent_id from public.studio_outreach where id=p_id;if not found then raise exception 'unknown_outreach' using errcode='PT404';end if;end if;
 -- Shared parent lock serializes preference changes and manual contact records.
 select * into prospect from public.studio_prospects where id=parent_id for update;
 if not found then raise exception 'unknown_prospect' using errcode='PT404';end if;
 if p_action<>'create' then
  select * into target from public.studio_outreach where id=p_id for update;
  if p_revision is null or target.revision<>p_revision then raise exception 'stale_outreach' using errcode='40001';end if;
  if p_action='record_sent' and target.status='sent' and p_confirmed is true then return ara_studio_private.outreach_result(target,prospect);end if;
 end if;
 if p_action='cancel' then
  if target.status not in ('draft','in_review','approved') then raise exception 'outreach_state_changed' using errcode='40001';end if;
  update public.studio_outreach set status='cancelled',approved_by=null,approved_at=null,approved_revision=null,updated_at=clock_timestamp() where id=p_id returning * into target;
 else
  if prospect.lifecycle_status in ('archived','won','lost') then raise exception 'outreach_prospect_closed' using errcode='P4002';end if;
  if exists(select 1 from public.studio_outreach_preferences where prospect_id=prospect.id and blocked) then raise exception 'outreach_paused' using errcode='P4003';end if;
  if p_action='create' then
   if not ara_studio_private.outreach_valid(p_content) then raise exception 'invalid_outreach_content' using errcode='23514';end if;
   observations=ara_studio_private.outreach_evidence(p_audit,p_content->'finding_ids',prospect);
   if p_reply_to is not null and not exists(select 1 from public.studio_outreach where id=p_reply_to and prospect_id=prospect.id and status='sent') then raise exception 'sent_parent_required' using errcode='P4004';end if;
   insert into public.studio_outreach(prospect_id,source_audit_id,reply_to_id,content,evidence,created_by) values(prospect.id,p_audit,p_reply_to,p_content,observations,actor) returning * into target;
  else
   if target.status in ('sent','cancelled') and p_action<>'copy' then raise exception 'outreach_record_immutable' using errcode='40001';end if;
   if p_action='save' then
    if not ara_studio_private.outreach_valid(p_content) then raise exception 'invalid_outreach_content' using errcode='23514';end if;
    observations=ara_studio_private.outreach_evidence(target.source_audit_id,p_content->'finding_ids',prospect);
    update public.studio_outreach set content=p_content,evidence=observations,revision=revision+1,status='draft',review_note='',approved_by=null,approved_at=null,approved_revision=null,updated_at=clock_timestamp() where id=p_id returning * into target;
   elsif p_action in ('submit','approve','copy','record_sent') then
    perform ara_studio_private.outreach_evidence(target.source_audit_id,target.content->'finding_ids',prospect);
    if p_action='submit' then
     if target.status<>'draft' then raise exception 'outreach_state_changed' using errcode='40001';end if;
     if not ara_studio_private.outreach_ready(target.content) then raise exception 'outreach_not_ready' using errcode='P4005';end if;
     update public.studio_outreach set status='in_review',review_note='',updated_at=clock_timestamp() where id=p_id returning * into target;
    elsif p_action='approve' then
     if not ara_studio_private.is_admin() then raise exception 'admin_required' using errcode='42501';end if;
     if target.status<>'in_review' then raise exception 'outreach_state_changed' using errcode='40001';end if;
     if p_confirmed is distinct from true or not ara_studio_private.outreach_ready(target.content) then raise exception 'review_required' using errcode='P4005';end if;
     update public.studio_outreach set status='approved',approved_by=actor,approved_at=clock_timestamp(),approved_revision=revision,updated_at=clock_timestamp() where id=p_id returning * into target;
    elsif p_action='copy' then
     if target.status not in ('approved','sent') then raise exception 'approved_outreach_required' using errcode='P4005';end if;
     return ara_studio_private.outreach_result(target,prospect);
    else
     if target.status<>'approved' or p_confirmed is distinct from true then raise exception 'manual_send_confirmation_required' using errcode='P4005';end if;
     if p_prospect_version is null or prospect.updated_at<>p_prospect_version then raise exception 'stale_prospect' using errcode='40001';end if;
     if p_follow_up is not null and p_follow_up<=clock_timestamp() then raise exception 'future_follow_up_required' using errcode='P4006';end if;
     update public.studio_outreach set status='sent',sent_by=actor,sent_recorded_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_id returning * into target;
     update public.studio_prospects set follow_up_at=p_follow_up where id=prospect.id returning * into prospect;
    end if;
   elsif p_action='request_changes' then
    if not ara_studio_private.is_admin() then raise exception 'admin_required' using errcode='42501';end if;
    if target.status<>'in_review' then raise exception 'outreach_state_changed' using errcode='40001';end if;
    if p_note is null or char_length(btrim(p_note)) not between 3 and 1000 then raise exception 'review_note_required' using errcode='P4005';end if;
    update public.studio_outreach set status='draft',review_note=btrim(p_note),updated_at=clock_timestamp() where id=p_id returning * into target;
   else raise exception 'unknown_outreach_action' using errcode='23514';end if;
  end if;
 end if;
 perform ara_studio_private.outreach_log(target,p_action);
 return ara_studio_private.outreach_result(target,prospect);
end $$;
revoke all on function ara_studio_private.outreach_command(uuid,text,integer,jsonb,uuid,uuid,text,boolean,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function ara_studio_private.outreach_command(uuid,text,integer,jsonb,uuid,uuid,text,boolean,timestamptz,timestamptz) to authenticated;
create function public.studio_outreach_command(p_id uuid,p_action text,p_revision integer,p_content jsonb default null,p_audit uuid default null,p_reply_to uuid default null,p_note text default '',p_confirmed boolean default false,p_follow_up timestamptz default null,p_prospect_version timestamptz default null) returns jsonb
language sql security invoker set search_path='' as $$select ara_studio_private.outreach_command(p_id,p_action,p_revision,p_content,p_audit,p_reply_to,p_note,p_confirmed,p_follow_up,p_prospect_version)$$;
revoke all on function public.studio_outreach_command(uuid,text,integer,jsonb,uuid,uuid,text,boolean,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.studio_outreach_command(uuid,text,integer,jsonb,uuid,uuid,text,boolean,timestamptz,timestamptz) to authenticated;

create function ara_studio_private.set_outreach_preference(p_id uuid,p_blocked boolean,p_revision integer,p_reason text,p_confirmed boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=ara_studio_private.staff_id();prospect public.studio_prospects;preference public.studio_outreach_preferences;current_revision integer;
begin
 if actor is null then raise exception 'active_staff_required' using errcode='42501';end if;
 perform ara_studio_private.consume_write();
 select * into prospect from public.studio_prospects where id=p_id for update;if not found then raise exception 'unknown_prospect' using errcode='PT404';end if;
 select * into preference from public.studio_outreach_preferences where prospect_id=p_id for update;current_revision=coalesce(preference.revision,0);
 if p_revision is distinct from current_revision then raise exception 'stale_preference' using errcode='40001';end if;
 if p_blocked is null or p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then raise exception 'preference_reason_required' using errcode='23514';end if;
 if not p_blocked and (not ara_studio_private.is_admin() or p_confirmed is distinct from true) then raise exception 'admin_confirmation_required' using errcode='42501';end if;
 insert into public.studio_outreach_preferences values(p_id,p_blocked,btrim(p_reason),current_revision+1,actor,clock_timestamp())
 on conflict(prospect_id) do update set blocked=excluded.blocked,reason=excluded.reason,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at returning * into preference;
 if p_blocked and prospect.follow_up_at is not null then update public.studio_prospects set follow_up_at=null where id=p_id;end if;
 insert into public.studio_activity_log(entity_type,entity_id,action,actor_user_id,new_state) values('prospect',p_id,case when p_blocked then 'outreach_paused' else 'outreach_resumed' end,actor,jsonb_build_object('business_name',prospect.business_name,'outreach_paused',p_blocked));
 return to_jsonb(preference);
end $$;
revoke all on function ara_studio_private.set_outreach_preference(uuid,boolean,integer,text,boolean) from public,anon,authenticated;
grant execute on function ara_studio_private.set_outreach_preference(uuid,boolean,integer,text,boolean) to authenticated;
create function public.studio_set_outreach_preference(p_id uuid,p_blocked boolean,p_revision integer,p_reason text,p_confirmed boolean default false) returns jsonb language sql security invoker set search_path='' as $$select ara_studio_private.set_outreach_preference(p_id,p_blocked,p_revision,p_reason,p_confirmed)$$;
revoke all on function public.studio_set_outreach_preference(uuid,boolean,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.studio_set_outreach_preference(uuid,boolean,integer,text,boolean) to authenticated;

create function public.studio_pipeline(p_query text default '',p_owner text default 'all',p_priority text default 'all',p_due boolean default false,p_stage text default 'all',p_view text default 'board',p_page integer default 1) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if ara_studio_private.staff_id() is null then raise exception 'active_staff_required' using errcode='42501';end if;
 if p_query is null or char_length(p_query)>80 or p_owner is null or (p_owner not in ('all','unassigned') and p_owner !~ '^[a-fA-F0-9-]{36}$')
  or p_priority is null or p_priority not in ('all','high','normal','low') or p_due is null or p_stage is null
  or p_stage not in ('all','discovered','researching','audited','demo_in_progress','demo_ready','contacted','replied','meeting_booked','proposal_sent','won','lost','archived')
  or p_view is null or p_view not in ('board','list') or p_page is null or p_page not between 1 and 10000 then raise exception 'invalid_pipeline_filters' using errcode='23514';end if;
 return(with base as (
  select p.*,coalesce(pref.blocked,false) outreach_paused,(select max(sent_recorded_at) from public.studio_outreach where prospect_id=p.id and status='sent') last_manual_sent_at
  from public.studio_prospects p left join public.studio_outreach_preferences pref on pref.prospect_id=p.id
  where (p_stage='archived' or p.lifecycle_status<>'archived')
   and (p_query='' or position(lower(p_query) in lower(p.business_name||' '||p.normalized_domain))>0)
   and (p_owner='all' or (p_owner='unassigned' and p.assigned_to is null) or p.assigned_to::text=p_owner)
   and (p_priority='all' or p.priority=p_priority)
   and (not p_due or (p.follow_up_at<=now() and p.lifecycle_status not in ('won','lost','archived') and not coalesce(pref.blocked,false)))
 ), ranked as (select base.*,row_number() over(partition by lifecycle_status order by case priority when 'high' then 0 when 'normal' then 1 else 2 end,follow_up_at asc nulls last,updated_at desc,id) stage_position from base where p_stage='all' or lifecycle_status=p_stage),
 chosen as (select * from ranked where p_view='board' and stage_position<=8 order by lifecycle_status,stage_position),
 listed as (select * from ranked order by case priority when 'high' then 0 when 'normal' then 1 else 2 end,follow_up_at asc nulls last,updated_at desc,id limit 25 offset (p_page-1)*25),
 cards as(select * from chosen where p_view='board' union all select * from listed where p_view='list')
 select jsonb_build_object('total',(select count(*) from base),'matching',(select count(*) from ranked),
  'due',(select count(*) from base where follow_up_at<=now() and lifecycle_status not in ('won','lost','archived') and not outreach_paused),
  'paused',(select count(*) from base where outreach_paused),
  'counts',coalesce((select jsonb_object_agg(lifecycle_status,n) from(select lifecycle_status,count(*) n from base group by lifecycle_status) grouped),'{}'::jsonb),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'business_name',business_name,'normalized_domain',normalized_domain,'lifecycle_status',lifecycle_status,'priority',priority,'assigned_to',assigned_to,'follow_up_at',follow_up_at,'updated_at',updated_at,'outreach_paused',outreach_paused,'followup_due',coalesce(follow_up_at<=now() and lifecycle_status not in ('won','lost','archived') and not outreach_paused,false),'last_manual_sent_at',last_manual_sent_at)) from cards),'[]'::jsonb)));
end $$;
revoke all on function public.studio_pipeline(text,text,text,boolean,text,text,integer) from public,anon,authenticated;
grant execute on function public.studio_pipeline(text,text,text,boolean,text,text,integer) to authenticated;

create or replace function public.studio_dashboard() returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if ara_studio_private.staff_id() is null then raise exception 'active_staff_required' using errcode='42501';end if;
 return(select jsonb_build_object('total',count(*),'active',count(*) filter(where lifecycle_status not in ('archived','won','lost')),
 'archived',count(*) filter(where lifecycle_status='archived'),'followups_due',count(*) filter(where follow_up_at<=now() and lifecycle_status not in ('archived','won','lost') and not exists(select 1 from public.studio_outreach_preferences preference where preference.prospect_id=prospect.id and preference.blocked))) from public.studio_prospects prospect);
end $$;
revoke all on function public.studio_dashboard() from public,anon,authenticated;
grant execute on function public.studio_dashboard() to authenticated;
