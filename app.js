import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase.config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let markers = [];
const filters = ['duelPlayer', 'duelType', 'duelOutcome'];
const storageKey = 'touchline-duel-review-v1';
const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
let selected = null;

const authGate = document.getElementById('authGate');
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authTitle = document.getElementById('authTitle');
const authIntro = document.getElementById('authIntro');
const authSubmit = document.getElementById('authSubmit');
const authModeToggle = document.getElementById('authModeToggle');
const authStatus = document.getElementById('authStatus');
const signOutButton = document.getElementById('signOutButton');
const teamOnboarding = document.getElementById('teamOnboarding');
const teamForm = document.getElementById('teamForm');
const teamStatus = document.getElementById('teamStatus');
let currentUser = null;
let currentTeam = null;
let hasTeamMembership = false;
let roster = [];
let currentMatch = null;
let activeLineupIds = new Set();
let authMode = 'sign-in';

function setAuthStatus(message, isError = false) {
  authStatus.textContent = message;
  authStatus.classList.toggle('is-error', isError);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function setSession(session) {
  currentUser = session?.user ?? null;
  authGate.hidden = Boolean(session);
  document.body.classList.toggle('is-authenticated', Boolean(session));
}
function renderAuthMode() {
  const isSignUp = authMode === 'sign-up';
  authTitle.textContent = isSignUp ? 'Create coach account' : 'Sign in to your team';
  authIntro.textContent = isSignUp ? 'Create a password-protected coach account for your team.' : 'Use your coach email and password to access your team.';
  authPassword.autocomplete = isSignUp ? 'new-password' : 'current-password';
  authSubmit.innerHTML = `${isSignUp ? 'Create account' : 'Sign in'} <span>→</span>`;
  authModeToggle.textContent = isSignUp ? 'Already have an account? Sign in' : 'New coach? Create an account';
  setAuthStatus('Your match data stays private to your coaching staff.');
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
  renderManagerView();
  renderTeamSettings();
  renderDuelPlayerOptions();
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
  const opponent = document.getElementById('matchOpponent');
  const kickoff = document.getElementById('matchKickoff');
  const matchStatus = document.getElementById('matchStatus');
  const submit = document.querySelector('#matchForm button[type="submit"]');
  if (!roster.length) picker.innerHTML = '<p class="empty-lineup">Your roster will appear here after team setup.</p>';
  else picker.innerHTML = roster.map(player => `<label class="lineup-choice"><input type="checkbox" value="${player.id}" ${activeLineupIds.has(player.id) ? 'checked' : ''}><strong>#${player.shirt_number} ${escapeHtml(player.name)}</strong><small>${escapeHtml(player.position || 'Player')}</small></label>`).join('');
  count.textContent = `${activeLineupIds.size} selected`;
  state.textContent = currentMatch ? `${currentMatch.status} · vs ${currentMatch.opponent_name}` : 'No active match';
  state.className = `status ${currentMatch?.status === 'live' ? 'good' : 'watch'}`;
  if (currentMatch) {
    opponent.value = currentMatch.opponent_name;
    kickoff.value = new Date(currentMatch.started_at).toISOString().slice(0, 16);
    matchStatus.value = currentMatch.status;
    submit.innerHTML = 'Save match changes <span>→</span>';
  } else submit.innerHTML = 'Create match <span>→</span>';
  document.querySelectorAll('#lineupPicker input').forEach(input => input.addEventListener('change', () => { input.checked ? activeLineupIds.add(input.value) : activeLineupIds.delete(input.value); count.textContent = `${activeLineupIds.size} selected`; renderManagerView(); }));
}
const formationSlots = [
  [50, 88], [17, 67], [39, 69], [61, 69], [83, 67], [26, 43],
  [50, 38], [74, 43], [20, 16], [50, 12], [80, 16]
];
const formationRoles = [
  { label: 'Goalkeeper', matches: /\b(gk|goalkeeper)\b/i },
  { label: 'Left back', matches: /\b(lb|lwb|left back|left-back)\b/i },
  { label: 'Left centre back', matches: /\b(lcb|cb|centre back|center back)\b/i },
  { label: 'Right centre back', matches: /\b(rcb|cb|centre back|center back)\b/i },
  { label: 'Right back', matches: /\b(rb|rwb|right back|right-back)\b/i },
  { label: 'Defensive midfield', matches: /\b(cdm|dm|defensive midfield)\b/i },
  { label: 'Central midfield', matches: /\b(cm|central midfield|midfielder)\b/i },
  { label: 'Attacking midfield', matches: /\b(cam|am|attacking midfield)\b/i },
  { label: 'Left wing', matches: /\b(lw|lwb|left wing|left winger)\b/i },
  { label: 'Striker', matches: /\b(st|cf|striker|forward|centre forward|center forward)\b/i },
  { label: 'Right wing', matches: /\b(rw|rwb|right wing|right winger)\b/i }
];
function arrangeMatchdaySquad(players) {
  const remaining = [...players];
  const starters = formationRoles.map(role => {
    const index = remaining.findIndex(player => role.matches.test(player.position || ''));
    return index >= 0 ? remaining.splice(index, 1)[0] : remaining.shift();
  }).filter(Boolean);
  return { starters, bench: remaining };
}
function getMatchMinutes() {
  if (!currentMatch || currentMatch.status !== 'live') return 0;
  return Math.max(0, Math.min(130, Math.floor((Date.now() - new Date(currentMatch.started_at).getTime()) / 60000)));
}
function playerInitials(name) {
  return name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
}
function selectManagerPlayer(player, minutes) {
  const card = document.getElementById('selectedPlayer');
  card.querySelector('.selected-number').textContent = player.shirt_number;
  card.querySelector('.eyebrow').textContent = player.position || 'Player';
  card.querySelector('h2').innerHTML = '';
  card.querySelector('h2').append(document.createTextNode(`${player.name} `));
  const rating = document.createElement('span');
  rating.textContent = minutes ? '6.5' : '—';
  card.querySelector('h2').append(rating);
  card.querySelector('small').textContent = `${minutes} minutes played`;
  document.getElementById('statMinutes').textContent = `${minutes}'`;
  document.getElementById('statPasses').textContent = '0 / 0';
  document.getElementById('statShots').textContent = '0';
  document.getElementById('statTackles').textContent = '0';
}
function renderManagerView() {
  const pitch = document.querySelector('.formation-pitch');
  const benchPanel = document.querySelector('.bench-panel');
  pitch.querySelectorAll('.formation-player').forEach(player => player.remove());
  benchPanel.querySelectorAll('.bench-player').forEach(player => player.remove());
  const matchdayPlayers = activeLineupIds.size ? roster.filter(player => activeLineupIds.has(player.id)) : roster;
  const { starters, bench } = arrangeMatchdaySquad(matchdayPlayers);
  const minutes = getMatchMinutes();
  starters.forEach((player, index) => {
    const [x, y] = formationSlots[index];
    const button = document.createElement('button');
    button.type = 'button'; button.className = `formation-player${index === 0 ? ' active' : ''}`;
    button.style.setProperty('--x', `${x}%`); button.style.setProperty('--y', `${y}%`);
    const number = document.createElement('span'); number.textContent = player.shirt_number;
    const name = document.createElement('b'); name.textContent = player.name;
    const rating = document.createElement('small'); rating.textContent = minutes ? '6.5' : '—';
    button.append(number, name, rating);
    button.addEventListener('click', () => { pitch.querySelectorAll('.formation-player').forEach(item => item.classList.remove('active')); button.classList.add('active'); selectManagerPlayer(player, minutes); });
    pitch.append(button);
  });
  bench.forEach(player => {
    const row = document.createElement('div'); row.className = 'bench-player';
    const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = playerInitials(player.name);
    const details = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = player.name;
    const position = document.createElement('small'); position.textContent = `${player.position || 'Player'} · 0 min`;
    details.append(name, position);
    const action = document.createElement('button'); action.type = 'button'; action.textContent = 'Bring on';
    row.append(avatar, details, action);
    benchPanel.insertBefore(row, benchPanel.querySelector('.minutes-note'));
  });
  benchPanel.querySelector('.status').textContent = bench.length ? `${bench.length} on bench` : 'No substitutes';
  if (starters.length) selectManagerPlayer(starters[0], minutes);
  else {
    document.getElementById('selectedPlayer').querySelector('.eyebrow').textContent = 'No players selected';
    document.getElementById('selectedPlayer').querySelector('h2').textContent = 'Set up your roster';
  }
}
function renderTeamSettings() {
  document.getElementById('settingsTeamName').value = currentTeam?.name || '';
  const manager = document.getElementById('rosterManager');
  if (!roster.length) { manager.innerHTML = '<p class="empty-lineup">Your roster will appear here.</p>'; return; }
  manager.innerHTML = roster.map(player => `<div class="roster-row"><b>#${player.shirt_number}</b><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.position || 'Player')}</small><button type="button" data-edit-player="${player.id}">Edit</button><button type="button" data-remove-player="${player.id}">Remove</button></div>`).join('');
  document.querySelectorAll('[data-edit-player]').forEach(button => button.addEventListener('click', () => {
    const player = roster.find(item => item.id === button.dataset.editPlayer);
    const row = button.closest('.roster-row');
    if (!player || !row) return;
    row.innerHTML = `<form class="player-edit-form"><input name="number" type="number" min="1" max="99" value="${player.shirt_number}" aria-label="Shirt number" required><input name="name" value="${escapeHtml(player.name)}" aria-label="Player name" required><input name="position" value="${escapeHtml(player.position || '')}" aria-label="Position" placeholder="Position"><button type="submit">Save</button><button type="button">Cancel</button></form>`;
    const form = row.querySelector('form');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const values = new FormData(form);
      const status = document.getElementById('playerFormStatus');
      const { error } = await supabase.from('players').update({ shirt_number: Number(values.get('number')), name: values.get('name').trim(), position: values.get('position').trim() || null }).eq('id', player.id);
      if (error) { status.textContent = error.message; status.classList.add('is-error'); return; }
      status.classList.remove('is-error'); status.textContent = 'Player updated.'; await loadTeamData();
    });
    form.querySelector('button[type="button"]').addEventListener('click', () => renderTeamSettings());
  }));
  document.querySelectorAll('[data-remove-player]').forEach(button => button.addEventListener('click', async () => {
    const player = roster.find(item => item.id === button.dataset.removePlayer);
    if (!player || !window.confirm(`Remove ${player.name} from the roster?`)) return;
    const { error } = await supabase.from('players').delete().eq('id', player.id);
    const status = document.getElementById('playerFormStatus');
    if (error) { status.textContent = error.message; status.classList.add('is-error'); return; }
    status.classList.remove('is-error'); status.textContent = `${player.name} was removed.`; await loadTeamData();
  }));
}
function renderDuelPlayerOptions() {
  const filterOptions = roster.map(player => `<option value="${escapeHtml(player.name)}">#${player.shirt_number} ${escapeHtml(player.name)}</option>`).join('');
  const logOptions = roster.map(player => `<option value="${player.id}">#${player.shirt_number} ${escapeHtml(player.name)}</option>`).join('');
  const logSelect = document.getElementById('duelLogPlayer');
  const filterSelect = document.getElementById('duelPlayer');
  logSelect.innerHTML = `<option value="">Select player</option>${logOptions}`;
  filterSelect.innerHTML = `<option value="all">All players</option>${filterOptions}`;
}
function timeLabel(totalSeconds) {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}
function attachDuelMarker(marker) { marker.addEventListener('click', () => renderDetail(marker)); }
function createMarkerFromDuel(duel, player = null) {
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = `duel-marker ${duel.outcome} ${duel.duel_type}`;
  marker.style.setProperty('--x', `${duel.pitch_x}%`); marker.style.setProperty('--y', `${duel.pitch_y}%`);
  marker.dataset.duelId = duel.id; marker.dataset.player = player?.name || 'Unassigned player'; marker.dataset.number = player?.shirt_number || '–'; marker.dataset.time = timeLabel(duel.occurred_at_seconds); marker.dataset.zone = duel.zone || 'Field location'; marker.dataset.confidence = duel.confidence ?? 100; marker.dataset.outcome = duel.outcome; marker.dataset.initialOutcome = duel.suggested_outcome || duel.outcome; marker.dataset.type = duel.duel_type; marker.dataset.confirmed = duel.review_status === 'suggested' ? '' : 'true';
  marker.innerHTML = `<span>${marker.dataset.number}</span>`;
  document.querySelector('.duel-pitch').append(marker); markers.push(marker); attachDuelMarker(marker);
  return marker;
}
async function loadMatchDuels() {
  document.querySelectorAll('.duel-marker').forEach(marker => marker.remove());
  markers = [];
  selected = null;
  if (!currentMatch) { updateTotal(); renderDetail(null); return; }
  const { data: savedDuels, error } = await supabase.from('duels').select('id,player_id,occurred_at_seconds,pitch_x,pitch_y,duel_type,outcome,suggested_outcome,confidence,review_status').eq('match_id', currentMatch.id);
  if (error) return;
  savedDuels.forEach(duel => {
    const marker = markers.find(item => {
      const [minutes, seconds] = item.dataset.time.split(':').map(Number);
      return minutes * 60 + seconds === duel.occurred_at_seconds;
    });
    const player = roster.find(item => item.id === duel.player_id);
    if (!marker) { const createdMarker = createMarkerFromDuel(duel, player); if (!selected) selected = createdMarker; return; }
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
  const password = authPassword.value;
  if (!email || !password) return;
  if (password.length < 8) return setAuthStatus('Use a password with at least 8 characters.', true);
  const isSignUp = authMode === 'sign-up';
  setAuthStatus(isSignUp ? 'Creating your coach account…' : 'Signing you in…');
  const { data, error } = isSignUp
    ? await supabase.auth.signUp({ email, password })
    : await supabase.auth.signInWithPassword({ email, password });
  if (error) return setAuthStatus(error.message, true);
  if (isSignUp && !data.session) return setAuthStatus('Account created. Confirm the email if email confirmation is enabled in Supabase.');
  setAuthStatus(isSignUp ? 'Account created. Opening your team workspace…' : 'Signed in. Opening your team workspace…');
});
authModeToggle.addEventListener('click', () => { authMode = authMode === 'sign-in' ? 'sign-up' : 'sign-in'; renderAuthMode(); });
signOutButton.addEventListener('click', async () => {
  signOutButton.disabled = true;
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  signOutButton.disabled = false;
  if (error) return setAuthStatus(error.message, true);
  currentUser = null;
  currentTeam = null;
  currentMatch = null;
  roster = [];
  activeLineupIds = new Set();
  teamOnboarding.hidden = true;
  authPassword.value = '';
  setSession(null);
  setAuthStatus('You have been signed out.');
});
supabase.auth.onAuthStateChange((_event, session) => { setSession(session); if (session) loadTeamWorkspace(); });
renderAuthMode();
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
  const isUpdate = Boolean(currentMatch);
  message.classList.remove('is-error'); message.textContent = isUpdate ? 'Saving match changes…' : 'Creating your match…';
  const matchRequest = isUpdate
    ? supabase.from('matches').update({ opponent_name: opponent, started_at: new Date(startedAt).toISOString(), status }).eq('id', currentMatch.id).select().single()
    : supabase.from('matches').insert({ team_id: currentTeam.id, opponent_name: opponent, started_at: new Date(startedAt).toISOString(), status }).select().single();
  const { data: match, error: matchError } = await matchRequest;
  if (matchError) { message.textContent = matchError.message; message.classList.add('is-error'); return; }
  const lineup = [...activeLineupIds].map(player_id => ({ match_id: match.id, player_id }));
  if (isUpdate) {
    const { error: clearLineupError } = await supabase.from('match_lineups').delete().eq('match_id', match.id);
    if (clearLineupError) { message.textContent = clearLineupError.message; message.classList.add('is-error'); return; }
  }
  const { error: lineupError } = await supabase.from('match_lineups').insert(lineup);
  if (lineupError) { message.textContent = lineupError.message; message.classList.add('is-error'); return; }
  currentMatch = match; message.textContent = isUpdate ? `${opponent} matchday changes saved.` : `${opponent} is ready for matchday.`; await loadTeamData();
});

document.getElementById('duelLogForm').addEventListener('submit', async event => {
  event.preventDefault();
  const status = document.getElementById('duelLogStatus');
  const playerId = document.getElementById('duelLogPlayer').value;
  const minute = Number(document.getElementById('duelLogMinute').value);
  if (!currentMatch || !playerId || Number.isNaN(minute)) { status.textContent = 'Create an active match and choose a player before logging a duel.'; status.classList.add('is-error'); return; }
  const zoneMap = { central: { x: 50, y: 50, label: 'Central third' }, 'left-attacking': { x: 24, y: 27, label: 'Left attacking third' }, 'right-defensive': { x: 72, y: 72, label: 'Right defensive third' }, 'left-defensive': { x: 27, y: 74, label: 'Left defensive third' }, 'right-attacking': { x: 76, y: 26, label: 'Right attacking third' } };
  const zone = zoneMap[document.getElementById('duelLogZone').value];
  const payload = { match_id: currentMatch.id, player_id: playerId, occurred_at_seconds: minute * 60, pitch_x: zone.x, pitch_y: zone.y, duel_type: document.getElementById('duelLogType').value, outcome: document.getElementById('duelLogOutcome').value, suggested_outcome: document.getElementById('duelLogOutcome').value, confidence: 100, review_status: 'confirmed' };
  status.classList.remove('is-error'); status.textContent = 'Saving duel…';
  const { data: duel, error } = await supabase.from('duels').insert(payload).select().single();
  if (error) { status.textContent = error.message; status.classList.add('is-error'); return; }
  const player = roster.find(item => item.id === playerId);
  const marker = createMarkerFromDuel({ ...duel, zone: zone.label }, player);
  marker.dataset.zone = zone.label; status.textContent = `Duel added at ${timeLabel(payload.occurred_at_seconds)}.`; event.target.reset(); updateTotal(); renderDetail(marker); filterMarkers();
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
function updateTotal() { const total = markers.length; const won = markers.filter(marker => marker.dataset.outcome === 'won').length; document.getElementById('duelTeamTotal').innerHTML = `${won} <i>/ ${total}</i>`; document.querySelector('.duel-total small').textContent = total ? `${Math.round((won / total) * 100)}% · target 58%` : 'No duels logged yet'; }
function renderDetail(marker) { const confirm = document.getElementById('confirmDuel'); const change = document.getElementById('changeDuel'); if (!marker) { document.getElementById('duelDetailTitle').textContent = 'No duels logged yet'; document.getElementById('duelConfidence').textContent = 'Waiting for an event'; document.getElementById('duelClipLabel').textContent = 'Log a duel to review it here'; document.getElementById('duelClipTime').textContent = '—'; document.getElementById('duelPlayerName').textContent = '—'; document.getElementById('duelDetailType').textContent = '—'; document.getElementById('duelLocation').textContent = '—'; document.getElementById('duelDetailOutcome').textContent = '—'; confirm.disabled = true; change.disabled = true; return; } confirm.disabled = false; change.disabled = false; selected = marker; markers.forEach(item => item.classList.toggle('selected', item === marker)); const data = marker.dataset; const won = data.outcome === 'won'; const confirmed = data.confirmed === 'true'; document.getElementById('duelDetailTitle').textContent = `${data.player} · ${won ? 'Won' : 'Lost'}`; const confidence = document.getElementById('duelConfidence'); confidence.textContent = confirmed ? 'Confirmed' : `${data.confidence}% confidence`; confidence.className = `status ${confirmed || data.confidence >= 75 ? 'good' : 'watch'}`; document.getElementById('duelClipLabel').textContent = confirmed ? 'Coach reviewed' : 'Suggested event'; document.getElementById('duelClipTime').textContent = data.time; document.getElementById('duelPlayerName').textContent = `#${data.number} ${data.player}`; document.getElementById('duelDetailType').textContent = `${data.type[0].toUpperCase()}${data.type.slice(1)} duel`; document.getElementById('duelLocation').textContent = data.zone; const outcome = document.getElementById('duelDetailOutcome'); outcome.textContent = won ? 'Won · retained possession' : 'Lost · opponent progressed'; outcome.className = won ? 'outcome-won' : 'outcome-lost'; confirm.textContent = confirmed ? 'Confirmed' : 'Confirm result'; document.getElementById('reviewNote').textContent = confirmed ? (data.duelId ? 'Coach-reviewed event saved to this match.' : 'Coach-reviewed event. Create a match to sync it to Supabase.') : 'Suggested event — confirm it or make a correction.'; document.getElementById('correctionPanel').hidden = true; }
function filterMarkers() { const player = document.getElementById('duelPlayer').value, type = document.getElementById('duelType').value, outcome = document.getElementById('duelOutcome').value; markers.forEach(marker => { marker.hidden = !((player === 'all' || marker.dataset.player === player) && (type === 'all' || marker.dataset.type === type) && (outcome === 'all' || marker.dataset.outcome === outcome)); }); }
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.tab,.tab-view').forEach(element => element.classList.remove('active')); tab.classList.add('active'); document.getElementById(tab.dataset.tab).classList.add('active'); }));
document.querySelectorAll('.formation-player').forEach(player => player.addEventListener('click', () => { document.querySelectorAll('.formation-player').forEach(item => item.classList.remove('active')); player.classList.add('active'); const data = player.dataset; const card = document.getElementById('selectedPlayer'); card.querySelector('.selected-number').textContent = data.number; card.querySelector('.eyebrow').textContent = data.position; card.querySelector('h2').innerHTML = `${data.name} <span>${data.rating}</span>`; card.querySelector('small').textContent = `${data.minutes} minutes played`; document.getElementById('statMinutes').textContent = `${data.minutes}'`; document.getElementById('statPasses').textContent = data.passes; document.getElementById('statShots').textContent = data.shots; document.getElementById('statTackles').textContent = data.tackles; }));
markers.forEach(marker => { applyStored(marker); attachDuelMarker(marker); }); filters.forEach(id => document.getElementById(id).addEventListener('change', filterMarkers));
document.getElementById('confirmDuel').addEventListener('click', async () => { if (!selected) return; selected.dataset.confirmed = 'true'; await save(selected); renderDetail(selected); });
document.getElementById('changeDuel').addEventListener('click', () => { const panel = document.getElementById('correctionPanel'); panel.hidden = !panel.hidden; });
document.querySelectorAll('[data-correction]').forEach(button => button.addEventListener('click', async () => { selected.dataset.outcome = button.dataset.correction; selected.dataset.confirmed = 'true'; selected.classList.toggle('won', selected.dataset.outcome === 'won'); selected.classList.toggle('lost', selected.dataset.outcome === 'lost'); await save(selected, 'corrected'); updateTotal(); filterMarkers(); renderDetail(selected); }));
document.querySelectorAll('[data-correction-type]').forEach(button => button.addEventListener('click', async () => { selected.dataset.type = button.dataset.correctionType; selected.dataset.confirmed = 'true'; selected.classList.toggle('ground', selected.dataset.type === 'ground'); selected.classList.toggle('aerial', selected.dataset.type === 'aerial'); await save(selected, 'corrected'); filterMarkers(); renderDetail(selected); }));
updateTotal(); renderDetail(selected);
