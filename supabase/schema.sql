-- 職安乙級 App：讀書進度同步（獨立的 Supabase 專案，跟監造數位化無關）
-- 貼到 Supabase → SQL Editor → 全選（Ctrl+A）後按 Run。可以重複跑。

create table if not exists public.progress (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

-- 每個人只能讀寫自己的那一列
drop policy if exists "own row select" on public.progress;
drop policy if exists "own row insert" on public.progress;
drop policy if exists "own row update" on public.progress;
create policy "own row select" on public.progress for select using (auth.uid() = user_id);
create policy "own row insert" on public.progress for insert with check (auth.uid() = user_id);
create policy "own row update" on public.progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
