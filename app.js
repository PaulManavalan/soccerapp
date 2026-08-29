import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase.config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const markers = [...document.querySelectorAll('.duel-marker')];
const filters = ['duelPlayer', 'duelType', 'duelOutcome'];
const storageKey = 'touchline-duel-review-v1';
const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
let selected = markers[0] || null;

const authGate = document.getElementById('authGate');
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authStatus = document.getElementById('authStatus');
const teamOnboarding = document.getElementById('teamOnboarding');
const teamForm = document.getElementById('teamForm');
const teamStatus = document.getElementById('teamStatus');
let currentUser = null;
let currentTeam = null;
let hasTeamMembership = false;
let roster = [];
let currentMatch = null;
let activeLineupIds = new Set();

function setAuthStatus(message, isError = false) {
  authStatus.textContent = message;
  authStatus.classList.toggle('is-error', isError);
}
function setSession(session) {
  currentUser = session?.user ?? null;
  authGate.hidden = Boolean(session);
  document.body.classList.toggle('is-authenticated', Boolean(session));
}
async function loadTeamWorkspace() {
  if (!currentUser) return;
  const { data, error } = await supabase.from('teams').select('id,name').limit(1);
  if (error) return setAuthStatus('Your account is signed in, but the team workspace could not load.', true);
  currentTeam = data?.[0] ?? null;
  if (currentTeam) {
    const { data: membership } = await supabase.from('team_members').select('team_id').eq('team_id', currentTeam.id).maybeSingle();
    hasTeamMembership = Boolean(membership);
  }
  teamOnboarding.hidden = Boolean(currentTeam && hasTeamMembership);
  if (currentTeam && hasTeamMembership) await loadTeamData();
}
async function loadTeamData() {
  const { data: players, error: playersError } = await supabase.from('players').select('id,name,shirt_number,position').eq('team_id', currentTeam.id).order('shirt_number');
  if (playersError) return;
  roster = players ?? [];
  const { data: match } = await supabase.from('matches').select('id,opponent_name,started_at,status').eq('team_id', currentTeam.id).in('status', ['live', 'scheduled']).order('started_at', { ascending: false }).limit(1).maybeSingle();
  currentMatch = match ?? null;
  activeLineupIds = new Set();
  if (currentMatch) {
    const { data: lineup } = await supabase.from('match_lineups').select('player_id').eq('match_id', currentMatch.id);
    activeLineupIds = new Set((lineup ?? []).map(row => row.player_id));
  }
  renderMatchSetup();
  renderTeamSettings();
  updateMatchContext();
  await loadMatchDuels();
}
function updateMatchContext() {
  const teamName = currentTeam?.name || 'Summit FC';
  const opponentName = currentMatch?.opponent_name || 'Harbor City';
  document.querySelectorAll('[data-team-name]').forEach(node => { node.textContent = teamName; });
  document.querySelectorAll('[data-opponent-name]').forEach(node => { node.textContent = opponentName; });
  document.querySelectorAll('[data-active-match-title]').forEach(node => { node.textContent = `${teamName} vs. ${opponentName}`; });
}
function renderMatchSetup() {
  const picker = document.getElementById('lineupPicker');
  const count = document.getElementById('lineupCount');
  const state = document.getElementById('matchState');
  if (!roster.length) picker.innerHTML = '<p class="empty-lineup">Your roster will appear here after team setup.</p>';
  else picker.innerHTML = roster.map(player => `<label class="lineup-choice"><input type="checkbox" value="${player.id}" ${activeLineupIds.has(player.id) ? 'checked' : ''}><strong>#${player.shirt_number} ${player.name}</strong><small>${player.position || 'Player'}</small></label>`).join('');
  count.textContent = `${activeLineupIds.size} selected`;
  state.textContent = currentMatch ? `${currentMatch.status} · vs ${currentMatch.opponent_name}` : 'No active match';
  state.className = `status ${currentMatch?.status === 'live' ? 'good' : 'watch'}`;
  document.querySelectorAll('#lineupPicker input').forEach(input => input.addEventListener('change', () => { input.checked ? activeLineupIds.add(input.value) : activeLineupIds.delete(input.value); count.textContent = `${activeLineupIds.size} selected`; }));
}
function renderTeamSettings() {
  document.getElementById('settingsTeamName').value = currentTeam?.name || '';
  const manager = document.getElementById('rosterManager');
  if (!roster.length) { manager.innerHTML = '<p class="empty-lineup">Your roster will appear here.</p>'; return; }
  manager.innerHTML = roster.map(player => `<div class="roster-row"><b>#${player.shirt_number}</b><strong>${player.name}</strong><small>${player.position || 'Player'}</small><button type="button" data-remove-player="${player.id}">Remove</button></div>`).join('');
  document.querySelectorAll('[data-remove-player]').forEach(button => button.addEventListener('click', async () => {
    const player = roster.find(item => item.id === button.dataset.removePlayer);
    if (!player || !window.confirm(`Remove ${player.name} from the roster?`)) return;
    const { error } = await supabase.from('players').delete().eq('id', player.id);
    const status = document.getElementById('playerFormStatus');
    if (error) { status.textContent = error.message; status.classList.add('is-error'); return; }
    status.classList.remove('is-error'); status.textContent = `${player.name} was removed.`; await loadTeamData();
  }));
}
async function loadMatchDuels() {
  if (!currentMatch) return;
  const { data: savedDuels, error } = await supabase.from('duels').select('id,player_id,occurred_at_seconds,duel_type,outcome,suggested_outcome,confidence,review_status').eq('match_id', currentMatch.id);
  if (error) return;
  savedDuels.forEach(duel => {
    const marker = markers.find(item => {
      const [minutes, seconds] = item.dataset.time.split(':').map(Number);
      return minutes * 60 + seconds === duel.occurred_at_seconds;
    });
    if (!marker) return;
    marker.dataset.duelId = duel.id;
    marker.dataset.outcome = duel.outcome;
    marker.dataset.type = duel.duel_type;
    marker.dataset.initialOutcome = duel.suggested_outcome || duel.outcome;
    marker.dataset.confidence = duel.confidence ?? marker.dataset.confidence;
    marker.dataset.confirmed = duel.review_status === 'suggested' ? '' : 'true';
    marker.classList.toggle('won', duel.outcome === 'won');
    marker.classList.toggle('lost', duel.outcome === 'lost');
    marker.classList.toggle('ground', duel.duel_type === 'ground');
    marker.classList.toggle('aerial', duel.duel_type === 'aerial');
    const player = roster.find(item => item.id === duel.player_id);
    if (player) { marker.dataset.player = player.name; marker.dataset.number = player.shirt_number; }
  });
  updateTotal();
  filterMarkers();
  renderDetail(selected);
}
async function initialiseAuth() {
  const { data, error } = await supabase.auth.getSession();
  if (error) setAuthStatus('Unable to connect to the sign-in service. Please try again.', true);
  setSession(data?.session);
  await loadTeamWorkspace();
}
authForm.addEventListener('submit', async event => {
  event.preventDefault();
  const email = authEmail.value.trim();
  if (!email) return;
  setAuthStatus('Sending your secure sign-in link…');
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
  if (error) return setAuthStatus(error.message, true);
  setAuthStatus(`Check ${email} for your sign-in link.`);
});
supabase.auth.onAuthStateChange((_event, session) => { setSession(session); if (session) loadTeamWorkspace(); });
initialiseAuth();

teamForm.addEventListener('submit', async event => {
  event.preventDefault();
  const name = document.getElementById('teamName').value.trim();
  const roster = document.getElementById('teamRoster').value.trim().split('\n').map(line => line.split(',').map(value => value.trim())).filter(parts => parts.length >= 2);
  if (!name || !roster.length || !currentUser) return;
  teamStatus.textContent = 'Creating your team workspace…';
  let team = currentTeam;
  if (!team) {
    const { data: createdTeam, error: teamError } = await supabase.from('teams').insert({ name, created_by: currentUser.id }).select().single();
    if (teamError) { teamStatus.textContent = teamError.message; teamStatus.classList.add('is-error'); return; }
    team = createdTeam;
  }
  if (!hasTeamMembership) {
    const { error: memberError } = await supabase.from('team_members').insert({ team_id: team.id, user_id: currentUser.id, role: 'coach' });
    if (memberError) { teamStatus.textContent = memberError.message; teamStatus.classList.add('is-error'); return; }
  }
  const players = roster.map(([shirtNumber, playerName, position = null]) => ({ team_id: team.id, shirt_number: Number(shirtNumber), name: playerName, position }));
  const { error: playerError } = await supabase.from('players').insert(players);
  if (playerError) { teamStatus.textContent = playerError.message; teamStatus.classList.add('is-error'); return; }
  currentTeam = team; hasTeamMembership = true; teamOnboarding.hidden = true;
  await loadTeamData();
});

document.getElementById('teamSettingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentTeam) return;
  const name = document.getElementById('settingsTeamName').value.trim();
  const status = document.getElementById('teamSettingsStatus');
  if (!name) return;
  const { error } = await supabase.from('teams').update({ name }).eq('id', currentTeam.id);
  if (error) { status.textContent = error.message; status.classList.add('is-error'); return; }
  currentTeam.name = name; status.classList.remove('is-error'); status.textContent = 'Team name saved.'; updateMatchContext();
});

document.getElementById('playerForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentTeam) return;
  const shirtNumber = Number(document.getElementById('playerNumber').value);
  const name = document.getElementById('playerName').value.trim();
  const position = document.getElementById('playerPosition').value.trim() || null;
  const status = document.getElementById('playerFormStatus');
  const { error } = await supabase.from('players').insert({ team_id: currentTeam.id, shirt_number: shirtNumber, name, position });
  if (error) { status.textContent = error.message; status.classList.add('is-error'); return; }
  event.target.reset(); status.classList.remove('is-error'); status.textContent = `${name} was added.`; await loadTeamData();
});

document.getElementById('matchKickoff').value = new Date().toISOString().slice(0, 16);
document.getElementById('matchForm').addEventListener('submit', async event => {
  event.preventDefault();
  const opponent = document.getElementById('matchOpponent').value.trim();
  const startedAt = document.getElementById('matchKickoff').value;
  const status = document.getElementById('matchStatus').value;
  const message = document.getElementById('matchFormStatus');
  if (!currentTeam || !opponent || !startedAt || !activeLineupIds.size) { message.textContent = 'Choose an opponent, kickoff, and at least one active player.'; message.classList.add('is-error'); return; }
  message.classList.remove('is-error'); message.textContent = 'Creating your match…';
  const { data: match, error: matchError } = await supabase.from('matches').insert({ team_id: currentTeam.id, opponent_name: opponent, started_at: new Date(startedAt).toISOString(), status }).select().single();
  if (matchError) { message.textContent = matchError.message; message.classList.add('is-error'); return; }
  const lineup = [...activeLineupIds].map(player_id => ({ match_id: match.id, player_id }));
  const { error: lineupError } = await supabase.from('match_lineups').insert(lineup);
  if (lineupError) { message.textContent = lineupError.message; message.classList.add('is-error'); return; }
  currentMatch = match; message.textContent = `${opponent} is ready for matchday.`; await loadTeamData();
});

markers.forEach(marker => { marker.dataset.initialOutcome = marker.dataset.outcome; });
function applyStored(marker) { const saved = stored[marker.dataset.time]; if (!saved) return; marker.dataset.outcome = saved.outcome; marker.dataset.type = saved.type; marker.dataset.confirmed = saved.confirmed ? 'true' : ''; marker.classList.toggle('won', saved.outcome === 'won'); marker.classList.toggle('lost', saved.outcome === 'lost'); marker.classList.toggle('ground', saved.type === 'ground'); marker.classList.toggle('aerial', saved.type === 'aerial'); }
async function save(marker, reviewStatus = 'confirmed') {
  stored[marker.dataset.time] = { outcome: marker.dataset.outcome, type: marker.dataset.type, confirmed: marker.dataset.confirmed === 'true' };
  localStorage.setItem(storageKey, JSON.stringify(stored));
  if (!currentMatch) return;
  const player = roster.find(item => item.name === marker.dataset.player);
  const [minutes, seconds] = marker.dataset.time.split(':').map(Number);
  const payload = { match_id: currentMatch.id, player_id: player?.id ?? null, occurred_at_seconds: minutes * 60 + seconds, pitch_x: Number.parseFloat(marker.style.getPropertyValue('--x')), pitch_y: Number.parseFloat(marker.style.getPropertyValue('--y')), duel_type: marker.dataset.type, outcome: marker.dataset.outcome, suggested_outcome: marker.dataset.initialOutcome, confidence: Number(marker.dataset.confidence), review_status: reviewStatus };
  const request = marker.dataset.duelId ? supabase.from('duels').update(payload).eq('id', marker.dataset.duelId).select().single() : supabase.from('duels').insert(payload).select().single();
  const { data, error } = await request;
  if (error) { document.getElementById('reviewNote').textContent = `Saved locally; Supabase sync needs attention: ${error.message}`; return; }
  marker.dataset.duelId = data.id;
  document.getElementById('reviewNote').textContent = 'Coach-reviewed event saved to this match.';
}
function updateTotal() { const total = 46; const won = 28 + markers.reduce((change, marker) => marker.dataset.outcome === marker.dataset.initialOutcome ? change : change + (marker.dataset.outcome === 'won' ? 1 : -1), 0); document.getElementById('duelTeamTotal').innerHTML = `${won} <i>/ ${total}</i>`; document.querySelector('.duel-total small').textContent = `${Math.round((won / total) * 100)}% · target 58%`; }
function renderDetail(marker) { if (!marker) return; selected = marker; markers.forEach(item => item.classList.toggle('selected', item === marker)); const data = marker.dataset; const won = data.outcome === 'won'; const confirmed = data.confirmed === 'true'; document.getElementById('duelDetailTitle').textContent = `${data.player} · ${won ? 'Won' : 'Lost'}`; const confidence = document.getElementById('duelConfidence'); confidence.textContent = confirmed ? 'Confirmed' : `${data.confidence}% confidence`; confidence.className = `status ${confirmed || data.confidence >= 75 ? 'good' : 'watch'}`; document.getElementById('duelClipLabel').textContent = confirmed ? 'Coach reviewed' : 'Suggested event'; document.getElementById('duelClipTime').textContent = data.time; document.getElementById('duelPlayerName').textContent = `#${data.number} ${data.player}`; document.getElementById('duelDetailType').textContent = `${data.type[0].toUpperCase()}${data.type.slice(1)} duel`; document.getElementById('duelLocation').textContent = data.zone; const outcome = document.getElementById('duelDetailOutcome'); outcome.textContent = won ? 'Won · retained possession' : 'Lost · opponent progressed'; outcome.className = won ? 'outcome-won' : 'outcome-lost'; document.getElementById('confirmDuel').textContent = confirmed ? 'Confirmed' : 'Confirm result'; document.getElementById('reviewNote').textContent = confirmed ? (data.duelId ? 'Coach-reviewed event saved to this match.' : 'Coach-reviewed event. Create a match to sync it to Supabase.') : 'Suggested event — confirm it or make a correction.'; document.getElementById('correctionPanel').hidden = true; }
function filterMarkers() { const player = document.getElementById('duelPlayer').value, type = document.getElementById('duelType').value, outcome = document.getElementById('duelOutcome').value; markers.forEach(marker => { marker.hidden = !((player === 'all' || marker.dataset.player === player) && (type === 'all' || marker.dataset.type === type) && (outcome === 'all' || marker.dataset.outcome === outcome)); }); }
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.tab,.tab-view').forEach(element => element.classList.remove('active')); tab.classList.add('active'); document.getElementById(tab.dataset.tab).classList.add('active'); }));
document.querySelectorAll('.formation-player').forEach(player => player.addEventListener('click', () => { document.querySelectorAll('.formation-player').forEach(item => item.classList.remove('active')); player.classList.add('active'); const data = player.dataset; const card = document.getElementById('selectedPlayer'); card.querySelector('.selected-number').textContent = data.number; card.querySelector('.eyebrow').textContent = data.position; card.querySelector('h2').innerHTML = `${data.name} <span>${data.rating}</span>`; card.querySelector('small').textContent = `${data.minutes} minutes played`; document.getElementById('statMinutes').textContent = `${data.minutes}'`; document.getElementById('statPasses').textContent = data.passes; document.getElementById('statShots').textContent = data.shots; document.getElementById('statTackles').textContent = data.tackles; }));
markers.forEach(marker => { applyStored(marker); marker.addEventListener('click', () => renderDetail(marker)); }); filters.forEach(id => document.getElementById(id).addEventListener('change', filterMarkers));
document.getElementById('confirmDuel').addEventListener('click', async () => { selected.dataset.confirmed = 'true'; await save(selected); renderDetail(selected); });
document.getElementById('changeDuel').addEventListener('click', () => { const panel = document.getElementById('correctionPanel'); panel.hidden = !panel.hidden; });
document.querySelectorAll('[data-correction]').forEach(button => button.addEventListener('click', async () => { selected.dataset.outcome = button.dataset.correction; selected.dataset.confirmed = 'true'; selected.classList.toggle('won', selected.dataset.outcome === 'won'); selected.classList.toggle('lost', selected.dataset.outcome === 'lost'); await save(selected, 'corrected'); updateTotal(); filterMarkers(); renderDetail(selected); }));
document.querySelectorAll('[data-correction-type]').forEach(button => button.addEventListener('click', async () => { selected.dataset.type = button.dataset.correctionType; selected.dataset.confirmed = 'true'; selected.classList.toggle('ground', selected.dataset.type === 'ground'); selected.classList.toggle('aerial', selected.dataset.type === 'aerial'); await save(selected, 'corrected'); filterMarkers(); renderDetail(selected); }));
updateTotal(); renderDetail(selected);
