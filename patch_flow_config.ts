import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const workspace = await prisma.workspace.findFirst();
  if (!workspace) {
    console.log('No workspace found.');
    return;
  }

  const config = workspace.flowConfig as any;
  if (!config) {
    console.log('No flowConfig found.');
    return;
  }

  // 1. Add intents
  const newIntents = [
    {
      "id": "REGISTER_ACCOUNT",
      "category": "Account Management",
      "examples": ["i want to register", "create an account", "sign me up", "i don't have an account", "register me"],
      "routeTo": "register_customer"
    },
    {
      "id": "MY_ACCOUNT",
      "category": "Account Management",
      "examples": ["my account", "profile", "account details", "who am i registered as", "my details"],
      "routeTo": "my_account"
    },
    {
      "id": "MY_ORDERS",
      "category": "Account Management",
      "examples": ["show my orders", "my orders", "what requests do i have", "check my orders"],
      "routeTo": "my_orders"
    },
    {
      "id": "MY_PAYMENTS",
      "category": "Account Management",
      "examples": ["show my payments", "payment history", "my payments"],
      "routeTo": "my_payments"
    },
    {
      "id": "ACCOUNT_RECOVERY",
      "category": "Account Management",
      "examples": ["i forgot my password", "reset my password", "i can't login", "recover account"],
      "routeTo": "account_recovery"
    },
    {
      "id": "LOGIN_ACCOUNT",
      "category": "Account Management",
      "examples": ["login", "log in", "sign in"],
      "routeTo": "login_customer"
    }
  ];

  if (config.chatFlowUpdate && config.chatFlowUpdate.intentRouter && config.chatFlowUpdate.intentRouter.intents) {
    for (const intent of newIntents) {
      if (!config.chatFlowUpdate.intentRouter.intents.find((i: any) => i.id === intent.id)) {
        config.chatFlowUpdate.intentRouter.intents.push(intent);
      }
    }
  }

  // 2. Add Service Routes mapping
  if (config.chatFlowUpdate && config.chatFlowUpdate.serviceRouting && config.chatFlowUpdate.serviceRouting.routes) {
    Object.assign(config.chatFlowUpdate.serviceRouting.routes, {
      "REGISTER_ACCOUNT": "register_customer",
      "MY_ACCOUNT": "my_account",
      "MY_ORDERS": "my_orders",
      "MY_PAYMENTS": "my_payments",
      "ACCOUNT_RECOVERY": "account_recovery",
      "LOGIN_ACCOUNT": "login_customer"
    });
  }

  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { flowConfig: config }
  });

  console.log('Successfully patched Workspace flowConfig with new Account intents!');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
