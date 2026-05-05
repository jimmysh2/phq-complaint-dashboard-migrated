#!/usr/bin/env node
/**
 * seed-master-data.js
 * ────────────────────────────────────────────────────────────────────────────
 * One-time script to populate District, PoliceStation, and Office tables
 * from the Haryana Police Government API.
 *
 * Run once on any new database:
 *   node scripts/seed-master-data.js
 *
 * Or with custom env:
 *   DATABASE_URL=postgresql://... node scripts/seed-master-data.js
 *
 * Safe to re-run — uses upsert (idempotent).
 * ────────────────────────────────────────────────────────────────────────────
 */

// Load .env from the backend root
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── API Endpoints ──────────────────────────────────────────────────────────
const BASE    = process.env.HARYANA_POLICE_API_BASE     || 'https://api.haryanapolice.gov.in/eSaralServices/api/common';
const DISTRICT_API  = process.env.HARYANA_DISTRICT_API        || `${BASE}/district`;
const PS_API        = process.env.HARYANA_POLICE_STATION_API  || `${BASE}/GetPSByDistrict`;
const OFFICE_API    = process.env.HARYANA_OFFICE_API          || `${BASE}/GetAllOffice`;
const STATE_CODE    = process.env.HARYANA_STATE_CODE          || '13';

const TIMEOUT_MS    = 120_000; // 2 minutes per request
const PS_BATCH_SIZE = 3;       // concurrent district PS fetches

// ── Helpers ────────────────────────────────────────────────────────────────

const toId = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  try { return BigInt(raw); } catch { return null; }
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
    const id   = toId(row.ID ?? row.Id ?? row.id);
    const name = String(row.Name ?? row.NAME ?? row.name ?? '').trim();
    if (id && name) items.push({ id, name });
  }
  return items;
};

const parseXmlPayload = (rawText) => {
  const xml  = rawText.replace(/<d2p1:/g, '<').replace(/<\/d2p1:/g, '</').replace(/<d3p1:/g, '<').replace(/<\/d3p1:/g, '</');
  const ids  = Array.from(xml.matchAll(/<ID>(.*?)<\/ID>/g),   (m) => m[1]);
  const names = Array.from(xml.matchAll(/<Name>(.*?)<\/Name>/g), (m) => m[1]);
  const items = [];
  for (let i = 0; i < ids.length; i++) {
    const id   = toId(ids[i]);
    const name = (names[i] || '').trim();
    if (id && name) items.push({ id, name });
  }
  return items;
};

const fetchItems = async (url) => {
  console.log(`  → GET ${url}`);
  const res = await fetch(url, {
    headers: { Accept: 'application/json, text/plain, application/xml;q=0.9, */*;q=0.8' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const rawText = (await res.text()).trim().replace(/^\uFEFF/, '');
  return parseJsonPayload(rawText) ?? parseXmlPayload(rawText) ?? [];
};

// ── Step 1: Seed Districts ─────────────────────────────────────────────────

const seedDistricts = async () => {
  console.log('\n[1/3] Seeding Districts...');
  const items = await fetchItems(DISTRICT_API);
  if (items.length === 0) throw new Error('No districts returned from API');

  let count = 0;
  for (const d of items) {
    await prisma.district.upsert({
      where:  { id: d.id },
      update: { name: d.name },
      create: { id: d.id, name: d.name },
    });
    count++;
  }
  console.log(`  ✅ ${count} districts upserted`);
  return items;
};

// ── Step 2: Seed Police Stations (per district) ────────────────────────────

const seedPoliceStations = async (districts) => {
  console.log('\n[2/3] Seeding Police Stations...');
  let total = 0;

  for (let i = 0; i < districts.length; i += PS_BATCH_SIZE) {
    const batch = districts.slice(i, i + PS_BATCH_SIZE);
    await Promise.all(batch.map(async (district) => {
      try {
        const url   = `${PS_API}?state=${STATE_CODE}&district=${district.id.toString()}`;
        const items = await fetchItems(url);
        for (const ps of items) {
          await prisma.policeStation.upsert({
            where:  { id: ps.id },
            update: { name: ps.name, districtId: district.id, districtName: district.name },
            create: { id: ps.id, name: ps.name, districtId: district.id, districtName: district.name },
          });
        }
        console.log(`     District "${district.name}": ${items.length} PS`);
        total += items.length;
      } catch (err) {
        console.warn(`  ⚠️  Failed for district "${district.name}": ${err.message}`);
      }
    }));
  }

  console.log(`  ✅ ${total} police stations upserted`);
};

// ── Step 3: Seed Offices ───────────────────────────────────────────────────

const seedOffices = async () => {
  console.log('\n[3/3] Seeding Offices...');
  const items = await fetchItems(OFFICE_API);

  let count = 0;
  for (const office of items) {
    await prisma.office.upsert({
      where:  { id: office.id },
      update: { name: office.name },
      create: { id: office.id, name: office.name },
    });
    count++;
  }
  console.log(`  ✅ ${count} offices upserted`);
};

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' PHQ Dashboard — Master Data Seed Script');
  console.log('═══════════════════════════════════════════════════════');
  console.log(` District API : ${DISTRICT_API}`);
  console.log(` PS API       : ${PS_API}`);
  console.log(` Office API   : ${OFFICE_API}`);
  console.log(` State code   : ${STATE_CODE}`);
  console.log('───────────────────────────────────────────────────────\n');

  const t0 = Date.now();

  const districts = await seedDistricts();
  await seedPoliceStations(districts);
  await seedOffices();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(` ✅ Seed complete in ${elapsed}s`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Seed failed:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
