const fs = require('fs');
const https = require('https');
const path = require('path');

const version = "1.0.6";
const repo = "Timon2306/minecraft-offline-launcher";
const filePath = path.join(__dirname, "dist", `Minecraft Offline Launcher Setup ${version}.exe`);

const token = process.env.GH_TOKEN;
if (!token) {
  console.error("Please set GH_TOKEN environment variable.");
  process.exit(1);
}

const headers = {
  "Authorization": `token ${token}`,
  "Accept": "application/vnd.github.v3+json",
  "User-Agent": "NodeJS-Upload-Script"
};

console.log(`1. Checking if release ${version} exists...`);

function request(url, options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: body ? JSON.parse(body) : null }));
    });
    req.on('error', reject);
    if (postData) {
      if (Buffer.isBuffer(postData)) {
        req.write(postData);
      } else {
        req.write(JSON.stringify(postData));
      }
    }
    req.end();
  });
}

async function upload() {
  try {
    let release;
    
    // Check if release exists
    const getRes = await request(`https://api.github.com/repos/${repo}/releases/tags/v${version}`, { headers, method: 'GET' });
    if (getRes.statusCode === 200) {
      console.log("Release already exists. Using existing release.");
      release = getRes.body;
    } else if (getRes.statusCode === 404) {
      console.log(`Release not found. Creating new release v${version}...`);
      const postRes = await request(`https://api.github.com/repos/${repo}/releases`, { headers, method: 'POST' }, {
        tag_name: `v${version}`,
        name: `Release v${version}`,
        body: `### Что нового в ${version}:
- Исправлено отображение русских символов в тексте ошибок.
- Добавлено автоматическое восстановление (удаление битых файлов), если при скачивании версии пропадал интернет или сервер Mojang не отвечал.
- Все фиксы из 1.0.5.

**ВАЖНО:** Сами сборки (моды и конфиги) никак не изменились с версии 1.0.0, обновлен только сам лаунчер!`,
        draft: false,
        prerelease: false
      });
      if (postRes.statusCode >= 200 && postRes.statusCode < 300) {
        release = postRes.body;
      } else {
        throw new Error(`Failed to create release: ${JSON.stringify(postRes.body)}`);
      }
    } else {
      throw new Error(`Failed to check release: ${JSON.stringify(getRes.body)}`);
    }

    const uploadUrl = release.upload_url.replace(/\{.*\}$/, '');
    const fileName = path.basename(filePath);
    const encodedFileName = encodeURIComponent(fileName);

    console.log(`2. Uploading ${fileName} to GitHub Releases...`);
    const fileStats = fs.statSync(filePath);
    
    // Check if asset already exists and delete it
    if (release.assets && release.assets.length > 0) {
      const existingAsset = release.assets.find(a => a.name === fileName);
      if (existingAsset) {
        console.log(`Asset ${fileName} already exists. Deleting old asset...`);
        await request(`https://api.github.com/repos/${repo}/releases/assets/${existingAsset.id}`, { headers, method: 'DELETE' });
      }
    }

    const uploadOptions = {
      headers: {
        ...headers,
        "Content-Type": "application/octet-stream",
        "Content-Length": fileStats.size
      },
      method: 'POST'
    };

    console.log("Starting upload...");
    const req = https.request(`${uploadUrl}?name=${encodedFileName}`, uploadOptions, (res) => {
      let responseBody = '';
      res.on('data', d => responseBody += d);
      res.on('end', () => {
        console.log(); // empty line after progress bar
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log("\x1b[32mSuccessfully uploaded the release!\x1b[0m");
          console.log(`\x1b[32mRelease URL: ${release.html_url}\x1b[0m`);
        } else {
          console.error("Upload failed with status", res.statusCode, responseBody);
        }
      });
    });

    req.on('error', (e) => {
      console.log(); // empty line after progress bar
      console.error("Error during upload:", e);
    });

    const fileStream = fs.createReadStream(filePath);
    let uploadedBytes = 0;
    const totalBytes = fileStats.size;

    fileStream.on('data', (chunk) => {
      uploadedBytes += chunk.length;
      const percent = ((uploadedBytes / totalBytes) * 100).toFixed(2);
      const barLength = 40;
      const filledLength = Math.round((barLength * uploadedBytes) / totalBytes);
      const bar = '='.repeat(filledLength) + '-'.repeat(barLength - filledLength);
      
      process.stdout.write(`\r[${bar}] ${percent}% (${(uploadedBytes / 1024 / 1024).toFixed(2)} MB / ${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
    });

    fileStream.pipe(req);

  } catch (err) {
    console.error("Error:", err);
  }
}

upload();
