-- Phase 5: one internal client project per won prospect.
create table public.studio_projects (
 id uuid primary key default gen_random_uuid(),
 prospect_id uuid not null unique references public.studio_prospects(id),
 client_name text not null check(char_length(client_name) between 2 and 180),
 title text not null check(char_length(btrim(title)) between 3 and 180),
 scope text not null check(char_length(btrim(scope)) between 10 and 4000),
 next_step text not null default '' check(char_length(next_step)<=500),
 status text not null default 'planned' check(status in ('planned','in_progress','on_hold','completed')),
 assigned_to uuid references public.studio_users(id),
 due_on date check(due_on between date '1900-01-01' and date '9999-12-31'),
 revision integer not null default 1 check(revision>0),
 approved_by uuid not null references public.studio_users(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create index studio_projects_owner on public.studio_projects(assigned_to);
create index studio_projects_approver on public.studio_projects(approved_by);
create index studio_projects_recent on public.studio_projects(updated_at desc,id);
alter table public.studio_projects enable row level security;
revoke all on public.studio_projects from public,anon,authenticated;
grant select on public.studio_projects to authenticated;
create policy studio_projects_read on public.studio_projects for select to authenticated
 using ((select ara_studio_private.staff_id()) is not null);

create function ara_studio_private.project_command(p_id uuid,p_action text,p_revision integer,p_details jsonb,p_confirmed boolean default false,p_prospect_version timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=ara_studio_private.staff_id();
 prospect public.studio_prospects;
 project public.studio_projects;
 owner_id uuid;
 due_date date;
 next_status text;
begin
 if actor is null then raise exception 'active_staff_required' using errcode='42501';end if;
 perform ara_studio_private.consume_write();
 if p_action='convert' then
  if not ara_studio_private.is_admin() or p_confirmed is distinct from true then
   raise exception 'conversion_approval_required' using errcode='42501';
  end if;
  select * into prospect from public.studio_prospects where id=p_id for update;
  if not found then raise exception 'unknown_prospect' using errcode='PT404';end if;
  select * into project from public.studio_projects where prospect_id=p_id;
  if found then return to_jsonb(project);end if;
  if prospect.updated_at is distinct from p_prospect_version then
   raise exception 'stale_prospect' using errcode='40001';
  end if;
  if prospect.lifecycle_status<>'won' then raise exception 'won_prospect_required' using errcode='40001';end if;
 elsif p_action='update' then
  select * into project from public.studio_projects where id=p_id for update;
  if not found then raise exception 'unknown_project' using errcode='PT404';end if;
  if project.revision is distinct from p_revision then raise exception 'stale_project' using errcode='40001';end if;
 else
  raise exception 'unknown_project_action' using errcode='23514';
 end if;
 if p_details is null or pg_column_size(p_details)>19000
  or not ara_studio_private.redesign_keys(p_details,array['title','scope','next_step','status','assigned_to','due_on'])
  or not ara_studio_private.redesign_text(p_details,'title',3,180)
  or not ara_studio_private.redesign_text(p_details,'scope',10,4000)
  or not ara_studio_private.redesign_text(p_details,'next_step',0,500)
  or coalesce(jsonb_typeof(p_details->'assigned_to'),'') not in ('null','string')
  or coalesce(jsonb_typeof(p_details->'due_on'),'') not in ('null','string')
  or (p_details->>'due_on' is not null and p_details->>'due_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
 then raise exception 'invalid_project_details' using errcode='23514';end if;
 owner_id=(p_details->>'assigned_to')::uuid;
 due_date=(p_details->>'due_on')::date;
 next_status=p_details->>'status';
 if owner_id is not null and owner_id is distinct from project.assigned_to
 and not exists(select 1 from public.studio_users where id=owner_id and active) then
  raise exception 'inactive_assignee' using errcode='23514';
 end if;
 if p_action='convert' then
  if next_status is distinct from 'planned' then raise exception 'initial_project_stage' using errcode='23514';end if;
  insert into public.studio_projects(prospect_id,client_name,title,scope,next_step,assigned_to,due_on,approved_by)
  values(prospect.id,prospect.business_name,btrim(p_details->>'title'),btrim(p_details->>'scope'),btrim(p_details->>'next_step'),owner_id,due_date,actor)
  returning * into project;
 else
  if next_status is null or next_status not in ('planned','in_progress','on_hold','completed') then
   raise exception 'invalid_project_stage' using errcode='23514';
  end if;
  if project.status='completed' and next_status<>'completed' and not ara_studio_private.is_admin() then
   raise exception 'admin_reopen_required' using errcode='42501';
  end if;
  update public.studio_projects set title=btrim(p_details->>'title'),scope=btrim(p_details->>'scope'),
   next_step=btrim(p_details->>'next_step'),status=next_status,assigned_to=owner_id,due_on=due_date,
   revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into project;
 end if;
 insert into public.studio_activity_log(entity_type,entity_id,action,actor_user_id,new_state,metadata)
 values('prospect',project.prospect_id,'project_'||p_action,actor,
  jsonb_build_object('business_name',project.client_name,'project_status',project.status),
  jsonb_build_object('project_id',project.id,'revision',project.revision));
 return to_jsonb(project);
end $$;
revoke all on function ara_studio_private.project_command(uuid,text,integer,jsonb,boolean,timestamptz) from public,anon,authenticated;
grant execute on function ara_studio_private.project_command(uuid,text,integer,jsonb,boolean,timestamptz) to authenticated;
create function public.studio_project_command(p_id uuid,p_action text,p_revision integer,p_details jsonb,p_confirmed boolean default false,p_prospect_version timestamptz default null)
returns jsonb language sql security invoker set search_path='' as $$
 select ara_studio_private.project_command(p_id,p_action,p_revision,p_details,p_confirmed,p_prospect_version)
$$;
revoke all on function public.studio_project_command(uuid,text,integer,jsonb,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.studio_project_command(uuid,text,integer,jsonb,boolean,timestamptz) to authenticated;
