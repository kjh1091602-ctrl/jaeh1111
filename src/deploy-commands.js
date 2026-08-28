require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`🔄 슬래시 명령어 ${commands.length}개 등록 중...`);

    if (process.env.GUILD_ID) {
      // 특정 서버에만 등록 (즉시 반영, 개발/테스트에 추천)
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands },
      );
      console.log(`✅ 길드(${process.env.GUILD_ID}) 명령어 등록 완료 (즉시 적용)`);
    } else {
      // 전역 등록 (모든 서버, 반영까지 최대 1시간)
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
      );
      console.log('✅ 전역 명령어 등록 완료 (최대 1시간 내 반영)');
    }
  } catch (error) {
    console.error('❌ 명령어 등록 실패:', error);
  }
})();
