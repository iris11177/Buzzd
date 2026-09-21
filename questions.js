'use strict';
// Automatic trivia questions from the Open Trivia Database (https://opentdb.com, CC BY-SA 4.0).
// Questions are fetched 50 at a time into pools so many rooms can start without hitting
// the API's rate limit (1 request per 5 seconds per IP). If the API is down, a built-in
// question bank keeps games running.

const API = 'https://opentdb.com';

const CATEGORIES = [
  { id: 'any', name: 'Any category', otdb: null },
  { id: 'general', name: 'General knowledge', otdb: 9 },
  { id: 'science', name: 'Science & nature', otdb: 17 },
  { id: 'computers', name: 'Computers', otdb: 18 },
  { id: 'math', name: 'Mathematics', otdb: 19 },
  { id: 'geography', name: 'Geography', otdb: 22 },
  { id: 'history', name: 'History', otdb: 23 },
  { id: 'sports', name: 'Sports', otdb: 21 },
  { id: 'film', name: 'Movies', otdb: 11 },
  { id: 'music', name: 'Music', otdb: 12 },
  { id: 'tv', name: 'Television', otdb: 14 },
  { id: 'games', name: 'Video games', otdb: 15 },
  { id: 'anime', name: 'Anime & manga', otdb: 31 },
  { id: 'animals', name: 'Animals', otdb: 27 },
  { id: 'mythology', name: 'Mythology', otdb: 20 },
];
const CATEGORY_LIST = CATEGORIES.map(({ id, name }) => ({ id, name }));
const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

// [difficulty, question, correct, wrong1, wrong2, wrong3, category]
const FALLBACK = [
  ['easy', 'What is the capital of the Philippines?', 'Manila', 'Cebu City', 'Davao City', 'Quezon City', 'Geography'],
  ['easy', 'How many continents are there on Earth?', '7', '5', '6', '8', 'Geography'],
  ['easy', 'Which planet is known as the Red Planet?', 'Mars', 'Venus', 'Jupiter', 'Mercury', 'Science & nature'],
  ['easy', 'What gas do plants absorb from the air?', 'Carbon dioxide', 'Oxygen', 'Nitrogen', 'Helium', 'Science & nature'],
  ['easy', 'How many legs does a spider have?', '8', '6', '10', '12', 'Animals'],
  ['easy', 'What is the largest ocean on Earth?', 'Pacific Ocean', 'Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean', 'Geography'],
  ['easy', 'Which animal is known as the King of the Jungle?', 'Lion', 'Tiger', 'Elephant', 'Gorilla', 'Animals'],
  ['easy', 'What is 9 × 7?', '63', '56', '72', '81', 'Mathematics'],
  ['easy', 'What color do you get by mixing blue and yellow?', 'Green', 'Purple', 'Orange', 'Brown', 'General knowledge'],
  ['easy', 'Which sport uses a shuttlecock?', 'Badminton', 'Tennis', 'Squash', 'Volleyball', 'Sports'],
  ['easy', 'What is the freezing point of water in Celsius?', '0°', '32°', '-10°', '100°', 'Science & nature'],
  ['easy', 'How many days are in a leap year?', '366', '365', '364', '360', 'General knowledge'],
  ['easy', 'What is the national flower of the Philippines?', 'Sampaguita', 'Rose', 'Orchid', 'Gumamela', 'General knowledge'],
  ['easy', 'Which company makes the iPhone?', 'Apple', 'Samsung', 'Google', 'Nokia', 'Computers'],
  ['medium', 'Who painted the Mona Lisa?', 'Leonardo da Vinci', 'Michelangelo', 'Raphael', 'Vincent van Gogh', 'General knowledge'],
  ['medium', 'What is the chemical symbol for gold?', 'Au', 'Ag', 'Go', 'Gd', 'Science & nature'],
  ['medium', 'In what year did World War II end?', '1945', '1944', '1946', '1939', 'History'],
  ['medium', 'What is the smallest prime number?', '2', '1', '3', '0', 'Mathematics'],
  ['medium', 'Which country has the most natural lakes?', 'Canada', 'Russia', 'United States', 'Finland', 'Geography'],
  ['medium', 'What does "HTTP" stand for?', 'HyperText Transfer Protocol', 'High Transfer Text Protocol', 'HyperText Transmission Program', 'Hyperlink Text Transfer Process', 'Computers'],
  ['medium', 'How many players are on a basketball team on court?', '5', '6', '7', '4', 'Sports'],
  ['medium', 'Which Filipino boxer won titles in eight weight divisions?', 'Manny Pacquiao', 'Nonito Donaire', 'Flash Elorde', 'Donnie Nietes', 'Sports'],
  ['medium', 'What is the hardest natural substance?', 'Diamond', 'Quartz', 'Titanium', 'Graphite', 'Science & nature'],
  ['medium', 'Which planet has the most confirmed moons?', 'Saturn', 'Jupiter', 'Uranus', 'Neptune', 'Science & nature'],
  ['medium', 'Who wrote "Noli Me Tángere"?', 'José Rizal', 'Andrés Bonifacio', 'Marcelo H. del Pilar', 'Apolinario Mabini', 'History'],
  ['medium', 'In Greek mythology, who is the king of the gods?', 'Zeus', 'Poseidon', 'Hades', 'Apollo', 'Mythology'],
  ['medium', 'What is the square root of 144?', '12', '14', '11', '16', 'Mathematics'],
  ['hard', 'What is the longest bone in the human body?', 'Femur', 'Tibia', 'Humerus', 'Fibula', 'Science & nature'],
  ['hard', 'Which element has atomic number 26?', 'Iron', 'Cobalt', 'Nickel', 'Manganese', 'Science & nature'],
  ['hard', 'In what year was the Philippine Declaration of Independence proclaimed?', '1898', '1896', '1946', '1901', 'History'],
  ['hard', 'Which programming language was created by Guido van Rossum?', 'Python', 'Ruby', 'Perl', 'Java', 'Computers'],
  ['hard', 'What is the capital of Australia?', 'Canberra', 'Sydney', 'Melbourne', 'Perth', 'Geography'],
  ['hard', 'How many bones are in the adult human body?', '206', '208', '201', '212', 'Science & nature'],
  ['hard', 'Which ancient wonder stood in Alexandria?', 'The Lighthouse', 'The Colossus', 'The Hanging Gardens', 'The Mausoleum', 'History'],
  ['hard', 'What is the sum of the interior angles of a hexagon?', '720°', '540°', '900°', '600°', 'Mathematics'],
  ['hard', 'Which Norse god is associated with a hammer named Mjölnir?', 'Thor', 'Odin', 'Loki', 'Freyr', 'Mythology'],
  ['hard', 'What is the most spoken native language in the world?', 'Mandarin Chinese', 'English', 'Spanish', 'Hindi', 'General knowledge'],
  ['hard', 'Which mountain range contains Mount Apo?', 'Mindanao ranges (Apo–Talomo)', 'Cordillera Central', 'Sierra Madre', 'Zambales Mountains', 'Geography'],
];

let token = null;
let lastCall = 0;
let chain = Promise.resolve();
const pools = new Map(); // key -> array of questions
const refilling = new Set();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeQuestion(text, correct, wrong, difficulty, category) {
  const choices = shuffle([correct, ...wrong]);
  return { text, choices, answer: choices.indexOf(correct), difficulty, category };
}

// Keep API calls at least 5.1 s apart across the whole server.
function throttled(fn) {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastCall + 5100 - Date.now());
    if (wait) await sleep(wait);
    lastCall = Date.now();
    return fn();
  });
  chain = run.catch(() => {});
  return run;
}

async function getJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function ensureToken() {
  if (token) return;
  try {
    const data = await throttled(() => getJSON(`${API}/api_token.php?command=request`));
    if (data.response_code === 0) token = data.token;
  } catch { /* play without a token */ }
}

async function apiFetch(difficulty, otdbCategory, amount = 50) {
  await ensureToken();
  const params = new URLSearchParams({ amount: String(amount), type: 'multiple', encode: 'url3986' });
  if (difficulty !== 'mixed') params.set('difficulty', difficulty);
  if (otdbCategory) params.set('category', String(otdbCategory));
  if (token) params.set('token', token);

  const data = await throttled(() => getJSON(`${API}/api.php?${params}`));
  const code = data.response_code;
  if (code === 0) {
    const dec = decodeURIComponent;
    return data.results.map((r) =>
      makeQuestion(dec(r.question), dec(r.correct_answer), r.incorrect_answers.map(dec), r.difficulty, dec(r.category)));
  }
  if (code === 3 || code === 4) token = null; // token missing or used up: get a fresh one next time
  if (code === 1 && amount > 10) return apiFetch(difficulty, otdbCategory, 10); // narrow category, ask for fewer
  return [];
}

function poolFor(key) {
  if (!pools.has(key)) pools.set(key, []);
  return pools.get(key);
}

async function refill(key, difficulty, category) {
  if (refilling.has(key)) return;
  refilling.add(key);
  try {
    const cat = CATEGORIES.find((c) => c.id === category);
    const fresh = await apiFetch(difficulty, cat ? cat.otdb : null, 50);
    const pool = poolFor(key);
    const seen = new Set(pool.map((q) => q.text));
    for (const q of fresh) if (!seen.has(q.text)) pool.push(q);
  } catch (err) {
    console.warn('[questions] API fetch failed:', err.message);
  } finally {
    refilling.delete(key);
  }
}

function fallback(amount, difficulty, exclude) {
  let bank = FALLBACK.filter((f) => difficulty === 'mixed' || f[0] === difficulty);
  bank = shuffle(bank).filter((f) => !exclude.has(f[1]));
  if (bank.length < amount) bank = bank.concat(shuffle(FALLBACK)); // repeat if we must
  return bank.slice(0, amount).map((f) => makeQuestion(f[1], f[2], [f[3], f[4], f[5]], f[0], f[6]));
}

async function fetchQuestions({ amount, difficulty, category }) {
  const key = `${difficulty}|${category}`;
  let pool = poolFor(key);

  if (pool.length < amount) {
    // Wait for the API, but never longer than 15 s before falling back.
    await Promise.race([refill(key, difficulty, category), sleep(15000)]);
    pool = poolFor(key);
  }

  const out = pool.splice(0, amount);
  if (out.length < amount) {
    out.push(...fallback(amount - out.length, difficulty, new Set(out.map((q) => q.text))));
  }
  if (pool.length < 20) refill(key, difficulty, category); // top up in the background

  return out;
}

module.exports = { fetchQuestions, CATEGORY_LIST, CATEGORY_IDS };
