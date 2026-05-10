import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  console.log('Testing query...');
  try {
    const res = await prisma.complaint.findMany({ select: { districtMasterId: true, statusGroup: true, isDisposedMissingDate: true } });
    console.log('success length:', res.length);
  } catch(e) {
    console.error('error:', e);
  } finally {
    await prisma.$disconnect();
  }
}
test();
