require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, MessageFlags } = require('discord.js');

const { handlePresenceButton, handleTaxOpenModal, handleTaxApprove, handleTaxRejectOpenModal } = require('./handlers/buttonHandler');
const { handleTaxModalSubmit, handleTaxRejectReasonSubmit } = require('./handlers/modalHandler');
const { startTaxCron } = require('./handlers/cron');
const { initDb } = require('./database');
const { startHealthCheckServer } = require('./healthcheck');

// Render 같은 "웹 서비스" 호스팅은 포트에 바인딩된 프로세스가 있어야 정상으로 인식하고,
// UptimeRobot 등으로 주기적으로 이 서버에 핑을 보내면 무료 플랜이 잠드는 것도 막을 수 있어요.
startHealthCheckServer();

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

// discord.js Client는 EventEmitter라서, 'error' 이벤트에 리스너가 하나도 없으면
// Node.js가 그 오류를 그대로 던져서 프로세스 전체가 죽습니다. 반드시 리스너를 달아둬야 해요.
client.on('error', (err) => {
  console.error('디스코드 클라이언트 오류(무시하고 계속 실행):', err);
});

// 어딘가에서 await 없이 놓친 Promise 거부가 있어도, 봇 전체가 죽지 않고 로그만 남기도록 안전망을 겁니다.
process.on('unhandledRejection', (reason) => {
  console.error('처리되지 않은 Promise 거부(무시하고 계속 실행):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('처리되지 않은 예외(무시하고 계속 실행):', err);
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
        await handlePresenceButton(interaction);
        return;
      }
      if (id === 'tax_open_modal') {
        await handleTaxOpenModal(interaction);
        return;
      }
      if (id.startsWith('tax_approve_')) {
        await handleTaxApprove(interaction);
        return;
      }
      if (id.startsWith('tax_reject_')) {
        await handleTaxRejectOpenModal(interaction);
        return;
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'tax_modal') {
        await handleTaxModalSubmit(interaction);
        return;
      }
      if (interaction.customId.startsWith('tax_reject_reason_')) {
        await handleTaxRejectReasonSubmit(interaction);
        return;
      }
      return;
    }
  } catch (err) {
    console.error('인터랙션 처리 중 오류:', err);
    const errorMsg = { content: '⚠️ 처리 중 오류가 발생했습니다.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(errorMsg).catch(() => {});
    } else {
      await interaction.reply(errorMsg).catch(() => {});
    }
  }
});

(async () => {
  await initDb();
  await client.login(process.env.DISCORD_TOKEN);
})();
