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
    brief: 'Philippine government and current events: how government works, the Constitution, elections, national officials, major laws, national news and issues from the past year. Mix about two-thirds serious questions with one-third fun ones about Pinoy political culture: political slang (trapo, balimbing, epal, hakot), campaign jingles and dance crazes, tarpaulins, SONA red-carpet fashion, and celebrities turned politicians. Fun questions poke fun at political habits in general, never at a specific politician. Always neutral: no opinions and no favoring any party or person.',
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
  ["history", "easy", "Who is widely regarded as the national hero of the Philippines?", "José Rizal", "Andrés Bonifacio", "Emilio Aguinaldo", "Apolinario Mabini"],
  ["history", "easy", "What was José Rizal's first novel?", "Noli Me Tángere", "El Filibusterismo", "Florante at Laura", "Ibong Adarna"],
  ["history", "easy", "The Philippines was named after which Spanish king?", "King Philip II", "King Ferdinand", "King Charles V", "King Philip V"],
  ["history", "medium", "In what year did Ferdinand Magellan reach the Philippines?", "1521", "1565", "1492", "1898"],
  ["history", "medium", "Where was Philippine independence declared on June 12, 1898?", "Kawit, Cavite", "Malolos, Bulacan", "Tondo, Manila", "Biak-na-Bato"],
  ["history", "medium", "How many rays does the sun on the Philippine flag have?", "8", "7", "3", "12"],
  ["history", "medium", "What do the three stars on the Philippine flag stand for?", "Luzon, Visayas and Mindanao", "The three branches of government", "Three national heroes", "Three Spanish provinces"],
  ["history", "medium", "Which hero is called the \"Brains of the Revolution\"?", "Apolinario Mabini", "Emilio Jacinto", "Antonio Luna", "Andrés Bonifacio"],
  ["history", "medium", "Which opposition leader was assassinated at the Manila airport in 1983?", "Ninoy Aquino", "Jose W. Diokno", "Lorenzo Tañada", "Jovito Salonga"],
  ["history", "medium", "On what date did the United States recognize Philippine independence?", "July 4, 1946", "June 12, 1898", "February 25, 1986", "November 15, 1935"],
  ["history", "medium", "Which president died in a plane crash in 1957?", "Ramon Magsaysay", "Manuel Roxas", "Elpidio Quirino", "Manuel L. Quezon"],
  ["history", "medium", "When the Philippine flag is flown with red on top, it means the country is…", "At war", "Celebrating a holiday", "In mourning", "Electing a president"],
  ["history", "hard", "How much did the U.S. pay Spain for the Philippines under the 1898 Treaty of Paris?", "$20 million", "$2 million", "$10 million", "$50 million"],
  ["history", "hard", "Which of these was one of José Rizal's pen names?", "Laong Laan", "Plaridel", "Taga-Ilog", "Kalipulako"],
  ["history", "hard", "In what year was the Katipunan founded?", "1892", "1896", "1872", "1898"],
  ["history", "hard", "Fathers Gomez, Burgos and Zamora, executed in 1872, are known together as?", "GomBurZa", "KKK", "La Liga Filipina", "The Propaganda Trio"],
  ["history", "hard", "Which town was the capital of the First Philippine Republic?", "Malolos, Bulacan", "Kawit, Cavite", "Intramuros, Manila", "Tarlac, Tarlac"],
  ["history", "hard", "In what year did the Bataan Death March happen?", "1942", "1941", "1944", "1945"],
  ["history", "hard", "Which general, known for his fiery temper, was the subject of the 2015 film about him?", "Antonio Luna", "Gregorio del Pilar", "Miguel Malvar", "Artemio Ricarte"],
  ["history", "hard", "Which \"boy general\" died defending Tirad Pass in 1899?", "Gregorio del Pilar", "Antonio Luna", "Emilio Jacinto", "Macario Sakay"],
  ["history", "hard", "The lyrics of the national anthem came from a Spanish poem by whom?", "José Palma", "Julián Felipe", "José Rizal", "Apolinario Mabini"],
  ["politics", "easy", "What is the smallest unit of local government in the Philippines?", "Barangay", "Municipality", "Province", "Region"],
  ["politics", "easy", "Which government agency runs Philippine elections?", "COMELEC", "DILG", "COA", "DepEd"],
  ["politics", "medium", "How long is the term of a Philippine senator?", "6 years", "3 years", "4 years", "9 years"],
  ["politics", "medium", "How long is the term of a member of the House of Representatives?", "3 years", "6 years", "4 years", "2 years"],
  ["politics", "medium", "When does the President deliver the State of the Nation Address (SONA)?", "Fourth Monday of July", "June 12", "First Monday of January", "Last Friday of December"],
  ["politics", "medium", "Who was the second woman to become President of the Philippines?", "Gloria Macapagal Arroyo", "Imelda Marcos", "Miriam Defensor Santiago", "Leni Robredo"],
  ["politics", "hard", "Where does the President usually deliver the SONA?", "Batasang Pambansa", "Malacañang Palace", "Rizal Park", "Manila Hotel"],
  ["politics", "hard", "How many justices sit on the Philippine Supreme Court?", "15", "9", "12", "24"],
  ["politics", "hard", "What is the minimum age to run for President of the Philippines?", "40", "35", "45", "30"],
  ["politics", "hard", "What is the minimum age to run for Senator?", "35", "40", "25", "30"],
  ["politics", "hard", "National and local elections in the Philippines are held on which day?", "Second Monday of May", "First Monday of June", "Last Monday of April", "Second Tuesday of November"],
  ["politics", "hard", "In 2016, an international arbitral tribunal on the South China Sea largely ruled in favor of which country?", "The Philippines", "China", "Vietnam", "Malaysia"],
  ["politics", "hard", "What does BARMM stand for?", "Bangsamoro Autonomous Region in Muslim Mindanao", "Bangsamoro Administrative Region of Mindanao and Mimaropa", "Basilan and Regional Muslim Mindanao", "Bangsamoro Assembly for Regional Muslim Matters"],
  ["politics", "hard", "In 2013, the Supreme Court declared which lawmakers' fund unconstitutional?", "PDAF (the \"pork barrel\")", "Internal Revenue Allotment", "SSS Pension Fund", "Calamity Fund"],
  ["politics", "hard", "Who was the youngest person ever to become President of the Philippines?", "Emilio Aguinaldo", "Ramon Magsaysay", "Ferdinand Marcos", "Benigno Aquino III"],
  ["politics", "hard", "Which president held office the longest?", "Ferdinand Marcos", "Manuel L. Quezon", "Gloria Macapagal Arroyo", "Rodrigo Duterte"],
  ["politics", "easy", "\"Trapo\" is short for \"traditional politician\". What else does trapo mean?", "Rag", "Broom", "Umbrella", "Slipper"],
  ["politics", "easy", "A politician called a \"balimbing\" (star fruit) is one who…", "Keeps switching parties", "Never attends sessions", "Only campaigns during fiestas", "Only speaks in English"],
  ["politics", "easy", "In Pinoy slang, an \"epal\" politician is one who…", "Puts their name and face on public projects", "Fixes potholes at night", "Sings at every event", "Refuses all interviews"],
  ["politics", "easy", "In the barangay, who is usually called \"Kap\"?", "The barangay captain", "The police chief", "The parish priest", "The school principal"],
  ["politics", "easy", "What do Filipinos call the big vinyl banners with politicians' faces and \"Happy Fiesta!\" greetings?", "Tarpaulin", "Banderitas", "Parol", "Karatula"],
  ["politics", "easy", "During campaign season, candidates love turning popular songs into what?", "Campaign jingles", "Lullabies", "National anthems", "Ringtones"],
  ["politics", "easy", "How do Filipinos vote on the automated election ballot?", "Shade the oval beside the name", "Write the candidate's name", "Punch a hole", "Circle it with a red pen"],
  ["politics", "medium", "Besides the speech itself, SONA day is famous for what?", "A red-carpet parade of lawmakers' outfits", "Free lechon for everyone", "A fireworks show", "A basketball game"],
  ["politics", "medium", "A \"hakot\" crowd at a political rally is…", "People brought in, often with perks, to fill the venue", "The candidate's bodyguards", "Reporters covering the rally", "Volunteers who clean up after"],
  ["politics", "medium", "Which boxing legend also served as a senator?", "Manny Pacquiao", "Nonito Donaire", "Onyok Velasco", "Flash Elorde"],
  ["politics", "medium", "Which former action star was elected President in 1998?", "Joseph Estrada", "Fernando Poe Jr.", "Lito Lapid", "Ramon Revilla Sr."],
  ["politics", "medium", "Former senator Tito Sotto is part of which famous comedy trio?", "TVJ", "APO Hiking Society", "Eraserheads", "Smokey Mountain"],
  ["politics", "medium", "Vico Sotto, who became Pasig City mayor in 2019, is the son of which comedian?", "Vic Sotto", "Joey de Leon", "Dolphy", "Michael V."],
  ["politics", "medium", "Which senator was nicknamed the \"Iron Lady of Asia\"?", "Miriam Defensor Santiago", "Imelda Marcos", "Corazon Aquino", "Loren Legarda"],
  ["politics", "medium", "In Philippine politics, \"pork barrel\" refers to…", "Lawmakers' funds for pet projects", "A tax on lechon", "The Senate cafeteria budget", "An election-day feast"],
  ["politics", "hard", "The \"budots\" dance craze, later a campaign-rally favorite, came from which city?", "Davao City", "Cebu City", "Quezon City", "Iloilo City"],
  ["culture", "easy", "What is the capital of the Philippines?", "Manila", "Quezon City", "Cebu City", "Davao City"],
  ["culture", "easy", "What are the three main island groups of the Philippines?", "Luzon, Visayas, Mindanao", "Luzon, Palawan, Mindanao", "Visayas, Mindanao, Sulu", "Luzon, Samar, Leyte"],
  ["culture", "easy", "Which tiny, big-eyed primate is a famous sight in Bohol?", "Tarsier", "Tamaraw", "Mouse deer", "Binturong"],
  ["culture", "easy", "Adobo is mainly flavored with what?", "Vinegar and soy sauce", "Coconut milk and chili", "Fish sauce and tamarind", "Peanut sauce"],
  ["culture", "easy", "The sour taste of classic sinigang comes from which fruit?", "Tamarind (sampalok)", "Mango", "Pineapple", "Banana"],
  ["culture", "easy", "\"Halo-halo\" literally means…", "Mix-mix", "Cold-cold", "Sweet-sweet", "Ice-ice"],
  ["culture", "easy", "What is balut?", "A boiled developing duck egg", "A rice cake", "A fried fish ball", "A grilled pork skewer"],
  ["culture", "easy", "What is the national flower of the Philippines?", "Sampaguita", "Gumamela", "Rose", "Waling-waling"],
  ["culture", "medium", "What is the largest lake in the Philippines?", "Laguna de Bay", "Taal Lake", "Lake Lanao", "Lake Buhi"],
  ["culture", "medium", "About how many islands does the Philippines have, based on the latest official count?", "7,641", "1,700", "10,500", "5,012"],
  ["culture", "medium", "Baguio's Panagbenga festival is famous for what?", "Flowers", "Masks", "Lanterns", "Kites"],
  ["culture", "medium", "The colorful Pahiyas festival, with houses decorated with kiping, is held in which town?", "Lucban, Quezon", "Vigan, Ilocos Sur", "Kalibo, Aklan", "Taal, Batangas"],
  ["culture", "medium", "The Kadayawan festival is celebrated in which city?", "Davao City", "Cebu City", "Iloilo City", "Baguio"],
  ["culture", "medium", "Which city is most famous for chicken inasal?", "Bacolod", "Cebu City", "Vigan", "Tacloban"],
  ["culture", "medium", "Orange kwek-kwek is made by battering and frying what?", "Quail eggs", "Fish balls", "Chicken skin", "Squid rings"],
  ["culture", "medium", "Which is the most populous city in the Philippines?", "Quezon City", "Manila", "Davao City", "Caloocan"],
  ["culture", "hard", "The Tubbataha Reefs are in which sea?", "Sulu Sea", "West Philippine Sea", "Celebes Sea", "Philippine Sea"],
  ["culture", "hard", "The Puerto Princesa Underground River is in which province?", "Palawan", "Bohol", "Cebu", "Surigao del Norte"],
  ["culture", "hard", "What is the national gem of the Philippines?", "Pearl", "Jade", "Diamond", "Ruby"],
  ["culture", "hard", "Which was declared the national martial art and sport in 2009?", "Arnis", "Basketball", "Boxing", "Chess"],
  ["culture", "hard", "In what year did Mount Pinatubo have its huge eruption?", "1991", "1968", "2006", "1814"],
  ["culture", "hard", "What is the northernmost province of the Philippines?", "Batanes", "Ilocos Norte", "Cagayan", "Apayao"],
  ["culture", "hard", "What is the southernmost province of the Philippines?", "Tawi-Tawi", "Sulu", "Sarangani", "Davao Occidental"],
  ["sports", "easy", "Which boxer is called the \"Pambansang Kamao\" (National Fist)?", "Manny Pacquiao", "Nonito Donaire", "Donnie Nietes", "Onyok Velasco"],
  ["sports", "medium", "The PBA, founded in 1975, is known as the first what in Asia?", "Professional basketball league", "Volleyball league", "Boxing federation", "Football league"],
  ["sports", "medium", "In 2023, the Philippines co-hosted which world tournament?", "FIBA Basketball World Cup", "FIFA World Cup", "Olympic Games", "World Chess Championship"],
  ["sports", "hard", "Which boxer won an Olympic silver in 1996 and later became a comedian-actor?", "Onyok Velasco", "Manny Pacquiao", "Eumir Marcial", "Nesthy Petecio"],
  ["showbiz", "easy", "Which TV network calls its viewers \"Kapamilya\"?", "ABS-CBN", "GMA", "TV5", "PTV"],
  ["showbiz", "easy", "Which TV network calls its viewers \"Kapuso\"?", "GMA", "ABS-CBN", "TV5", "PTV"],
  ["showbiz", "easy", "The love team \"AlDub\" is made up of Alden Richards and who?", "Maine Mendoza", "Kathryn Bernardo", "Nadine Lustre", "Julia Barretto"],
  ["showbiz", "easy", "The love team \"KathNiel\" is Kathryn Bernardo and who?", "Daniel Padilla", "Alden Richards", "James Reid", "Enrique Gil"],
  ["showbiz", "easy", "\"Bahay ni Kuya\" is the house in which reality show?", "Pinoy Big Brother", "It's Showtime", "Eat Bulaga", "Wowowin"],
  ["showbiz", "easy", "Popoy and Basha are the iconic couple from which movie?", "One More Chance", "Hello, Love, Goodbye", "Four Sisters and a Wedding", "Starting Over Again"],
  ["showbiz", "easy", "Who is known as the \"Unkabogable Star\"?", "Vice Ganda", "Anne Curtis", "Kim Chiu", "Toni Gonzaga"],
  ["showbiz", "easy", "Who is known as \"Asia's Songbird\"?", "Regine Velasquez", "Sarah Geronimo", "Lea Salonga", "Morissette Amon"],
  ["showbiz", "easy", "Which P-pop girl group sang the viral hit \"Pantropiko\"?", "BINI", "4th Impact", "MNL48", "Kaia"],
  ["showbiz", "easy", "Which P-pop boy group released the hit \"Gento\"?", "SB19", "BGYO", "Alamat", "Hori7on"],
  ["showbiz", "medium", "Filipino singer Arnel Pineda became the lead vocalist of which American band?", "Journey", "Queen", "Toto", "Chicago"],
  ["showbiz", "medium", "Who played the lead role in \"FPJ's Ang Probinsyano\"?", "Coco Martin", "Piolo Pascual", "Dingdong Dantes", "John Lloyd Cruz"],
  ["showbiz", "medium", "Who starred as Marimar in the 2007 Filipino remake?", "Marian Rivera", "Kim Chiu", "Anne Curtis", "Heart Evangelista"],
  ["showbiz", "medium", "Who sings the OPM hit \"Buwan\"?", "Juan Karlos", "Moira Dela Torre", "Zack Tabudlo", "Adie"],
  ["showbiz", "medium", "Which band recorded \"Tadhana\"?", "Up Dharma Down", "Ben&Ben", "December Avenue", "IV of Spades"],
  ["showbiz", "medium", "Which band recorded \"Mundo\"?", "IV of Spades", "Ben&Ben", "The Juans", "Silent Sanctuary"],
  ["showbiz", "medium", "AlDub's \"Kalyeserye\" segment aired on which noontime show?", "Eat Bulaga", "It's Showtime", "ASAP", "Wowowin"],
  ["showbiz", "medium", "In Eat Bulaga's \"Pinoy Henyo\", the guesser can only be answered with…", "Oo, hindi, or puwede", "Any clue at all", "Charades", "Drawings"],
  ["showbiz", "hard", "Who played the title role in the 2015 film \"Heneral Luna\"?", "John Arcilla", "Paulo Avelino", "Cesar Montano", "Dingdong Dantes"],
  ["showbiz", "hard", "Which band recorded the OPM classic \"Jopay\"?", "Mayonnaise", "Kamikazee", "Hale", "Sponge Cola"],
  ["showbiz", "hard", "In what year did ABS-CBN go off free TV after its franchise was not renewed?", "2020", "2016", "2022", "2018"],
  ["social", "easy", "In Pinoy slang, \"chika\" means…", "Gossip or a story", "Chicken", "A snack", "A dance"],
  ["social", "easy", "If you got \"na-budol\", what happened?", "You were tricked into buying or giving something", "You won a raffle", "You fell asleep", "You got promoted"],
  ["social", "easy", "What animal is Jollibee, the fast-food mascot?", "A bee", "A chicken", "A dog", "A cat"],
  ["social", "easy", "Your \"beshie\" is your…", "Best friend", "Boss", "Neighbor", "Ex"],
  ["social", "easy", "What does \"gigil\" describe?", "The urge to squeeze something super cute", "Being extremely sleepy", "Fear of heights", "Craving rice"],
  ["social", "medium", "In Pinoy slang, \"dasurv\" means…", "Deserved", "Dessert", "Disturbed", "Dizzy"],
  ["social", "medium", "Someone acting \"pabebe\" is being…", "Cutesy and childish", "Very aggressive", "Super rich", "Extremely lazy"],
  ["social", "medium", "When a friend asks \"Ano'ng ganap?\", they want to know…", "What's happening", "How much it costs", "Where you live", "Who you like"],
  ["social", "medium", "Which vlogger leads the content creator group \"Team Payaman\"?", "Cong TV", "Ninong Ry", "Kuya Kim", "Toni Gonzaga"],
  ["social", "medium", "Ranz Kyle is famous for dance videos with which sibling?", "Niana Guerrero", "Ivana Alawi", "Andrea Brillantes", "Maymay Entrata"],
  ["social", "medium", "Content creator Ninong Ry is best known for what kind of videos?", "Cooking", "Gaming", "Makeup", "Travel"],
  ["social", "medium", "\"Kuya Kim\" Atienza is best known on TV for what?", "Trivia and weather segments", "A cooking show", "Boxing commentary", "Pageant hosting"],
  ["social", "medium", "In Pinoy slang, a \"walwal\" night means…", "Heavy drinking and partying", "Studying all night", "Walking around the mall", "Watching teleseryes"],
  ["social", "hard", "The word \"Marites\" is said to come from which phrase?", "\"Mare, ano'ng latest?\"", "\"Mare, tara na!\"", "\"Mare, ang ganda mo!\"", "\"Mare, kain na!\""],
  ["social", "hard", "Words like \"lodi\", \"petmalu\" and \"werpa\" are examples of what kind of slang?", "Words spelled backwards", "Jejemon spelling", "Gay lingo", "Conyo speak"],
  ["social", "hard", "Which name is given to Filipino gay lingo?", "Swardspeak", "Jejemon", "Conyo", "Taglish"],
  ["social", "hard", "Typing \"3ow p0wh\" with odd letters and numbers is linked to which online subculture?", "Jejemon", "Conyo", "Marites", "Bekimon"],
  ["social", "hard", "\"Let's make kain na!\" is a classic example of which way of talking?", "Conyo", "Jejemon", "Swardspeak", "Deep Tagalog"],
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
