const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const complaints = await prisma.complaint.findMany({
    where: { 
      districtName: { contains: 'AMBALA', mode: 'insensitive' },
      policeStationName: { contains: 'AMBALA CANTT', mode: 'insensitive' }
    },
    select: { id: true, districtName: true, policeStationName: true, officeName: true, officeMasterId: true },
    take: 5
  });
  console.log('Result:', complaints);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
