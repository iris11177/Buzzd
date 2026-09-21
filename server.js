'use strict';
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { fetchQuestions, prewarm, CATEGORY_LIST, CATEGORY_IDS, aiEnabled } = require('./questions');

const PORT = process.env.PORT || 3000;

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: 0 })); // browsers always check for the newest version
app.get('/api/categories', (_req, res) => res.json({ categories: CATEGORY_LIST, aiEnabled }));
app.get('/img/:id', require('./images').serve); // photos for picture questions
app.get('/api/images-status', require('./images').status); // check which photos loaded
app.get('/healthz', (_req, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e4 });

// ---------- Game rules ----------
const MAX_PLAYERS = 12;
const AVATARS = ['🦊', '🐸', '🐼', '🐯', '🐙', '🦉', '🐧', '🦄', '🐵', '🐨', '🦖', '🐝', '🐳', '🦩', '🐔', '🐶'];
const OPTIONS = {
  rounds: [5, 10, 15, 20, 25, 30],
  time: [10, 15, 20, 30, 45, 60],
  hints: [0, 1, 2],
  difficulty: ['mixed', 'easy', 'medium', 'hard'],
};
// Public rooms use PUBLIC_CATEGORY (set it to e.g. ph-all on Render to make random games Philippine-themed)
const PUBLIC_SETTINGS = { rounds: 10, time: 20, hints: 1, difficulty: 'mixed', category: process.env.PUBLIC_CATEGORY || 'any' };
const PRIVATE_DEFAULTS = { rounds: 10, time: 20, hints: 1, difficulty: 'mixed', category: 'any' };
const BASE_POINTS = { easy: 100, medium: 150, hard: 200 };
const REVEAL_MS = 5000;
const PUBLIC_START_MS = 10000;
const PUBLIC_RESTART_MS = 15000;
const MIN_PUBLIC_PLAYERS = 2;

const rooms = new Map();

// ---------- Helpers ----------
function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(n) {
  const name = String(n || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return name || `Player${Math.floor(100 + Math.random() * 900)}`;
}

const cleanAvatar = (a) => (AVATARS.includes(a) ? a : AVATARS[0]);

function createRoom(isPublic) {
  const room = {
    code: makeCode(),
    isPublic,
    hostId: null,
    settings: { ...(isPublic ? PUBLIC_SETTINGS : PRIVATE_DEFAULTS) },
    players: new Map(),
    state: 'lobby', // lobby | loading | question | reveal | ended
    questions: [],
    qIndex: -1,
    qEndsAt: 0,
    answers: new Map(),
    eliminated: [],
    timers: [],
    startsAt: null,
  };
  rooms.set(room.code, room);
  if (isPublic) prewarm(room.settings.category);
  return room;
}

function clearTimers(room) {
  room.timers.forEach(clearTimeout);
  room.timers = [];
}

function later(room, ms, fn) {
  room.timers.push(setTimeout(fn, ms));
}

function leaderboard(room) {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
    .map((p) => {
      const a = room.answers.get(p.id);
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: p.score,
        answered: Boolean(a),
        correct: a ? a.correct : false,
        isHost: p.id === room.hostId,
      };
    });
}

function snapshot(room) {
  return {
    code: room.code,
    isPublic: room.isPublic,
    hostId: room.hostId,
    state: room.state,
    settings: room.settings,
    qIndex: room.qIndex,
    total: room.questions.length || room.settings.rounds,
    players: leaderboard(room),
    startsIn: room.startsAt ? Math.max(0, room.startsAt - Date.now()) : null,
    max: MAX_PLAYERS,
  };
}

const broadcast = (room) => io.to(room.code).emit('room', snapshot(room));
const sys = (room, text, tone = 'info') => io.to(room.code).emit('chat', { system: true, tone, text });
const getRoom = (socket) => rooms.get(socket.data.room);

// ---------- Game flow ----------
function maybeAutoStart(room) {
  if (!room.isPublic || room.state !== 'lobby') return;
  if (room.players.size >= MIN_PUBLIC_PLAYERS && !room.startsAt) {
    room.startsAt = Date.now() + PUBLIC_START_MS;
    later(room, PUBLIC_START_MS, () => startGame(room));
    broadcast(room);
  } else if (room.players.size < MIN_PUBLIC_PLAYERS && room.startsAt) {
    clearTimers(room);
    room.startsAt = null;
    broadcast(room);
  }
}

function resetScores(room) {
  for (const p of room.players.values()) {
    p.score = 0;
    p.streak = 0;
  }
}

async function startGame(room) {
  if (room.state !== 'lobby' && room.state !== 'ended') return;
  clearTimers(room);
  room.startsAt = null;
  room.state = 'loading';
  room.qIndex = -1;
  room.answers = new Map();
  resetScores(room);
  broadcast(room);

  const { rounds, difficulty, category } = room.settings;
  const questions = await fetchQuestions({ amount: rounds, difficulty, category });
  if (!rooms.has(room.code) || room.state !== 'loading') return; // everyone left while loading
  room.questions = questions;
  sys(room, 'Game on. Good luck!');
  nextQuestion(room);
}

function questionPayload(room) {
  const q = room.questions[room.qIndex];
  return {
    index: room.qIndex + 1,
    total: room.questions.length,
    text: q.text,
    quote: q.quote || null,
    image: q.image ? q.image.url : null,
    imageCredit: q.image ? q.image.credit : null,
    imageSource: q.image ? q.image.source : null,
    choices: q.choices,
    category: q.category,
    difficulty: q.difficulty,
    duration: room.settings.time * 1000,
    remaining: Math.max(0, room.qEndsAt - Date.now()),
    eliminated: room.eliminated,
  };
}

function nextQuestion(room) {
  clearTimers(room);
  room.qIndex++;
  if (room.qIndex >= room.questions.length) return endGame(room);

  const q = room.questions[room.qIndex];
  const duration = room.settings.time * 1000;
  room.state = 'question';
  room.answers = new Map();
  room.eliminated = [];
  room.qEndsAt = Date.now() + duration;

  io.to(room.code).emit('question', questionPayload(room));
  broadcast(room);

  // Hints: wrong choices disappear at evenly spaced moments, like letters revealing in skribbl.io
  const wrong = q.choices.map((_, i) => i).filter((i) => i !== q.answer).sort(() => Math.random() - 0.5);
  const hints = Math.min(room.settings.hints, wrong.length - 1);
  for (let h = 0; h < hints; h++) {
    later(room, (duration * (h + 1)) / (hints + 1), () => {
      room.eliminated.push(wrong[h]);
      io.to(room.code).emit('hint', { eliminated: [...room.eliminated] });
    });
  }
  later(room, duration, () => reveal(room));
}

function reveal(room) {
  if (room.state !== 'question') return;
  clearTimers(room);
  room.state = 'reveal';
  const q = room.questions[room.qIndex];
  const counts = q.choices.map(() => 0);
  const results = {};
  for (const [id, a] of room.answers) {
    counts[a.choice]++;
    results[id] = { choice: a.choice, points: a.points };
  }
  for (const p of room.players.values()) if (!room.answers.has(p.id)) p.streak = 0;

  io.to(room.code).emit('reveal', { answer: q.answer, counts, results });
  broadcast(room);
  later(room, REVEAL_MS, () => nextQuestion(room));
}

function endGame(room) {
  clearTimers(room);
  room.state = 'ended';
  room.answers = new Map();
  const board = leaderboard(room);
  io.to(room.code).emit('ended', { players: board });
  broadcast(room);
  if (board[0]) sys(room, `${board[0].name} wins with ${board[0].score} points!`, 'good');

  if (room.isPublic) {
    later(room, PUBLIC_RESTART_MS, () => {
      room.state = 'lobby';
      room.questions = [];
      room.qIndex = -1;
      resetScores(room);
      broadcast(room);
      maybeAutoStart(room);
    });
  }
}

// ---------- Joining & leaving ----------
function leaveCurrent(socket) {
  const room = getRoom(socket);
  if (!room) return;
  const p = room.players.get(socket.id);
  room.players.delete(socket.id);
  room.answers.delete(socket.id);
  socket.leave(room.code);
  socket.data.room = null;

  if (room.players.size === 0) {
    clearTimers(room);
    rooms.delete(room.code);
    return;
  }
  if (!room.isPublic && room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value;
    sys(room, `${room.players.get(room.hostId).name} is now the host.`);
  }
  if (p) sys(room, `${p.name} left.`);
  broadcast(room);

  if (room.state === 'question' && room.answers.size >= room.players.size) later(room, 700, () => reveal(room));
  if (room.isPublic) maybeAutoStart(room);
}

function addPlayer(socket, room, { name, avatar }) {
  leaveCurrent(socket);
  if (room.players.size >= MAX_PLAYERS) {
    socket.emit('problem', 'That room is full. Try another room or play a random game.');
    return;
  }
  const player = {
    id: socket.id,
    name: cleanName(name),
    avatar: cleanAvatar(avatar),
    score: 0,
    streak: 0,
    joinedAt: Date.now(),
    lastChat: 0,
  };
  room.players.set(socket.id, player);
  if (!room.isPublic && !room.players.has(room.hostId)) room.hostId = socket.id;

  socket.join(room.code);
  socket.data.room = room.code;
  socket.emit('joined', { code: room.code, you: socket.id, isPublic: room.isPublic });
  sys(room, `${player.name} joined.`);
  broadcast(room);

  if (room.state === 'question') socket.emit('question', questionPayload(room));
  if (room.isPublic) maybeAutoStart(room);
}

function findPublicRoom() {
  let best = null;
  for (const room of rooms.values()) {
    if (!room.isPublic || room.players.size >= MAX_PLAYERS) continue;
    if (!best || room.players.size > best.players.size) best = room;
  }
  return best || createRoom(true);
}

// ---------- Socket events ----------
io.on('connection', (socket) => {
  socket.on('quickplay', (profile = {}) => addPlayer(socket, findPublicRoom(), profile));

  socket.on('create', (profile = {}) => addPlayer(socket, createRoom(false), profile));

  socket.on('join', (data = {}) => {
    const room = rooms.get(String(data.code || '').toUpperCase().trim());
    if (!room) return socket.emit('problem', 'Room not found. Check the code or ask your friend for a new link.');
    addPlayer(socket, room, data);
  });

  socket.on('settings', (s = {}) => {
    const room = getRoom(socket);
    if (!room || room.isPublic || socket.id !== room.hostId || room.state !== 'lobby') return;
    const next = { ...room.settings };
    if (OPTIONS.rounds.includes(Number(s.rounds))) next.rounds = Number(s.rounds);
    if (OPTIONS.time.includes(Number(s.time))) next.time = Number(s.time);
    if (OPTIONS.hints.includes(Number(s.hints))) next.hints = Number(s.hints);
    if (OPTIONS.difficulty.includes(s.difficulty)) next.difficulty = s.difficulty;
    if (CATEGORY_IDS.has(s.category)) next.category = s.category;
    room.settings = next;
    prewarm(next.category); // start writing Philippine questions while the host sets up
    broadcast(room);
  });

  socket.on('start', () => {
    const room = getRoom(socket);
    if (!room || room.isPublic || socket.id !== room.hostId) return;
    startGame(room);
  });

  socket.on('playAgain', () => {
    const room = getRoom(socket);
    if (!room || room.isPublic || socket.id !== room.hostId || room.state !== 'ended') return;
    room.state = 'lobby';
    room.questions = [];
    room.qIndex = -1;
    resetScores(room);
    broadcast(room);
  });

  socket.on('answer', (raw) => {
    const room = getRoom(socket);
    if (!room || room.state !== 'question' || room.answers.has(socket.id)) return;
    const player = room.players.get(socket.id);
    const q = room.questions[room.qIndex];
    const choice = Number(raw);
    if (!player || !Number.isInteger(choice) || choice < 0 || choice >= q.choices.length) return;

    const duration = room.settings.time * 1000;
    const left = Math.max(0, room.qEndsAt - Date.now());
    const correct = choice === q.answer;
    let points = 0;
    if (correct) {
      player.streak++;
      const base = BASE_POINTS[q.difficulty] || 150;
      // Faster answers earn more (50%–100% of base), plus a small streak bonus.
      points = Math.round(base * (0.5 + 0.5 * (left / duration))) + Math.min(50, (player.streak - 1) * 10);
      player.score += points;
    } else {
      player.streak = 0;
    }
    room.answers.set(socket.id, { choice, correct, points });
    socket.emit('answered', { choice, correct, points, streak: player.streak });
    if (correct) sys(room, `${player.name} got it!`, 'good');
    broadcast(room);

    if (room.answers.size >= room.players.size) later(room, 700, () => reveal(room));
  });

  socket.on('chat', (raw) => {
    const room = getRoom(socket);
    const player = room && room.players.get(socket.id);
    if (!player) return;
    const now = Date.now();
    if (now - player.lastChat < 700) return;
    const text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!text) return;
    player.lastChat = now;

    if (room.state === 'question') {
      const q = room.questions[room.qIndex];
      const ans = q.choices[q.answer].toLowerCase();
      const t = text.toLowerCase();
      if ((ans.length > 1 && t.includes(ans)) || /^[a-d1-4]$/.test(t)) {
        socket.emit('chat', { system: true, tone: 'warn', text: 'Hold that thought until the answer is revealed.' });
        return;
      }
    }
    io.to(room.code).emit('chat', { name: player.name, avatar: player.avatar, text });
  });

  socket.on('leave', () => leaveCurrent(socket));
  socket.on('disconnect', () => leaveCurrent(socket));
});

server.listen(PORT, () => console.log(`Trivia server running on http://localhost:${PORT}`));
