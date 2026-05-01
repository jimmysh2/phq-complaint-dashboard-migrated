const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting DB cleanup and District refresh...');

  // 1. Get unique districts from CCTNSComplaint
  const uniqueDistricts = await prisma.cCTNSComplaint.findMany({
    select: { district: true },
    distinct: ['district'],
  });

  const districtNames = uniqueDistricts
    .map(d => d.district)
    .filter(Boolean)
    .map(d => d.trim().toUpperCase());

  console.log(`Found ${districtNames.length} unique districts in CCTNS data.`);

  // 2. Truncate District table (and dependent Office table if any)
  // Since Prisma findUnique/create might conflict, we'll just delete all first
  // Note: This might fail if there are foreign key constraints, but currently Office and others are empty or linked to these.
  
  try {
    await prisma.office.deleteMany({});
    await prisma.district.deleteMany({});
    console.log('Existing District and Office records cleared.');
  } catch (err) {
    console.error('Error clearing tables:', err.message);
  }

  // 3. Insert clean districts
  for (const name of districtNames) {
    await prisma.district.create({
      data: { name }
    });
  }
  console.log('District table populated with clean Haryana districts.');

  // 4. Optionally populate Offices from addressPs in CCTNSComplaint
  const uniqueOffices = await prisma.cCTNSComplaint.findMany({
    select: { district: true, addressPs: true },
    distinct: ['district', 'addressPs'],
  });

  console.log(`Found ${uniqueOffices.length} unique Police Stations in CCTNS data.`);

  for (const row of uniqueOffices) {
    if (!row.district || !row.addressPs) continue;
    
    const district = await prisma.district.findUnique({
      where: { name: row.district.trim().toUpperCase() }
    });

    if (district) {
      await prisma.office.create({
        data: {
          name: row.addressPs.trim().toUpperCase(),
          districtId: district.id
        }
      });
    }
  }
  console.log('Office table populated with unique Police Stations.');

  await prisma.$disconnect();
  console.log('Cleanup and refresh complete.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
