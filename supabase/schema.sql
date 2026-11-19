-- Run in Supabase SQL editor (free tier). Text-only sync; audio stays on device.
create table if not exists public.recordings (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null default '',
  created_at bigint not null,
  updated_at bigint not null,
  duration real not null default 0,
  language text not null default 'auto',
  folder text not null default '',
  tags text[] not null default '{}',
  segments jsonb not null default '[]',
  summary text not null default '',
  slides text not null default '',
  mindmap text not null default '',
  deleted boolean not null default false
);

create table if not exists public.shares (
  token text primary key,
  recording_id uuid not null references public.recordings(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.recordings enable row level security;
alter table public.shares enable row level security;

create policy "own recordings" on public.recordings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own shares" on public.shares
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.recordings r where r.id = recording_id and r.user_id = auth.uid())
  );

-- Public read-only access by unguessable token
create or replace function public.get_shared(share_token text)
returns table (title text, summary text, slides text, mindmap text, segments jsonb, created_at bigint)
language sql security definer set search_path = public as $$
  select r.title, r.summary, r.slides, r.mindmap, r.segments, r.created_at
  from public.shares s join public.recordings r on r.id = s.recording_id
  where s.token = share_token and r.deleted = false;
$$;
grant execute on function public.get_shared(text) to anon, authenticated;
