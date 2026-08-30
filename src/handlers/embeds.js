const { EmbedBuilder } = require('discord.js');
const { db, getGuildSettings } = require('../database');

const COLOR_NORMAL = 0x2ecc71; // 초록 (평상시)
const COLOR_WAR = 0xe74c3c;    // 빨강 (전쟁 조건 충족)
const COLOR_INFO = 0x5865f2;
const COLOR_PENDING = 0xf1c40f;
const COLOR_APPROVED = 0x2ecc71;
const COLOR_REJECTED = 0xe74c3c;

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function buildPresenceEmbed(guildId) {
  const rows = await db.prepare(`
    SELECT p.discord_id, p.role, c.mc_nick
    FROM presence p
    LEFT JOIN citizens c
      ON c.guild_id = p.guild_id AND c.discord_id = p.discord_id AND c.active = 1
    WHERE p.guild_id = ?
  `).all(guildId);

  const kings = rows.filter(r => r.role === 'king');
  const citizens = rows.filter(r => r.role === 'citizen');

  const isWar = kings.length >= 1 && citizens.length >= 1;

  const fmt = (list) => list.length
    ? list.map(r => `${r.mc_nick ? `\`${r.mc_nick}\` ` : ''}<@${r.discord_id}>`).join('\n')
    : '없음';

  const embed = new EmbedBuilder()
    .setTitle(isWar ? '⚔️ 접근금지 (왕 포함 접속 중)' : '🏰 인게임 인원 관리')
    .setDescription('버튼을 눌러 접속/퇴장 관리')
    .setColor(isWar ? COLOR_WAR : COLOR_NORMAL)
    .addFields(
      { name: '📊 접속 현황', value: `왕 ${kings.length}명 | 시민 ${citizens.length}명` },
      { name: '👑 왕', value: fmt(kings) },
      { name: '🛡️ 시민', value: fmt(citizens) },
      { name: '⚠️ 상태', value: isWar ? '⚔️ 접근금지 (왕 포함 접속 중)' : '✅ 접속 가능' },
    )
    .setTimestamp();

  return embed;
}

async function buildTaxInfoEmbed(guildId) {
  const settings = await db.prepare('SELECT tax_amount FROM guild_settings WHERE guild_id = ?').get(guildId);
  const amount = settings ? settings.tax_amount : 0;

  return new EmbedBuilder()
    .setTitle('💰 세금 안내')
    .setColor(COLOR_INFO)
    .setDescription(
      `현재 세금: **${amount.toLocaleString()}만원**\n\n` +
      `아래 **세금 인증하기** 버튼을 눌러 마크닉과 납부 스크린샷을 제출해주세요.\n` +
      `관리자 승인 후 이번 달 납부가 완료 처리됩니다.`
    );
}

function buildTaxRequestEmbed({ mcNick, discordId, amount, status, period, reviewedBy, rejectReason }) {
  const statusText = {
    pending: '⏳ 대기중',
    approved: '✅ 승인됨',
    rejected: '❌ 반려됨',
  }[status];

  const color = {
    pending: COLOR_PENDING,
    approved: COLOR_APPROVED,
    rejected: COLOR_REJECTED,
  }[status];

  const embed = new EmbedBuilder()
    .setTitle('🧾 세금 인증 요청')
    .setColor(color)
    .addFields(
      { name: '마크닉', value: mcNick, inline: true },
      { name: '신청자', value: `<@${discordId}>`, inline: true },
      { name: '금액', value: `${amount.toLocaleString()}만원`, inline: true },
      { name: '납부 월', value: period, inline: true },
      { name: '상태', value: statusText, inline: true },
    )
    .setTimestamp();

  if (reviewedBy) {
    embed.addFields({ name: '처리자', value: `<@${reviewedBy}>`, inline: true });
  }

  if (status === 'rejected' && rejectReason) {
    embed.addFields({ name: '반려 사유', value: rejectReason, inline: false });
  }

  return embed;
}

async function buildUnpaidListEmbed(guildId) {
  const period = currentPeriod();
  const citizens = await db.prepare('SELECT * FROM citizens WHERE guild_id = ? AND active = 1').all(guildId);

  const paidRows = await db.prepare(`
    SELECT discord_id FROM tax_payments
    WHERE guild_id = ? AND status = 'approved' AND period = ?
  `).all(guildId, period);
  const paidSet = new Set(paidRows.map(r => r.discord_id));

  const unpaid = citizens.filter(c => !paidSet.has(c.discord_id));

  const embed = new EmbedBuilder()
    .setTitle(`📋 세금미납자 목록 (${period})`)
    .setColor(unpaid.length ? COLOR_WAR : COLOR_NORMAL)
    .setDescription(
      unpaid.length
        ? unpaid.map(c => `❌ \`${c.mc_nick}\` <@${c.discord_id}>`).join('\n')
        : '🎉 전원 납부 완료!'
    )
    .addFields({ name: '미납 인원', value: `${unpaid.length}명` })
    .setTimestamp();

  return embed;
}

async function refreshTaxInfoBanner(channel, guildId) {
  const { taxInfoButtons } = require('./components');

  const settings = await getGuildSettings(guildId);

  // 기존 배너가 있으면 지워서, 새로 보내는 배너가 채널 맨 아래로 오도록 합니다.
  if (settings.tax_info_message_id) {
    const oldMsg = await channel.messages.fetch(settings.tax_info_message_id).catch(() => null);
    if (oldMsg) await oldMsg.delete().catch(() => {});
  }

  const embed = await buildTaxInfoEmbed(guildId);
  const newMsg = await channel.send({ embeds: [embed], components: taxInfoButtons() });

  await db.prepare('UPDATE guild_settings SET tax_info_message_id = ? WHERE guild_id = ?').run(newMsg.id, guildId);

  return newMsg;
}

module.exports = {
  buildPresenceEmbed,
  buildTaxInfoEmbed,
  buildTaxRequestEmbed,
  buildUnpaidListEmbed,
  refreshTaxInfoBanner,
  currentPeriod,
};
