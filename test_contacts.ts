import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const workspaces = await prisma.workspace.findMany();
  if (workspaces.length === 0) {
    console.log("No workspaces found");
    return;
  }
  
  const workspaceId = workspaces[0].id;
  console.log("Using workspace:", workspaceId);
  
  try {
    const contacts = await prisma.contact.findMany({
      where: { workspaceId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    
    console.log(`Found ${contacts.length} contacts`);
    
    const getPriorityWeight = (priority: string) => {
      if (priority === 'URGENT') return 3;
      if (priority === 'HIGH') return 2;
      return 1;
    };

    const sortedContacts = contacts.sort((a, b) => {
      const aWeight = getPriorityWeight((a as any).priority || 'STANDARD');
      const bWeight = getPriorityWeight((b as any).priority || 'STANDARD');
      
      if (aWeight !== bWeight) {
        return bWeight - aWeight; 
      }

      const aUnread = a.unreadCount > 0 ? 1 : 0;
      const bUnread = b.unreadCount > 0 ? 1 : 0;

      if (aUnread !== bUnread) {
        return bUnread - aUnread; 
      }

      const aTime = a.messages[0]?.createdAt.getTime() || 0;
      const bTime = b.messages[0]?.createdAt.getTime() || 0;
      return bTime - aTime;
    });
    
    console.log("Sorting succeeded");
    
    for (const c of sortedContacts) {
       console.log(`- ${c.id}: ${c.phoneNumber} (messages: ${c.messages.length})`);
    }
  } catch (e) {
    console.error("Error fetching/sorting contacts:", e);
  }
}

main().finally(() => prisma.$disconnect());
