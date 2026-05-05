/**
 * masterSync.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the master data sync lifecycle:
 *
 *   1. Sync Districts from Haryana govt API (upsert — always fast)
 *   2. Sync Police Stations for any districts that are missing PS in DB
 *   3. Sync Offices from Haryana govt API (upsert — always fast)
 *   4. Remap all Complaint master IDs (districtMasterId / policeStationMasterId /
 *      officeMasterId) using the freshest lookup tables.
 *
 * This is called automatically:
 *   - On server startup          (30s after boot to let DB wake up)
 *   - After every CCTNS sync job (background + manual)
 *
 * No user action required.
 */

import { prisma } from '../config/database.js';
import { syncDistricts, syncOffices, syncPoliceStationsByDistrict } from '../routes/government.js';
import { remapComplaintMasterIds } from './master-mapping.js';

let isRunning = false;

export interface MasterSyncStats {
  districtsUpserted: number;
  psDistrictsSynced: number;
  officesUpserted: number;
  remapped: number;
  unmapped: number;
  total: number;
  skipped: boolean;        // true when another run is already in progress
  durationMs: number;
}

/**
 * runMasterSync()
 *
 * Idempotent — safe to call multiple times concurrently (guarded by `isRunning`).
 * All errors are caught and logged; the function never throws.
 */
export const runMasterSync = async (label = 'master-sync'): Promise<MasterSyncStats> => {
  const blank: MasterSyncStats = {
    districtsUpserted: 0, psDistrictsSynced: 0, officesUpserted: 0,
    remapped: 0, unmapped: 0, total: 0, skipped: false, durationMs: 0,
  };

  if (isRunning) {
    console.log(`[${label}] Already running — skipping duplicate call`);
    return { ...blank, skipped: true };
  }

  isRunning = true;
  const start = Date.now();
  console.log(`[${label}] Starting master sync...`);

  try {
    // ── 1. Districts ──────────────────────────────────────────────────────────
    let districts: { id: bigint; name: string }[] = [];
    try {
      districts = await syncDistricts();
      console.log(`[${label}] Districts synced: ${districts.length}`);
      blank.districtsUpserted = districts.length;
    } catch (e: any) {
      console.error(`[${label}] District sync failed (non-fatal):`, e.message);
      // Fall back to what's already in DB
      districts = await prisma.district.findMany({ select: { id: true, name: true } });
    }

    // ── 2. Police Stations (only districts missing from DB) ───────────────────
    try {
      const existingDistrictIds = new Set(
        (
          await prisma.policeStation.findMany({
            select: { districtId: true },
            distinct: ['districtId'],
          })
        )
          .map((r) => r.districtId?.toString())
          .filter(Boolean) as string[]
      );

      const missingDistricts = districts.filter(
        (d) => !existingDistrictIds.has(d.id.toString())
      );

      if (missingDistricts.length > 0) {
        console.log(
          `[${label}] Syncing PS for ${missingDistricts.length} district(s) missing from DB: ` +
            missingDistricts.map((d) => d.name).join(', ')
        );
        for (let i = 0; i < missingDistricts.length; i += 5) {
          await Promise.all(
            missingDistricts.slice(i, i + 5).map((d) =>
              syncPoliceStationsByDistrict(d.id).catch((e: any) =>
                console.error(`[${label}] PS sync failed for ${d.name}:`, e.message)
              )
            )
          );
        }
        blank.psDistrictsSynced = missingDistricts.length;
      } else {
        console.log(`[${label}] All districts already have PS — skipping PS sync`);
      }
    } catch (e: any) {
      console.error(`[${label}] PS sync step failed (non-fatal):`, e.message);
    }

    // ── 3. Offices ────────────────────────────────────────────────────────────
    try {
      const offices = await syncOffices();
      blank.officesUpserted = offices.length;
      console.log(`[${label}] Offices synced: ${offices.length}`);
    } catch (e: any) {
      console.error(`[${label}] Office sync failed (non-fatal):`, e.message);
    }

    // ── 4. Remap complaint master IDs ─────────────────────────────────────────
    try {
      const stats = await remapComplaintMasterIds();
      blank.remapped  = stats.mapped;
      blank.unmapped  = stats.unmapped;
      blank.total     = stats.total;
      console.log(`[${label}] Remap complete — mapped: ${stats.mapped}, unmapped: ${stats.unmapped}`);
    } catch (e: any) {
      console.error(`[${label}] Remap failed (non-fatal):`, e.message);
    }

  } finally {
    isRunning = false;
    blank.durationMs = Date.now() - start;
    console.log(`[${label}] Done in ${blank.durationMs}ms`, blank);
  }

  return blank;
};

/**
 * scheduleStartupMasterSync()
 *
 * Called once on server start. Waits 30 seconds (lets DB wake from Neon idle),
 * then checks whether any complaints are missing master IDs. If yes, runs a
 * full sync. This is the "zero user action" path.
 */
export const scheduleStartupMasterSync = () => {
  const DELAY_MS = 30_000; // 30 seconds — Neon DB needs time to wake up
  console.log(`[startup-sync] Scheduled master sync will run in ${DELAY_MS / 1000}s...`);

  setTimeout(async () => {
    try {
      // Quick check: are there ANY complaints with unresolved district IDs?
      const unresolved = await prisma.complaint.count({
        where: { districtMasterId: null },
      });

      if (unresolved > 0) {
        console.log(
          `[startup-sync] Found ${unresolved} complaint(s) with null districtMasterId — triggering master sync`
        );
        await runMasterSync('startup-sync');
      } else {
        // Even if complaints look fine, ensure PS tables are populated
        const psCount = await prisma.policeStation.count();
        const districtCount = await prisma.district.count();

        if (districtCount > 0 && psCount === 0) {
          console.log(`[startup-sync] District table populated but no PS found — triggering master sync`);
          await runMasterSync('startup-sync-ps-missing');
        } else {
          console.log(`[startup-sync] All master IDs look good — skipping full sync`);
        }
      }
    } catch (e: any) {
      console.error(`[startup-sync] Bootstrap check failed:`, e.message);
    }
  }, DELAY_MS);
};
