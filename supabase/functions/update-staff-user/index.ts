import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type UpdateStaffPayload = {
  user_id: string
  auth_user_id: string
  full_name?: string | null
  username?: string | null
  role_id?: string | null
  password?: string | null
  is_active?: boolean | null
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
    return new Response(JSON.stringify({ error: 'Only owner can update staff account' }), {
      status: 403,
      headers: jsonHeaders,
    })
  }

  const body = (await req.json()) as UpdateStaffPayload
  const userId = body.user_id
  const authUserId = body.auth_user_id
  const fullName = body.full_name?.trim() || null
  const username = body.username?.trim() || null
  const roleId = body.role_id || null
  const password = body.password || null
  const isActive = body.is_active ?? null

  if (!userId || !authUserId) {
    return new Response(JSON.stringify({ error: 'user_id and auth_user_id are required' }), {
      status: 400,
      headers: jsonHeaders,
    })
  }

  // Update Auth User
  const updatePayload: any = {}
  if (password) {
    updatePayload.password = password
  }
  if (username) {
    updatePayload.email = `${username}@ease.local`
    updatePayload.user_metadata = {
      full_name: fullName,
      username,
    }
  }

  if (Object.keys(updatePayload).length > 0) {
    const { error: authError } = await adminClient.auth.admin.updateUserById(
      authUserId,
      updatePayload
    )
    if (authError) {
      return new Response(JSON.stringify({ error: `Auth update error: ${authError.message}` }), {
        status: 400,
        headers: jsonHeaders,
      })
    }
  }

  // Update users table
  const dbUpdatePayload: Record<string, unknown> = {
    full_name: fullName,
    username: username,
    role_id: roleId,
  }
  if (isActive !== null) {
    dbUpdatePayload.is_active = isActive
  }

  const { error: dbError } = await adminClient
    .from('users')
    .update(dbUpdatePayload)
    .eq('id', userId)

  if (dbError) {
    return new Response(JSON.stringify({ error: `Database update error: ${dbError.message}` }), {
      status: 400,
      headers: jsonHeaders,
    })
  }

  return new Response(
    JSON.stringify({
      success: true,
    }),
    {
      status: 200,
      headers: jsonHeaders,
    }
  )
})
