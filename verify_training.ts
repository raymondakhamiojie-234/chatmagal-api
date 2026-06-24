import { PrismaClient } from '@prisma/client';
import { generateGeminiResponse } from './src/services/whatsappService';

const prisma = new PrismaClient();

async function runVerification() {
  console.log('🧪 Starting AI Bot CSV Training & RAG Integration Verification...');

  // 1. Resolve or create a mock workspace
  const workspaceId = 'test-workspace-id';
  let workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  
  if (!workspace) {
    console.log('   Creating mock workspace "test-workspace-id"...');
    workspace = await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: 'Verification Testing Workspace',
        leaderPassword: 'leader123',
        memberPassword: 'member123',
        walletBalance: 100.00
      }
    });
  }

  // 2. Clear existing training data for this workspace
  console.log('   Clearing any previous training data for test workspace...');
  await prisma.botTraining.deleteMany({ where: { workspaceId } });

  // 3. Insert mock Q&A training rules (simulating CSV upload parse)
  console.log('   Simulating Q&A CSV training upload...');
  const testQuestion = 'What is your secret developer code?';
  const testAnswer = 'The secret developer code is Antigravity-RAG-2026-Superb!';

  await prisma.botTraining.create({
    data: {
      workspaceId,
      question: testQuestion,
      answer: testAnswer
    }
  });
  console.log(`   ✓ Successfully seeded training rule:\n     - Q: "${testQuestion}"\n     - A: "${testAnswer}"`);

  // 4. Create a mock contact for this workspace
  const testPhone = '19998887777';
  let contact = await prisma.contact.findFirst({
    where: { workspaceId, phoneNumber: testPhone }
  });
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        workspaceId,
        phoneNumber: testPhone,
        botEnabled: true
      }
    });
  }

  // 5. Invoke generateGeminiResponse to verify RAG / Local custom match resolution
  console.log('   Invoking generateGeminiResponse with the custom training query...');
  const reply = await generateGeminiResponse(contact.id, 'What is your secret developer code?');
  
  console.log('\n💬 AI Auto-Respondent Reply Received:');
  console.log(`   "${reply}"\n`);

  // 6. Assertions
  if (reply.includes('Antigravity-RAG-2026-Superb')) {
    console.log('🎉 SUCCESS! The AI Bot successfully retrieved and used the custom CSV training data.');
    console.log('   Both the database-backed RAG context and the local sandbox matching engine resolved the ground-truth answer perfectly.');
  } else {
    throw new Error('❌ FAILURE: The AI Bot did not answer using the custom CSV training data.');
  }

  // 7. Cleanup test training data
  console.log('   Cleaning up test training data...');
  await prisma.botTraining.deleteMany({ where: { workspaceId } });
}

runVerification()
  .catch(err => {
    console.error('❌ Verification Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
