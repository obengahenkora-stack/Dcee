-- Lab Management System: database schema for Supabase (PostgreSQL)
-- Run this once in the Supabase SQL editor.

-- ---------- Tables ----------

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  student_id text,
  role text not null default 'student'
    check (role in ('student', 'lecturer', 'lab_admin', 'super_admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table software (
  id bigint generated always as identity primary key,
  name text not null,
  version text,
  vendor text,
  licence_type text,
  seats int not null default 1 check (seats > 0),
  expiry_date date,
  host_machine text,
  active boolean not null default true
);

create table bookings (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references profiles(id),
  software_id bigint not null references software(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked', 'cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table usage_logs (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id),
  software_id bigint references software(id),
  session_start timestamptz not null,
  session_end timestamptz
);

create table assets (
  id bigint generated always as identity primary key,
  name text not null,
  asset_type text,
  serial_number text,
  location text,
  condition text,
  next_service date
);

create table tickets (
  id bigint generated always as identity primary key,
  reporter_id uuid not null default auth.uid() references profiles(id),
  software_id bigint references software(id),
  asset_id bigint references assets(id),
  description text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  assigned_to uuid references profiles(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table backups (
  id bigint generated always as identity primary key,
  backup_date date not null default current_date,
  what text,
  result text check (result in ('ok', 'failed'))
);

-- ---------- Helper functions ----------

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and active and role in ('lab_admin', 'super_admin')
  );
$$;

create function is_super() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and active and role = 'super_admin'
  );
$$;

-- Create a profile automatically when someone signs up (always as a student).
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, student_id)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'student_id'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Only a super admin may change roles or the active flag.
-- (auth.uid() is null in the SQL editor, so you can set the first super admin there.)
create function protect_profile_fields() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not is_super()
     and (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'Only a super admin can change role or active status';
  end if;
  return new;
end;
$$;

create trigger protect_profile_fields
  before update on profiles
  for each row execute function protect_profile_fields();

-- Never book more seats than the licence allows in the same time slot.
create function check_seats() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  seat_limit int;
  taken int;
begin
  if new.status <> 'booked' then
    return new;
  end if;
  select seats into seat_limit from software where id = new.software_id and active;
  if seat_limit is null then
    raise exception 'This software is not available for booking';
  end if;
  select count(*) into taken from bookings
  where software_id = new.software_id
    and status = 'booked'
    and id is distinct from new.id
    and starts_at < new.ends_at
    and ends_at > new.starts_at;
  if taken >= seat_limit then
    raise exception 'No seats left in that time slot';
  end if;
  return new;
end;
$$;

create trigger check_seats
  before insert or update on bookings
  for each row execute function check_seats();

-- ---------- Row level security ----------

alter table profiles   enable row level security;
alter table software   enable row level security;
alter table bookings   enable row level security;
alter table usage_logs enable row level security;
alter table assets     enable row level security;
alter table tickets    enable row level security;
alter table backups    enable row level security;

-- profiles
create policy "read own or admin" on profiles for select
  using (id = auth.uid() or is_admin());
create policy "update own or super" on profiles for update
  using (id = auth.uid() or is_super());

-- software: everyone signed in can see it, admins manage it
create policy "read software" on software for select
  using (auth.uid() is not null);
create policy "admin writes software" on software for all
  using (is_admin()) with check (is_admin());

-- bookings
create policy "read own or admin" on bookings for select
  using (user_id = auth.uid() or is_admin());
create policy "book for self" on bookings for insert
  with check (user_id = auth.uid());
create policy "change own or admin" on bookings for update
  using (user_id = auth.uid() or is_admin());

-- usage logs
create policy "read own or admin" on usage_logs for select
  using (user_id = auth.uid() or is_admin());
create policy "admin writes usage" on usage_logs for all
  using (is_admin()) with check (is_admin());

-- assets and backups: admins only
create policy "admin assets" on assets for all
  using (is_admin()) with check (is_admin());
create policy "admin backups" on backups for all
  using (is_admin()) with check (is_admin());

-- tickets
create policy "read own or admin" on tickets for select
  using (reporter_id = auth.uid() or is_admin());
create policy "report a fault" on tickets for insert
  with check (reporter_id = auth.uid());
create policy "admin updates tickets" on tickets for update
  using (is_admin());

-- ---------- Make yourself the first super admin ----------
-- 1. Sign up on the site with your email.
-- 2. Run this in the SQL editor, using your email:
--
-- update profiles set role = 'super_admin'
-- where id = (select id from auth.users where email = 'you@example.com');
