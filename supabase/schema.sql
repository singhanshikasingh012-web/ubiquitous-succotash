create extension if not exists pgcrypto;

create table if not exists public.question_threads (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  asked_by text not null,
  question text not null,
  created_at timestamptz not null default now(),
  answered_by text,
  answer_text text,
  answer_type text,
  answer_attachment_name text,
  answer_attachment_type text,
  answer_attachment_data text,
  answered_at timestamptz
);

create index if not exists question_threads_room_created_at_idx
  on public.question_threads (room_code, created_at desc);