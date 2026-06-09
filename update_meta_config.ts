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
  let workspace = await prisma.workspace.findFirst();

  if (!workspace) {
    console.log('⚠️ No workspace found in database. Seeding default "test-workspace-id" workspace...');
    workspace = await prisma.workspace.create({
      data: {
        id: 'test-workspace-id',
        name: 'Chatmagal Demo Workspace',
        walletBalance: 100.00,
        metaPhoneNumberId: phoneNumberId.trim(),
        metaWabaId: wabaId.trim(),
        transactions: {
          create: {
            type: 'REFILL',
            amount: 100.00,
            description: 'Welcome Sign Up Bonus Credits!'
          }
        },
        contacts: {
          create: {
            phoneNumber: '15550109999',
            botEnabled: true,
            sentiment: 'NEUTRAL',
            priority: 'STANDARD',
            messages: {
              create: {
                direction: 'INBOUND',
                lane: 'SUPPORT',
                content: {
                  messaging_product: 'whatsapp',
                  type: 'text',
                  text: {
                    body: 'Hello! Welcome to your new Chatmagal workspace. Try typing a reply below!'
                  }
                },
                status: 'READ'
              }
            }
          }
        }
      }
    });
    console.log('✅ Success! Default Workspace ID "test-workspace-id" has been seeded and updated with Meta credentials.');
    return;
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
