import { PrismaClient, Prisma } from '@prisma/client';
import { triggerAutoResponse } from './src/services/whatsappService';

const prisma = new PrismaClient();

async function simulate() {
  const workspaceId = "7a40bce3-503a-4467-bc18-28956973e20e";
  const contactPhone = "9998887776";
  const contactId = "36021f1d-720a-493e-afbd-22ccad3d9c75";

  // Check if contact exists, otherwise create it
  let contact = await prisma.contact.findFirst({ where: { phoneNumber: contactPhone } });
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        workspaceId,
        phoneNumber: contactPhone,
        name: "Test User",
        accountStatus: "GUEST"
      }
    });
    console.log("Created test contact:", contact.id);
  } else {
    // Reset state
    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        formState: null,
        formData: Prisma.DbNull,
        suspendedFlowData: Prisma.DbNull,
        accountStatus: 'GUEST',
        emailVerified: false,
        customerId: null,
        email: null,
        name: "Test User"
      }
    });
    console.log("Reset test contact:", contact.id);
  }

  const simulateMessage = async (msg: string) => {
    console.log(`\n==========================================`);
    console.log(`👤 User: ${msg}`);
    await triggerAutoResponse(workspaceId, contact.id, contactPhone, msg);
    
    // Check latest message sent to user
    const lastMsg = await prisma.message.findFirst({
      where: { contactId: contact.id, direction: 'OUTBOUND' },
      orderBy: { createdAt: 'desc' }
    });
    console.log(`🤖 Bot: ${lastMsg?.content ? (lastMsg.content as any).body : 'No response'}`);
  };

  await simulateMessage("i want followers");
  await simulateMessage("facebook");
  await simulateMessage("1000");
  await simulateMessage("global");
  
  // This should trigger the register_customer interceptor!
  
  // Provide Name
  await simulateMessage("Alice Wonderland");
  
  // Provide Email
  await simulateMessage("alice@example.com");

  // At this point, DB should have a setup link and a verification code
  const updatedContact = await prisma.contact.findUnique({ where: { id: contact.id }});
  console.log("\n--- DB STATE AFTER EMAIL ---");
  console.log("Reset Token:", updatedContact?.resetToken);
  
  // SIMULATE WEB APP CREATING PASSWORD
  console.log("\n--- SIMULATING WEB APP /api/account/setup ---");
  const code = "123456";
  await prisma.contact.update({
    where: { id: contact.id },
    data: {
      passwordHash: "dummyhash",
      verificationCode: code,
      verificationExpiry: new Date(Date.now() + 15 * 60000)
    }
  });

  // Supply Verification Code
  await simulateMessage(code);

  // Check if Order was saved
  const orders = await prisma.order.findMany({ where: { contactId: contact.id }});
  console.log("\n--- FINAL ORDERS ---");
  console.log(orders);
}

simulate()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
