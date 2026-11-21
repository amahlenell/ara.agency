create table public.studio_audits (
 id uuid primary key default gen_random_uuid(),
 prospect_id uuid not null references public.studio_prospects(id) on delete restrict,
 website_url text not null check(char_length(website_url)<=2048),
 requested_by uuid not null references public.studio_users(id) on delete restrict,
 status text not null default 'running' check(status in ('running','completed','failed')),
 report jsonb,error_message text check(char_length(error_message)<=600),
 created_at timestamptz not null default now(),completed_at timestamptz,
 check ((status='running' and report is null and error_message is null and completed_at is null)
  or (status='completed' and report is not null and jsonb_typeof(report)='object' and report->>'method' is not distinct from 'html-baseline' and error_message is null and completed_at is not null)
  or (status='failed' and report is null and error_message is not null and completed_at is not null)),
 check (report is null or pg_column_size(report)<=200000)
);
create index studio_audits_prospect_created on public.studio_audits(prospect_id,created_at desc);
create index studio_audits_requester_created on public.studio_audits(requested_by,created_at desc);
create index studio_audits_created on public.studio_audits(created_at desc);
alter table public.studio_audits enable row level security;
revoke all on public.studio_audits from public,anon,authenticated;
grant select on public.studio_audits to authenticated;
grant insert(prospect_id,requested_by,website_url) on public.studio_audits to authenticated;
grant update(status,report,error_message) on public.studio_audits to authenticated;
create policy studio_audits_read on public.studio_audits for select to authenticated
 using ((select ara_studio_private.staff_id()) is not null);
create policy studio_audits_insert on public.studio_audits for insert to authenticated
 with check (requested_by=(select ara_studio_private.staff_id()));
create policy studio_audits_update on public.studio_audits for update to authenticated
 using (requested_by=(select ara_studio_private.staff_id()) and status='running')
 with check (requested_by=(select ara_studio_private.staff_id()));

create function ara_studio_private.guard_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=ara_studio_private.staff_id(); target public.studio_prospects;
begin
 if actor is null or new.requested_by<>actor then raise exception 'active_staff_required' using errcode='42501';end if;
 perform ara_studio_private.consume_write();
 if tg_op='INSERT' then
  perform pg_advisory_xact_lock(hashtextextended('studio-audit-'||new.prospect_id::text,0));
  select * into target from public.studio_prospects where id=new.prospect_id;
  if not found or target.lifecycle_status='archived' or new.website_url<>target.website_url then
   raise exception 'audit_target_changed' using errcode='23514';end if;
  if exists(select 1 from public.studio_audits where prospect_id=new.prospect_id and
    (created_at>clock_timestamp()-interval '1 minute' or (status='running' and created_at>clock_timestamp()-interval '2 minutes'))) then
   raise exception 'audit_already_running' using errcode='55P03';end if;
  if (select count(*) from public.studio_audits where requested_by=actor and created_at>clock_timestamp()-interval '1 hour')>=20 then
   raise exception 'audit_rate_limited' using errcode='P0002';end if;
  new.status='running';new.report=null;new.error_message=null;new.completed_at=null;new.created_at=clock_timestamp();
 else
  if old.status<>'running' or new.status not in ('completed','failed') then raise exception 'audit_immutable' using errcode='23514';end if;
  if new.id<>old.id or new.prospect_id<>old.prospect_id or new.website_url<>old.website_url or new.requested_by<>old.requested_by or new.created_at<>old.created_at then
   raise exception 'audit_immutable' using errcode='23514';end if;
  if new.status='completed' and (new.report->>'requestedUrl' is distinct from old.website_url or jsonb_typeof(new.report->'findings') is distinct from 'array') then
   raise exception 'invalid_audit_report' using errcode='23514';end if;
  new.completed_at=clock_timestamp();
 end if;
 return new;
end $$;
revoke all on function ara_studio_private.guard_audit() from public,anon,authenticated;
create trigger studio_guard_audit before insert or update on public.studio_audits for each row execute function ara_studio_private.guard_audit();

create function ara_studio_private.log_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.studio_activity_log(entity_type,entity_id,action,actor_user_id,new_state,metadata)
 values('prospect',new.prospect_id,'audit_'||case when new.status='running' then 'started' else new.status end,new.requested_by,
  jsonb_build_object('business_name',(select business_name from public.studio_prospects where id=new.prospect_id),'audit_status',new.status),
  jsonb_build_object('audit_id',new.id));
 return new;
end $$;
revoke all on function ara_studio_private.log_audit() from public,anon,authenticated;
create trigger studio_log_audit after insert or update on public.studio_audits for each row execute function ara_studio_private.log_audit();
