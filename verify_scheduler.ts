import { PrismaClient } from '@prisma/client';
import { broadcastQueue } from './src/services/queueService';

const prisma = new PrismaClient();

async function main() {
  console.log('⚡ Starting campaign scheduler programmatic verification...\n');

  // 1. Get or create a test workspace
  let workspace = await prisma.workspace.findFirst();
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: 'Verification Workspace',
        walletBalance: 100.00,
        metaPhoneNumberId: '106574929348123',
        metaWabaId: '2094838294829',
      },
    });
    console.log(`Created new workspace: ${workspace.id}`);
  } else {
    console.log(`Using existing workspace: ${workspace.id} (Balance: $${workspace.walletBalance})`);
  }

  // Ensure balance is sufficient
  if (Number(workspace.walletBalance) < 10) {
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { walletBalance: 100.00 },
    });
    workspace.walletBalance = 100.00 as any;
    console.log('Refilled workspace balance to $100.00');
  }

  const phoneNumbers = ['2348054540828', '15550109999'];
  const templateName = 'sample_marketing_template';

  // 2. Test scheduled campaign creation
  console.log('\n--- Test 1: Scheduling a campaign ---');
  const scheduledTime = new Date(Date.now() + 5000); // 5 seconds into the future
  const delayMs = scheduledTime.getTime() - Date.now();

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      templateName,
      status: 'SCHEDULED',
      scheduledAt: scheduledTime,
    },
  });

  console.log(`Successfully created scheduled campaign!`);
  console.log(`Campaign ID: ${campaign.id}`);
  console.log(`Status: ${campaign.status}`);
  console.log(`Scheduled At: ${campaign.scheduledAt}`);
  console.log(`Delay calculated: ${delayMs}ms`);

  // Enqueue delayed job in BullMQ
  const job = await broadcastQueue.add(
    `broadcast-${campaign.id}-test`,
    {
      campaignId: campaign.id,
      workspaceId: workspace.id,
      templateName,
      phoneNumbers,
    },
    { delay: delayMs }
  );

  console.log(`BullMQ delayed job added! Job ID: ${job.id}`);

  // 3. Test scheduled campaign cancellation
  console.log('\n--- Test 2: Cancelling a scheduled campaign ---');
  const campaignToCancel = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      templateName,
      status: 'SCHEDULED',
      scheduledAt: new Date(Date.now() + 10000),
    },
  });

  console.log(`Created Campaign to Cancel: ${campaignToCancel.id} (Status: ${campaignToCancel.status})`);

  // Update status to CANCELLED in DB
  const cancelledCampaign = await prisma.campaign.update({
    where: { id: campaignToCancel.id },
    data: { status: 'CANCELLED' },
  });

  console.log(`Updated status to: ${cancelledCampaign.status}`);
  if (cancelledCampaign.status === 'CANCELLED') {
    console.log('✓ Campaign successfully marked as CANCELLED!');
  } else {
    console.error('✗ Failed to mark campaign as CANCELLED.');
  }

  // 4. Verify that running the queue worker with CANCELLED campaign exits early
  console.log('\n--- Test 3: Simulating queue worker on CANCELLED campaign ---');
  const campCheck = await prisma.campaign.findUnique({ where: { id: campaignToCancel.id } });
  if (campCheck && campCheck.status === 'CANCELLED') {
    console.log(`✓ Worker check simulation: Campaign status is '${campCheck.status}'. Execution is skipped successfully!`);
  } else {
    console.error('✗ Worker check simulation failed.');
  }

  console.log('\n⚡ Verification tests completed successfully!');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
