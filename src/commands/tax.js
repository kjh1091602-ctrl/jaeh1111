const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { db, getGuildSettings } = require('../database');
const { buildUnpaidListEmbed, refreshTaxInfoBanner } = require('../handlers/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('세금')
    .setDescription('세금 관련 명령어')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('수정')
        .setDescription('세금 금액을 변경합니다 (만원 단위)')
        .addIntegerOption(o => o.setName('금액').setDescription('예: 200 → 200만원').setRequired(true).setMinValue(0))
    )
    .addSubcommand(sub =>
      sub.setName('현황')
        .setDescription('이번 달 세금 미납자 목록을 지금 바로 게시합니다')
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const settings = await getGuildSettings(guildId);

    if (sub === '수정') {
      const amount = interaction.options.getInteger('금액');
      await db.prepare('UPDATE guild_settings SET tax_amount = ? WHERE guild_id = ?').run(amount, guildId);

      await interaction.reply(`✅ 세금이 **${amount.toLocaleString()}만원**으로 변경되었습니다.`);

      if (settings.tax_channel_id) {
        const channel = await interaction.guild.channels.fetch(settings.tax_channel_id).catch(() => null);
        if (channel) {
          await refreshTaxInfoBanner(channel, guildId);
        }
      }
      return;
    }

    if (sub === '현황') {
      if (!settings.tax_channel_id) {
        return interaction.reply({ content: '⚠️ 먼저 `/설정 세금채널`로 세금 채널을 지정해주세요.', flags: MessageFlags.Ephemeral });
      }
      const channel = await interaction.guild.channels.fetch(settings.tax_channel_id).catch(() => null);
      if (!channel) {
        return interaction.reply({ content: '⚠️ 지정된 세금 채널을 찾을 수 없습니다.', flags: MessageFlags.Ephemeral });
      }
      const embed = await buildUnpaidListEmbed(guildId);
      await channel.send({ embeds: [embed] });
      return interaction.reply({ content: '✅ 미납자 목록을 게시했습니다.', flags: MessageFlags.Ephemeral });
    }
  },
};
