import 'dotenv/config';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getCctnsToken, fetchCctnsComplaints } from './src/services/cctns.js';
import { CctnsComplaintRow, normalizeComplaintRow } from './src/services/cctns-normalize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXPORTS_DIR = join(__dirname, 'exports');

// ─── Configuration ────────────────────────────────────────────────────────
const TIME_FROM = '01/04/2026';
const TIME_TO = '30/04/2026';

// ─── Helper: ensure exports directory exists ──────────────────────────────
async function ensureDir() {
  try {
    await mkdir(EXPORTS_DIR, { recursive: true });
  } catch (error) {
    console.warn('Warning: could not create exports directory:', error);
  }
}

// ─── Complaints CSV ─────────────────────────────────────────────────────────
async function exportComplaints() {
  console.log('\n=== Exporting Complaints (April 2026) ===');
  
  try {
    const token = await getCctnsToken();
    console.log(`✓ Token acquired (expires in ~55 min)`);
    
    const rawRows = (await fetchCctnsComplaints(TIME_FROM, TIME_TO)) as CctnsComplaintRow[];
    console.log(`✓ Fetched ${rawRows.length} raw records from CCTNS API`);
    
    const uniqueRows = Array.from(
      new Map(rawRows.map(r => [r.COMPL_REG_NUM, r])).values()
    );
    console.log(`✓ Deduplicated: ${uniqueRows.length} unique complaints`);
    
    const normalized = uniqueRows
      .map(normalizeComplaintRow)
      .filter((r): r is NonNullable<typeof r> => r !== null);
    console.log(`✓ Normalized: ${normalized.length} valid records`);
    
    // Select columns matching Prisma Complaint model + derived fields
    const columns = [
      'complRegNum', 'complRegDt', 'districtName', 'districtMasterId', 'policeStationMasterId', 'officeMasterId',
      'complDesc', 'complSrno', 'firstName', 'lastName', 'mobile', 'gender', 'age',
      'addressLine1', 'addressLine2', 'addressLine3', 'village', 'tehsil', 'addressDistrict', 'addressPs',
      'receptionMode', 'incidentType', 'incidentPlc', 'incidentFromDt', 'incidentToDt',
      'submitPsCd', 'submitOfficeCd', 'email',
      'statusRaw', 'statusGroup', 'statusOfComplaint', 'disposalDate',
      'classOfIncident', 'complaintSource', 'typeOfComplaint', 'crimeCategory',
      'complainantType', 'complaintPurpose', 'ioDetails', 'respondentCategories',
      'transferDistrictCd', 'transferOfficeCd', 'transferPsCd',
    ];
    
    const header = columns.join(',');
    const rows = normalized.map(row => {
      return columns.map(col => {
        const val = (row as Record<string, unknown>)[col];
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Escape quotes and wrap in quotes if contains comma, newline, or quote
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',');
    });
    
    const csv = [header, ...rows].join('\n');
    await writeFile(join(EXPORTS_DIR, 'complaints-april-2026.csv'), csv, 'utf-8');
    console.log(`✓ Written: complaints-april-2026.csv (${rows.length} data rows)`);
    
    return normalized.length;
  } catch (error) {
    console.error('✗ Failed to export complaints:', error instanceof Error ? error.message : error);
    throw error;
  }
}

// ─── Districts CSV ──────────────────────────────────────────────────────────
async function exportDistricts() {
  console.log('\n=== Exporting Districts ===');
  
  const url = 'https://api.haryanapolice.gov.in/eSaralServices/api/common/district';
  
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    
    const raw = (await res.text()).trim().replace(/^\uFEFF/, '');
    let data: Array<{ ID: unknown; Name: unknown }> = [];
    
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) data = parsed;
      else if (parsed.Result) data = parsed.Result;
      else if (parsed.DropDownDTO) data = parsed.DropDownDTO;
    } catch {
      // Fallback XML parse
      const xml = raw.replace(/<d2p1:/g, '<').replace(/<\/d2p1:/g, '</').replace(/<d3p1:/g, '<').replace(/<\/d3p1:/g, '</');
      const ids = Array.from(xml.matchAll(/<ID>(.*?)<\/ID>/g), m => m[1]);
      const names = Array.from(xml.matchAll(/<Name>(.*?)<\/Name>/g), m => m[1]);
      data = ids.map((id, i) => ({ ID: id, Name: names[i] || '' }));
    }
    
    const districts = data
      .map(item => ({
        id: String(item.ID ?? '').trim(),
        name: String(item.Name ?? '').trim(),
      }))
      .filter(d => d.id && d.name);
    
    const csvRows = [
      'id,name',
      ...districts.map(d => `${d.id},"${d.name.replace(/"/g, '""')}"`),
    ];
    
    await writeFile(join(EXPORTS_DIR, 'districts.csv'), csvRows.join('\n'), 'utf-8');
    console.log(`✓ Written: districts.csv (${districts.length} districts)`);
    
    return districts;
  } catch (error) {
    console.error('✗ Failed to export districts:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ─── Police Stations CSV ─────────────────────────────────────────────────────
async function exportPoliceStations(districts: Array<{ id: string; name: string }>) {
  console.log('\n=== Exporting Police Stations ===');
  
  const allStations: Array<{ id: string; districtId: string; districtName: string; name: string }> = [];
  const stateCode = '13';
  
  for (const district of districts) {
    try {
      const url = `https://api.haryanapolice.gov.in/eSaralServices/api/common/GetPSByDistrict?state=${stateCode}&district=${district.id}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      
      if (!res.ok) {
        console.warn(`  District ${district.name} (${district.id}): HTTP ${res.status} — skipping`);
        continue;
      }
      
      const raw = (await res.text()).trim().replace(/^\uFEFF/, '');
      let data: Array<{ ID: unknown; Name: unknown }> = [];
      
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) data = parsed;
        else if (parsed.Result) data = parsed.Result;
        else if (parsed.DropDownDTO) data = parsed.DropDownDTO;
      } catch {
        const xml = raw.replace(/<d2p1:/g, '<').replace(/<\/d2p1:/g, '</').replace(/<d3p1:/g, '<').replace(/<\/d3p1:/g, '</');
        const ids = Array.from(xml.matchAll(/<ID>(.*?)<\/ID>/g), m => m[1]);
        const names = Array.from(xml.matchAll(/<Name>(.*?)<\/Name>/g), m => m[1]);
        data = ids.map((id, i) => ({ ID: id, Name: names[i] || '' }));
      }
      
      const stations = data
        .map(item => ({
          id: String(item.ID ?? '').trim(),
          name: String(item.Name ?? '').trim(),
        }))
        .filter(s => s.id && s.name)
        .map(s => ({ ...s, districtId: district.id, districtName: district.name }));
      
      allStations.push(...stations);
      console.log(`  ✓ ${district.name}: ${stations.length} police stations`);
    } catch (error) {
      console.warn(`  ✗ District ${district.name} failed: ${error instanceof Error ? error.message : error}`);
    }
  }
  
  const csvRows = [
    'id,districtId,districtName,name',
    ...allStations.map(s => 
      `${s.id},"${s.districtId}","${s.districtName.replace(/"/g, '""')}","${s.name.replace(/"/g, '""')}"`
    ),
  ];
  
  await writeFile(join(EXPORTS_DIR, 'police-stations.csv'), csvRows.join('\n'), 'utf-8');
  console.log(`✓ Written: police-stations.csv (${allStations.length} total stations)`);
}

// ─── Offices CSV ────────────────────────────────────────────────────────────
async function exportOffices() {
  console.log('\n=== Exporting Offices ===');
  
  const url = 'https://api.haryanapolice.gov.in/eSaralServices/api/common/GetAllOffices';
  
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    
    const raw = (await res.text()).trim().replace(/^\uFEFF/, '');
    let data: Array<{ ID: unknown; Name: unknown }> = [];
    
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) data = parsed;
      else if (parsed.Result) data = parsed.Result;
      else if (parsed.DropDownDTO) data = parsed.DropDownDTO;
    } catch {
      const xml = raw.replace(/<d2p1:/g, '<').replace(/<\/d2p1:/g, '</').replace(/<d3p1:/g, '<').replace(/<\/d3p1:/g, '</');
      const ids = Array.from(xml.matchAll(/<ID>(.*?)<\/ID>/g), m => m[1]);
      const names = Array.from(xml.matchAll(/<Name>(.*?)<\/Name>/g), m => m[1]);
      data = ids.map((id, i) => ({ ID: id, Name: names[i] || '' }));
    }
    
    const offices = data
      .map(item => ({
        id: String(item.ID ?? '').trim(),
        name: String(item.Name ?? '').trim(),
      }))
      .filter(o => o.id && o.name);
    
    const csvRows = [
      'id,name',
      ...offices.map(o => `${o.id},"${o.name.replace(/"/g, '""')}"`),
    ];
    
    await writeFile(join(EXPORTS_DIR, 'offices.csv'), csvRows.join('\n'), 'utf-8');
    console.log(`✓ Written: offices.csv (${offices.length} offices)`);
  } catch (error) {
    console.error('✗ Failed to export offices:', error instanceof Error ? error.message : error);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('CCTNS DATA EXPORT — April 2026');
  console.log('='.repeat(60));
  console.log(`Date range: ${TIME_FROM} to ${TIME_TO}`);
  
  try {
    await ensureDir();
    
    // Export order: districts first (needed for police stations), offices last
    const districts = await exportDistricts();
    await exportOffices();
    await exportPoliceStations(districts);
    const complaintCount = await exportComplaints();
    
    console.log('\n' + '='.repeat(60));
    console.log('EXPORT COMPLETE');
    console.log('='.repeat(60));
    console.log(`CSV files saved to: ${EXPORTS_DIR}/`);
    console.log(`  - complaints-april-2026.csv  (${complaintCount} records)`);
    console.log(`  - districts.csv              (${districts.length} records)`);
    console.log(`  - police-stations.csv        (see above)`);
    console.log(`  - offices.csv                (see above)`);
    console.log();
  } catch (error) {
    console.error('\n✗ Export failed:', error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
