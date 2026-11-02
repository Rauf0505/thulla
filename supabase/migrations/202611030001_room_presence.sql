create table public.room_presence (
  room_code text not null references public.rooms(code) on delete cascade,
  seat_id text not null,
  user_id uuid references public.profiles(id) on delete set null,
  last_seen timestamptz not null default now(),
  primary key (room_code, seat_id)
);

alter table public.room_presence enable row level security;

create index room_presence_last_seen on public.room_presence(room_code, last_seen desc);
