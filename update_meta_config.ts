import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const phoneNumberId = process.argv[2];
const wabaId = process.argv[3];

async function main() {
  if (!phoneNumberId || !wabaId) {
    console.error('❌ Error: Please provide both the Phone Number ID and WABA ID.');
    console.error('Usage: npx ts-node update_meta_config.ts <phone_number_id> <waba_id>');
    process.exit(1);
  }

  // Get the first workspace (usually test-workspace-id or your custom workspace)
  const workspace = await prisma.workspace.findFirst();

  if (!workspace) {
    console.error('❌ Error: No workspace found in database.');
    process.exit(1);
  }

  const updated = await prisma.workspace.update({
    where: { id: workspace.id },
    data: {
      metaPhoneNumberId: phoneNumberId.trim(),
      metaWabaId: wabaId.trim()
    }
  });

  console.log('✅ Success! Workspace Meta configurations updated successfully:');
  console.log(`- Workspace ID: ${updated.id}`);
  console.log(`- Business Name: ${updated.name}`);
  console.log(`- New Phone Number ID: ${updated.metaPhoneNumberId}`);
  console.log(`- New WABA ID: ${updated.metaWabaId}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
