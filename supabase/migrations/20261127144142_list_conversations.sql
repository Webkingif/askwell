-- list_conversations: the Conversations list (project.md §6.7, §7, §9).
-- No table or column changes.
--
-- PostgREST aggregates stay off (§9), so the preview, message count and
-- last-message time come from this one read-only function. Owners call it
-- through the owner client. It is SECURITY INVOKER: RLS on conversations and
-- messages scopes it to the caller's own projects, so another owner's project
-- ID returns zero rows.
--
-- Rows: newest first by last_message_at, then id (descending), at most
-- p_limit, clamped to 1..50 (null means 50).
--   preview          the first visitor message, left(body, 120); '' if none
--   message_count    every message in the conversation, visitor and bot
--   last_message_at  the newest message's created_at; the conversation's
--                    created_at if it has no messages

create function public.list_conversations(
  p_project_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  visitor_id text,
  preview text,
  message_count integer,
  created_at timestamptz,
  last_message_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.visitor_id,
    coalesce(left(f.body, 120), '') as preview,
    s.message_count,
    c.created_at,
    coalesce(s.last_message_at, c.created_at) as last_message_at
  from public.conversations c
  cross join lateral (
    select count(*)::integer as message_count, max(m.created_at) as last_message_at
    from public.messages m
    where m.conversation_id = c.id
  ) s
  left join lateral (
    select m.body
    from public.messages m
    where m.conversation_id = c.id
      and m.role = 'visitor'
    order by m.created_at, m.id
    limit 1
  ) f on true
  where c.project_id = p_project_id
  order by coalesce(s.last_message_at, c.created_at) desc, c.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 50);
$$;

-- Supabase's default privileges grant EXECUTE to the API roles; only owners
-- (authenticated) may call this one.
revoke all on function public.list_conversations(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_conversations(uuid, integer)
  to authenticated;
