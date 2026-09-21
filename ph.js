'use strict';
// Philippines categories. Questions are written by Claude (Anthropic API). For current
// events, showbiz and social media, Claude searches the web first so questions stay fresh.
// Without an ANTHROPIC_API_KEY, the built-in Philippine question bank below is used.

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const DAILY_BATCH_LIMIT = Number(process.env.AI_DAILY_BATCH_LIMIT || 30); // spending guard
const BATCH_SIZE = 25;
const HOUR = 3600 * 1000;

const PH_TOPICS = {
  'ph-all': {
    name: 'Everything Philippines',
    label: 'Philippines',
    search: true,
    ttl: 12 * HOUR,
    brief: 'a lively mix of everything Filipino: history and heroes, government and current events, food, places, festivals and traditions, language and slang, sports, showbiz and OPM, viral trends, memes and influencers. Mix serious and funny questions.',
  },
  'ph-history': {
    name: 'History & heroes',
    label: 'Philippine history',
    search: false,
    ttl: 7 * 24 * HOUR,
    brief: 'Philippine history: pre-colonial kingdoms, Spanish and American periods, the Revolution and its heroes, World War II, Martial Law, EDSA People Power, landmark laws and national symbols. Serious, educational tone.',
  },
  'ph-politics': {
    name: 'Politics & current events',
    label: 'Philippine politics',
    search: true,
    ttl: 12 * HOUR,
    brief: 'Philippine government and current events: how government works, the Constitution, elections, national officials, major laws, national news and issues from the past year. Serious, strictly neutral and factual tone.',
  },
  'ph-culture': {
    name: 'Food, places & culture',
    label: 'Filipino culture',
    search: false,
    ttl: 7 * 24 * HOUR,
    brief: 'Filipino food and regional dishes, provinces, islands and tourist spots, festivals, traditions and superstitions, languages and Filipino words, family and everyday Pinoy life. Warm, fun tone.',
  },
  'ph-showbiz': {
    name: 'Showbiz & chismis',
    label: 'Showbiz & chismis',
    search: true,
    ttl: 12 * HOUR,
    brief: 'Filipino showbiz: celebrities, love teams, teleseryes, movies, noontime shows, OPM and P-pop, beauty pageants, and the latest publicly reported showbiz news. Playful "Marites" chismis tone, Taglish welcome.',
  },
  'ph-social': {
    name: 'Social media & trends',
    label: 'Viral & trending',
    search: true,
    ttl: 12 * HOUR,
    brief: 'Filipino internet culture: viral videos and moments, memes, TikTok and Facebook trends, influencers and content creators, Pinoy slang and "hugot" lines, and what is trending online in the Philippines recently. Funny, Taglish tone welcome.',
  },
  'ph-sports': {
    name: 'Sports',
    label: 'Philippine sports',
    search: true,
    ttl: 24 * HOUR,
    brief: 'Philippine sports: basketball (PBA, UAAP, NCAA, Gilas Pilipinas, Filipino NBA links), boxing, volleyball (PVL, Alas Pilipinas), Olympic and SEA Games athletes, billiards, and recent results. Energetic tone.',
  },
};

// ---------- Built-in bank (used without an API key, or to top up) ----------
// [topic, difficulty, question, correct, wrong1, wrong2, wrong3]
const BANK = [
  ['history', 'easy', 'Who was the first president of the Philippines?', 'Emilio Aguinaldo', 'Manuel L. Quezon', 'Andrés Bonifacio', 'José P. Laurel'],
  ['history', 'easy', 'Who founded the Katipunan?', 'Andrés Bonifacio', 'José Rizal', 'Emilio Jacinto', 'Apolinario Mabini'],
  ['history', 'easy', 'In what year did the EDSA People Power Revolution happen?', '1986', '1983', '1989', '1972'],
  ['history', 'easy', 'Who led the natives who defeated Ferdinand Magellan in the Battle of Mactan?', 'Lapulapu', 'Rajah Humabon', 'Rajah Sulayman', 'Datu Puti'],
  ['history', 'easy', 'Who was the first woman president of the Philippines?', 'Corazon Aquino', 'Gloria Macapagal Arroyo', 'Imelda Marcos', 'Leni Robredo'],
  ['history', 'easy', 'On what date is Philippine Independence Day celebrated?', 'June 12', 'July 4', 'August 21', 'December 30'],
  ['history', 'medium', 'In what year did Ferdinand Marcos declare Martial Law?', '1972', '1965', '1969', '1981'],
  ['history', 'medium', 'Which hero is known as the "Sublime Paralytic"?', 'Apolinario Mabini', 'Emilio Jacinto', 'Marcelo H. del Pilar', 'Graciano López Jaena'],
  ['history', 'medium', 'Who sewed the first Philippine flag in Hong Kong?', 'Marcela Agoncillo', 'Melchora Aquino', 'Gabriela Silang', 'Teresa Magbanua'],
  ['history', 'medium', 'Who composed the music of the Philippine national anthem?', 'Julián Felipe', 'José Palma', 'Nicanor Abelardo', 'Lucio San Pedro'],
  ['history', 'medium', 'Which treaty transferred the Philippines from Spain to the United States in 1898?', 'Treaty of Paris', 'Treaty of Manila', 'Treaty of Tordesillas', 'Treaty of Versailles'],
  ['history', 'medium', 'What was the real name of "Tandang Sora"?', 'Melchora Aquino', 'Gregoria de Jesús', 'Trinidad Tecson', 'Josefa Llanes Escoda'],
  ['history', 'medium', 'Who was the first president of the Philippine Commonwealth?', 'Manuel L. Quezon', 'Sergio Osmeña', 'Manuel Roxas', 'Emilio Aguinaldo'],
  ['history', 'medium', 'In what year was José Rizal executed at Bagumbayan?', '1896', '1898', '1892', '1901'],
  ['history', 'hard', 'Which hero is called the "Brains of the Katipunan"?', 'Emilio Jacinto', 'Apolinario Mabini', 'Andrés Bonifacio', 'Antonio Luna'],
  ['history', 'hard', 'Gabriela Silang led a revolt in which region?', 'Ilocos', 'Bicol', 'Visayas', 'Cagayan Valley'],
  ['politics', 'easy', 'Where is the official residence of the President of the Philippines?', 'Malacañang Palace', 'Batasang Pambansa', 'Rizal Park', 'Fort Santiago'],
  ['politics', 'easy', 'How long is the term of the President of the Philippines?', '6 years, no reelection', '4 years, one reelection', '5 years, one reelection', '6 years, one reelection'],
  ['politics', 'medium', 'In what year was the current Philippine Constitution ratified?', '1987', '1973', '1935', '1986'],
  ['politics', 'medium', 'How many senators are in the Philippine Senate?', '24', '12', '30', '36'],
  ['politics', 'medium', 'What is the minimum voting age in the Philippines?', '18', '16', '21', '17'],
  ['culture', 'easy', 'Which province is home to the Chocolate Hills?', 'Bohol', 'Cebu', 'Palawan', 'Iloilo'],
  ['culture', 'easy', 'Mayon Volcano, famous for its near-perfect cone, is in which province?', 'Albay', 'Sorsogon', 'Batangas', 'Camarines Sur'],
  ['culture', 'easy', 'What is the highest mountain in the Philippines?', 'Mount Apo', 'Mount Pulag', 'Mount Mayon', 'Mount Kanlaon'],
  ['culture', 'easy', 'Which city is called the "Summer Capital of the Philippines"?', 'Baguio', 'Tagaytay', 'Davao City', 'Cebu City'],
  ['culture', 'easy', 'Sizzling sisig is most closely linked to which province?', 'Pampanga', 'Bulacan', 'Batangas', 'Ilocos Norte'],
  ['culture', 'easy', 'Which cold dessert mixes shaved ice, evaporated milk and many sweet toppings?', 'Halo-halo', 'Leche flan', 'Taho', 'Buko pandan'],
  ['culture', 'easy', 'The Sinulog festival is celebrated in which city?', 'Cebu City', 'Iloilo City', 'Bacolod', 'Davao City'],
  ['culture', 'easy', 'What is the national bird of the Philippines?', 'Philippine eagle', 'Maya', 'Kalaw', 'Tarictic hornbill'],
  ['culture', 'medium', 'The Ati-Atihan festival is held in which town?', 'Kalibo, Aklan', 'Roxas City, Capiz', 'Lucban, Quezon', 'Vigan, Ilocos Sur'],
  ['culture', 'medium', 'The MassKara Festival is celebrated in which city?', 'Bacolod', 'Iloilo City', 'Dumaguete', 'Tacloban'],
  ['culture', 'medium', 'The famous Banaue Rice Terraces are in which province?', 'Ifugao', 'Benguet', 'Mountain Province', 'Kalinga'],
  ['culture', 'medium', 'What is the longest river in the Philippines?', 'Cagayan River', 'Pasig River', 'Agusan River', 'Pampanga River'],
  ['culture', 'medium', 'What is the national tree of the Philippines?', 'Narra', 'Molave', 'Acacia', 'Mango'],
  ['culture', 'medium', 'The first jeepneys were made from what?', 'Leftover US military jeeps', 'Old Japanese trucks', 'Spanish horse carriages', 'Retired city buses'],
  ['sports', 'easy', 'Hidilyn Diaz won the first Olympic gold medal for the Philippines in which sport?', 'Weightlifting', 'Boxing', 'Gymnastics', 'Taekwondo'],
  ['sports', 'easy', 'Carlos Yulo won two Olympic golds at Paris 2024 in which sport?', 'Gymnastics', 'Swimming', 'Boxing', 'Pole vault'],
  ['sports', 'easy', 'What is the nickname of the Philippine men\'s national basketball team?', 'Gilas Pilipinas', 'Alas Pilipinas', 'Azkals', 'Smart Tigers'],
  ['sports', 'easy', 'Efren "Bata" Reyes is a legend in which sport?', 'Billiards', 'Bowling', 'Chess', 'Boxing'],
  ['sports', 'easy', 'What does PBA stand for?', 'Philippine Basketball Association', 'Pinoy Basketball Alliance', 'Pro Basketball Asia', 'Philippine Ball Association'],
  ['showbiz', 'easy', 'Which band recorded "Ang Huling El Bimbo"?', 'Eraserheads', 'Rivermaya', 'Parokya ni Edgar', 'Kamikazee'],
  ['showbiz', 'easy', 'SB19 is known as a pioneer of what music genre?', 'P-pop', 'OPM rock', 'Hip-hop', 'Kundiman'],
  ['showbiz', 'medium', 'In what year did Pia Wurtzbach win Miss Universe?', '2015', '2013', '2017', '2018'],
  ['showbiz', 'medium', 'In what year did Catriona Gray win Miss Universe?', '2018', '2016', '2015', '2019'],
  ['showbiz', 'medium', 'Lea Salonga won a Tony Award for which musical?', 'Miss Saigon', 'Les Misérables', 'Mulan', 'Aladdin'],
  ['showbiz', 'hard', 'Who was the first Filipina to win Miss Universe?', 'Gloria Diaz', 'Margie Moran', 'Pia Wurtzbach', 'Melanie Marquez'],
  ['showbiz', 'medium', 'Which singer is known as the "Popstar Royalty"?', 'Sarah Geronimo', 'Regine Velasquez', 'Yeng Constantino', 'Moira Dela Torre'],
  ['social', 'easy', 'In Pinoy slang, what does "charot" mean?', 'Just kidding', 'Let\'s eat', 'So tired', 'Very rich'],
  ['social', 'easy', 'The slang word "lodi" comes from which word spelled backwards?', 'Idol', 'Lodge', 'Dilo', 'Old'],
  ['social', 'easy', 'Online, calling someone a "Marites" means they are a what?', 'Gossip lover', 'Good cook', 'Night owl', 'Big spender'],
  ['social', 'easy', 'The slang word "werpa" is a reversed form of which word?', 'Power', 'Paper', 'Wrap', 'Prayer'],
  ['social', 'easy', 'What does "kilig" describe?', 'Giddy romantic excitement', 'Extreme hunger', 'Deep sadness', 'Feeling sleepy'],
  ['social', 'medium', 'The slang "petmalu" is a reversed form of which Filipino word?', 'Malupit', 'Malupet na', 'Maluto', 'Malapit'],
  ['social', 'easy', 'When someone comments "sana all" on a post, what are they saying?', 'They wish they had it too', 'They are congratulating everyone', 'They want the post deleted', 'They are saying goodbye'],
];

const TOPIC_LABEL = {
  history: 'Philippine history', politics: 'Philippine politics', culture: 'Filipino culture',
  showbiz: 'Showbiz & chismis', social: 'Viral & trending', sports: 'Philippine sports',
};

const TOPIC_OF = {
  'ph-history': 'history', 'ph-politics': 'politics', 'ph-culture': 'culture',
  'ph-showbiz': 'showbiz', 'ph-social': 'social', 'ph-sports': 'sports',
};

// ---------- State ----------
const pools = new Map();    // category -> [{text, choices, answer, difficulty, category, createdAt}]
const recent = new Map();   // category -> recent question texts (to avoid repeats)
const inflight = new Map(); // category -> promise
let day = '';
let batchesToday = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isPhCategory = (id) => Object.prototype.hasOwnProperty.call(PH_TOPICS, id);

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
  return { text, choices, answer: choices.indexOf(correct), difficulty, category, createdAt: Date.now() };
}

function remember(category, texts) {
  const list = recent.get(category) || [];
  list.push(...texts);
  recent.set(category, list.slice(-80));
}

function underBudget() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; batchesToday = 0; }
  return batchesToday < DAILY_BATCH_LIMIT;
}

// ---------- Prompt ----------
function buildPrompt(category) {
  const t = PH_TOPICS[category];
  const today = new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' });
  const avoid = (recent.get(category) || []).slice(-40);

  return `Today is ${today}. Write ${BATCH_SIZE} multiple-choice trivia questions for Buzzd, a multiplayer trivia game played mostly by Filipinos.

Topic: ${t.brief}

${t.search
    ? 'First, use web search to find what is happening and trending in the Philippines right now (last few weeks to months), using reliable Philippine news outlets such as Inquirer, Philstar, Rappler, GMA News, ABS-CBN News, Manila Bulletin and PNA. Base at least half of the questions on recent, well-reported news. Fill the rest with evergreen facts.'
    : 'Use well-established facts only.'}

Accuracy rules:
- Every question must have exactly one clearly correct answer that is verifiable from reliable sources. If you are not sure, leave that question out.
- For anything time-sensitive, put the time in the question (for example "In August 2026, ..." or "As of 2026, ...") so it stays correct later.
- Wrong choices must be plausible but clearly wrong. All 4 choices must be different. Keep each choice under 60 characters.

Fairness and safety rules (very important, these are about real people):
- Showbiz and chismis: only use things the celebrities themselves or reliable news outlets have publicly confirmed (announced relationships or breakups, projects, awards, viral public moments). Never present rumors, blind items or speculation as fact.
- Never ask about anyone's health, pregnancies, sexuality, private family matters, or unconfirmed relationships. Never make questions about minors' private lives.
- No accusations of crimes or wrongdoing, unless it is a matter of public record decided by a court or officially filed and widely reported, and phrase it neutrally.
- Politics: strictly neutral and factual (who, what, when, where). No opinions, no loaded words, no favoring any party or politician, no questions about controversies that are only allegations.
- Funny questions should laugh with Filipinos, not at any region, group, religion or person. No insults or body shaming.

Style: keep questions short (under 25 words). ${t.search ? 'Mix serious and fun.' : ''} Taglish is fine where it fits the topic and tone.
Difficulty mix: about 40% "easy", 40% "medium", 20% "hard".
${avoid.length ? `Do not repeat or closely copy any of these earlier questions:\n${avoid.map((q) => `- ${q}`).join('\n')}\n` : ''}
Reply with ONLY a JSON array, no other text, in this exact shape:
[{"q": "question text", "correct": "right answer", "wrong": ["wrong 1", "wrong 2", "wrong 3"], "difficulty": "easy"}]`;
}

// ---------- API ----------
async function callClaude(messages, useSearch) {
  const body = {
    model: MODEL,
    max_tokens: 8000,
    messages,
  };
  if (useSearch) {
    body.tools = [{
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 5,
      user_location: { type: 'approximate', country: 'PH', timezone: 'Asia/Manila' },
    }];
  }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(150000),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function validItem(o) {
  if (!o || typeof o.q !== 'string' || typeof o.correct !== 'string' || !Array.isArray(o.wrong)) return false;
  if (o.q.trim().length < 10 || o.q.length > 300 || o.wrong.length !== 3) return false;
  const all = [o.correct, ...o.wrong];
  if (!all.every((c) => typeof c === 'string' && c.trim() && c.length <= 80)) return false;
  return new Set(all.map((c) => c.trim().toLowerCase())).size === 4;
}

async function generate(category) {
  const t = PH_TOPICS[category];
  const messages = [{ role: 'user', content: buildPrompt(category) }];
  let data;
  for (let i = 0; i < 4; i++) {
    data = await callClaude(messages, t.search);
    if (data.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: data.content }); // long search turn: let it continue
  }
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('No JSON array in reply');
  const items = JSON.parse(text.slice(start, end + 1));

  const seen = new Set((recent.get(category) || []).map((q) => q.toLowerCase()));
  const out = [];
  for (const o of items) {
    if (!validItem(o)) continue;
    const key = o.q.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const diff = ['easy', 'medium', 'hard'].includes(o.difficulty) ? o.difficulty : 'medium';
    out.push(makeQuestion(o.q.trim(), o.correct.trim(), o.wrong.map((w) => w.trim()), diff, t.label));
  }
  return out;
}

function refill(category) {
  if (!API_KEY || !isPhCategory(category)) return Promise.resolve();
  if (inflight.has(category)) return inflight.get(category);
  if (!underBudget()) {
    console.warn('[ph] daily AI batch limit reached; using the built-in bank');
    return Promise.resolve();
  }
  batchesToday++;
  const p = generate(category)
    .then((qs) => {
      const pool = pools.get(category) || [];
      pool.push(...qs);
      pools.set(category, pool);
      remember(category, qs.map((q) => q.text));
      console.log(`[ph] generated ${qs.length} questions for ${category}`);
    })
    .catch((err) => console.warn(`[ph] generation failed for ${category}:`, err.message))
    .finally(() => inflight.delete(category));
  inflight.set(category, p);
  return p;
}

function prune(category) {
  const ttl = PH_TOPICS[category].ttl;
  const pool = (pools.get(category) || []).filter((q) => Date.now() - q.createdAt < ttl);
  pools.set(category, pool);
  return pool;
}

function fromBank(category, amount, difficulty, exclude) {
  const topic = TOPIC_OF[category];
  const fits = (r) => difficulty === 'mixed' || r[1] === difficulty;
  const order = (rows) => shuffle(rows.filter(fits)).concat(shuffle(rows.filter((r) => !fits(r))));
  const usable = BANK.filter((r) => !exclude.has(r[2]));
  // The category's own topic first; borrow from other Philippine topics only if needed.
  const rows = topic
    ? order(usable.filter((r) => r[0] === topic)).concat(order(usable.filter((r) => r[0] !== topic)))
    : order(usable);
  return rows.slice(0, amount).map((r) => makeQuestion(r[2], r[3], [r[4], r[5], r[6]], r[1], TOPIC_LABEL[r[0]]));
}

// Take `amount` questions, preferring the requested difficulty.
async function getPhQuestions({ amount, difficulty, category }) {
  let pool = prune(category);
  if (pool.length < amount && API_KEY) {
    await Promise.race([refill(category), sleep(60000)]); // AI writing + searching takes ~20-60 s
    pool = prune(category);
  }

  const matches = (q) => difficulty === 'mixed' || q.difficulty === difficulty;
  const picked = [];
  for (const pass of [matches, () => true]) {
    for (let i = 0; i < pool.length && picked.length < amount; ) {
      if (pass(pool[i])) picked.push(pool.splice(i, 1)[0]);
      else i++;
    }
  }
  if (picked.length < amount) {
    picked.push(...fromBank(category, amount - picked.length, difficulty, new Set(picked.map((q) => q.text))));
  }
  if (pool.length < 15) refill(category); // top up in the background
  return shuffle(picked);
}

// Called when a host picks a Philippines category, so questions are ready by the time they press Start.
function prewarm(category) {
  if (isPhCategory(category) && prune(category).length < 15) refill(category);
}

const PH_CATEGORY_LIST = Object.entries(PH_TOPICS).map(([id, t]) => ({ id, name: t.name, group: 'Philippines' }));

module.exports = { getPhQuestions, prewarm, isPhCategory, PH_CATEGORY_LIST, aiEnabled: Boolean(API_KEY) };
