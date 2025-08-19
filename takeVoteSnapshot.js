// snapshot.js
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// === Constants ===
const SNAPSHOT_DIR = path.resolve('snapshots');
const TODAY = new Date().toISOString().slice(0, 10); // e.g. "2025-08-19"
const FILE_PATH = path.join(SNAPSHOT_DIR, `${TODAY}.json`);
const MAX_ENTRIES = 288; // every 5 minutes

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

// === Helper sleep ===
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  // Wait for global poll function and trigger it
  await page.evaluate(() => {
    return new Promise((resolve) => {
      const tryTrigger = () => {
        if (typeof PD_vote15909793 === 'function') {
          PD_vote15909793(1); // Request results
          resolve();
        } else {
          setTimeout(tryTrigger, 300);
        }
      };
      tryTrigger();
    });
  });

  console.log('[Scraper] ⏳ Waiting for vote results...');
  await page.waitForSelector('.pds-feedback-group', {
    timeout: 15000,
  });
  await sleep(1000); // Ensure full render

  // ✅ Extract vote data
  const votes = await page.evaluate(() => {
    const results = {};
    const items = document.querySelectorAll('.pds-feedback-group');

    items.forEach((item) => {
      const name = item
        .querySelector('[title]')
        ?.getAttribute('title')
        ?.trim();
      const raw =
        item.querySelector('.pds-feedback-votes')?.innerText || '';
      const match = raw.match(/[\d,]+/);
      const count = match
        ? parseInt(match[0].replace(/,/g, ''), 10)
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
