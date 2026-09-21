# Buzzd – multiplayer trivia

A real-time trivia game in the spirit of skribbl.io. Players join a random public room or create a private room and invite friends with a link. The host picks rounds, seconds per question, hints and difficulty (plus a category). Questions are pulled automatically from the Open Trivia Database, and a built-in question bank takes over if that service is down.

## How the game works

- **Public rooms:** "Play with random players" drops you into the busiest open room. A game starts 10 seconds after 2 players are present, and a new one starts automatically 15 seconds after each game ends.
- **Private rooms:** the creator is the host and is also a player on the ranking. Only the host can change settings and start. If the host leaves, the next player becomes host.
- **Scoring:** easy 100, medium 150, hard 200 points, scaled from 50% to 100% by how fast you answer, plus +10 per consecutive correct answer (up to +50). Wrong or no answer scores 0.
- **Hints:** like skribbl.io's letter reveals, wrong choices vanish at evenly spaced moments during the timer.
- **Fair play:** the correct answer never leaves the server until the reveal, and chat blocks messages that give the answer away while a question is live.
- Up to 12 players per room.

## Run it on your computer

1. Install Node.js 18 or newer from https://nodejs.org
2. In this folder run:
   ```
   npm install
   npm start
   ```
3. Open http://localhost:3000 in two browser windows to play against yourself.

## Put it online

The game uses WebSockets, so it needs a host that keeps a server running. Vercel and Netlify won't work for the game server. Good options:

- **Render** (render.com): New > Web Service > connect your GitHub repo. Build command `npm install`, start command `npm start`. The free plan sleeps when idle, so use a paid instance once you have traffic.
- **Railway** (railway.app) or **Fly.io**: similar, low monthly cost.

Then buy a domain (e.g. from Namecheap, Cloudflare or a .ph registrar) and point it at the host.

After you have your domain, replace `YOURDOMAIN.com` in `public/index.html`, `public/robots.txt` and `public/sitemap.xml`, and fill in the date and email in `public/privacy.html`.

## Get found on Google

1. Add the site in Google Search Console (search.google.com/search-console) and submit `https://YOURDOMAIN.com/sitemap.xml`.
2. Share the link where players hang out: Facebook groups, TikTok, Discord, Reddit. Early traffic matters more than anything for a new game.

## Earn from ads (Google AdSense)

1. Apply at https://adsense.google.com with your live domain. Approval usually needs a real domain, a privacy policy (included), and some original content (the How to play section helps).
2. Once approved, replace every `ca-pub-XXXXXXXXXXXXXXXX` in `public/index.html` with your publisher ID, and the `XXXXXXXXXXXXXXXX` in `public/ads.txt`.
3. In AdSense, create three display ad units and paste their slot IDs over `1111111111` (home banner), `2222222222` (results screen) and `3333333333` (sidebar during play).

Ad placement follows AdSense rules: ads are kept away from the answer buttons so players don't click them by accident. Don't move ads next to the choices.

## Change the name or look

- Site name: search for `Buzzd` in `public/index.html` and `public/privacy.html`. The big logo is written one letter per `<span>`; letters with `class="zap"` are drawn in pink.
- Colors: the variables at the top of `public/style.css`.
- Game rules (players per room, timing, points): the constants at the top of `server.js`.

## Credits

Questions from the Open Trivia Database (https://opentdb.com), licensed CC BY-SA 4.0. Keep the attribution in the footer.
