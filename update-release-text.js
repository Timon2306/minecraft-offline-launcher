const https = require('https');
const token = process.env.GH_TOKEN;
const repo = "Timon2306/minecraft-offline-launcher";
const version = "1.0.5";
const releaseId = "348084607"; // I know the ID from previous logs

const body = `### Что нового в ${version}:
- Исправлено зависание при запуске игры (теперь лаунчер не висит на 100%).
- Улучшен интерфейс: добавлены плавные переходы панорам (без мельканий).
- Добавлена новая тема оформления «Хамелеон» (в бета-режиме, можно выбрать в настройках).
- Добавлено отображение логов/ошибок запуска, если игра крашится.

**ВАЖНО:** Сами сборки (моды и конфиги) никак не изменились с версии 1.0.0, обновлен только сам лаунчер!`;

const req = https.request(`https://api.github.com/repos/${repo}/releases/${releaseId}`, {
  method: 'PATCH',
  headers: {
    "Authorization": `token ${token}`,
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "NodeJS-Upload-Script"
  }
}, (res) => {
  console.log("Status:", res.statusCode);
});
req.write(JSON.stringify({ body }));
req.end();
