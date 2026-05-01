const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  console.log('Clearing CCTNSComplaint table...');
  const deleted = await p.cCTNSComplaint.deleteMany({});
  console.log(`Deleted ${deleted.count} stale CCTNS records`);
  
  console.log('Clearing District table...');
  const deletedDist = await p.district.deleteMany({});
  console.log(`Deleted ${deletedDist.count} district records`);
  
  console.log('Done. Ready for fresh sync.');
}

main().catch(console.error).finally(() => p.$disconnect());
