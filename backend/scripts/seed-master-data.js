/**
 * seed-master-data.js
 * ────────────────────────────────────────────────────────────────────────────
 * One-time script to populate District, PoliceStation, and Office tables.
 *
 * HOW IT WORKS:
 *  1. Fetches master data directly from the Haryana Govt API (port 443 ✅)
 *  2. POSTs fetched data to the LOCAL backend API (localhost:3001) which
 *     writes to the database (backend has full DB access ✅)
 *
 * This avoids the need for direct DB access (port 5432) from local machine.
 *
 * USAGE:
 *  1. Make sure backend is running: npm run dev  (in backend/ folder)
 *  2. Get your JWT from browser → DevTools → Application → localStorage → 'token'
 *  3. Run:
 *       JWT_TOKEN=<your-token> node scripts/seed-master-data.js
 *
 * Or set in .env.seed file:
 *       BACKEND_URL=http://localhost:3001
 *       JWT_TOKEN=eyJhbGci...
 * ────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.seed'), override: false });

const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');
const JWT_TOKEN = process.env.JWT_TOKEN || '';
const STATE_CODE = process.env.HARYANA_STATE_CODE || '13';
const PS_BATCH_SIZE = 3;

const BASE = process.env.HARYANA_POLICE_API_BASE || 'https://api.haryanapolice.gov.in/eSaralServices/api/common';
const DISTRICT_API = process.env.HARYANA_DISTRICT_API || `${BASE}/district`;
const PS_API = process.env.HARYANA_POLICE_STATION_API || `${BASE}/GetPSByDistrict`;
const OFFICE_API = process.env.HARYANA_OFFICE_API || `${BASE}/GetAllOffices`;

if (!JWT_TOKEN) {
  console.error('\n❌  JWT_TOKEN is required.\n');
  console.error('   1. Open your dashboard in browser and log in.');
  console.error('   2. Open DevTools → Application → Local Storage → copy "token" value.');
  console.error('   3. Run:  JWT_TOKEN=<paste-here> node scripts/seed-master-data.js\n');
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────────────

const toId = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  return raw;           // keep as string — backend parses to BigInt
};

const parseJsonPayload = (rawText) => {
  let parsed;
  try { parsed = JSON.parse(rawText); } catch { return null; }
  const source = Array.isArray(parsed.Result)
    ? parsed.Result
    : Array.isArray(parsed.DropDownDTO)
      ? parsed.DropDownDTO
      : [];
  const items = [];
  for (const row of source) {
    const id = toId(row.ID ?? row.Id ?? row.id);
    const name = String(row.Name ?? row.NAME ?? row.name ?? '').trim();
    if (id && name) items.push({ id, name });
  }
  return items;
};

const parseXmlPayload = (rawText) => {
  const xml = rawText.replace(/<d2p1:/g, '<').replace(/<\/d2p1:/g, '</').replace(/<d3p1:/g, '<').replace(/<\/d3p1:/g, '</');
  const ids = Array.from(xml.matchAll(/<ID>(.*?)<\/ID>/g), (m) => m[1]);
  const names = Array.from(xml.matchAll(/<Name>(.*?)<\/Name>/g), (m) => m[1]);
  const items = [];
  for (let i = 0; i < ids.length; i++) {
    const id = toId(ids[i]);
    const name = (names[i] || '').trim();
    if (id && name) items.push({ id, name });
  }
  return items;
};

// ── HTTP helper (uses native https to bypass govt API SSL cert issues) ─────

const https = require('https');
const http = require('http');

const httpGet = (url) => new Promise((resolve, reject) => {
  const mod = url.startsWith('https') ? https : http;
  const req = mod.get(url, {
    rejectUnauthorized: false,          // Govt APIs often have self-signed certs
    headers: {
      Accept: 'application/json, text/plain, application/xml;q=0.9, */*;q=0.8',
    },
  }, (res) => {
    let raw = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => { raw += chunk; });
    res.on('end', () => resolve(raw.trim().replace(/^\uFEFF/, '')));
  });
  req.setTimeout(300_000, () => {       // 5 minutes — govt servers are very slow
    req.destroy(new Error(`Timeout after 5 min: ${url}`));
  });
  req.on('error', reject);
});

const fetchGovtItems = async (url) => {
  console.log(`  → GET ${url}`);
  const rawText = await httpGet(url);
  return parseJsonPayload(rawText) ?? parseXmlPayload(rawText) ?? [];
};

// ── Step 1: Collect all data from Govt API ─────────────────────────────────

const collectAllData = async () => {
  // Districts
  console.log('\n[1/3] Fetching Districts from Govt API...');
  const districts = await fetchGovtItems(DISTRICT_API);
  console.log(`      ✅ ${districts.length} districts fetched`);

  // Police Stations (per district, in batches)
  console.log('\n[2/3] Fetching Police Stations from Govt API...');
  const policeStations = [];
  for (let i = 0; i < districts.length; i += PS_BATCH_SIZE) {
    const batch = districts.slice(i, i + PS_BATCH_SIZE);
    const results = await Promise.all(batch.map(async (district) => {
      try {
        const url = `${PS_API}?state=${STATE_CODE}&district=${district.id}`;
        const items = await fetchGovtItems(url);
        console.log(`      District "${district.name}": ${items.length} PS`);
        return items.map(ps => ({ ...ps, districtId: district.id, districtName: district.name }));
      } catch (err) {
        console.warn(`  ⚠️  PS fetch failed for district "${district.name}": ${err.message}`);
        return [];
      }
    }));
    policeStations.push(...results.flat());
  }
  console.log(`      ✅ ${policeStations.length} police stations fetched`);

  // Offices
  console.log('\n[3/3] Fetching Offices from Govt API...');
  const offices = await fetchGovtItems(OFFICE_API);
  console.log(`      ✅ ${offices.length} offices fetched`);

  return { districts, policeStations, offices };
};

// ── Step 2: POST to local backend (which writes to DB) ─────────────────────

const seedViaBackend = async (data) => {
  console.log(`\n[SAVING] POSTing to ${BACKEND_URL}/api/gov/bulk-seed ...`);
  const res = await fetch(`${BACKEND_URL}/api/gov/bulk-seed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JWT_TOKEN}`,
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(`Backend bulk-seed failed (${res.status}): ${json.message}`);
  }
  return json.data;
};

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' PHQ Dashboard — Master Data Seed Script');
  console.log('═══════════════════════════════════════════════════════');
  console.log(` Backend URL  : ${BACKEND_URL}`);
  console.log(` District API : ${DISTRICT_API}`);
  console.log(` PS API       : ${PS_API}`);
  console.log(` Office API   : ${OFFICE_API}`);
  console.log(` State code   : ${STATE_CODE}`);
  console.log('───────────────────────────────────────────────────────');

  const t0 = Date.now();

  // Fetch all data from govt API
  const data = await collectAllData();

  // Save via local backend (handles DB write)
  const result = await seedViaBackend(data);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(` ✅ Seed complete in ${elapsed}s`);
  console.log(` Districts:       ${result.districts}`);
  console.log(` Police Stations: ${result.policeStations}`);
  console.log(` Offices:         ${result.offices}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Seed failed:', err.message);
    process.exit(1);
  });
