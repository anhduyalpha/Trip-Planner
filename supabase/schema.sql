-- ============================================================
--  QUẢN LÝ LỊCH TRÌNH CHUYẾN ĐI — Database schema (PostgreSQL / Supabase)
--  Cách dùng: mở Supabase Dashboard > SQL Editor > dán toàn bộ file này > Run
-- ============================================================

-- ---------- 1. PROFILES (gắn với auth.users của Supabase) ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default 'Thành viên',
  created_at timestamptz not null default now()
);

-- Tự tạo profile mỗi khi có user đăng ký
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 2. TRIPS ----------
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text default '',
  start_date  date,
  end_date    date,
  lead_id     uuid not null references public.profiles (id) on delete cascade,
  join_code   text not null unique,
  created_at  timestamptz not null default now()
);

-- ---------- 3. TRIP_MEMBERS ----------
-- user_id có thể NULL: Lead được phép thêm thành viên "ngoại tuyến" (không có tài khoản)
create table if not exists public.trip_members (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id) on delete cascade,
  user_id      uuid references public.profiles (id) on delete set null,
  display_name text not null,
  role_desc    text default '',              -- dẫn đoàn / xem map / nấu ăn / chụp hình...
  permission   text not null default 'member' check (permission in ('lead', 'member')),
  created_at   timestamptz not null default now(),
  unique (trip_id, user_id)
);

-- ---------- 4. EVENTS ----------
create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references public.trips (id) on delete cascade,
  title           text not null,
  description     text default '',
  start_time      timestamptz not null,
  end_time        timestamptz not null,
  location        text default '',
  category        text not null default 'other'
                  check (category in ('food', 'sightseeing', 'bonding', 'move', 'rest', 'other')),
  status          text not null default 'upcoming'
                  check (status in ('upcoming', 'ongoing', 'done', 'cancelled', 'postponed')),
  approval        text not null default 'pending'
                  check (approval in ('pending', 'approved', 'rejected')),
  is_completed    boolean not null default false,
  cost            numeric(14, 2) not null default 0 check (cost >= 0),
  payer_member_id uuid references public.trip_members (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint events_time_order check (end_time > start_time)
);

create index if not exists events_trip_start_idx on public.events (trip_id, start_time);

-- ---------- 5. EVENT_MEMBERS (assign thành viên vào event) ----------
create table if not exists public.event_members (
  event_id  uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.trip_members (id) on delete cascade,
  primary key (event_id, member_id)
);

-- ============================================================
--  HÀM TIỆN ÍCH (security definer để tránh RLS đệ quy)
-- ============================================================
-- Giữ các bản public bên dưới để file này nâng cấp được database cũ mà không
-- làm gãy policy đang phụ thuộc. Các policy mới dùng bản trong schema private;
-- Supabase/PostgREST không expose schema này như RPC công khai.
create schema if not exists private;

create or replace function public.is_trip_member(p_trip uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from trip_members where trip_id = p_trip and user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_lead(p_trip uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from trips where id = p_trip and lead_id = auth.uid());
$$;

create or replace function public.event_trip(p_event uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select trip_id from events where id = p_event;
$$;

create or replace function private.is_trip_member(p_trip uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from trip_members where trip_id = p_trip and user_id = auth.uid()
  );
$$;

create or replace function private.is_trip_lead(p_trip uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from trips where id = p_trip and lead_id = auth.uid());
$$;

create or replace function private.event_trip(p_event uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select trip_id from events where id = p_event;
$$;

-- ============================================================
--  RPC 1: Tham gia chuyến đi bằng mã
-- ============================================================
create or replace function public.join_trip(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_trip uuid;
  v_name text;
begin
  -- Ham nay la security definer nen no ghi duoc vao trip_members bat ke RLS.
  -- Khong chan nguoi chua dang nhap thi auth.uid() la null va dong thanh vien
  -- se duoc tao voi user_id null: rac trong roster ma khong ai xoa duoc.
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập trước khi tham gia chuyến đi';
  end if;

  select id into v_trip from trips where join_code = upper(trim(p_code));
  if v_trip is null then
    raise exception 'Mã chuyến đi không tồn tại';
  end if;

  if exists (select 1 from trip_members where trip_id = v_trip and user_id = auth.uid()) then
    return v_trip;
  end if;

  select full_name into v_name from profiles where id = auth.uid();

  insert into trip_members (trip_id, user_id, display_name, permission)
  values (v_trip, auth.uid(), coalesce(v_name, 'Thành viên'), 'member');

  return v_trip;
end $$;

-- ============================================================
--  RPC 2: Realtime engine phía server
--  Bất kỳ thành viên nào cũng gọi được, nhưng chỉ đổi trạng thái
--  theo giờ hệ thống. Không chạm tới event Hủy / Tạm hoãn.
-- ============================================================
create or replace function public.sync_trip_statuses(p_trip uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_trip_member(p_trip) then
    raise exception 'Không có quyền truy cập chuyến đi này';
  end if;

  update events set status = 'upcoming'
   where trip_id = p_trip and status not in ('cancelled', 'postponed')
     and now() < start_time and status <> 'upcoming';

  update events set status = 'ongoing'
   where trip_id = p_trip and status not in ('cancelled', 'postponed')
     and now() >= start_time and now() < end_time and status <> 'ongoing';

  update events set status = 'done'
   where trip_id = p_trip and status not in ('cancelled', 'postponed')
     and now() >= end_time and status <> 'done';
end $$;

-- ============================================================
--  TRIGGER: bắt buộc luồng duyệt event
--  - Lead tạo event  -> approved ngay
--  - Member tạo event -> luôn pending (không thể tự set approved)
--  - Chỉ Lead được đổi trường approval
-- ============================================================
create or replace function public.enforce_event_rules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.approval := case when private.is_trip_lead(new.trip_id) then 'approved' else 'pending' end;
  elsif tg_op = 'UPDATE' then
    if new.approval is distinct from old.approval and not private.is_trip_lead(new.trip_id) then
      raise exception 'Chỉ Lead được duyệt hoặc từ chối event';
    end if;
    if new.trip_id is distinct from old.trip_id then
      raise exception 'Không thể chuyển hoạt động sang chuyến đi khác';
    end if;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

drop trigger if exists events_enforce_rules on public.events;
create trigger events_enforce_rules
  before insert or update on public.events
  for each row execute function public.enforce_event_rules();

-- Các cột định danh của một thành viên không thuộc phạm vi form chỉnh sửa.
-- Chặn ở trigger để policy không phải SELECT lại chính trip_members (việc đó
-- làm policy tự gọi lại chính nó và PostgreSQL báo infinite recursion).
create or replace function private.enforce_member_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.trip_id is distinct from old.trip_id or new.user_id is distinct from old.user_id then
    raise exception 'Không thể đổi tài khoản hoặc chuyến đi của thành viên';
  end if;
  if new.permission is distinct from old.permission
     and not private.is_trip_lead(old.trip_id) then
    raise exception 'Chỉ Lead được đổi quyền thành viên';
  end if;
  return new;
end $$;

drop trigger if exists trip_members_enforce_update on public.trip_members;
create trigger trip_members_enforce_update
  before update on public.trip_members
  for each row execute function private.enforce_member_update();

-- ============================================================
--  QUYỀN GỌI HÀM
--  Postgres mac dinh cap EXECUTE cho PUBLIC, nghia la PostgREST phoi moi
--  ham duoi day ra ca vai tro `anon` (chua dang nhap). Cac policy ben duoi
--  deu viet `to authenticated` nen chung KHONG che duoc anon goi RPC.
-- ============================================================
revoke execute on function public.join_trip(text) from public, anon;
revoke execute on function public.sync_trip_statuses(uuid) from public, anon;
revoke execute on function public.is_trip_member(uuid) from public, anon, authenticated;
revoke execute on function public.is_trip_lead(uuid) from public, anon, authenticated;
revoke execute on function public.event_trip(uuid) from public, anon, authenticated;
revoke all on schema private from public, anon;

grant execute on function public.join_trip(text) to authenticated;
grant execute on function public.sync_trip_statuses(uuid) to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_trip_member(uuid) to authenticated;
grant execute on function private.is_trip_lead(uuid) to authenticated;
grant execute on function private.event_trip(uuid) to authenticated;

-- ============================================================
--  ROW LEVEL SECURITY — phân quyền Lead / Member
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.trips         enable row level security;
alter table public.trip_members  enable row level security;
alter table public.events        enable row level security;
alter table public.event_members enable row level security;

-- profiles
-- `using (true)` cu cho phep bat ky ai dang ky mot tai khoan doc duoc id va
-- ho ten cua TOAN BO nguoi dung. Chi con doc duoc dong cua chinh minh:
-- AuthContext la noi duy nhat doc bang nay va no da loc theo id, con
-- join_trip la security definer nen khong bi RLS chan.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- trips
drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips
  for select to authenticated using (lead_id = auth.uid() or private.is_trip_member(id));

drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips
  for insert to authenticated with check (lead_id = auth.uid());

drop policy if exists trips_update_lead on public.trips;
create policy trips_update_lead on public.trips
  for update to authenticated using (lead_id = auth.uid());

drop policy if exists trips_delete_lead on public.trips;
create policy trips_delete_lead on public.trips
  for delete to authenticated using (lead_id = auth.uid());

-- trip_members
drop policy if exists members_select on public.trip_members;
create policy members_select on public.trip_members
  for select to authenticated using (private.is_trip_member(trip_id) or private.is_trip_lead(trip_id));

-- Nhanh `user_id = auth.uid()` cu bien ma tham gia thanh do trang tri: chi can
-- biet UUID cua chuyen di (no nam ngay tren URL) la tu them minh vao roster,
-- doc duoc toan bo lich trinh va chi phi. Nguoi dung thuong vao nhom qua RPC
-- join_trip (security definer, co kiem tra ma) nen khong can nhanh nay nua.
drop policy if exists members_insert on public.trip_members;
create policy members_insert on public.trip_members
  for insert to authenticated with check (private.is_trip_lead(trip_id));

-- Lead sửa mọi thành viên; thành viên chỉ sửa dòng của chính mình.
-- Thieu WITH CHECK thi Postgres lay lai bieu thuc USING de kiem tra dong MOI,
-- ma bieu thuc do van dung khi chi can giu nguyen user_id. Hau qua: mot Member
-- tu doi permission cua minh thanh 'lead', hoac doi trip_id sang chuyen di
-- khac de chui vao nhom la. WITH CHECK duoi day ghim ca hai cot do.
drop policy if exists members_update on public.trip_members;
create policy members_update on public.trip_members
  for update to authenticated
  using (private.is_trip_lead(trip_id) or user_id = auth.uid())
  with check (private.is_trip_lead(trip_id) or user_id = auth.uid());

-- Chỉ Lead được xóa thành viên
drop policy if exists members_delete_lead on public.trip_members;
create policy members_delete_lead on public.trip_members
  for delete to authenticated using (private.is_trip_lead(trip_id));

-- events
drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to authenticated using (private.is_trip_member(trip_id));

drop policy if exists events_insert on public.events;
create policy events_insert on public.events
  for insert to authenticated with check (private.is_trip_member(trip_id));

-- Lead: toàn quyền. Member: chỉ event do mình tạo VÀ đang chờ duyệt.
-- WITH CHECK bat buoc phai co: khong co no, Member sua duoc trip_id cua event
-- minh tao sang mot chuyen di khac (bieu thuc USING van dung vi created_by va
-- approval khong doi), tuc la nhet du lieu vao nhom ma minh khong thuoc ve.
drop policy if exists events_update on public.events;
create policy events_update on public.events
  for update to authenticated
  using (
    private.is_trip_lead(trip_id)
    or (created_by = auth.uid() and approval = 'pending')
  )
  with check (
    private.is_trip_lead(trip_id)
    or (created_by = auth.uid() and approval = 'pending' and private.is_trip_member(trip_id))
  );

drop policy if exists events_delete on public.events;
create policy events_delete on public.events
  for delete to authenticated using (
    private.is_trip_lead(trip_id)
    or (created_by = auth.uid() and approval = 'pending')
  );

-- event_members
drop policy if exists event_members_select on public.event_members;
create policy event_members_select on public.event_members
  for select to authenticated using (private.is_trip_member(private.event_trip(event_id)));

drop policy if exists event_members_write on public.event_members;
create policy event_members_write on public.event_members
  for insert to authenticated with check (
    private.is_trip_lead(private.event_trip(event_id))
    or exists (select 1 from events e
               where e.id = event_id and e.created_by = auth.uid() and e.approval = 'pending')
  );

drop policy if exists event_members_delete on public.event_members;
create policy event_members_delete on public.event_members
  for delete to authenticated using (
    private.is_trip_lead(private.event_trip(event_id))
    or exists (select 1 from events e
               where e.id = event_id and e.created_by = auth.uid() and e.approval = 'pending')
  );

-- ============================================================
--  REALTIME (tùy chọn): đồng bộ tức thì giữa các thành viên
-- ============================================================
do $$
begin
  alter publication supabase_realtime add table public.events;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.trip_members;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.event_members;
exception when others then null;
end $$;
