const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { db, getGuildSettings } = require('../database');
const { buildPresenceEmbed } = require('../handlers/embeds');
const { presenceButtons } = require('../handlers/components');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('인원관리')
    .setDescription('인게임 인원(전쟁 조건) 확인 관리')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('생성')
        .setDescription('이 채널에 인원확인 게시판을 생성합니다')
    )
    .addSubcommand(sub =>
      sub.setName('삭제')
        .setDescription('접속 목록에서 특정 인원을 강제로 제거합니다')
        .addUserOption(o => o.setName('대상').setDescription('제거할 디스코드 계정').setRequired(true))
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === '생성') {
      const embed = await buildPresenceEmbed(guildId);
      const msg = await interaction.channel.send({ embeds: [embed], components: presenceButtons() });

      await getGuildSettings(guildId);
      await db.prepare('UPDATE guild_settings SET presence_channel_id = ?, presence_message_id = ? WHERE guild_id = ?')
        .run(interaction.channel.id, msg.id, guildId);

      return interaction.reply({ content: '✅ 인원확인 게시판을 생성했습니다.', flags: MessageFlags.Ephemeral });
    }

    if (sub === '삭제') {
      const target = interaction.options.getUser('대상');
      const removed = await db.prepare('DELETE FROM presence WHERE guild_id = ? AND discord_id = ?').run(guildId, target.id);

      if (removed.changes === 0) {
        return interaction.reply({ content: `⚠️ <@${target.id}>님은 접속 목록에 없습니다.`, flags: MessageFlags.Ephemeral });
      }

      await refreshPresenceBoard(interaction);
      return interaction.reply({ content: `✅ <@${target.id}>님을 접속 목록에서 제거했습니다.`, flags: MessageFlags.Ephemeral });
    }
  },
};

async function refreshPresenceBoard(interaction) {
  const guildId = interaction.guildId;
  const settings = await getGuildSettings(guildId);
  if (!settings.presence_channel_id || !settings.presence_message_id) return;

  const channel = await interaction.guild.channels.fetch(settings.presence_channel_id).catch(() => null);
  if (!channel) return;
  const msg = await channel.messages.fetch(settings.presence_message_id).catch(() => null);
  if (!msg) return;

  const embed = await buildPresenceEmbed(guildId);
  await msg.edit({ embeds: [embed], components: presenceButtons() });
}

module.exports.refreshPresenceBoard = refreshPresenceBoard;
