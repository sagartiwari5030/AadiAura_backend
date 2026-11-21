-- Run this whole file once in Supabase > SQL Editor

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text, role text not null default 'customer', created_at timestamptz default now());

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name'); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create or replace function is_admin() returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique not null, description text,
  price numeric not null check (price >= 0), compare_price numeric,
  category text not null default 'Mats', images text[] default '{}',
  stock int not null default 0, active boolean not null default true, created_at timestamptz default now());

create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users, status text not null default 'placed'
    check (status in ('placed','confirmed','shipped','delivered','cancelled')),
  total numeric not null, address jsonb not null, payment_method text default 'cod', created_at timestamptz default now());

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders on delete cascade, product_id uuid references products on delete set null,
  name text not null, price numeric not null, qty int not null check (qty > 0));

alter table profiles enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

create policy "own profile" on profiles for select using (id = auth.uid() or is_admin());
create policy "public read active products" on products for select using (active or is_admin());
create policy "admin writes products" on products for all using (is_admin()) with check (is_admin());
create policy "own orders" on orders for select using (user_id = auth.uid() or is_admin());
create policy "admin updates orders" on orders for update using (is_admin());
create policy "own order items" on order_items for select
  using (exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_admin())));

-- Orders are created only through this function, so prices always come from the database, not the browser.
create or replace function place_order(items jsonb, address jsonb, pay text default 'cod') returns uuid
language plpgsql security definer set search_path = public as $$
declare oid uuid; it jsonb; p products; t numeric := 0;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  insert into orders (user_id, total, address, payment_method) values (auth.uid(), 0, address, pay) returning id into oid;
  for it in select * from jsonb_array_elements(items) loop
    select * into p from products where id = (it->>'id')::uuid and active;
    if p.id is null then raise exception 'A product is no longer available'; end if;
    if p.stock < (it->>'qty')::int then raise exception '% has only % left', p.name, p.stock; end if;
    update products set stock = stock - (it->>'qty')::int where id = p.id;
    insert into order_items (order_id, product_id, name, price, qty) values (oid, p.id, p.name, p.price, (it->>'qty')::int);
    t := t + p.price * (it->>'qty')::int;
  end loop;
  update orders set total = t where id = oid;
  return oid;
end $$;

-- Image storage
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true) on conflict do nothing;
create policy "public read images" on storage.objects for select using (bucket_id = 'product-images');
create policy "admin upload images" on storage.objects for insert with check (bucket_id = 'product-images' and is_admin());
create policy "admin delete images" on storage.objects for delete using (bucket_id = 'product-images' and is_admin());

-- Sample products (add photos later from the admin panel)
insert into products (name, slug, price, compare_price, category, stock, description) values
('Bathroom Mat','bathroom-mat-1',960,1499,'Mats',20,'Soft, quick-drying anti-slip bathroom mat.'),
('Sofa Throw (Cotton)','sofa-throw-cotton-1',550,899,'Sofa',20,'Light cotton throw for sofas and beds.'),
('Printed Kids Mat','printed-kids-mat-1',1750,2000,'Kids',15,'Soft printed play mat for kids rooms.'),
('Floor Runner','floor-runner-1',560,899,'Runners',20,'Hallway and kitchen floor runner.');

-- After you sign up on the site, make yourself admin (replace the email):
-- update profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
