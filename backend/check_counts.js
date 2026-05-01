const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const complaint = await p.complaint.count();
  const cctns = await p.cCTNSComplaint.count();
  const district = await p.district.count();
  console.log('Complaint:', complaint);
  console.log('CCTNS:', cctns);
  console.log('District:', district);
}

main().catch(console.error).finally(() => p.$disconnect());
