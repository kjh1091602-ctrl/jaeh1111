const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { db } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('시민')
    .setDescription('시민(마크닉-디스코드 연동) 관리')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('추가')
        .setDescription('새 시민을 등록합니다')
        .addStringOption(o => o.setName('마크닉').setDescription('마인크래프트 닉네임').setRequired(true))
        .addUserOption(o => o.setName('디코').setDescription('디스코드 계정').setRequired(true))
        .addStringOption(o => o.setName('직급').setDescription('직급 (기본: 시민)').addChoices(
          { name: '왕(부왕 포함)', value: 'king' },
          { name: '시민', value: 'citizen' },
        ))
    )
    .addSubcommand(sub =>
      sub.setName('제거')
        .setDescription('시민을 제거(비활성화)합니다')
        .addStringOption(o => o.setName('마크닉').setDescription('마인크래프트 닉네임').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('수정')
        .setDescription('시민 정보를 수정합니다')
        .addStringOption(o => o.setName('마크닉').setDescription('수정할 대상의 현재 마크닉').setRequired(true))
        .addStringOption(o => o.setName('새마크닉').setDescription('새 마크닉'))
        .addUserOption(o => o.setName('새디코').setDescription('새 디스코드 계정'))
        .addStringOption(o => o.setName('직급').setDescription('직급 변경').addChoices(
          { name: '왕(부왕 포함)', value: 'king' },
          { name: '시민', value: 'citizen' },
        ))
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === '추가') {
      const mcNick = interaction.options.getString('마크닉');
      const user = interaction.options.getUser('디코');
      const role = interaction.options.getString('직급') || 'citizen';

      const exists = await db.prepare('SELECT * FROM citizens WHERE guild_id = ? AND mc_nick = ? AND active = 1').get(guildId, mcNick);
      if (exists) {
        return interaction.reply({ content: `⚠️ 이미 등록된 마크닉입니다: \`${mcNick}\``, flags: MessageFlags.Ephemeral });
      }

      await db.prepare('INSERT INTO citizens (guild_id, mc_nick, discord_id, role) VALUES (?, ?, ?, ?)')
        .run(guildId, mcNick, user.id, role);

      return interaction.reply(`✅ 시민 등록 완료: \`${mcNick}\` (${role === 'king' ? '👑 왕' : '🛡️ 시민'}) — <@${user.id}>`);
    }

    if (sub === '제거') {
      const mcNick = interaction.options.getString('마크닉');
      const row = await db.prepare('SELECT * FROM citizens WHERE guild_id = ? AND mc_nick = ? AND active = 1').get(guildId, mcNick);
      if (!row) {
        return interaction.reply({ content: `❌ 등록되지 않은 마크닉입니다: \`${mcNick}\``, flags: MessageFlags.Ephemeral });
      }
      await db.prepare('UPDATE citizens SET active = 0 WHERE id = ?').run(row.id);
      await db.prepare('DELETE FROM presence WHERE guild_id = ? AND discord_id = ?').run(guildId, row.discord_id);

      return interaction.reply(`🗑️ 시민 제거 완료: \`${mcNick}\``);
    }

    if (sub === '수정') {
      const mcNick = interaction.options.getString('마크닉');
      const newNick = interaction.options.getString('새마크닉');
      const newUser = interaction.options.getUser('새디코');
      const newRole = interaction.options.getString('직급');

      const row = await db.prepare('SELECT * FROM citizens WHERE guild_id = ? AND mc_nick = ? AND active = 1').get(guildId, mcNick);
      if (!row) {
        return interaction.reply({ content: `❌ 등록되지 않은 마크닉입니다: \`${mcNick}\``, flags: MessageFlags.Ephemeral });
      }
      if (!newNick && !newUser && !newRole) {
        return interaction.reply({ content: '⚠️ 변경할 항목을 하나 이상 입력해주세요.', flags: MessageFlags.Ephemeral });
      }

      await db.prepare(`
        UPDATE citizens SET
          mc_nick = COALESCE(?, mc_nick),
          discord_id = COALESCE(?, discord_id),
          role = COALESCE(?, role)
        WHERE id = ?
      `).run(newNick, newUser ? newUser.id : null, newRole, row.id);

      // 접속 중이던 경우 presence 테이블도 동기화
      if (newUser || newRole) {
        const pres = await db.prepare('SELECT * FROM presence WHERE guild_id = ? AND discord_id = ?').get(guildId, row.discord_id);
        if (pres) {
          await db.prepare('DELETE FROM presence WHERE guild_id = ? AND discord_id = ?').run(guildId, row.discord_id);
          await db.prepare('INSERT OR REPLACE INTO presence (guild_id, discord_id, role) VALUES (?, ?, ?)')
            .run(guildId, newUser ? newUser.id : row.discord_id, newRole || pres.role);
        }
      }

      return interaction.reply(`✏️ 시민 정보 수정 완료: \`${mcNick}\``);
    }
  },
};
