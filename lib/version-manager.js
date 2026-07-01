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

/**
 * Загрузить и скомпоновать список версий (с использованием кэша + сканирование локальных кастомных версий)
 * @returns {Promise<object>}
 */
async function getVersions() {
  let manifest = null;
  const customVersions = [];

  // 1. Сначала загружаем манифест версий Mojang (из API или кэша)
  try {
    console.log('[VersionManager] Загрузка списка версий из API Mojang...');
    manifest = await fetchVersionsFromAPI();
    
    // Сохраняем в кэш
    try {
      fs.writeFileSync(cachePath, JSON.stringify(manifest, null, 2), 'utf8');
      console.log('[VersionManager] Список версий кэширован локально.');
    } catch (writeErr) {
      console.error('[VersionManager] Ошибка записи кэша версий:', writeErr);
    }
  } catch (apiErr) {
    console.warn('[VersionManager] Сетевая ошибка или таймаут. Попытка загрузить из локального кэша...', apiErr.message);
    
    // Пытаемся прочитать из кэша
    if (fs.existsSync(cachePath)) {
      try {
        const cachedData = fs.readFileSync(cachePath, 'utf8');
        manifest = JSON.parse(cachedData);
        console.log('[VersionManager] Список версий успешно загружен из кэша.');
      } catch (cacheErr) {
        console.error('[VersionManager] Не удалось прочитать локальный кэш версий:', cacheErr);
      }
    }
  }

  // 2. Создаем Set с ID официальных версий для фильтрации дубликатов
  const vanillaIds = new Set();
  if (manifest && manifest.versions) {
    manifest.versions.forEach(v => vanillaIds.add(v.id));
  }

  // 3. Сканируем локальные версии в папке игры
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
          // Исключаем:
          // - официальные ванильные версии, которые были скачаны локально
          // - виртуальную оптимизированную сборку
          // - технические профили Fabric и Forge
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

  // 3.5. Сканируем сборки Cristalix
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
          
          // Временный фильтр сборок
          let allowedPacks = ['everyrage', 'skyvoid', 'magica', 'technomagic', 'galax', 'divinepvp'];
          try {
            const configManager = require('./config-manager');
            const config = configManager.getConfig();
            if (config.allowedCristalixPacks) {
              allowedPacks = config.allowedCristalixPacks;
            }
          } catch (configErr) {}

          if (!allowedPacks.some(p => p.toLowerCase() === item.name.toLowerCase())) {
            return;
          }

          // Пропускаем папки без mods/ — они не являются сборками (например, папка с .zs скриптами крафтов)
          const modsDir = path.join(buildPath, 'mods');
          if (!fs.existsSync(modsDir)) {
            console.log(`[VersionManager] Пропущена папка ${item.name} — нет mods/`);
            return;
          }
          // Определяем версию Minecraft по модам
          const mcVersion = detectMinecraftVersion(buildPath);
          cristalixVersions.push({
            id: `cristalix-${item.name}`,
            type: 'cristalix',
            mcVersion: mcVersion
          });
          console.log(`[VersionManager] Найдена сборка Cristalix: ${item.name} (версия MC: ${mcVersion})`);
        }
      });
    }
  } catch (err) {
    console.error('[VersionManager] Ошибка сканирования сборок Cristalix:', err);
  }

  // 4. Форматируем список версий для рендерера
  let versionsList = [];

  // Добавляем сначала сборки Cristalix
  versionsList = versionsList.concat(cristalixVersions);

  // Затем добавляем локальные кастомные версии (модпаки)
  versionsList = versionsList.concat(customVersions);

  if (manifest && manifest.versions) {
    const formattedVersions = manifest.versions.map(v => ({
      id: v.id,
      type: v.type // 'release' или 'snapshot'
    }));
    versionsList = versionsList.concat(formattedVersions);

    return {
      latest: manifest.latest || { release: '1.20.4', snapshot: '1.20.4' },
      versions: versionsList
    };
  }

  // Если вообще ничего не удалось получить (интернета нет, кэша нет)
  console.warn('[VersionManager] Кэш отсутствует, сеть недоступна. Возвращаем локальные + базовый fallback.');
  versionsList.push({ id: '1.20.4', type: 'release' });
  return {
    latest: { release: '1.20.4', snapshot: '1.20.4' },
    versions: versionsList
  };
}

module.exports = {
  getVersions,
  detectMinecraftVersion
};
