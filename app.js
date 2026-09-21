(() => {
  'use strict';

  const AVATARS = ['🦊', '🐸', '🐼', '🐯', '🐙', '🦉', '🐧', '🦄', '🐵', '🐨', '🦖', '🐝', '🐳', '🦩', '🐔', '🐶'];
  const KEYS = ['A', 'B', 'C', 'D'];
  const OPTIONS = {
    rounds: [5, 10, 15, 20, 25, 30],
    time: [10, 15, 20, 30, 45, 60],
    hints: [[0, 'No hints'], [1, '1 hint'], [2, '2 hints']],
    difficulty: [['mixed', 'Mixed'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']],
  };

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // Stored locally so returning players keep their name and avatar
  const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  const state = {
    me: null,
    room: null,
    question: null,
    myAnswer: null,
    endsAt: 0,
    raf: 0,
    avatarIndex: Math.max(0, AVATARS.indexOf(store.get('avatar', AVATARS[0]))),
    lastScores: {},
  };

  const socket = io();

  // ---------- Screens & ads ----------
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${id}`));
    fillAds(document.getElementById(`screen-${id}`));
  }

  function showView(id) {
    ['lobby', 'stage', 'results'].forEach((v) => { $(`#view-${v}`).hidden = v !== id; });
    fillAds(document.getElementById(`view-${id}`));
  }

  // AdSense needs each slot pushed once, and only while it is visible.
  function fillAds(root) {
    if (!root) return;
    root.querySelectorAll('ins.adsbygoogle:not([data-pushed])').forEach((ins) => {
      if (!ins.offsetWidth) return;
      ins.setAttribute('data-pushed', '1');
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* ad blocker or not approved yet */ }
    });
  }

  // ---------- Home ----------
  const nameInput = $('#name');
  nameInput.value = store.get('name', '');

  function renderAvatar() { $('#avatar').textContent = AVATARS[state.avatarIndex]; }
  $('#avPrev').onclick = () => { state.avatarIndex = (state.avatarIndex + AVATARS.length - 1) % AVATARS.length; renderAvatar(); };
  $('#avNext').onclick = () => { state.avatarIndex = (state.avatarIndex + 1) % AVATARS.length; renderAvatar(); };
  renderAvatar();

  function profile() {
    const name = nameInput.value.trim();
    const avatar = AVATARS[state.avatarIndex];
    store.set('name', name);
    store.set('avatar', avatar);
    $('#homeError').textContent = '';
    return { name, avatar };
  }

  const inviteCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  if (inviteCode) {
    $('#btnJoinInvite').hidden = false;
    $('#inviteCode').textContent = inviteCode;
    $('#btnPlay').classList.remove('primary');
  }

  $('#btnJoinInvite').onclick = () => socket.emit('join', { code: inviteCode, ...profile() });
  $('#btnPlay').onclick = () => socket.emit('quickplay', profile());
  $('#btnCreate').onclick = () => socket.emit('create', profile());
  $('#joinForm').onsubmit = (e) => {
    e.preventDefault();
    const code = $('#codeInput').value.trim().toUpperCase();
    if (code.length !== 5) { $('#homeError').textContent = 'Room codes have 5 characters.'; return; }
    socket.emit('join', { code, ...profile() });
  };

  $('#btnLeave').onclick = () => {
    socket.emit('leave');
    leaveToHome();
  };

  function leaveToHome(message) {
    state.room = null;
    state.question = null;
    stopTimer();
    $('#chatLog').innerHTML = '';
    history.replaceState(null, '', '/');
    $('#btnJoinInvite').hidden = true;
    $('#btnPlay').classList.add('primary');
    showScreen('home');
    if (message) $('#homeError').textContent = message;
  }

  // ---------- Lobby settings ----------
  function fillSelect(sel, items, fmt) {
    sel.innerHTML = '';
    items.forEach((it) => {
      const [value, label] = Array.isArray(it) ? it : [it, fmt ? fmt(it) : String(it)];
      const o = el('option', null, label);
      o.value = value;
      sel.append(o);
    });
  }
  fillSelect($('#setRounds'), OPTIONS.rounds, (n) => `${n} questions`);
  fillSelect($('#setTime'), OPTIONS.time, (n) => `${n} seconds`);
  fillSelect($('#setHints'), OPTIONS.hints);
  fillSelect($('#setDifficulty'), OPTIONS.difficulty);
  fetch('/api/categories').then((r) => r.json())
    .then((cats) => { fillSelect($('#setCategory'), cats.map((c) => [c.id, c.name])); if (state.room) renderLobby(state.room); })
    .catch(() => fillSelect($('#setCategory'), [['any', 'Any category']]));

  const settingSelects = ['#setRounds', '#setTime', '#setHints', '#setDifficulty', '#setCategory'];
  settingSelects.forEach((id) => {
    $(id).onchange = () => socket.emit('settings', {
      rounds: $('#setRounds').value,
      time: $('#setTime').value,
      hints: $('#setHints').value,
      difficulty: $('#setDifficulty').value,
      category: $('#setCategory').value,
    });
  });

  $('#btnStart').onclick = () => socket.emit('start');
  $('#btnAgain').onclick = () => socket.emit('playAgain');
  $('#btnCopy').onclick = async () => {
    const link = $('#inviteLink');
    try { await navigator.clipboard.writeText(link.value); } catch { link.select(); document.execCommand('copy'); }
    $('#btnCopy').textContent = 'Copied';
    setTimeout(() => { $('#btnCopy').textContent = 'Copy link'; }, 1500);
  };

  let countdownTimer = 0;
  function renderLobby(room) {
    const isHost = room.hostId === state.me;
    $('#publicWait').hidden = !room.isPublic;
    $('#privateLobby').hidden = room.isPublic;

    clearInterval(countdownTimer);
    if (room.isPublic) {
      const need = Math.max(0, 2 - room.players.length);
      $('#publicWaitText').textContent = room.startsIn != null
        ? 'Get ready. The game is about to start.'
        : `Waiting for ${need} more player${need === 1 ? '' : 's'}. Share the site with friends to fill the room faster.`;
      if (room.startsIn != null) {
        const end = Date.now() + room.startsIn;
        const tick = () => { $('#publicCountdown').textContent = Math.max(0, Math.ceil((end - Date.now()) / 1000)); };
        tick();
        countdownTimer = setInterval(tick, 250);
      } else {
        $('#publicCountdown').textContent = '';
      }
      return;
    }

    const s = room.settings;
    $('#setRounds').value = s.rounds;
    $('#setTime').value = s.time;
    $('#setHints').value = s.hints;
    $('#setDifficulty').value = s.difficulty;
    $('#setCategory').value = s.category;
    settingSelects.forEach((id) => { $(id).disabled = !isHost; });
    $('#inviteLink').value = `${location.origin}/?room=${room.code}`;
    $('#btnStart').hidden = !isHost;
    $('#waitHost').hidden = isHost;
  }

  // ---------- Players ----------
  function renderPlayers(room) {
    const list = $('#playerList');
    list.innerHTML = '';
    $('#playerCount').textContent = `${room.players.length}/${room.max}`;
    const showStatus = room.state === 'question' || room.state === 'reveal';

    room.players.forEach((p, i) => {
      const li = el('li');
      if (p.id === state.me) li.classList.add('me');
      if (showStatus && p.answered) li.classList.add(p.correct ? 'correct' : 'answered');

      li.append(el('span', 'rank', `${i + 1}`), el('span', 'avatar', p.avatar));
      const name = el('span', 'pname', p.name);
      const tags = [];
      if (p.isHost) tags.push('host');
      if (p.id === state.me) tags.push('you');
      if (tags.length) name.append(' ', el('small', null, `(${tags.join(', ')})`));
      li.append(name);

      const score = el('span', 'score', String(p.score));
      const gained = p.score - (state.lastScores[p.id] ?? p.score);
      if (room.state === 'reveal' && gained > 0) score.append(el('span', 'gained', `+${gained}`));
      li.append(score);
      li.title = `${p.name}: ${p.score} points`;
      list.append(li);
    });
  }

  // ---------- Question & timer ----------
  function stopTimer() { cancelAnimationFrame(state.raf); }

  function runTimer(duration) {
    stopTimer();
    const bar = $('#timerBar');
    const label = $('#qTime');
    const frame = () => {
      const left = Math.max(0, state.endsAt - performance.now());
      bar.style.transform = `scaleX(${left / duration})`;
      const secs = Math.ceil(left / 1000);
      label.textContent = secs;
      const urgent = secs <= 5;
      bar.classList.toggle('urgent', urgent);
      label.classList.toggle('urgent', urgent);
      if (left > 0) state.raf = requestAnimationFrame(frame);
    };
    frame();
  }

  function renderQuestion(q) {
    state.question = q;
    state.myAnswer = null;
    // Baseline for the "+points" shown next to each player at the reveal
    if (state.room) state.lastScores = Object.fromEntries(state.room.players.map((p) => [p.id, p.score]));
    $('#loadingText').hidden = true;
    $('#qCounter').textContent = `Question ${q.index} of ${q.total}`;
    $('#qMeta').textContent = `${q.category}, ${q.difficulty}`;
    $('#qText').textContent = q.text;
    $('#qStatus').textContent = '';
    $('#qStatus').className = 'q-status';

    const box = $('#choices');
    box.innerHTML = '';
    q.choices.forEach((c, i) => {
      const b = el('button', 'choice');
      b.type = 'button';
      b.dataset.i = i;
      b.append(el('span', 'key', KEYS[i]), el('span', 'label', c));
      b.onclick = () => answer(i);
      box.append(b);
    });
    applyHints(q.eliminated || []);

    state.endsAt = performance.now() + q.remaining;
    runTimer(q.duration);
    showView('stage');
  }

  function applyHints(eliminated) {
    eliminated.forEach((i) => {
      const b = $(`#choices .choice[data-i="${i}"]`);
      if (b) { b.classList.add('out'); b.disabled = true; }
    });
  }

  function answer(i) {
    if (state.myAnswer != null || !state.question) return;
    const b = $(`#choices .choice[data-i="${i}"]`);
    if (!b || b.disabled) return;
    state.myAnswer = i;
    socket.emit('answer', i);
    document.querySelectorAll('#choices .choice').forEach((c) => { c.disabled = true; });
    b.classList.add('picked');
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea') || $('#view-stage').hidden) return;
    const k = e.key.toUpperCase();
    const idx = KEYS.indexOf(k) >= 0 ? KEYS.indexOf(k) : ['1', '2', '3', '4'].indexOf(k);
    if (idx >= 0) answer(idx);
  });

  // ---------- Results ----------
  function renderResults(players) {
    const podium = $('#podium');
    podium.innerHTML = '';
    players.slice(0, 3).forEach((p, i) => {
      const spot = el('div', `spot p${i + 1}`);
      spot.append(el('div', 'avatar', p.avatar), el('div', 'pname', p.name), el('div', 'pts', `${p.score} pts`), el('div', 'block', String(i + 1)));
      podium.append(spot);
    });
    const rest = $('#restList');
    rest.innerHTML = '';
    players.slice(3).forEach((p, i) => {
      const li = el('li');
      if (p.id === state.me) li.classList.add('me');
      li.append(el('span', 'rank', `${i + 4}`), el('span', 'avatar', p.avatar), el('span', 'pname', p.name), el('span', 'score', String(p.score)));
      rest.append(li);
    });

    const room = state.room;
    const isHost = room && room.hostId === state.me;
    $('#btnAgain').hidden = !(room && !room.isPublic && isHost);
    $('#againNote').textContent = room && room.isPublic
      ? 'A new game starts automatically in a few seconds.'
      : isHost ? '' : 'Waiting for the host to start another game.';
    showView('results');
  }

  // ---------- Chat ----------
  function addChat(msg) {
    const log = $('#chatLog');
    const li = el('li');
    if (msg.system) {
      li.className = `sys ${msg.tone || ''}`;
      li.textContent = msg.text;
    } else {
      li.append(el('span', 'who', `${msg.avatar} ${msg.name}: `), document.createTextNode(msg.text));
    }
    log.append(li);
    while (log.children.length > 100) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  $('#chatForm').onsubmit = (e) => {
    e.preventDefault();
    const input = $('#chatInput');
    const text = input.value.trim();
    if (text) socket.emit('chat', text);
    input.value = '';
  };

  // ---------- Socket events ----------
  socket.on('joined', ({ code, you, isPublic }) => {
    state.me = you;
    state.lastScores = {};
    history.replaceState(null, '', isPublic ? '/' : `/?room=${code}`);
    $('#roomLabel').textContent = isPublic ? 'Public room' : `Private room ${code}`;
    showScreen('room');
  });

  socket.on('room', (room) => {
    const prev = state.room;
    state.room = room;
    renderPlayers(room);

    if (room.state === 'lobby') {
      renderLobby(room);
      showView('lobby');
    } else if (room.state === 'loading') {
      showView('stage');
      $('#loadingText').hidden = false;
      $('#qText').textContent = '';
      $('#choices').innerHTML = '';
      $('#qStatus').textContent = '';
      $('#qCounter').textContent = '';
      $('#qMeta').textContent = '';
      $('#qTime').textContent = '';
    } else if (room.state === 'ended' && (!prev || prev.state !== 'ended')) {
      renderResults(room.players);
    }
  });

  socket.on('question', renderQuestion);
  socket.on('hint', ({ eliminated }) => applyHints(eliminated));

  socket.on('answered', ({ correct, points, streak }) => {
    const s = $('#qStatus');
    if (correct) {
      s.textContent = streak > 1 ? `Correct! +${points} (${streak} in a row)` : `Correct! +${points}`;
      s.className = 'q-status good';
    } else {
      s.textContent = 'Not this time. Wait for the reveal.';
      s.className = 'q-status bad';
    }
  });

  socket.on('reveal', ({ answer: right, counts }) => {
    stopTimer();
    $('#timerBar').style.transform = 'scaleX(0)';
    $('#qTime').textContent = '0';
    document.querySelectorAll('#choices .choice').forEach((b) => {
      const i = Number(b.dataset.i);
      b.disabled = true;
      if (i === right) b.classList.add('right');
      else if (i === state.myAnswer) b.classList.add('wrong');
      b.append(el('span', 'votes', `${counts[i]} picked`));
    });
    if (state.myAnswer == null) {
      const s = $('#qStatus');
      s.textContent = 'Time is up. Be quicker next round!';
      s.className = 'q-status bad';
    }
    if (state.room) renderPlayers(state.room);
  });

  socket.on('ended', ({ players }) => renderResults(players));
  socket.on('chat', addChat);
  socket.on('problem', (msg) => {
    if (state.room) addChat({ system: true, tone: 'warn', text: msg });
    else $('#homeError').textContent = msg;
  });

  let wasConnected = false;
  socket.on('connect', () => {
    $('#connBanner').hidden = true;
    if (wasConnected && state.room) {
      const code = state.room.isPublic ? null : state.room.code;
      leaveToHome(code
        ? `You were disconnected. Rejoin room ${code} with the button above.`
        : 'You were disconnected. Press play to join a new game.');
      if (code) {
        history.replaceState(null, '', `/?room=${code}`);
        $('#btnJoinInvite').hidden = false;
        $('#inviteCode').textContent = code;
        $('#btnJoinInvite').onclick = () => socket.emit('join', { code, ...profile() });
      }
    }
    wasConnected = true;
  });
  socket.on('disconnect', () => { $('#connBanner').hidden = false; });

  window.addEventListener('load', () => fillAds($('#screen-home')));
})();
