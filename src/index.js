require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');

const { handlePresenceButton, handleTaxOpenModal, handleTaxReview } = require('./handlers/buttonHandler');
const { handleTaxModalSubmit } = require('./handlers/modalHandler');
const { startTaxCron } = require('./handlers/cron');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

client.once('ready', () => {
  console.log(`✅ ${client.user.tag} 로그인 완료`);
  startTaxCron(client);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id.startsWith('presence_')) {
        return handlePresenceButton(interaction);
      }
      if (id === 'tax_open_modal') {
        return handleTaxOpenModal(interaction);
      }
      if (id.startsWith('tax_approve_') || id.startsWith('tax_reject_')) {
        return handleTaxReview(interaction);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'tax_modal') {
        return handleTaxModalSubmit(interaction);
      }
      return;
    }
  } catch (err) {
    console.error('인터랙션 처리 중 오류:', err);
    const errorMsg = { content: '⚠️ 처리 중 오류가 발생했습니다.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(errorMsg).catch(() => {});
    } else {
      await interaction.reply(errorMsg).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
