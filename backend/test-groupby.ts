import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  console.log('Testing groupBy...');
  const start = Date.now();
  try {
    const res = await prisma.complaint.groupBy({
      by: ['districtMasterId', 'statusGroup', 'isDisposedMissingDate'],
      _count: { _all: true }
    });
    console.log('success length:', res.length, 'time:', Date.now() - start, 'ms');
  } catch(e) {
    console.error('error:', e);
  } finally {
    await prisma.$disconnect();
  }
}
test();
