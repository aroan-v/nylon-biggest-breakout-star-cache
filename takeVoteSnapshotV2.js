// snapshot.js
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

async function fetchVotes() {
  try {
    // Fetch the poll JS snippet directly
    const response = await fetch(
      'https://polls.polldaddy.com/vote-js.php?p=15909793'
    );
    const text = await response.text();

    // Regex pattern for individual names and votes
    const nameVotePattern =
      /title="([^"]+)"[\s\S]*?\(([\d,.]+) votes\)/g;

    const results = {};

    // Extract individual votes
    for (const match of text.matchAll(nameVotePattern)) {
      results[match[1]] = Number(match[2].replace(/,/g, ''));
    }

    return results;
  } catch (err) {
    console.error('[fetchVotes] Error fetching votes:', err);
    return {};
  }
}

// === Runner ===
(async () => {
  const votes = await fetchVotes();
  addSnapshot(votes);
  console.log(`[Snapshot Saved] ${FILE_PATH}`);
})();
