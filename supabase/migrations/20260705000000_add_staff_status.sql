-- Add is_active column to users table
alter table public.users
  add column if not exists is_active boolean not null default true;

-- Update existing records to be active by default (already handled by default)
-- Add comment for clarity
comment on column public.users.is_active is 'Indicates if the staff account is active. Non-active staff cannot access the POS.';

-- Grant: ensure authenticated users can see is_active (RLS already handles row-level, this is column access)
-- No extra grant needed since column inherits table-level permissions
