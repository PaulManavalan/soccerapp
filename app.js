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
    document.querySelectorAll('.club-card strong').forEach(node => { node.textContent = currentTeam.name; });
  }
  teamOnboarding.hidden = Boolean(currentTeam && hasTeamMembership);
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
  currentTeam = team; hasTeamMembership = true; teamOnboarding.hidden = true; document.querySelectorAll('.club-card strong').forEach(node => { node.textContent = team.name; });
});

markers.forEach(marker => { marker.dataset.initialOutcome = marker.dataset.outcome; });
function applyStored(marker) { const saved = stored[marker.dataset.time]; if (!saved) return; marker.dataset.outcome = saved.outcome; marker.dataset.type = saved.type; marker.dataset.confirmed = saved.confirmed ? 'true' : ''; marker.classList.toggle('won', saved.outcome === 'won'); marker.classList.toggle('lost', saved.outcome === 'lost'); marker.classList.toggle('ground', saved.type === 'ground'); marker.classList.toggle('aerial', saved.type === 'aerial'); }
function save(marker) { stored[marker.dataset.time] = { outcome: marker.dataset.outcome, type: marker.dataset.type, confirmed: marker.dataset.confirmed === 'true' }; localStorage.setItem(storageKey, JSON.stringify(stored)); }
function updateTotal() { const total = 46; const won = 28 + markers.reduce((change, marker) => marker.dataset.outcome === marker.dataset.initialOutcome ? change : change + (marker.dataset.outcome === 'won' ? 1 : -1), 0); document.getElementById('duelTeamTotal').innerHTML = `${won} <i>/ ${total}</i>`; document.querySelector('.duel-total small').textContent = `${Math.round((won / total) * 100)}% · target 58%`; }
function renderDetail(marker) { if (!marker) return; selected = marker; markers.forEach(item => item.classList.toggle('selected', item === marker)); const data = marker.dataset; const won = data.outcome === 'won'; document.getElementById('duelDetailTitle').textContent = `${data.player} · ${won ? 'Won' : 'Lost'}`; const confidence = document.getElementById('duelConfidence'); confidence.textContent = `${data.confidence}% confidence`; confidence.className = `status ${data.confidence < 75 ? 'watch' : 'good'}`; document.getElementById('duelClipTime').textContent = data.time; document.getElementById('duelPlayerName').textContent = `#${data.number} ${data.player}`; document.getElementById('duelDetailType').textContent = `${data.type[0].toUpperCase()}${data.type.slice(1)} duel`; document.getElementById('duelLocation').textContent = data.zone; const outcome = document.getElementById('duelDetailOutcome'); outcome.textContent = won ? 'Won · retained possession' : 'Lost · opponent progressed'; outcome.className = won ? 'outcome-won' : 'outcome-lost'; const confirmed = data.confirmed === 'true'; document.getElementById('confirmDuel').textContent = confirmed ? 'Confirmed' : 'Confirm result'; document.getElementById('reviewNote').textContent = confirmed ? 'Coach-reviewed event. Changes are stored on this device.' : 'Suggested event — confirm it or make a correction.'; document.getElementById('correctionPanel').hidden = true; }
function filterMarkers() { const player = document.getElementById('duelPlayer').value, type = document.getElementById('duelType').value, outcome = document.getElementById('duelOutcome').value; markers.forEach(marker => { marker.hidden = !((player === 'all' || marker.dataset.player === player) && (type === 'all' || marker.dataset.type === type) && (outcome === 'all' || marker.dataset.outcome === outcome)); }); }
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.tab,.tab-view').forEach(element => element.classList.remove('active')); tab.classList.add('active'); document.getElementById(tab.dataset.tab).classList.add('active'); }));
document.querySelectorAll('.formation-player').forEach(player => player.addEventListener('click', () => { document.querySelectorAll('.formation-player').forEach(item => item.classList.remove('active')); player.classList.add('active'); const data = player.dataset; const card = document.getElementById('selectedPlayer'); card.querySelector('.selected-number').textContent = data.number; card.querySelector('.eyebrow').textContent = data.position; card.querySelector('h2').innerHTML = `${data.name} <span>${data.rating}</span>`; card.querySelector('small').textContent = `${data.minutes} minutes played`; document.getElementById('statMinutes').textContent = `${data.minutes}'`; document.getElementById('statPasses').textContent = data.passes; document.getElementById('statShots').textContent = data.shots; document.getElementById('statTackles').textContent = data.tackles; }));
markers.forEach(marker => { applyStored(marker); marker.addEventListener('click', () => renderDetail(marker)); }); filters.forEach(id => document.getElementById(id).addEventListener('change', filterMarkers));
document.getElementById('confirmDuel').addEventListener('click', () => { selected.dataset.confirmed = 'true'; save(selected); renderDetail(selected); });
document.getElementById('changeDuel').addEventListener('click', () => { const panel = document.getElementById('correctionPanel'); panel.hidden = !panel.hidden; });
document.querySelectorAll('[data-correction]').forEach(button => button.addEventListener('click', () => { selected.dataset.outcome = button.dataset.correction; selected.dataset.confirmed = 'true'; selected.classList.toggle('won', selected.dataset.outcome === 'won'); selected.classList.toggle('lost', selected.dataset.outcome === 'lost'); save(selected); updateTotal(); renderDetail(selected); }));
document.querySelectorAll('[data-correction-type]').forEach(button => button.addEventListener('click', () => { selected.dataset.type = button.dataset.correctionType; selected.dataset.confirmed = 'true'; selected.classList.toggle('ground', selected.dataset.type === 'ground'); selected.classList.toggle('aerial', selected.dataset.type === 'aerial'); save(selected); renderDetail(selected); }));
updateTotal(); renderDetail(selected);
