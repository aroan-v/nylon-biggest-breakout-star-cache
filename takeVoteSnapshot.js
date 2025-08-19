// snapshot.js
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// === Constants ===
const SNAPSHOT_DIR = path.resolve('snapshots');
const TODAY = new Date().toISOString().slice(0, 10); // e.g. "2025-08-19"
const FILE_PATH = path.join(SNAPSHOT_DIR, `${TODAY}.json`);
const MAX_ENTRIES = 96; // every 15 minutes

// === Ensure folder exists ===
if (!fs.existsSync(SNAPSHOT_DIR)) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

// === Read JSON file safely or return default structure ===
function loadData() {
  try {
    const raw = fs.readFileSync(FILE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { times: [], voteIncrements: {}, baselineVotes: null };
  }
}

// === Write JSON to disk ===
function saveData(data) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// === Add new snapshot entry ===
function addSnapshot(votes) {
  const data = loadData();
  const timestamp = new Date().toISOString();

  if (!data.baselineVotes) {
    data.baselineVotes = votes;
  }

  data.times.push(timestamp);

  for (const [name, count] of Object.entries(votes)) {
    if (!data.voteIncrements[name]) {
      data.voteIncrements[name] = [];
    }
    data.voteIncrements[name].push(count);
  }

  // Keep at most MAX_ENTRIES
  if (data.times.length > MAX_ENTRIES) {
    data.times.shift();
    for (const arr of Object.values(data.voteIncrements)) {
      arr.shift();
    }
  }

  saveData(data);
}

// === Scraper function ===
async function scrapeVotes() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  await page.setContent(`
    <html>
      <head>
        <script src="https://secure.polldaddy.com/p/15909793.js"></script>
      </head>
      <body></body>
    </html>
  `);

  await page.evaluate(() => {
    if (typeof PD_vote15909793 === 'function') {
      PD_vote15909793(1);
    }
  });

  await page.waitForTimeout(2000);

  const votes = await page.evaluate(() => {
    const groups = document.querySelectorAll('.pds-feedback-group');
    const results = {};
    groups.forEach((group) => {
      const nameSpan = group.querySelector('[title]');
      const rawVote = group.querySelector(
        '.pds-feedback-votes'
      )?.textContent;
      const name = nameSpan?.getAttribute('title')?.trim();
      const voteMatch = rawVote?.match(/([\\d,]+)/);
      const count = voteMatch
        ? parseInt(voteMatch[1].replace(/,/g, ''))
        : null;

      if (name && count !== null && !isNaN(count)) {
        results[name] = count;
      }
    });
    return results;
  });

  await browser.close();
  return votes;
}

// === Runner ===
(async () => {
  const votes = await scrapeVotes();
  addSnapshot(votes);
  console.log(`[Snapshot Saved] ${FILE_PATH}`);
})();
