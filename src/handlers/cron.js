const cron = require('node-cron');
const { db } = require('../database');
const { buildUnpaidListEmbed } = require('./embeds');

function startTaxCron(client) {
  // 매일 00:00 (Asia/Seoul 기준)
  cron.schedule('0 0 * * *', async () => {
    const guilds = await db.prepare('SELECT guild_id, tax_channel_id FROM guild_settings WHERE tax_channel_id IS NOT NULL').all();

    for (const g of guilds) {
      try {
        const channel = await client.channels.fetch(g.tax_channel_id).catch(() => null);
        if (!channel) continue;
        const embed = await buildUnpaidListEmbed(g.guild_id);
        await channel.send({ embeds: [embed] });
      } catch (e) {
        console.error(`[cron] 길드 ${g.guild_id} 미납자 목록 게시 실패:`, e);
      }
    }
  }, { timezone: 'Asia/Seoul' });

  console.log('⏰ 세금미납자 자동 게시 스케줄러 시작 (매일 00:00 KST)');
}

module.exports = { startTaxCron };
