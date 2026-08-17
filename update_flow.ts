import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  try {
    const configPath = path.join(__dirname, 'final_chatbot_config.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    const flowConfig = JSON.parse(configData);

    // Get the first workspace (usually there's only one in this setup)
    const workspace = await prisma.workspace.findFirst();
    if (!workspace) {
      console.log('No workspace found in the database.');
      return;
    }

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { flowConfig: flowConfig }
    });

    console.log(`Successfully updated flowConfig for workspace: ${workspace.name} (${workspace.id})`);
  } catch (err) {
    console.error('Error updating flowConfig:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
