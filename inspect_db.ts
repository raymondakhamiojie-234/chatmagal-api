import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- WORKSPACES ---');
  const workspaces = await prisma.workspace.findMany();
  console.log(JSON.stringify(workspaces, null, 2));

  console.log('--- RECENT TRANSACTIONS ---');
  const transactions = await prisma.transaction.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
  console.log(JSON.stringify(transactions, null, 2));
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
