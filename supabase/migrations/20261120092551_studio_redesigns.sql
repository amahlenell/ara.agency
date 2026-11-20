-- Phase 3: structured concepts, reviewed snapshots and capability-gated demos.
-- The existing public website, enquiries, staff and prospect records are retained.
create function ara_studio_private.redesign_keys(doc jsonb, expected text[]) returns boolean
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(doc)='object' then
  array(select jsonb_object_keys(doc)) <@ expected and expected <@ array(select jsonb_object_keys(doc))
 else false end
$$;
create function ara_studio_private.redesign_text(doc jsonb, field text, minimum integer, maximum integer) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(doc->field)='string' and char_length(btrim(doc->>field))>=minimum and char_length(doc->>field)<=maximum,false)
$$;
create function ara_studio_private.redesign_valid(doc jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; contact jsonb;
begin
 if doc is null or pg_column_size(doc)>20000 or not ara_studio_private.redesign_keys(doc,array['version','brand','hero','services','about','contact','seo']) or jsonb_typeof(doc->'version') is distinct from 'number' or doc->>'version' is distinct from '1' then return false;end if;
 if not ara_studio_private.redesign_keys(doc->'brand',array['name','tagline','palette','art'])
  or not ara_studio_private.redesign_text(doc->'brand','name',2,180) or not ara_studio_private.redesign_text(doc->'brand','tagline',0,100)
  or not ara_studio_private.redesign_text(doc->'brand','palette',1,20) or not ara_studio_private.redesign_text(doc->'brand','art',1,20)
  or doc->'brand'->>'palette' not in ('sage','rose','midnight') or doc->'brand'->>'art' not in ('petal','arch','none') then return false;end if;
 if not ara_studio_private.redesign_keys(doc->'hero',array['eyebrow','heading','body','cta'])
  or not ara_studio_private.redesign_text(doc->'hero','eyebrow',0,70) or not ara_studio_private.redesign_text(doc->'hero','heading',3,120)
  or not ara_studio_private.redesign_text(doc->'hero','body',0,600) or not ara_studio_private.redesign_text(doc->'hero','cta',2,40) then return false;end if;
 if jsonb_typeof(doc->'services') is distinct from 'array' then return false;end if;
 if jsonb_array_length(doc->'services')>12 then return false;end if;
 for item in select * from jsonb_array_elements(doc->'services') loop
  if not ara_studio_private.redesign_keys(item,array['name','description','price']) or not ara_studio_private.redesign_text(item,'name',1,80)
   or not ara_studio_private.redesign_text(item,'description',0,400) or not ara_studio_private.redesign_text(item,'price',0,60) then return false;end if;
 end loop;
 if not ara_studio_private.redesign_keys(doc->'about',array['heading','body']) or not ara_studio_private.redesign_text(doc->'about','heading',2,100)
  or not ara_studio_private.redesign_text(doc->'about','body',0,1800) then return false;end if;
 contact=doc->'contact';
 if not ara_studio_private.redesign_keys(contact,array['email','phone','address','hours','bookingUrl'])
  or not ara_studio_private.redesign_text(contact,'email',0,254) or not ara_studio_private.redesign_text(contact,'phone',0,60)
  or not ara_studio_private.redesign_text(contact,'address',0,500) or not ara_studio_private.redesign_text(contact,'hours',0,300)
  or not ara_studio_private.redesign_text(contact,'bookingUrl',0,2048) then return false;end if;
 if contact->>'email'<>'' and contact->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return false;end if;
 if contact->>'phone'<>'' and (contact->>'phone' !~ '^[+0-9 ()/.-]+$' or length(regexp_replace(contact->>'phone','[^0-9]','','g'))<3) then return false;end if;
 if contact->>'bookingUrl'<>'' and (contact->>'bookingUrl' !~ '^https://([a-zA-Z0-9-]+\.)+[a-zA-Z][a-zA-Z0-9-]*(:443)?([/?#]|$)'
  or contact->>'bookingUrl' ~ '^https://[^/]*@' or contact->>'bookingUrl' ~ '^https://([^/]*\.)?(localhost|local|internal|test|invalid|example)([:/?#]|$)'
  or contact->>'bookingUrl' ~ '^https://metadata\.google\.internal([/?#]|$)') then return false;end if;
 if not ara_studio_private.redesign_keys(doc->'seo',array['title','description']) or not ara_studio_private.redesign_text(doc->'seo','title',2,100)
  or not ara_studio_private.redesign_text(doc->'seo','description',0,200) then return false;end if;
 return true;
end $$;
create function ara_studio_private.redesign_ready(doc jsonb) returns boolean
language sql immutable set search_path='' as $$
 select case when ara_studio_private.redesign_valid(doc) then
  char_length(btrim(doc->'hero'->>'body'))>=20 and char_length(btrim(doc->'about'->>'body'))>=20
  and jsonb_array_length(doc->'services')>=1
  and (doc->'contact'->>'email'<>'' or doc->'contact'->>'phone'<>'' or doc->'contact'->>'bookingUrl'<>'')
 else false end
$$;
revoke all on function ara_studio_private.redesign_keys(jsonb,text[]),ara_studio_private.redesign_text(jsonb,text,integer,integer),ara_studio_private.redesign_valid(jsonb),ara_studio_private.redesign_ready(jsonb) from public,anon,authenticated;

create table public.studio_redesigns (
 id uuid primary key default gen_random_uuid(), prospect_id uuid not null references public.studio_prospects(id) on delete restrict,
 source_audit_id uuid references public.studio_audits(id) on delete restrict, original_url text not null,
 template_id text not null default 'beauty_salon_v1' check(template_id='beauty_salon_v1'),
 content jsonb not null check(ara_studio_private.redesign_valid(content)), revision integer not null default 1 check(revision>0),
 status text not null default 'draft' check(status in ('draft','in_review','approved')), review_note text not null default '' check(char_length(review_note)<=1000),
 reference_path text check(reference_path is null or (char_length(reference_path)<=200 and split_part(reference_path,'/',1)=id::text)),
 created_by uuid not null references public.studio_users(id) on delete restrict,
 approved_by uuid references public.studio_users(id) on delete restrict, approved_at timestamptz, approved_revision integer,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check ((status='approved' and approved_by is not null and approved_at is not null and approved_revision=revision)
  or (status<>'approved' and approved_by is null and approved_at is null and approved_revision is null))
);
create index studio_redesigns_prospect_updated on public.studio_redesigns(prospect_id,updated_at desc);
create index studio_redesigns_updated on public.studio_redesigns(updated_at desc);
create table public.studio_redesign_demos (
 id uuid primary key default gen_random_uuid(),redesign_id uuid not null references public.studio_redesigns(id) on delete restrict,
 revision integer not null check(revision>0),token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 content_snapshot jsonb not null check(ara_studio_private.redesign_valid(content_snapshot)),
 expires_at timestamptz not null,revoked_at timestamptz,created_by uuid not null references public.studio_users(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp()
);
create index studio_redesign_demos_redesign on public.studio_redesign_demos(redesign_id,created_at desc);
alter table public.studio_redesigns enable row level security;
alter table public.studio_redesign_demos enable row level security;
revoke all on public.studio_redesigns,public.studio_redesign_demos from public,anon,authenticated;
grant select on public.studio_redesigns to authenticated;
grant select(id,redesign_id,revision,expires_at,revoked_at,created_by,created_at) on public.studio_redesign_demos to authenticated;
create policy studio_redesigns_read on public.studio_redesigns for select to authenticated using((select ara_studio_private.staff_id()) is not null);
create policy studio_redesign_demos_read on public.studio_redesign_demos for select to authenticated using((select ara_studio_private.staff_id()) is not null);

create function ara_studio_private.redesign_log(target public.studio_redesigns,event text) returns void
language sql security definer set search_path='' as $$
 insert into public.studio_activity_log(entity_type,entity_id,action,actor_user_id,new_state,metadata)
 values('prospect',target.prospect_id,'redesign_'||event,ara_studio_private.staff_id(),
  jsonb_build_object('business_name',target.content->'brand'->>'name','redesign_status',target.status,'revision',target.revision),
  jsonb_build_object('redesign_id',target.id,'revision',target.revision))
$$;
revoke all on function ara_studio_private.redesign_log(public.studio_redesigns,text) from public,anon,authenticated;

create function ara_studio_private.redesign_command(p_id uuid,p_action text,p_revision integer,p_content jsonb default null,p_note text default '',p_reference text default null,p_confirmed boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=ara_studio_private.staff_id();target public.studio_redesigns;prospect public.studio_prospects;source_audit uuid;
begin
 if actor is null then raise exception 'active_staff_required' using errcode='42501';end if;
 perform ara_studio_private.consume_write();
 if p_action='create' then
  select * into prospect from public.studio_prospects where id=p_id for update;
  if not found then raise exception 'unknown_prospect' using errcode='PT404';end if;
  if prospect.lifecycle_status='archived' or not ara_studio_private.redesign_valid(p_content) then raise exception 'invalid_redesign' using errcode='23514';end if;
  select id into source_audit from public.studio_audits where prospect_id=p_id and website_url=prospect.website_url and status='completed' order by created_at desc limit 1;
  insert into public.studio_redesigns(prospect_id,source_audit_id,original_url,content,created_by)
  values(p_id,source_audit,prospect.website_url,p_content,actor) returning * into target;
 else
  select * into target from public.studio_redesigns where id=p_id for update;
  if not found then raise exception 'unknown_redesign' using errcode='PT404';end if;
  select * into prospect from public.studio_prospects where id=target.prospect_id for share;
  if prospect.lifecycle_status='archived' then raise exception 'restore_prospect_first' using errcode='23514';end if;
  if p_revision is null or p_revision<>target.revision then raise exception 'stale_redesign' using errcode='40001';end if;
  if p_action='save' then
   if not ara_studio_private.redesign_valid(p_content) then raise exception 'invalid_redesign_content' using errcode='23514';end if;
   update public.studio_redesigns set content=p_content,revision=revision+1,status='draft',review_note='',approved_by=null,approved_at=null,approved_revision=null,updated_at=clock_timestamp() where id=p_id returning * into target;
  elsif p_action='reference' then
   if p_reference is null or split_part(p_reference,'/',1)<>p_id::text or p_reference !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|webp)$'
    or not exists(select 1 from storage.objects where bucket_id='studio-redesign-references' and name=p_reference) then raise exception 'invalid_reference' using errcode='23514';end if;
   update public.studio_redesigns set reference_path=p_reference,revision=revision+1,status='draft',review_note='',approved_by=null,approved_at=null,approved_revision=null,updated_at=clock_timestamp() where id=p_id returning * into target;
  elsif p_action='submit' then
   if target.status<>'draft' then raise exception 'redesign_state_changed' using errcode='40001';end if;
   if not ara_studio_private.redesign_ready(target.content) then raise exception 'redesign_not_ready' using errcode='23514';end if;
   update public.studio_redesigns set status='in_review',review_note='',updated_at=clock_timestamp() where id=p_id returning * into target;
  elsif p_action='approve' then
   if not ara_studio_private.is_admin() then raise exception 'admin_required' using errcode='42501';end if;
   if target.status<>'in_review' then raise exception 'redesign_state_changed' using errcode='40001';end if;
   if p_confirmed is distinct from true or not ara_studio_private.redesign_ready(target.content) then raise exception 'review_required' using errcode='23514';end if;
   update public.studio_redesigns set status='approved',approved_by=actor,approved_at=clock_timestamp(),approved_revision=revision,review_note='',updated_at=clock_timestamp() where id=p_id returning * into target;
  elsif p_action='request_changes' then
   if not ara_studio_private.is_admin() then raise exception 'admin_required' using errcode='42501';end if;
   if target.status<>'in_review' then raise exception 'redesign_state_changed' using errcode='40001';end if;
   if p_note is null or char_length(btrim(p_note)) not between 3 and 1000 then raise exception 'review_note_required' using errcode='23514';end if;
   update public.studio_redesigns set status='draft',review_note=btrim(p_note),updated_at=clock_timestamp() where id=p_id returning * into target;
  else raise exception 'unknown_redesign_action' using errcode='23514';end if;
 end if;
 perform ara_studio_private.redesign_log(target,p_action);
 return to_jsonb(target);
end $$;
revoke all on function ara_studio_private.redesign_command(uuid,text,integer,jsonb,text,text,boolean) from public,anon,authenticated;
grant execute on function ara_studio_private.redesign_command(uuid,text,integer,jsonb,text,text,boolean) to authenticated;
create function public.studio_redesign_command(p_id uuid,p_action text,p_revision integer,p_content jsonb default null,p_note text default '',p_reference text default null,p_confirmed boolean default false) returns jsonb
language sql security invoker set search_path='' as $$select ara_studio_private.redesign_command(p_id,p_action,p_revision,p_content,p_note,p_reference,p_confirmed)$$;
revoke all on function public.studio_redesign_command(uuid,text,integer,jsonb,text,text,boolean) from public,anon,authenticated;
grant execute on function public.studio_redesign_command(uuid,text,integer,jsonb,text,text,boolean) to authenticated;

create function ara_studio_private.create_redesign_demo(p_id uuid,p_revision integer,p_hash text,p_days integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target public.studio_redesigns;link public.studio_redesign_demos;
begin
 if not ara_studio_private.is_admin() then raise exception 'admin_required' using errcode='42501';end if;
 perform ara_studio_private.consume_write();
 select * into target from public.studio_redesigns where id=p_id for update;
 if not found then raise exception 'unknown_redesign' using errcode='PT404';end if;
 if target.revision is distinct from p_revision then raise exception 'stale_redesign' using errcode='40001';end if;
 if target.status<>'approved' or target.approved_revision<>target.revision or not exists(select 1 from public.studio_prospects where id=target.prospect_id and lifecycle_status<>'archived') then raise exception 'approved_redesign_required' using errcode='23514';end if;
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_days is null or p_days not in (1,3,7) then raise exception 'invalid_demo_link' using errcode='23514';end if;
 if (select count(*) from public.studio_redesign_demos where redesign_id=p_id and revoked_at is null and expires_at>clock_timestamp())>=10 then raise exception 'active_demo_limit' using errcode='P1001';end if;
 insert into public.studio_redesign_demos(redesign_id,revision,token_hash,content_snapshot,expires_at,created_by)
 values(p_id,target.revision,p_hash,target.content,clock_timestamp()+make_interval(days=>p_days),ara_studio_private.staff_id()) returning * into link;
 perform ara_studio_private.redesign_log(target,'demo_created');
 return to_jsonb(link)-'token_hash'-'content_snapshot';
end $$;
revoke all on function ara_studio_private.create_redesign_demo(uuid,integer,text,integer) from public,anon,authenticated;
grant execute on function ara_studio_private.create_redesign_demo(uuid,integer,text,integer) to authenticated;
create function public.studio_create_redesign_demo(p_id uuid,p_revision integer,p_hash text,p_days integer) returns jsonb
language sql security invoker set search_path='' as $$select ara_studio_private.create_redesign_demo(p_id,p_revision,p_hash,p_days)$$;
revoke all on function public.studio_create_redesign_demo(uuid,integer,text,integer) from public,anon,authenticated;
grant execute on function public.studio_create_redesign_demo(uuid,integer,text,integer) to authenticated;

create function ara_studio_private.revoke_redesign_demo(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare link public.studio_redesign_demos;target public.studio_redesigns;
begin
 if not ara_studio_private.is_admin() then raise exception 'admin_required' using errcode='42501';end if;
 perform ara_studio_private.consume_write();
 select * into link from public.studio_redesign_demos where id=p_id for update;
 if not found then raise exception 'unknown_demo' using errcode='PT404';end if;
 if link.revoked_at is null then
  update public.studio_redesign_demos set revoked_at=clock_timestamp() where id=p_id;
  select * into target from public.studio_redesigns where id=link.redesign_id;
  perform ara_studio_private.redesign_log(target,'demo_revoked');
 end if;
end $$;
revoke all on function ara_studio_private.revoke_redesign_demo(uuid) from public,anon,authenticated;
grant execute on function ara_studio_private.revoke_redesign_demo(uuid) to authenticated;
create function public.studio_revoke_redesign_demo(p_id uuid) returns void language sql security invoker set search_path='' as $$select ara_studio_private.revoke_redesign_demo(p_id)$$;
revoke all on function public.studio_revoke_redesign_demo(uuid) from public,anon,authenticated;
grant execute on function public.studio_revoke_redesign_demo(uuid) to authenticated;

-- Deliberate public capability endpoint: a 256-bit hash and matching link ID
-- expose only the approved snapshot. No anonymous table grants or staff data.
create function public.studio_read_redesign_demo(p_id uuid,p_hash text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('content',demo.content_snapshot,'template_id','beauty_salon_v1','revision',demo.revision,'expires_at',demo.expires_at)
 from public.studio_redesign_demos demo join public.studio_redesigns concept on concept.id=demo.redesign_id
 join public.studio_prospects prospect on prospect.id=concept.prospect_id
 where demo.id=p_id and p_hash ~ '^[a-f0-9]{64}$' and demo.token_hash=p_hash
 and demo.revoked_at is null and demo.expires_at>now() and prospect.lifecycle_status<>'archived'
$$;
revoke all on function public.studio_read_redesign_demo(uuid,text) from public,anon,authenticated;
grant execute on function public.studio_read_redesign_demo(uuid,text) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('studio-redesign-references','studio-redesign-references',false,5242880,array['image/png','image/jpeg','image/webp']);
create policy studio_reference_read on storage.objects for select to authenticated
 using(bucket_id='studio-redesign-references' and (select ara_studio_private.staff_id()) is not null
  and exists(select 1 from public.studio_redesigns where id::text=split_part(storage.objects.name,'/',1)));
create policy studio_reference_upload on storage.objects for insert to authenticated
 with check(bucket_id='studio-redesign-references' and (select ara_studio_private.staff_id()) is not null
  and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|webp)$'
  and exists(select 1 from public.studio_redesigns concept join public.studio_prospects prospect on prospect.id=concept.prospect_id
   where concept.id::text=split_part(storage.objects.name,'/',1) and prospect.lifecycle_status<>'archived'));
create policy studio_reference_cleanup on storage.objects for delete to authenticated
 using(bucket_id='studio-redesign-references' and (select ara_studio_private.staff_id()) is not null
  and exists(select 1 from public.studio_redesigns where id::text=split_part(storage.objects.name,'/',1))
  and not exists(select 1 from public.studio_redesigns where reference_path=storage.objects.name));
