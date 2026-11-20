create index studio_redesigns_source_audit on public.studio_redesigns(source_audit_id);
create index studio_redesigns_creator on public.studio_redesigns(created_by);
create index studio_redesigns_approver on public.studio_redesigns(approved_by);
create index studio_redesign_demos_creator on public.studio_redesign_demos(created_by);
