-- Run once in Supabase > SQL Editor (after schema.sql)
alter table orders add column if not exists payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded'));
alter table orders add column if not exists paid_at timestamptz;
alter table orders add column if not exists tracking_note text;
alter table profiles add column if not exists phone text;

create table if not exists saved_addresses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  label text, address jsonb not null, created_at timestamptz default now());
create table if not exists order_events (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders on delete cascade,
  label text not null, created_at timestamptz default now());
alter table saved_addresses enable row level security;
alter table order_events enable row level security;
create policy "own addresses" on saved_addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own order events" on order_events for select
  using (exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_admin())));

-- Customers may edit only name and phone (never their role)
create policy "update own profile" on profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on profiles from anon, authenticated;
grant update (full_name, phone) on profiles to authenticated;

-- Timeline + stock restore when an order is cancelled
create or replace function log_order_event() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then insert into order_events (order_id, label) values (new.id, 'Order placed');
  else
    if new.status <> old.status then insert into order_events (order_id, label) values (new.id, 'Order ' || new.status); end if;
    if new.payment_status <> old.payment_status then insert into order_events (order_id, label) values (new.id, 'Payment ' || new.payment_status); end if;
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      update products p set stock = p.stock + oi.qty from order_items oi where oi.order_id = new.id and oi.product_id = p.id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists order_events_trg on orders;
create trigger order_events_trg after insert or update on orders for each row execute function log_order_event();

-- Orders are now created only by the backend (service role)
drop function if exists place_order(jsonb, jsonb, text);
create or replace function create_order_for(p_user uuid, items jsonb, address jsonb, pay text) returns uuid
language plpgsql security definer set search_path = public as $$
declare oid uuid; it jsonb; p products; t numeric := 0;
begin
  insert into orders (user_id, total, address, payment_method) values (p_user, 0, address, pay) returning id into oid;
  for it in select * from jsonb_array_elements(items) loop
    select * into p from products where id = (it->>'id')::uuid and active for update;
    if p.id is null then raise exception 'A product is no longer available'; end if;
    if p.stock < (it->>'qty')::int then raise exception '% has only % left', p.name, p.stock; end if;
    update products set stock = stock - (it->>'qty')::int where id = p.id;
    insert into order_items (order_id, product_id, name, price, qty) values (oid, p.id, p.name, p.price, (it->>'qty')::int);
    t := t + p.price * (it->>'qty')::int;
  end loop;
  update orders set total = t where id = oid;
  return oid;
end $$;
revoke execute on function create_order_for(uuid, jsonb, jsonb, text) from public, anon, authenticated;
