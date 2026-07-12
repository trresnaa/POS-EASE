import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type DeleteStaffPayload = {
  user_id?: string
  auth_user_id?: string | null
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
    .select('id, role:roles(name)')
    .eq('auth_user_id', requester.id)
    .maybeSingle()

  if (profileError || requesterProfile?.role?.name !== 'owner') {
    return new Response(JSON.stringify({ error: 'Only owner can delete staff account' }), {
      status: 403,
      headers: jsonHeaders,
    })
  }

  const body = (await req.json()) as DeleteStaffPayload
  const userId = body.user_id
  if (!userId) {
    return new Response(JSON.stringify({ error: 'user_id is required' }), {
      status: 400,
      headers: jsonHeaders,
    })
  }

  const { data: target, error: targetError } = await adminClient
    .from('users')
    .select('id, auth_user_id')
    .eq('id', userId)
    .maybeSingle()

  if (targetError || !target) {
    return new Response(JSON.stringify({ error: targetError?.message || 'Staff not found' }), {
      status: 404,
      headers: jsonHeaders,
    })
  }

  if (target.auth_user_id === requester.id) {
    return new Response(JSON.stringify({ error: 'Owner cannot delete own account' }), {
      status: 400,
      headers: jsonHeaders,
    })
  }

  if (target.auth_user_id) {
    console.log(`Attempting to delete auth user: ${target.auth_user_id}`)
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(target.auth_user_id)
    if (deleteAuthError) {
      console.error(`Error deleting auth user: ${deleteAuthError.message}`)
      return new Response(JSON.stringify({ error: deleteAuthError.message }), {
        status: 400,
        headers: jsonHeaders,
      })
    }
    console.log(`Successfully deleted auth user: ${target.auth_user_id}`)
  }

  console.log(`Attempting to delete profile row: ${userId}`)
  const { error: deleteProfileError } = await adminClient.from('users').delete().eq('id', userId)
  if (deleteProfileError) {
    console.error(`Error deleting profile row: ${deleteProfileError.message}`)
    return new Response(
      JSON.stringify({ error: `Auth deleted, but profile delete failed: ${deleteProfileError.message}` }),
      {
        status: 400,
        headers: jsonHeaders,
      },
    )
  }
  console.log(`Successfully deleted profile row: ${userId}`)

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: jsonHeaders,
  })
})
