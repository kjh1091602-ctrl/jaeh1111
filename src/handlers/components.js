const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function presenceButtons() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('presence_join_king').setLabel('접속(왕)').setEmoji('👑').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('presence_leave_king').setLabel('퇴장(왕)').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('presence_join_citizen').setLabel('접속(시민)').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('presence_leave_citizen').setLabel('퇴장(시민)').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
  );
  return [row];
}

function taxInfoButtons() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tax_open_modal').setLabel('세금 인증하기').setEmoji('💰').setStyle(ButtonStyle.Success),
  );
  return [row];
}

function taxReviewButtons(paymentId) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tax_approve_${paymentId}`).setLabel('승인').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`tax_reject_${paymentId}`).setLabel('반려').setEmoji('❌').setStyle(ButtonStyle.Danger),
  );
  return [row];
}

module.exports = { presenceButtons, taxInfoButtons, taxReviewButtons };
