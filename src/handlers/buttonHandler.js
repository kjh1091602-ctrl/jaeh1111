const { PermissionFlagsBits, ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle, FileUploadBuilder } = require('discord.js');
const { db, getGuildSettings } = require('../database');
const { buildPresenceEmbed, buildTaxRequestEmbed } = require('./embeds');
const { presenceButtons, taxReviewButtons } = require('./components');

async function refreshPresenceMessage(guild) {
  const settings = getGuildSettings(guild.id);
  if (!settings.presence_channel_id || !settings.presence_message_id) return;
  const channel = await guild.channels.fetch(settings.presence_channel_id).catch(() => null);
  if (!channel) return;
  const msg = await channel.messages.fetch(settings.presence_message_id).catch(() => null);
  if (!msg) return;
  await msg.edit({ embeds: [buildPresenceEmbed(guild.id)], components: presenceButtons() });
}

async function handlePresenceButton(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const [, action, role] = interaction.customId.split('_'); // presence_join_king 등

  const citizen = db.prepare('SELECT * FROM citizens WHERE guild_id = ? AND discord_id = ? AND active = 1').get(guildId, userId);

  if (action === 'join') {
    if (!citizen) {
      return interaction.reply({ content: '⚠️ 먼저 시민으로 등록되어야 합니다. 관리자에게 `/시민 추가`를 요청해주세요.', ephemeral: true });
    }
    if (citizen.role !== role) {
      return interaction.reply({
        content: role === 'king'
          ? '⚠️ 왕/부왕으로 등록된 계정만 이용할 수 있습니다.'
          : '⚠️ 시민으로 등록된 계정만 이용할 수 있습니다.',
        ephemeral: true,
      });
    }
    db.prepare('INSERT OR REPLACE INTO presence (guild_id, discord_id, role) VALUES (?, ?, ?)').run(guildId, userId, role);
    await refreshPresenceMessage(interaction.guild);
    return interaction.reply({ content: '✅ 접속 처리되었습니다.', ephemeral: true });
  }

  if (action === 'leave') {
    const existing = db.prepare('SELECT * FROM presence WHERE guild_id = ? AND discord_id = ?').get(guildId, userId);
    if (!existing) {
      return interaction.reply({ content: '⚠️ 현재 접속 목록에 없습니다.', ephemeral: true });
    }
    db.prepare('DELETE FROM presence WHERE guild_id = ? AND discord_id = ?').run(guildId, userId);
    await refreshPresenceMessage(interaction.guild);
    return interaction.reply({ content: '✅ 퇴장 처리되었습니다.', ephemeral: true });
  }
}

async function handleTaxOpenModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('tax_modal')
    .setTitle('세금 인증')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('마크닉네임')
        .setTextInputComponent(
          new TextInputBuilder().setCustomId('mc_nick').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32)
        ),
      new LabelBuilder()
        .setLabel('세금 납부 스크린샷')
        .setDescription('세금을 납부한 화면의 스크린샷을 첨부해주세요')
        .setFileUploadComponent(
          new FileUploadBuilder().setCustomId('screenshot').setRequired(true).setMaxValues(1)
        ),
    );

  await interaction.showModal(modal);
}

async function handleTaxReview(interaction) {
  const [, action, idStr] = interaction.customId.split('_'); // tax_approve_12 / tax_reject_12
  const paymentId = Number(idStr);

  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: '⚠️ 관리자만 승인/반려할 수 있습니다.', ephemeral: true });
  }

  const payment = db.prepare('SELECT * FROM tax_payments WHERE id = ?').get(paymentId);
  if (!payment) {
    return interaction.reply({ content: '⚠️ 요청을 찾을 수 없습니다.', ephemeral: true });
  }
  if (payment.status !== 'pending') {
    return interaction.reply({ content: '⚠️ 이미 처리된 요청입니다.', ephemeral: true });
  }

  const status = action === 'approve' ? 'approved' : 'rejected';
  db.prepare('UPDATE tax_payments SET status = ?, reviewed_by = ?, reviewed_at = datetime(\'now\') WHERE id = ?')
    .run(status, interaction.user.id, paymentId);

  const embed = buildTaxRequestEmbed({
    mcNick: payment.mc_nick,
    discordId: payment.discord_id,
    amount: payment.amount,
    status,
    period: payment.period,
    reviewedBy: interaction.user.id,
  });

  await interaction.update({ embeds: [embed], components: [] });

  // DM 알림 (실패해도 무시)
  try {
    const applicant = await interaction.client.users.fetch(payment.discord_id);
    const dmText = status === 'approved'
      ? `✅ 세금 인증이 **승인**되었습니다! (\`${payment.mc_nick}\`, ${payment.amount.toLocaleString()}만원, ${payment.period})`
      : `❌ 세금 인증이 **반려**되었습니다. (\`${payment.mc_nick}\`, ${payment.period}) 다시 인증해주세요.`;
    await applicant.send(dmText);
  } catch (e) {
    // DM 차단 등으로 실패 시 무시하고 embed 상태 변경만 유지
  }
}

module.exports = { handlePresenceButton, handleTaxOpenModal, handleTaxReview, refreshPresenceMessage };
