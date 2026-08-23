const app = (() => {
  const markers = [...document.querySelectorAll('.duel-marker')];
  const filters = ['duelPlayer', 'duelType', 'duelOutcome'];
  const storageKey = 'touchline-duel-review-v1';
  const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
  let selected = markers[0] || null;

  markers.forEach(marker => { marker.dataset.initialOutcome = marker.dataset.outcome; });

  function applyStored(marker) {
    const saved = stored[marker.dataset.time];
    if (!saved) return;
    marker.dataset.outcome = saved.outcome;
    marker.dataset.type = saved.type;
    marker.dataset.confirmed = saved.confirmed ? 'true' : '';
    marker.classList.toggle('won', saved.outcome === 'won');
    marker.classList.toggle('lost', saved.outcome === 'lost');
    marker.classList.toggle('ground', saved.type === 'ground');
    marker.classList.toggle('aerial', saved.type === 'aerial');
  }

  function save(marker) {
    stored[marker.dataset.time] = { outcome: marker.dataset.outcome, type: marker.dataset.type, confirmed: marker.dataset.confirmed === 'true' };
    localStorage.setItem(storageKey, JSON.stringify(stored));
  }

  function updateTotal() {
    const total = 46;
    const won = 28 + markers.reduce((change, marker) => {
      if (marker.dataset.outcome === marker.dataset.initialOutcome) return change;
      return change + (marker.dataset.outcome === 'won' ? 1 : -1);
    }, 0);
    const percent = Math.round((won / total) * 100);
    document.getElementById('duelTeamTotal').innerHTML = `${won} <i>/ ${total}</i>`;
    document.querySelector('.duel-total small').textContent = `${percent}% · target 58%`;
  }

  function renderDetail(marker) {
    if (!marker) return;
    selected = marker;
    markers.forEach(item => item.classList.toggle('selected', item === marker));
    const data = marker.dataset;
    const won = data.outcome === 'won';
    document.getElementById('duelDetailTitle').textContent = `${data.player} · ${won ? 'Won' : 'Lost'}`;
    const confidence = document.getElementById('duelConfidence');
    confidence.textContent = `${data.confidence}% confidence`;
    confidence.className = `status ${data.confidence < 75 ? 'watch' : 'good'}`;
    document.getElementById('duelClipTime').textContent = data.time;
    document.getElementById('duelPlayerName').textContent = `#${data.number} ${data.player}`;
    document.getElementById('duelDetailType').textContent = `${data.type[0].toUpperCase()}${data.type.slice(1)} duel`;
    document.getElementById('duelLocation').textContent = data.zone;
    const outcome = document.getElementById('duelDetailOutcome');
    outcome.textContent = won ? 'Won · retained possession' : 'Lost · opponent progressed';
    outcome.className = won ? 'outcome-won' : 'outcome-lost';
    const confirmed = data.confirmed === 'true';
    document.getElementById('confirmDuel').textContent = confirmed ? 'Confirmed' : 'Confirm result';
    document.getElementById('reviewNote').textContent = confirmed ? 'Coach-reviewed event. Changes are stored on this device.' : 'Suggested event — confirm it or make a correction.';
    document.getElementById('correctionPanel').hidden = true;
  }

  function filterMarkers() {
    const player = document.getElementById('duelPlayer').value;
    const type = document.getElementById('duelType').value;
    const outcome = document.getElementById('duelOutcome').value;
    markers.forEach(marker => {
      marker.hidden = !((player === 'all' || marker.dataset.player === player) && (type === 'all' || marker.dataset.type === type) && (outcome === 'all' || marker.dataset.outcome === outcome));
    });
  }

  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab,.tab-view').forEach(element => element.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  }));

  document.querySelectorAll('.formation-player').forEach(player => player.addEventListener('click', () => {
    document.querySelectorAll('.formation-player').forEach(item => item.classList.remove('active'));
    player.classList.add('active');
    const data = player.dataset;
    const card = document.getElementById('selectedPlayer');
    card.querySelector('.selected-number').textContent = data.number;
    card.querySelector('.eyebrow').textContent = data.position;
    card.querySelector('h2').innerHTML = `${data.name} <span>${data.rating}</span>`;
    card.querySelector('small').textContent = `${data.minutes} minutes played`;
    document.getElementById('statMinutes').textContent = `${data.minutes}'`;
    document.getElementById('statPasses').textContent = data.passes;
    document.getElementById('statShots').textContent = data.shots;
    document.getElementById('statTackles').textContent = data.tackles;
  }));

  markers.forEach(marker => {
    applyStored(marker);
    marker.addEventListener('click', () => renderDetail(marker));
  });
  filters.forEach(id => document.getElementById(id).addEventListener('change', filterMarkers));
  document.getElementById('confirmDuel').addEventListener('click', () => {
    selected.dataset.confirmed = 'true';
    save(selected);
    renderDetail(selected);
  });
  document.getElementById('changeDuel').addEventListener('click', () => {
    const panel = document.getElementById('correctionPanel');
    panel.hidden = !panel.hidden;
  });
  document.querySelectorAll('[data-correction]').forEach(button => button.addEventListener('click', () => {
    selected.dataset.outcome = button.dataset.correction;
    selected.dataset.confirmed = 'true';
    selected.classList.toggle('won', selected.dataset.outcome === 'won');
    selected.classList.toggle('lost', selected.dataset.outcome === 'lost');
    save(selected); updateTotal(); renderDetail(selected);
  }));
  document.querySelectorAll('[data-correction-type]').forEach(button => button.addEventListener('click', () => {
    selected.dataset.type = button.dataset.correctionType;
    selected.dataset.confirmed = 'true';
    selected.classList.toggle('ground', selected.dataset.type === 'ground');
    selected.classList.toggle('aerial', selected.dataset.type === 'aerial');
    save(selected); renderDetail(selected);
  }));
  updateTotal();
  renderDetail(selected);
})();
