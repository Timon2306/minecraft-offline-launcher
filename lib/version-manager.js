// ============================================
// version-manager.js — Version Management
// Загрузка версий с Mojang API + кэширование
// ============================================

const { app } = require('electron');
const https = require('https');
const fs = require('fs');
const path = require('path');

const cachePath = app && app.getPath
  ? path.join(app.getPath('userData'), 'versions-cache.json')
  : path.join(process.env.APPDATA || process.env.USERPROFILE || '', 'versions-cache.json');

/**
 * Автоопределение версии Minecraft по именам jar-файлов модов
 * @param {string} instancePath 
 * @returns {string}
 */
function detectMinecraftVersion(instancePath) {
  // Собираем список jar-файлов модов из нескольких возможных папок
  const possibleModsDirs = [
    path.join(instancePath, 'mods'),
    path.join(instancePath, 'libraries', 'mods')
  ];

  try {
    // 1. Проверяем наличие forge.jar + minecraft.jar в корне (старый формат 1.7.10)
    if (fs.existsSync(path.join(instancePath, 'forge.jar')) && 
        fs.existsSync(path.join(instancePath, 'minecraft.jar'))) {
      console.log(`[VersionManager] Определена версия 1.7.10 по наличию forge.jar + minecraft.jar`);
      return '1.7.10';
    }

    // 2. Проверяем наличие подпапки с именем версии (например, "1.7.10") в mods/
    const modsPath = path.join(instancePath, 'mods');
    if (fs.existsSync(modsPath)) {
      const versionDirRegex = /^1\.\d+(?:\.\d+)?$/;
      const modsContent = fs.readdirSync(modsPath);
      for (const file of modsContent) {
        const fullPath = path.join(modsPath, file);
        if (fs.statSync(fullPath).isDirectory() && versionDirRegex.test(file)) {
          console.log(`[VersionManager] Определена версия по подпапке mods/${file}`);
          return file;
        }
      }
    }

    // 3. Определяем по именам .jar файлов модов (ищем во всех папках)
    const versionCounts = {};
    const versionRegex = /(?:mc)?1\.\d+(?:\.\d+)?/g;

    for (const dir of possibleModsDirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith('.jar')) continue;
        const matches = file.match(versionRegex);
        if (matches) {
          for (const match of matches) {
            const ver = match.startsWith('mc') ? match.substring(2) : match;
            versionCounts[ver] = (versionCounts[ver] || 0) + 1;
          }
        }
      }
    }

    let bestVersion = '1.19.2';
    let maxCount = 0;
    for (const ver in versionCounts) {
      if (versionCounts[ver] > maxCount) {
        maxCount = versionCounts[ver];
        bestVersion = ver;
      }
    }
    return bestVersion;
  } catch (err) {
    console.error('[VersionManager] Ошибка автоопределения версии по модам:', err);
    return '1.19.2';
  }
}

/**
 * Получить список версий с Mojang API
 * @returns {Promise<object>}
 */
function fetchVersionsFromAPI() {
  return new Promise((resolve, reject) => {
    const url = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';
    const options = {
      headers: {
        'User-Agent': 'MinecraftOfflineLauncher/1.0'
      },
      timeout: 8000 // 8 секунд таймаут
    };

    const req = https.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Mojang API вернул статус-код ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error('Не удалось спарсить JSON манифеста версий Mojang'));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Превышено время ожидания ответа от Mojang API'));
    });
  });
}

function buildVersionsList(manifest) {
  const customVersions = [];
  const versionsList = [];
  
  const vanillaIds = new Set();
  if (manifest && manifest.versions) {
    manifest.versions.forEach(v => vanillaIds.add(v.id));
  }

  try {
    const configManager = require('./config-manager');
    const config = configManager.getConfig();
    const gameDir = config.gameDirectory;
    const versionsDir = path.join(gameDir, 'versions');

    if (fs.existsSync(versionsDir)) {
      const localDirs = fs.readdirSync(versionsDir);
      localDirs.forEach(dirName => {
        const jsonPath = path.join(versionsDir, dirName, `${dirName}.json`);
        if (fs.existsSync(jsonPath)) {
          const isVanilla = vanillaIds.has(dirName);
          const isOptimizedFabric = dirName === 'optimized-fabric-1.20.4';
          const isInternalFabric = dirName.startsWith('fabric-loader-');
          const isInternalForge = dirName.toLowerCase().includes('forge');

          if (!isVanilla && !isOptimizedFabric && !isInternalFabric && !isInternalForge) {
            customVersions.push({
              id: dirName,
              type: 'custom'
            });
          }
        }
      });
    }
  } catch (err) {
    console.error('[VersionManager] Ошибка сканирования локальных версий:', err);
  }

  const cristalixVersions = [];
  try {
    let cristaloxDir = path.join(require('os').homedir(), 'Desktop', 'папки', 'cristalox');
    if (!fs.existsSync(cristaloxDir)) {
      const configManager = require('./config-manager');
      const gameDir = configManager.getConfig().gameDirectory;
      cristaloxDir = path.join(gameDir, 'cristalox');
      if (!fs.existsSync(cristaloxDir)) {
        fs.mkdirSync(cristaloxDir, { recursive: true });
      }
    }
    if (fs.existsSync(cristaloxDir)) {
      const items = fs.readdirSync(cristaloxDir, { withFileTypes: true });
      items.forEach(item => {
        if (item.isDirectory()) {
          const buildPath = path.join(cristaloxDir, item.name);
          const hasJar = fs.existsSync(path.join(buildPath, `${item.name}.jar`));
          const hasJson = fs.existsSync(path.join(buildPath, `${item.name}.json`));
          if (hasJar || hasJson) {
            cristalixVersions.push({
              id: item.name,
              type: 'cristalix'
            });
          }
        }
      });
    }
  } catch (err) {
    console.error('[VersionManager] Ошибка сканирования сборок Cristalix:', err);
  }

  let finalVersions = [];
  
  // Добавляем Cristalix
  finalVersions = finalVersions.concat(cristalixVersions);
  
  // Добавляем оптимизированную сборку
  const configManager = require('./config-manager');
  const gameDir = configManager.getConfig().gameDirectory;
  const optJsonPath = path.join(gameDir, 'versions', 'optimized-fabric-1.20.4', 'optimized-fabric-1.20.4.json');
  if (fs.existsSync(optJsonPath)) {
    finalVersions.push({
      id: 'optimized-fabric-1.20.4',
      type: 'custom'
    });
  }

  // Добавляем кастомные
  finalVersions = finalVersions.concat(customVersions);

  // Добавляем ванильные
  if (manifest && manifest.versions) {
    const formattedVersions = manifest.versions.map(v => ({
      id: v.id,
      type: v.type
    }));
    finalVersions = finalVersions.concat(formattedVersions);

    return {
      latest: manifest.latest || { release: '1.20.4', snapshot: '1.20.4' },
      versions: finalVersions
    };
  }

  finalVersions.push({ id: '1.20.4', type: 'release' });
  return {
    latest: { release: '1.20.4', snapshot: '1.20.4' },
    versions: finalVersions
  };
}

/**
 * Загрузить и скомпоновать список версий (с использованием кэша + сканирование локальных кастомных версий)
 * @param {object} webContents - Соединение для отправки обновлений в фоне
 * @returns {Promise<object>}
 */
async function getVersions(webContents = null) {
  let manifest = null;
  const cacheExists = fs.existsSync(cachePath);

  // 1. Если есть кэш — отдаем сразу
  if (cacheExists) {
    try {
      const cachedData = fs.readFileSync(cachePath, 'utf8');
      manifest = JSON.parse(cachedData);
      console.log('[VersionManager] Отдаем список версий из кэша...');
      
      // Запускаем фоновое обновление
      setTimeout(async () => {
        try {
          console.log('[VersionManager] Фоновое обновление списка версий с Mojang API...');
          const freshManifest = await fetchVersionsFromAPI();
          fs.writeFileSync(cachePath, JSON.stringify(freshManifest, null, 2), 'utf8');
          console.log('[VersionManager] Локальный кэш версий обновлен в фоне.');
          
          if (webContents && !webContents.isDestroyed()) {
            const updatedResult = buildVersionsList(freshManifest);
            webContents.send('versions-updated', updatedResult);
          }
        } catch (bgErr) {
          console.warn('[VersionManager] Не удалось обновить кэш версий в фоне:', bgErr.message);
        }
      }, 100);

      return buildVersionsList(manifest);
    } catch (cacheErr) {
      console.error('[VersionManager] Ошибка чтения кэша версий, пойдем по сети:', cacheErr);
    }
  }

  // 2. Если кэша нет — скачиваем синхронно (первый запуск)
  try {
    console.log('[VersionManager] Первый запуск. Загрузка списка версий из API Mojang...');
    manifest = await fetchVersionsFromAPI();
    try {
      fs.writeFileSync(cachePath, JSON.stringify(manifest, null, 2), 'utf8');
      console.log('[VersionManager] Список версий сохранен в кэш.');
    } catch (writeErr) {
      console.error('[VersionManager] Ошибка записи кэша версий:', writeErr);
    }
    return buildVersionsList(manifest);
  } catch (apiErr) {
    console.error('[VersionManager] Ошибка сети при первом запуске:', apiErr.message);
    return buildVersionsList(null);
  }
}

module.exports = {
  getVersions,
  detectMinecraftVersion
};
