-- create_project: create a project under the owner's plan limit (project.md §6.3, §7).
--
-- The caller (a server route, as service_role) reads the plan on the server and
-- passes its PLAN_LIMITS.projects as p_max_projects; the limit is not kept here.
--
-- Concurrency: the owner's accounts row is locked FOR UPDATE before counting, so
-- two concurrent creates for one owner run one after the other and the second
-- sees the first's project. Both can't pass the limit.
--
-- Errors (the route maps them to API errors):
--   P0001 'project_limit'      the owner already has p_max_projects projects
--   P0002 'account_not_found'  no accounts row for p_owner_id
--   22023 'invalid_limit'      p_max_projects is null or negative
--   23514 (check violation)    name outside 1..80 chars (projects_name_length)

create function public.create_project(
  p_owner_id text,
  p_name text,
  p_max_projects integer
)
returns public.projects
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_count integer;
  v_project public.projects;
begin
  if p_max_projects is null or p_max_projects < 0 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;

  perform 1
  from public.accounts a
  where a.clerk_user_id = p_owner_id
  for update;

  if not found then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_count
  from public.projects p
  where p.owner_id = p_owner_id;

  if v_count >= p_max_projects then
    raise exception 'project_limit' using errcode = 'P0001';
  end if;

  -- 'pk_' + 32 hex chars (122 random bits); matches PUBLIC_KEY_PATTERN in
  -- packages/shared/src/constants.ts and the projects_public_key_format check.
  insert into public.projects (owner_id, name, public_key)
  values (p_owner_id, p_name, 'pk_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into v_project;

  -- Column defaults equal DEFAULT_WIDGET_CONFIG.
  insert into public.widget_configs (project_id)
  values (v_project.id);

  return v_project;
end;
$$;

-- Supabase's default privileges grant EXECUTE to the API roles; only the
-- server may call this.
revoke all on function public.create_project(text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.create_project(text, text, integer) to service_role;
