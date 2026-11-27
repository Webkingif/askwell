-- Knowledge + chat: the private `knowledge` bucket and the four functions
-- Phase 3 calls (project.md §3, §6.4, §6.6, §7, §9). No table or column changes.
--
-- Every function is SECURITY INVOKER with an empty search_path, and only
-- service_role (the server) may execute it. Routes check ownership and read the
-- plan on the server, then pass the plan's limit in.
--
-- Errors (the routes map them to API errors):
--   P0001 'plan_limit_reached'  reserve_knowledge_source: the project is at p_limit
--   P0002 'not_found'           the project (or, for save_chat_turn, the
--                               conversation in that project) does not exist
--   22023 'invalid_limit'       p_limit is null or negative
--   22023 'invalid_status'      reserve_knowledge_source: p_status doesn't fit p_type
--   23514 (check violation)     a table check failed (e.g. title length)

-- Load pgvector in this session first. Until its library is loaded,
-- hnsw.iterative_scan (set by match_chunks below) is an unknown placeholder,
-- and Supabase's non-superuser postgres role is refused when CREATE FUNCTION
-- sets it ("permission denied to set parameter"). Once loaded it is an
-- ordinary user-settable parameter.
select '[0]'::extensions.vector;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for uploaded knowledge files
-- ---------------------------------------------------------------------------

-- file_size_limit = MAX_KNOWLEDGE_FILE_BYTES, allowed_mime_types =
-- ALLOWED_KNOWLEDGE_MIME_TYPES (packages/shared). Change both together.
-- No storage.objects policies: anon and authenticated get nothing; the server
-- (service_role) creates signed upload URLs and reads the files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge',
  'knowledge',
  false,
  10485760,
  array['application/pdf', 'text/markdown', 'text/x-markdown', 'text/plain']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- reserve_knowledge_source: add a source under the project's plan limit
-- ---------------------------------------------------------------------------
--
-- Pasted text (type 'text', no storage key) inserts as 'processing'; a file
-- inserts as 'uploading' and counts toward the limit until finalize claims it.
-- An 'uploading' source older than 2 hours was never finalized: it is deleted
-- first so it stops counting. Its Storage object, if any was uploaded, is not
-- removed here (SQL can't delete Storage objects); the route may clean it up.
--
-- Concurrency: the project row is locked FOR UPDATE before the reclaim and the
-- count, so two reservations for one project run one after the other.

create function public.reserve_knowledge_source(
  p_project_id uuid,
  p_title text,
  p_type text,
  p_storage_key text,
  p_status text,
  p_limit integer
)
returns public.knowledge_sources
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_count integer;
  v_source public.knowledge_sources;
begin
  if p_limit is null or p_limit < 0 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;

  if p_status is distinct from (case when p_type = 'text' then 'processing' else 'uploading' end) then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  perform 1
  from public.projects p
  where p.id = p_project_id
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  delete from public.knowledge_sources s
  where s.project_id = p_project_id
    and s.status = 'uploading'
    and s.created_at < now() - interval '2 hours';

  select count(*)::integer into v_count
  from public.knowledge_sources s
  where s.project_id = p_project_id;

  if v_count >= p_limit then
    raise exception 'plan_limit_reached' using errcode = 'P0001';
  end if;

  insert into public.knowledge_sources (project_id, title, type, storage_key, status)
  values (p_project_id, p_title, p_type, p_storage_key, p_status)
  returning * into v_source;

  return v_source;
end;
$$;

-- ---------------------------------------------------------------------------
-- match_chunks: nearest chunks of one project's ready sources
-- ---------------------------------------------------------------------------
--
-- When the planner uses the HNSW index, a plain scan returns only the
-- hnsw.ef_search (40) nearest chunks across all projects and filters after,
-- so a small project could get nothing. iterative_scan = strict_order
-- (pgvector >= 0.8) keeps scanning until p_count rows pass the project and
-- ready filters, in exact distance order (bounded by hnsw.max_scan_tuples).

create function public.match_chunks(
  p_project_id uuid,
  p_embedding extensions.vector(1536),
  p_count integer default 5
)
returns table (
  id uuid,
  source_id uuid,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
set hnsw.iterative_scan = strict_order
as $$
  select
    c.id,
    c.source_id,
    c.content,
    1 - (c.embedding operator(extensions.<=>) p_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_sources s
    on s.id = c.source_id and s.project_id = c.project_id
  where c.project_id = p_project_id
    and s.status = 'ready'
  order by c.embedding operator(extensions.<=>) p_embedding
  limit greatest(coalesce(p_count, 5), 0);
$$;

-- ---------------------------------------------------------------------------
-- consume_message: count one visitor message against the monthly quota
-- ---------------------------------------------------------------------------
--
-- One UPDATE resets the period when the month (UTC) rolled over and increments
-- only while under p_limit. The UPDATE row-locks the project and re-checks its
-- WHERE on the latest row, so concurrent calls can't both take the last slot.
-- Returns allowed and messages_used after the call.

create function public.consume_message(
  p_project_id uuid,
  p_limit integer
)
returns table (
  allowed boolean,
  messages_used integer
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_month timestamptz := date_trunc('month', now(), 'UTC');
  v_used integer;
begin
  if p_limit is null or p_limit < 0 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;

  update public.projects p
  set
    messages_used = case when p.period_start < v_month then 1 else p.messages_used + 1 end,
    period_start = greatest(p.period_start, v_month)
  where p.id = p_project_id
    and (case when p.period_start < v_month then 0 else p.messages_used end) < p_limit
  returning p.messages_used into v_used;

  if found then
    return query select true, v_used;
    return;
  end if;

  select p.messages_used into v_used
  from public.projects p
  where p.id = p_project_id;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return query select false, v_used;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_chat_turn: store a visitor message and the bot's reply
-- ---------------------------------------------------------------------------
--
-- Creates the conversation when p_conversation_id is null; otherwise the
-- conversation must belong to p_project_id. Returns the conversation id.

create function public.save_chat_turn(
  p_project_id uuid,
  p_visitor_id text,
  p_conversation_id uuid,
  p_visitor_body text,
  p_bot_body text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_conversation_id uuid;
  v_at timestamptz := clock_timestamp();
begin
  if p_conversation_id is null then
    insert into public.conversations (project_id, visitor_id)
    values (p_project_id, p_visitor_id)
    returning id into v_conversation_id;
  else
    select c.id into v_conversation_id
    from public.conversations c
    where c.id = p_conversation_id
      and c.project_id = p_project_id;

    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;

  -- The bot reply sorts after the visitor message (thread order is created_at).
  insert into public.messages (conversation_id, role, body, created_at)
  values
    (v_conversation_id, 'visitor', p_visitor_body, v_at),
    (v_conversation_id, 'bot', p_bot_body, v_at + interval '1 microsecond');

  return v_conversation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: Supabase's default privileges grant EXECUTE to the API roles; only
-- the server may call these.
-- ---------------------------------------------------------------------------

revoke all on function public.reserve_knowledge_source(uuid, text, text, text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.match_chunks(uuid, extensions.vector, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.consume_message(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.save_chat_turn(uuid, text, uuid, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.reserve_knowledge_source(uuid, text, text, text, text, integer)
  to service_role;
grant execute on function public.match_chunks(uuid, extensions.vector, integer)
  to service_role;
grant execute on function public.consume_message(uuid, integer)
  to service_role;
grant execute on function public.save_chat_turn(uuid, text, uuid, text, text)
  to service_role;
