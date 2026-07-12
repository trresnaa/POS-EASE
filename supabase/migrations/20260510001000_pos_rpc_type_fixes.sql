drop function if exists public.submit_pos_order(
  text,
  uuid,
  jsonb,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric
);
drop function if exists public.submit_pos_order(
  text,
  text,
  jsonb,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric
);
drop function if exists public.void_pos_order(uuid, text, uuid);
drop function if exists public.void_pos_order(text, text, text);
drop function if exists public.report_products_by_period(timestamptz, timestamptz, integer, boolean);

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

    if coalesce(v_product.track_stock, false) then
      insert into stock_items (product_id, qty_on_hand, updated_at)
      values (v_product.id, -v_qty, now())
      on conflict (product_id) do update
      set qty_on_hand = stock_items.qty_on_hand - v_qty,
          updated_at = now();

      insert into stock_movements (
        product_id,
        delta,
        reason,
        created_by
      )
      values (
        v_product.id,
        -v_qty,
        'Order ' || p_order_number,
        v_cashier.id
      );
    end if;
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
  v_item record;
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

  for v_item in
    select
      oi.product_id,
      oi.qty,
      p.track_stock
    from order_items oi
    join products p on p.id = oi.product_id
    where oi.order_id = v_order.id
    for update of p
  loop
    if coalesce(v_item.track_stock, false) then
      insert into stock_items (product_id, qty_on_hand, updated_at)
      values (v_item.product_id, v_item.qty, now())
      on conflict (product_id) do update
      set qty_on_hand = stock_items.qty_on_hand + v_item.qty,
          updated_at = now();

      insert into stock_movements (
        product_id,
        delta,
        reason,
        created_by
      )
      values (
        v_item.product_id,
        v_item.qty,
        'Void ' || v_order.order_number,
        v_voider.id
      );
    end if;
  end loop;

  return jsonb_build_object('order', to_jsonb(v_order));
end;
$$;

create or replace function public.report_products_by_period(
  p_start timestamptz,
  p_end timestamptz,
  p_limit integer default 5,
  p_ascending boolean default false
)
returns table (
  product_id text,
  name text,
  total_qty numeric,
  total_sales numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id::text as product_id,
    p.name,
    coalesce(sum(oi.qty), 0)::numeric as total_qty,
    coalesce(sum(oi.line_total), 0)::numeric as total_sales
  from products p
  join order_items oi on oi.product_id = p.id
  join orders o on o.id = oi.order_id
  where o.created_at >= p_start
    and o.created_at <= p_end
    and o.status <> 'VOID'
  group by p.id, p.name
  order by
    case when p_ascending then coalesce(sum(oi.qty), 0) end asc,
    case when not p_ascending then coalesce(sum(oi.qty), 0) end desc,
    p.name asc
  limit greatest(p_limit, 0);
$$;

grant execute on function public.submit_pos_order(
  text,
  text,
  jsonb,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric
) to authenticated;

grant execute on function public.void_pos_order(text, text, text) to authenticated;
grant execute on function public.report_products_by_period(timestamptz, timestamptz, integer, boolean) to authenticated;

