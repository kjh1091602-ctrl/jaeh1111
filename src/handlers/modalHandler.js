const { MessageFlags } = require('discord.js');
const { db, getGuildSettings } = require('../database');
const { buildTaxRequestEmbed, currentPeriod, refreshTaxInfoBanner } = require('./embeds');
const { taxReviewButtons } = require('./components');

async function handleTaxModalSubmit(interaction) {
  // 스크린샷 전송 등 처리에 3초 넘게 걸릴 수 있으므로, 먼저 "생각 중..." 상태로 즉시 응답부터 확보합니다.
  // 이걸 안 하면 처리가 조금만 늦어져도 디스코드가 상호작용을 만료시켜 DiscordAPIError[10062]가 나고,
  // 그 오류를 놓치면 봇 프로세스 전체가 죽는 원인이 됩니다.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guildId = interaction.guildId;
  const settings = await getGuildSettings(guildId);

  if (!settings.tax_channel_id) {
    return interaction.editReply({ content: '⚠️ 세금 채널이 아직 설정되지 않았습니다. 관리자에게 문의해주세요.' });
  }

  const channel = await interaction.guild.channels.fetch(settings.tax_channel_id).catch(() => null);
  if (!channel) {
    return interaction.editReply({ content: '⚠️ 세금 채널을 찾을 수 없습니다. 관리자에게 문의해주세요.' });
  }

  const mcNick = interaction.fields.getTextInputValue('mc_nick');
  const files = interaction.fields.getUploadedFiles('screenshot');
  const screenshot = files && files.first ? files.first() : (files && files[0]);

  if (!screenshot) {
    return interaction.editReply({ content: '⚠️ 스크린샷 업로드에 실패했습니다. 다시 시도해주세요.' });
  }

  const amount = settings.tax_amount;
  const period = currentPeriod();

  const result = await db.prepare(`
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

  await db.prepare('UPDATE tax_payments SET message_id = ? WHERE id = ?').run(msg.id, paymentId);

  // 세금 인증 요청이 새로 올라왔으니, "세금 안내" 배너를 다시 맨 아래로 옮겨서
  // 다음 사람이 스크롤 없이 바로 [세금 인증하기] 버튼을 누를 수 있게 합니다.
  await refreshTaxInfoBanner(channel, guildId).catch((e) => console.error('세금 안내 배너 갱신 실패:', e));

  return interaction.editReply({ content: `✅ 세금 인증 요청이 접수되었습니다. (\`${mcNick}\`, ${amount.toLocaleString()}만원)` });
}

async function handleTaxRejectReasonSubmit(interaction) {
  const idStr = interaction.customId.split('_').pop(); // tax_reject_reason_12
  const paymentId = Number(idStr);

  await interaction.deferUpdate();

  const payment = await db.prepare('SELECT * FROM tax_payments WHERE id = ?').get(paymentId);
  if (!payment || payment.status !== 'pending') {
    return; // 이미 처리되었거나 삭제된 요청 — 조용히 무시
  }

  const reason = interaction.fields.getTextInputValue('reason') || null;

  await db.prepare(`
    UPDATE tax_payments
    SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now'), reject_reason = ?
    WHERE id = ?
  `).run(interaction.user.id, reason, paymentId);

  const embed = buildTaxRequestEmbed({
    mcNick: payment.mc_nick,
    discordId: payment.discord_id,
    amount: payment.amount,
    status: 'rejected',
    period: payment.period,
    reviewedBy: interaction.user.id,
    rejectReason: reason,
  });

  const targetChannel = interaction.channel;
  const targetMsg = await targetChannel.messages.fetch(payment.message_id).catch(() => null);
  if (targetMsg) {
    await targetMsg.edit({ embeds: [embed], components: [] }).catch(() => {});
  }

  try {
    const applicant = await interaction.client.users.fetch(payment.discord_id);
    const reasonText = reason ? `\n사유: ${reason}` : '';
    await applicant.send(`❌ 세금 인증이 **반려**되었습니다. (\`${payment.mc_nick}\`, ${payment.period}) 다시 인증해주세요.${reasonText}`);
  } catch (e) {
    // DM 차단 등으로 실패 시 무시
  }
}

module.exports = { handleTaxModalSubmit, handleTaxRejectReasonSubmit };
