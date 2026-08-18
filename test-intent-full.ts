import { PrismaClient } from '@prisma/client';
import { detectIntent } from './src/services/whatsappService';

const prisma = new PrismaClient();

async function run() {
  try {
    const workspace = await prisma.workspace.findFirst();
    if (!workspace) {
      console.log('No workspace');
      return;
    }
    
    // Test 1: How much is Name Change
    console.log("Testing: 'How much is Name Change'");
    const res1 = await detectIntent(workspace, "test-contact-1", "How much is Name Change");
    console.log("Result 1:", res1);
    
    // Test 2: where do i pay
    console.log("Testing: 'where do i pay'");
    const res2 = await detectIntent(workspace, "test-contact-1", "where do i pay");
    console.log("Result 2:", res2);
    
  } catch(err) {
    console.error("Test error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
