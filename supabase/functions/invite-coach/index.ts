import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const authorization = request.headers.get('Authorization')
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? ''
  const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? ''
  if (!authorization || !url || !publishableKey || !secretKey) return json({ error: 'Function authentication is not configured.' }, 500)

  const callerClient = createClient(url, publishableKey, { global: { headers: { Authorization: authorization } } })
  const adminClient = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: userData, error: userError } = await callerClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'You must be signed in to invite a coach.' }, 401)

  let payload: { email?: string; teamId?: string; role?: string; redirectTo?: string }
  try { payload = await request.json() } catch { return json({ error: 'Invalid invitation request.' }, 400) }
  const email = payload.email?.trim().toLowerCase()
  const role = payload.role === 'assistant_coach' ? 'assistant_coach' : 'coach'
  if (!email || !payload.teamId || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid coach email and team.' }, 400)

  const { data: membership } = await adminClient.from('team_members').select('role').eq('team_id', payload.teamId).eq('user_id', userData.user.id).maybeSingle()
  if (!membership || membership.role !== 'coach') return json({ error: 'Only a head coach can invite staff to this team.' }, 403)

  const { data: users, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (usersError) return json({ error: usersError.message }, 500)
  let invitedUser = users.users.find(user => user.email?.toLowerCase() === email)
  let invitationSent = false
  if (!invitedUser) {
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: payload.redirectTo,
      data: { invited_team_id: payload.teamId, invited_role: role },
    })
    if (error || !data.user) return json({ error: error?.message || 'Unable to send invitation.' }, 400)
    invitedUser = data.user
    invitationSent = true
  }

  const { error: memberError } = await adminClient.from('team_members').upsert({ team_id: payload.teamId, user_id: invitedUser.id, role })
  if (memberError) return json({ error: memberError.message }, 500)
  return json({ invitationSent, email, role })
})
