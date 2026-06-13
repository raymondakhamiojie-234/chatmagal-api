import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Fetching all workspaces to scan for name duplicates...');
  const workspaces = await prisma.workspace.findMany();
  
  const nameCounts: Record<string, number> = {};
  let updatedCount = 0;

  for (const workspace of workspaces) {
    const name = (workspace.name || '').trim();
    if (!name) {
      // Empty names are also duplicates! Rename to "Unnamed Workspace <ID>"
      const newName = `Unnamed Workspace ${workspace.id.slice(0, 8)}`;
      console.log(`⚠️ Workspace ID ${workspace.id} has empty name. Renaming to: "${newName}"`);
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { name: newName }
      });
      nameCounts[newName] = 1;
      updatedCount++;
      continue;
    }

    if (nameCounts[name]) {
      nameCounts[name]++;
      const newName = `${name} (${nameCounts[name]})`;
      console.log(`⚠️ Duplicate name found: "${name}". Renaming workspace ID ${workspace.id} to: "${newName}"`);
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { name: newName }
      });
      updatedCount++;
    } else {
      nameCounts[name] = 1;
    }
  }

  console.log(`✅ Finished scanning. Renamed ${updatedCount} duplicate workspaces.`);
}

main()
  .catch((e) => {
    console.error('❌ Error running deduplication script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
