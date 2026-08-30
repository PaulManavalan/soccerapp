import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-worker-secret' };
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  if (request.headers.get('X-Worker-Secret') !== Deno.env.get('DUEL_ANALYSIS_WORKER_SECRET')) {
    return Response.json({ error: 'Unauthorized worker' }, { status: 401, headers: corsHeaders });
  }
  const body = await request.json().catch(() => ({}));
  const { jobId, status, playerId, duelType, outcome, confidence, occurredAtSeconds, pitchX, pitchY, note } = body;
  if (!jobId) return Response.json({ error: 'jobId is required' }, { status: 400, headers: corsHeaders });
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: job, error: jobError } = await admin.from('duel_clip_jobs').select('id,team_id,match_id').eq('id', jobId).single();
  if (jobError || !job) return Response.json({ error: 'Clip job was not found' }, { status: 404, headers: corsHeaders });
  if (status === 'failed') {
    await admin.from('duel_clip_jobs').update({ status: 'failed', worker_note: String(note || 'Analysis failed'), updated_at: new Date().toISOString() }).eq('id', job.id);
    return Response.json({ status: 'failed' }, { headers: corsHeaders });
  }
  if (!['ground', 'aerial'].includes(duelType) || !['won', 'lost'].includes(outcome)) {
    return Response.json({ error: 'A valid duel type and outcome are required' }, { status: 400, headers: corsHeaders });
  }
  if (playerId) {
    const { data: player } = await admin.from('players').select('id').eq('id', playerId).eq('team_id', job.team_id).maybeSingle();
    if (!player) return Response.json({ error: 'Suggested player is not on this team' }, { status: 400, headers: corsHeaders });
  }
  const cleanConfidence = Math.max(0, Math.min(100, Math.round(Number(confidence) || 0)));
  const { data: duel, error: duelError } = await admin.from('duels').insert({
    match_id: job.match_id, player_id: playerId || null,
    occurred_at_seconds: Math.max(0, Math.round(Number(occurredAtSeconds) || 0)),
    pitch_x: Math.max(0, Math.min(100, Number(pitchX) || 50)),
    pitch_y: Math.max(0, Math.min(100, Number(pitchY) || 50)),
    duel_type: duelType, outcome, suggested_outcome: outcome, confidence: cleanConfidence, review_status: 'suggested',
  }).select('id').single();
  if (duelError) return Response.json({ error: 'Unable to save suggested duel' }, { status: 500, headers: corsHeaders });
  await admin.from('duel_clip_jobs').update({
    status: 'complete', suggested_player_id: playerId || null, suggested_type: duelType,
    suggested_outcome: outcome, confidence: cleanConfidence, worker_note: note || null,
    duel_id: duel.id, updated_at: new Date().toISOString(),
  }).eq('id', job.id);
  return Response.json({ status: 'complete', duelId: duel.id }, { headers: corsHeaders });
});
