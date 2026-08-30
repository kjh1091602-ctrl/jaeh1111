// Render의 "웹 서비스"는 어떤 포트에 바인딩된 프로세스가 있어야 정상 상태로 인식해요.
// (디스코드 봇 자체는 포트가 필요 없지만, Render가 죽었다고 오해해서 재시작시키지 않도록
//  최소한의 HTTP 서버를 하나 띄워둡니다.)
// 여기에 UptimeRobot 같은 서비스로 주기적으로 핑을 보내면, Render 무료 플랜의
// "일정 시간 요청 없으면 잠드는" 현상도 막을 수 있어요.
const http = require('http');

function startHealthCheckServer() {
  const PORT = process.env.PORT || 3000;

  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running');
  }).listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = { startHealthCheckServer };
