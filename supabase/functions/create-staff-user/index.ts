import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type CreateStaffPayload = {
  email?: string
  password?: string
  full_name?: string | null
  username?: string | null
  role_id?: string | null
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: jsonHeaders,
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase environment variables' }), {
      status: 500,
      headers: jsonHeaders,
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: jsonHeaders,
    })
  }

  const requesterClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const {
    data: { user: requester },
    error: requesterError,
  } = await requesterClient.auth.getUser()
  if (requesterError || !requester) {
    return new Response(JSON.stringify({ error: 'Unauthorized requester' }), {
      status: 401,
      headers: jsonHeaders,
    })
  }

  const { data: requesterProfile, error: profileError } = await adminClient
    .from('users')
    .select('role:roles(name)')
    .eq('auth_user_id', requester.id)
    .maybeSingle()

  if (profileError || requesterProfile?.role?.name !== 'owner') {
    return new Response(JSON.stringify({ error: 'Only owner can create staff account' }), {
      status: 403,
      headers: jsonHeaders,
    })
  }

  const body = (await req.json()) as CreateStaffPayload
  const email = body.email?.trim()
  const password = body.password
  const fullName = body.full_name?.trim() || null
  const username = body.username?.trim() || null
  const roleId = body.role_id || null

  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email and password are required' }), {
      status: 400,
      headers: jsonHeaders,
    })
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      username,
    },
  })

  if (createError || !created.user) {
    return new Response(JSON.stringify({ error: createError?.message || 'Failed to create user' }), {
      status: 400,
      headers: jsonHeaders,
    })
  }

  const { error: upsertError } = await adminClient.from('users').upsert(
    {
      auth_user_id: created.user.id,
      full_name: fullName,
      username,
      role_id: roleId,
    },
    { onConflict: 'auth_user_id' },
  )

  if (upsertError) {
    return new Response(JSON.stringify({ error: upsertError.message }), {
      status: 400,
      headers: jsonHeaders,
    })
  }

  return new Response(
    JSON.stringify({
      success: true,
      user: {
        id: created.user.id,
        email: created.user.email,
      },
    }),
    {
      status: 200,
      headers: jsonHeaders,
    },
  )
})
