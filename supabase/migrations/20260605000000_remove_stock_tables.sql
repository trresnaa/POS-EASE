-- ============================================================
-- Migration: Remove stock tables & clean up RPC functions
-- Alasan: Modul inventaris/stok di luar lingkup TA.
--         Tabel stock_items & stock_movements tidak digunakan.
-- ============================================================

-- 1. Drop tabel stock (child tables dulu, lalu parent)
drop table if exists public.stock_movements cascade;
drop table if exists public.stock_items cascade;

-- 2. Hapus kolom yang tidak dipakai dari products
alter table public.products drop column if exists track_stock;
alter table public.products drop column if exists sku;

-- 3. Recreate submit_pos_order TANPA logika stock
drop function if exists public.submit_pos_order(text, text, jsonb, numeric, numeric, numeric, numeric, numeric, numeric);

create or replace function public.submit_pos_order(
  p_order_number text,
  p_created_by text,
  p_items jsonb,
  p_subtotal numeric,
  p_tax numeric,
  p_discount numeric,
  p_total numeric,
  p_cash_received numeric,
  p_change numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_item jsonb;
  v_product products%rowtype;
  v_cashier users%rowtype;
  v_product_id text;
  v_qty numeric;
  v_price numeric;
  v_line_total numeric;
  v_note text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select *
  into v_cashier
  from users
  where id::text = p_created_by
    and auth_user_id = auth.uid();

  if not found then
    raise exception 'Invalid cashier profile';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order items are required';
  end if;

  insert into orders (
    order_number,
    subtotal,
    tax,
    discount,
    total,
    status,
    created_by
  )
  values (
    p_order_number,
    p_subtotal,
    p_tax,
    p_discount,
    p_total,
    'PROCESSING',
    v_cashier.id
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := v_item ->> 'product_id';
    v_qty := coalesce((v_item ->> 'qty')::numeric, 0);
    v_price := coalesce((v_item ->> 'price')::numeric, 0);
    v_line_total := coalesce((v_item ->> 'line_total')::numeric, v_qty * v_price);
    v_note := nullif(v_item ->> 'note', '');

    if v_product_id is null then
      raise exception 'Product id is required';
    end if;

    if v_qty <= 0 then
      raise exception 'Invalid quantity for product %', v_product_id;
    end if;

    select *
    into v_product
    from products
    where id::text = v_product_id
    for update;

    if not found then
      raise exception 'Product % not found', v_product_id;
    end if;

    insert into order_items (
      order_id,
      product_id,
      qty,
      price,
      line_total,
      note
    )
    values (
      v_order.id,
      v_product.id,
      v_qty,
      v_price,
      v_line_total,
      v_note
    );
  end loop;

  insert into payments (
    order_id,
    method,
    cash_received,
    change
  )
  values (
    v_order.id,
    'CASH',
    p_cash_received,
    p_change
  );

  return jsonb_build_object(
    'order',
    to_jsonb(v_order),
    'payment',
    jsonb_build_object(
      'method',
      'CASH',
      'cash_received',
      p_cash_received,
      'change',
      p_change
    )
  );
end;
$$;

-- 4. Recreate void_pos_order TANPA logika stock
drop function if exists public.void_pos_order(text, text, text);

create or replace function public.void_pos_order(
  p_order_id text,
  p_reason text,
  p_voided_by text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_voider users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Void reason is required';
  end if;

  select *
  into v_voider
  from users
  where id::text = p_voided_by
    and auth_user_id = auth.uid();

  if not found then
    raise exception 'Invalid void profile';
  end if;

  select *
  into v_order
  from orders
  where id::text = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status = 'VOID' then
    raise exception 'Order already voided';
  end if;

  update orders
  set status = 'VOID'
  where id = v_order.id
  returning * into v_order;

  insert into void_logs (
    order_id,
    reason,
    voided_by
  )
  values (
    v_order.id,
    trim(p_reason),
    v_voider.id
  );

  return jsonb_build_object('order', to_jsonb(v_order));
end;
$$;

-- 5. Re-grant permissions
grant execute on function public.submit_pos_order(text, text, jsonb, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.void_pos_order(text, text, text) to authenticated;
