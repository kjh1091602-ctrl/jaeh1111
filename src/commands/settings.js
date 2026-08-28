const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { db, getGuildSettings } = require('../database');
const { buildTaxInfoEmbed } = require('../handlers/embeds');
const { taxInfoButtons } = require('../handlers/components');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('설정')
    .setDescription('봇 기본 설정')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('세금채널')
        .setDescription('세금 인증/현황을 게시할 채널을 지정합니다')
        .addChannelOption(o => o.setName('채널').setDescription('채널 선택').addChannelTypes(ChannelType.GuildText).setRequired(true))
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === '세금채널') {
      const channel = interaction.options.getChannel('채널');
      getGuildSettings(guildId);
      db.prepare('UPDATE guild_settings SET tax_channel_id = ? WHERE guild_id = ?').run(channel.id, guildId);

      await interaction.reply(`✅ 세금 채널이 ${channel} (으)로 설정되었습니다. 안내 메시지를 게시합니다...`);

      const embed = buildTaxInfoEmbed(guildId);
      await channel.send({ embeds: [embed], components: taxInfoButtons() });
    }
  },
};
