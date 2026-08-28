const { db, getGuildSettings } = require('../database');
const { buildTaxRequestEmbed, currentPeriod } = require('./embeds');
const { taxReviewButtons } = require('./components');

async function handleTaxModalSubmit(interaction) {
  const guildId = interaction.guildId;
  const settings = getGuildSettings(guildId);

  if (!settings.tax_channel_id) {
    return interaction.reply({ content: '⚠️ 세금 채널이 아직 설정되지 않았습니다. 관리자에게 문의해주세요.', ephemeral: true });
  }

  const channel = await interaction.guild.channels.fetch(settings.tax_channel_id).catch(() => null);
  if (!channel) {
    return interaction.reply({ content: '⚠️ 세금 채널을 찾을 수 없습니다. 관리자에게 문의해주세요.', ephemeral: true });
  }

  const mcNick = interaction.fields.getTextInputValue('mc_nick');
  const files = interaction.fields.getUploadedFiles('screenshot');
  const screenshot = files && files.first ? files.first() : (files && files[0]);

  if (!screenshot) {
    return interaction.reply({ content: '⚠️ 스크린샷 업로드에 실패했습니다. 다시 시도해주세요.', ephemeral: true });
  }

  const amount = settings.tax_amount;
  const period = currentPeriod();

  const result = db.prepare(`
    INSERT INTO tax_payments (guild_id, mc_nick, discord_id, amount, status, period)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(guildId, mcNick, interaction.user.id, amount, period);

  const paymentId = result.lastInsertRowid;

  const embed = buildTaxRequestEmbed({
    mcNick,
    discordId: interaction.user.id,
    amount,
    status: 'pending',
    period,
  });

  const msg = await channel.send({
    embeds: [embed],
    components: taxReviewButtons(paymentId),
    files: [{ attachment: screenshot.url, name: screenshot.name || 'screenshot.png' }],
  });

  db.prepare('UPDATE tax_payments SET message_id = ? WHERE id = ?').run(msg.id, paymentId);

  return interaction.reply({ content: `✅ 세금 인증 요청이 접수되었습니다. (\`${mcNick}\`, ${amount.toLocaleString()}만원)`, ephemeral: true });
}

module.exports = { handleTaxModalSubmit };
