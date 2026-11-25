-- Initial schema: every table in project.md §7, pgvector, RLS, helpers, grants.
--
-- The Data API is public, so RLS and grants are the security boundary:
--   anon           nothing at all
--   authenticated  SELECT rows in their own projects; rename and delete their
--                  own projects; execute the two RLS helpers
--   service_role   all table privileges except TRUNCATE (server only)
--
-- Enum and length values match packages/shared (enums.ts, constants.ts,
-- widget.ts DEFAULT_WIDGET_CONFIG). Change both together.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One per Clerk user. The plan is kept in sync by the Clerk webhook.
create table public.accounts (
  clerk_user_id text primary key,
  plan text not null default 'free'
    constraint accounts_plan_check check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.accounts (clerk_user_id),
  name text not null
    constraint projects_name_length check (char_length(name) between 1 and 80),
  -- PUBLIC_KEY_PATTERN in packages/shared/src/constants.ts
  public_key text not null
    constraint projects_public_key_key unique
    constraint projects_public_key_format check (public_key ~ '^pk_[A-Za-z0-9_-]{16,64}$'),
  messages_used integer not null default 0
    constraint projects_messages_used_nonnegative check (messages_used >= 0),
  -- Start of the current monthly usage period (UTC).
  period_start timestamptz not null default date_trunc('month', now(), 'UTC'),
  created_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects (owner_id);

-- One per project. Defaults equal DEFAULT_WIDGET_CONFIG.
create table public.widget_configs (
  project_id uuid primary key references public.projects (id) on delete cascade,
  button_color text not null default '#000000'
    constraint widget_configs_button_color_format check (button_color ~ '^#[0-9a-fA-F]{6}$'),
  position text not null default 'bottom-right'
    constraint widget_configs_position_check
    check (position in ('bottom-right', 'bottom-left', 'top-right', 'top-left')),
  label text not null default 'Chat with us'
    constraint widget_configs_label_length check (char_length(label) between 1 and 40),
  animation text not null default 'fade'
    constraint widget_configs_animation_check check (animation in ('fade', 'slide', 'scale')),
  header_text text not null default 'Ask us anything'
    constraint widget_configs_header_text_length check (char_length(header_text) between 1 and 60),
  show_badge boolean not null default true
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null
    constraint knowledge_sources_title_length check (char_length(title) between 1 and 200),
  type text not null
    constraint knowledge_sources_type_check check (type in ('text', 'pdf', 'md', 'txt')),
  -- Storage object path; null for pasted text, set for every file.
  storage_key text
    constraint knowledge_sources_storage_key_key unique,
  status text not null
    constraint knowledge_sources_status_check
    check (status in ('uploading', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  constraint knowledge_sources_storage_key_matches_type
    check ((type = 'text') = (storage_key is null)),
  -- Lets knowledge_chunks prove its project_id matches its source's.
  constraint knowledge_sources_id_project_id_key unique (id, project_id)
);

create index knowledge_sources_project_id_idx on public.knowledge_sources (project_id);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  source_id uuid not null,
  content text not null,
  -- text-embedding-3-small
  embedding extensions.vector(1536) not null,
  -- A chunk always belongs to its source's project, so a search scoped by
  -- project_id can never reach another project's text.
  constraint knowledge_chunks_source_fkey foreign key (source_id, project_id)
    references public.knowledge_sources (id, project_id) on delete cascade
);

create index knowledge_chunks_project_id_idx on public.knowledge_chunks (project_id);
create index knowledge_chunks_source_id_project_id_idx
  on public.knowledge_chunks (source_id, project_id);
create index knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  visitor_id text not null,
  created_at timestamptz not null default now()
);

-- Covers the project_id FK and the "newest first" list.
create index conversations_project_id_created_at_idx
  on public.conversations (project_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null
    constraint messages_role_check check (role in ('visitor', 'bot')),
  body text not null,
  created_at timestamptz not null default now()
);

-- Covers the conversation_id FK and the thread order.
create index messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS helpers (SECURITY DEFINER so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------

create function public.owned_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.projects p
  where p.owner_id = (select auth.jwt() ->> 'sub');
$$;

create function public.owned_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.conversations c
  join public.projects p on p.id = c.project_id
  where p.owner_id = (select auth.jwt() ->> 'sub');
$$;

revoke all on function public.owned_project_ids() from public, anon, authenticated, service_role;
revoke all on function public.owned_conversation_ids() from public, anon, authenticated, service_role;
grant execute on function public.owned_project_ids() to authenticated;
grant execute on function public.owned_conversation_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.accounts enable row level security;
alter table public.projects enable row level security;
alter table public.widget_configs enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "Owners read their own account"
  on public.accounts for select to authenticated
  using (clerk_user_id = (select auth.jwt() ->> 'sub'));

create policy "Owners read their own projects"
  on public.projects for select to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'));

-- Column grants below limit this to `name`.
create policy "Owners rename their own projects"
  on public.projects for update to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'))
  with check (owner_id = (select auth.jwt() ->> 'sub'));

create policy "Owners delete their own projects"
  on public.projects for delete to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'));

create policy "Owners read their projects' widget configs"
  on public.widget_configs for select to authenticated
  using (project_id in (select public.owned_project_ids()));

create policy "Owners read their projects' knowledge sources"
  on public.knowledge_sources for select to authenticated
  using (project_id in (select public.owned_project_ids()));

create policy "Owners read their projects' knowledge chunks"
  on public.knowledge_chunks for select to authenticated
  using (project_id in (select public.owned_project_ids()));

create policy "Owners read their projects' conversations"
  on public.conversations for select to authenticated
  using (project_id in (select public.owned_project_ids()));

create policy "Owners read their conversations' messages"
  on public.messages for select to authenticated
  using (conversation_id in (select public.owned_conversation_ids()));

-- ---------------------------------------------------------------------------
-- Grants (Supabase's default privileges grant everything to the API roles;
-- start from nothing and add back only what each role needs)
-- ---------------------------------------------------------------------------

revoke all on table
  public.accounts, public.projects, public.widget_configs,
  public.knowledge_sources, public.knowledge_chunks,
  public.conversations, public.messages
from public, anon, authenticated, service_role;

grant select on table
  public.accounts, public.projects, public.widget_configs,
  public.knowledge_sources, public.knowledge_chunks,
  public.conversations, public.messages
to authenticated;

grant update (name) on table public.projects to authenticated;
grant delete on table public.projects to authenticated;

-- Everything except TRUNCATE (it skips RLS and row triggers).
grant select, insert, update, delete, references, trigger on table
  public.accounts, public.projects, public.widget_configs,
  public.knowledge_sources, public.knowledge_chunks,
  public.conversations, public.messages
to service_role;
