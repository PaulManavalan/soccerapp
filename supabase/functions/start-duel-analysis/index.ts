import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });

  const authorization = request.headers.get('Authorization');
  if (!authorization) return Response.json({ error: 'Sign in required' }, { status: 401, headers: corsHeaders });
  const userClient = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401, headers: corsHeaders });

  const { jobId } = await request.json().catch(() => ({}));
  if (!jobId) return Response.json({ error: 'jobId is required' }, { status: 400, headers: corsHeaders });
  const { data: job, error: jobError } = await userClient
    .from('duel_clip_jobs')
    .select('id,team_id,match_id,storage_path,status')
    .eq('id', jobId)
    .single();
  if (jobError || !job) return Response.json({ error: 'Clip job was not found' }, { status: 404, headers: corsHeaders });
  if (job.status === 'complete') return Response.json({ status: 'complete' }, { headers: corsHeaders });

  const workerUrl = Deno.env.get('DUEL_ANALYSIS_WORKER_URL');
  const workerSecret = Deno.env.get('DUEL_ANALYSIS_WORKER_SECRET');
  if (!workerUrl || !workerSecret) return Response.json({ error: 'Vision worker is not configured yet' }, { status: 503, headers: corsHeaders });

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: signed, error: signedError } = await admin.storage.from('duel-clips').createSignedUrl(job.storage_path, 900);
  if (signedError || !signed) return Response.json({ error: 'Unable to prepare the private clip' }, { status: 500, headers: corsHeaders });

  const response = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': workerSecret },
    body: JSON.stringify({
      jobId: job.id,
      teamId: job.team_id,
      matchId: job.match_id,
      clipUrl: signed.signedUrl,
      callbackUrl: `${supabaseUrl}/functions/v1/complete-duel-analysis`,
    }),
  });
  if (!response.ok) return Response.json({ error: 'Vision worker did not accept the clip' }, { status: 502, headers: corsHeaders });
  await admin.from('duel_clip_jobs').update({ status: 'analyzing', updated_at: new Date().toISOString() }).eq('id', job.id);
  return Response.json({ status: 'analyzing' }, { headers: corsHeaders });
});
