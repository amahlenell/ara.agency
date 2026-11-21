create or replace function ara_studio_private.redesign_valid(doc jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; contact jsonb;
begin
 if doc is null or pg_column_size(doc)>20000 or not ara_studio_private.redesign_keys(doc,array['version','brand','hero','services','about','contact','seo']) or jsonb_typeof(doc->'version') is distinct from 'number' or doc->>'version' not in ('1','2') then return false;end if;
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

create or replace function ara_studio_private.redesign_ready(doc jsonb) returns boolean
language sql immutable set search_path='' as $$
 select case when ara_studio_private.redesign_valid(doc) then
  char_length(btrim(doc->'hero'->>'body'))>=20 and (doc->>'version'='2' or (char_length(btrim(doc->'about'->>'body'))>=20 and jsonb_array_length(doc->'services')>=1))
  and (doc->'contact'->>'email'<>'' or doc->'contact'->>'phone'<>'' or doc->'contact'->>'bookingUrl'<>'')
 else false end
$$;

create or replace function ara_studio_private.redesign_command(p_id uuid,p_action text,p_revision integer,p_content jsonb default null,p_note text default '',p_reference text default null,p_confirmed boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=ara_studio_private.staff_id();target public.studio_redesigns;prospect public.studio_prospects;source_audit uuid;
begin
 if actor is null then raise exception 'active_staff_required' using errcode='42501';end if;
 perform ara_studio_private.consume_write();
 if p_action='create' then
  select * into prospect from public.studio_prospects where id=p_id for update;
  if not found then raise exception 'unknown_prospect' using errcode='PT404';end if;
  if p_content->>'version'='2' and prospect.website_url is distinct from p_note then raise exception 'stale_prospect_website' using errcode='40001';end if;
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
