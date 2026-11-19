create table public.ara_leads (
 id uuid primary key default gen_random_uuid(),
 submission_key uuid not null unique,
 reference text not null unique,
 created_at timestamptz not null default now(),
 kind text not null check (kind in ('contact','review')),
 name text not null,
 email text not null,
 business text not null,
 country text not null,
 service text not null default '',
 budget text not null default '',
 website text not null default '',
 phone text not null default '',
 industry text not null default '',
 social text not null default '',
 message text not null,
 source text not null default '',
 consent boolean not null check(consent),
 status text not null default 'New' check(status in ('New','Contacted','Qualified','Proposal Sent','Won','Lost')),
 notes text not null default '',
 notification_status text not null default 'pending' check(notification_status in ('pending','sent','failed')),
 confirmation_status text not null default 'pending' check(confirmation_status in ('pending','sent','failed'))
);
create index ara_leads_created_idx on public.ara_leads(created_at desc);
create table public.ara_submission_limits (
 key text primary key,
 count integer not null default 1,
 expires_at timestamptz not null
);
alter table public.ara_leads enable row level security;
alter table public.ara_submission_limits enable row level security;
revoke all on public.ara_leads from anon, authenticated;
revoke all on public.ara_submission_limits from anon, authenticated;
grant select,insert,update,delete on public.ara_leads to service_role;
grant select,insert,update,delete on public.ara_submission_limits to service_role;

create function public.submit_ara_enquiry(payload jsonb, limiter_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 existing public.ara_leads;
 created public.ara_leads;
 attempt_count integer;
 new_id uuid := gen_random_uuid();
begin
 -- The advisory lock makes retries with the same submission key atomic.
 perform pg_advisory_xact_lock(hashtextextended(payload->>'idempotency',0));
 select * into existing from public.ara_leads where submission_key=(payload->>'idempotency')::uuid;
 if found then
  return jsonb_build_object('id',existing.id,'reference',existing.reference,'duplicate',true,'notification_status',existing.notification_status,'confirmation_status',existing.confirmation_status);
 end if;
 insert into public.ara_submission_limits(key,count,expires_at)
 values(limiter_key,1,now()+interval '1 hour')
 on conflict(key) do update set count=public.ara_submission_limits.count+1
 returning count into attempt_count;
 if attempt_count>5 then raise exception 'rate_limited'; end if;
 insert into public.ara_leads(id,submission_key,reference,kind,name,email,business,country,service,budget,website,phone,industry,social,message,source,consent)
 values(new_id,(payload->>'idempotency')::uuid,'ARA-'||upper(left(new_id::text,8)),payload->>'kind',payload->>'name',payload->>'email',payload->>'business',payload->>'country',coalesce(payload->>'service',''),coalesce(payload->>'budget',''),coalesce(payload->>'website',''),coalesce(payload->>'phone',''),coalesce(payload->>'industry',''),coalesce(payload->>'social',''),payload->>'message',coalesce(payload->>'source',''),true)
 returning * into created;
 delete from public.ara_submission_limits where key in (select key from public.ara_submission_limits where expires_at<now() limit 100);
 return jsonb_build_object('id',created.id,'reference',created.reference,'duplicate',false,'notification_status',created.notification_status,'confirmation_status',created.confirmation_status);
end;
$$;
revoke all on function public.submit_ara_enquiry(jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_ara_enquiry(jsonb,text) to service_role;
