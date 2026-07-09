// ============================================
// fabric-manager.js — Fabric and Sodium Installer
// Автоматическая установка Fabric и мода Sodium
// ============================================

const fs = require('fs');
const path = require('path');
const https = require('https');

let nativeModule = null;
try {
  nativeModule = require('../src-rust/launcher-native.win32-x64-msvc.node');
} catch (e) {
  console.warn('[FabricManager] Rust-модуль недоступен на уровне модуля, используется JS-fallback', e.message);
}

/**
 * Скачать JSON/данные по URL (с поддержкой редиректов и User-Agent)
 * @param {string} url 
 * @returns {Promise<string>}
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'MinecraftOfflineLauncher/1.0.0 (contact@launcher.local)'
      },
      timeout: 10000
    };

    const req = https.get(url, options, (res) => {
      // Обработка редиректов (301, 302, 307, 308)
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        console.log(`[HTTP] Редирект на: ${res.headers.location}`);
        resolve(httpGet(res.headers.location));
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Сервер вернул статус-код ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Превышено время ожидания ответа по сети'));
    });
  });
}

/**
 * Скачать файл по URL и сохранить его на диск (с поддержкой редиректов)
 * @param {string} url 
 * @param {string} destPath 
 * @returns {Promise<void>}
 */
/**
 * Скачать файл по URL и сохранить его на диск (с отслеживанием прогресса, скорости и ETA)
 * @param {string} url 
 * @param {string} destPath 
 * @param {string} filename 
 * @param {BrowserWindow} mainWindow 
 * @returns {Promise<void>}
 */
function downloadFileWithProgress(url, destPath, filename, mainWindow) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath, { highWaterMark: 1024 * 1024 });
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Connection': 'keep-alive'
      },
      timeout: 30000
    };

    const req = https.get(url, options, (res) => {
      // Редирект
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        downloadFileWithProgress(res.headers.location, destPath, filename, mainWindow).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Ошибка скачивания файла: ${res.statusCode}`));
        return;
      }

      const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
      let downloadedBytes = 0;
      let startTime = Date.now();
      let lastTime = Date.now();
      let lastBytes = 0;
      let speedMb = 0;

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        
        const now = Date.now();
        const elapsed = now - lastTime;
        
        // Пересчет скорости каждые 500мс
        if (elapsed >= 500) {
          const bytesThisPeriod = downloadedBytes - lastBytes;
          const speedBytesPerSec = (bytesThisPeriod / elapsed) * 1000;
          speedMb = (speedBytesPerSec / (1024 * 1024)).toFixed(2);
          
          lastTime = now;
          lastBytes = downloadedBytes;
        }

        const percent = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
        const downloadedMb = (downloadedBytes / (1024 * 1024)).toFixed(2);
        const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);

        // Расчет оставшегося времени (ETA)
        let timeLeftSec = 0;
        if (parseFloat(speedMb) > 0 && totalBytes) {
          const remainingBytes = totalBytes - downloadedBytes;
          const speedBytesPerSec = parseFloat(speedMb) * 1024 * 1024;
          timeLeftSec = Math.round(remainingBytes / speedBytesPerSec);
        }

        // Отправляем IPC событие в рендерер
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-progress', {
            filename,
            percent,
            downloadedMb,
            totalMb,
            speedMb: parseFloat(speedMb) || 0,
            timeLeftSec
          });
        }
      });

      res.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    req.on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });

    file.on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

/**
 * Получить последнюю стабильную версию Fabric Loader для 1.20.4
 * @returns {Promise<string>}
 */
async function getLatestStableFabricVersion() {
  try {
    const resText = await httpGet('https://meta.fabricmc.net/v2/versions/loader/1.20.4');
    const loaders = JSON.parse(resText);
    
    // Ищем первый стабильный лоадер
    const stableLoader = loaders.find(l => l.loader && l.loader.stable === true);
    if (stableLoader) {
      return stableLoader.loader.version;
    }
    
    // Фоллбек
    return '0.16.10';
  } catch (err) {
    console.warn('[FabricManager] Не удалось запросить список лоадеров, используем стабильный фоллбек 0.16.10:', err.message);
    return '0.16.10';
  }
}

/**
 * Установка профиля Fabric в папку versions
 * @param {string} gameDir 
 * @returns {Promise<string>} Возвращает ID кастомной версии для MCLC (например, fabric-loader-0.16.10-1.20.4)
 */
/**
 * Установка профиля Fabric в папку versions для конкретной версии Майнкрафта
 * @param {string} gameDir 
 * @param {string} mcVersion 
 * @param {string} [fabricLoaderVersion]
 * @returns {Promise<string>} Возвращает ID кастомной версии
 */
async function installFabricProfileForVersion(gameDir, mcVersion, fabricLoaderVersion) {
  let loaderVer = fabricLoaderVersion;
  if (!loaderVer) {
    loaderVer = await getLatestStableFabricVersion();
  }
  const fabricVersionId = `fabric-loader-${loaderVer}-${mcVersion}`;
  const versionFolder = path.join(gameDir, 'versions', fabricVersionId);
  const jsonPath = path.join(versionFolder, `${fabricVersionId}.json`);

  // Если профиль уже установлен, пропускаем
  if (fs.existsSync(jsonPath)) {
    console.log(`[FabricManager] Профиль Fabric уже установлен: ${fabricVersionId}`);
    return fabricVersionId;
  }

  console.log(`[FabricManager] Установка Fabric профиля для ${mcVersion}: ${fabricVersionId}...`);
  fs.mkdirSync(versionFolder, { recursive: true });

  // Скачиваем JSON профиля
  const profileUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVer}/profile/json`;
  const profileJsonText = await httpGet(profileUrl);

  // Валидируем JSON
  JSON.parse(profileJsonText);

  // Сохраняем файл профиля
  fs.writeFileSync(jsonPath, profileJsonText, 'utf8');
  console.log(`[FabricManager] Профиль Fabric для ${mcVersion} успешно установлен.`);
  
  return fabricVersionId;
}

/**
 * Установка профиля Fabric по умолчанию (1.20.4)
 */
async function installFabricProfile(gameDir) {
  return installFabricProfileForVersion(gameDir, '1.20.4', null);
}

/**
 * Скачивание мода Sodium с Modrinth API
 * @param {string} gameDir 
 */
async function installSodium(gameDir, mainWindow) {
  const modsFolder = path.join(gameDir, 'mods');
  fs.mkdirSync(modsFolder, { recursive: true });

  console.log('[FabricManager] Проверка наличия мода Sodium для 1.20.4 Fabric...');

  // Ищем уже скачанные файлы Sodium в папке mods
  const files = fs.readdirSync(modsFolder);
  const hasSodium = files.some(file => file.toLowerCase().includes('sodium') && file.endsWith('.jar'));

  if (hasSodium) {
    console.log('[FabricManager] Мод Sodium уже присутствует в папке mods.');
    return;
  }

  console.log('[FabricManager] Запрос версии Sodium из Modrinth API...');
  
  // Sodium Project ID на Modrinth: AANobbMI
  const modrinthUrl = 'https://api.modrinth.com/v2/project/AANobbMI/version?loaders=["fabric"]&game_versions=["1.20.4"]';
  const apiResText = await httpGet(modrinthUrl);
  const versions = JSON.parse(apiResText);

  if (!versions || versions.length === 0) {
    throw new Error('Modrinth API не вернул версий Sodium для Fabric 1.20.4');
  }

  // Берем самую последнюю версию (первую в списке)
  const latestVer = versions[0];
  const primaryFile = latestVer.files.find(f => f.primary === true) || latestVer.files[0];

  const downloadUrl = primaryFile.url;
  const filename = primaryFile.filename;
  const destPath = path.join(modsFolder, filename);

  console.log(`[FabricManager] Скачивание Sodium: ${filename}...`);
  await downloadFileWithProgress(downloadUrl, destPath, filename, mainWindow);
  console.log('[FabricManager] Мод Sodium успешно загружен.');
}

/**
 * Полный пайплайн подготовки Fabric + Sodium
 * @param {string} gameDir 
 * @param {BrowserWindow} mainWindow 
 * @returns {Promise<string>} ID кастомной версии
 */
async function setupFabricOptimized(gameDir, mainWindow) {
  try {
    // Шаг 1: Установка профиля Fabric
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('launch-progress', { type: 'fabric', task: 1, total: 3 });
    }
    const fabricVersionId = await installFabricProfile(gameDir);

    // Шаг 2: Скачивание Sodium
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('launch-progress', { type: 'fabric', task: 2, total: 3 });
    }
    await installSodium(gameDir, mainWindow);

    // Шаг 3: Завершено
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('launch-progress', { type: 'fabric', task: 3, total: 3 });
    }

    return fabricVersionId;
  } catch (err) {
    console.error('[FabricManager] Ошибка установки Fabric+Sodium:', err);
    throw new Error(`Не удалось подготовить Optimized сборку: ${err.message}`);
  }
}

/**
 * Скачать одиночный мод с Modrinth API в папку mods
 * @param {string} projectId 
 * @param {string} gameDir 
 * @param {BrowserWindow} mainWindow 
 * @param {string} mcVersion
 * @param {string} loaderType
 * @param {string} instanceId
 * @returns {Promise<string>} Название установленного файла
 */
async function downloadSingleMod(projectId, gameDir, mainWindow, mcVersion = '1.20.4', loaderType = 'fabric', instanceId = '') {
  try {
    const modsFolder = instanceId 
      ? path.join(gameDir, 'versions', instanceId, 'mods')
      : path.join(gameDir, 'mods');
      
    fs.mkdirSync(modsFolder, { recursive: true });

    console.log(`[FabricManager] Запрос версии для мода ${projectId} на Modrinth (MC: ${mcVersion}, Loader: ${loaderType})...`);
    const modrinthUrl = `https://api.modrinth.com/v2/project/${projectId}/version?loaders=["${loaderType}"]&game_versions=["${mcVersion}"]`;
    
    const apiResText = await httpGet(modrinthUrl);
    const versions = JSON.parse(apiResText);

    if (!versions || versions.length === 0) {
      throw new Error(`Не найдено стабильных версий мода для ${loaderType.toUpperCase()} ${mcVersion}`);
    }

    const latestVer = versions[0];
    const primaryFile = latestVer.files.find(f => f.primary === true) || latestVer.files[0];

    const downloadUrl = primaryFile.url;
    const filename = primaryFile.filename;
    const destPath = path.join(modsFolder, filename);

    // Если файл уже скачан
    if (fs.existsSync(destPath)) {
      console.log(`[FabricManager] Мод ${filename} уже установлен.`);
      return filename;
    }

    console.log(`[FabricManager] Начало скачивания мода: ${filename}...`);
    await downloadFileWithProgress(downloadUrl, destPath, filename, mainWindow);
    console.log(`[FabricManager] Мод ${filename} успешно установлен.`);

    return filename;
  } catch (err) {
    console.error(`[FabricManager] Ошибка скачивания мода ${projectId}:`, err);
    throw err;
  }
}

/**
 * Скачивание и установка всей сборки модов (Modpack) формата .mrpack с Modrinth
 * @param {string} projectId 
 * @param {string} gameDir 
 * @param {BrowserWindow} mainWindow 
 */
async function installModpack(projectId, gameDir, mainWindow) {
  const AdmZip = require('adm-zip');
  
  try {
    console.log(`[FabricManager] Запрос версий сборки ${projectId} с Modrinth...`);
    const modrinthUrl = `https://api.modrinth.com/v2/project/${projectId}/version`;
    
    const apiResText = await httpGet(modrinthUrl);
    const versions = JSON.parse(apiResText);
    
    if (!versions || versions.length === 0) {
      throw new Error('У данной сборки модов не найдено опубликованных версий на Modrinth.');
    }
    
    const latestVersion = versions[0];
    // Ищем файл с расширением .mrpack
    const mrpackFile = latestVersion.files.find(f => f.filename.endsWith('.mrpack')) || latestVersion.files[0];
    
    const mrpackUrl = mrpackFile.url;
    const mrpackFilename = mrpackFile.filename;
    
    // Используем нормальное имя файла вместо temp_modpack, чтобы папка называлась адекватно
    const tempMrpackPath = path.join(gameDir, mrpackFilename);
    
    // Извлекаем метаданные из Modrinth API на случай, если архив окажется "нестандартным" (без mrpack.index.json и manifest.json)
    const mcVersion = latestVersion.game_versions && latestVersion.game_versions[0];
    const fabricLoader = latestVersion.loaders && latestVersion.loaders.find(l => l.toLowerCase() === 'fabric');
    const forgeLoader = latestVersion.loaders && latestVersion.loaders.find(l => l.toLowerCase() === 'forge');
    const modpackName = latestVersion.name || mrpackFilename.replace(/\.(mrpack|zip)$/i, '');
    
    const fallbackMeta = {
      name: modpackName,
      mcVersion: mcVersion,
      loaderType: fabricLoader ? 'fabric' : (forgeLoader ? 'forge' : 'vanilla')
    };
    
    // 1. Скачиваем файл .mrpack с прогрессом
    console.log(`[FabricManager] Скачивание файла сборки: ${mrpackFilename}...`);
    await downloadFileWithProgress(mrpackUrl, tempMrpackPath, mrpackFilename, mainWindow);
    
    // 2. Распаковываем и устанавливаем сборку через универсальный метод (поддерживает .mrpack, .zip, CurseForge)
    console.log('[FabricManager] Установка скачанной сборки...');
    const resultName = await installLocalZip(tempMrpackPath, gameDir, mainWindow, fallbackMeta);
    
    // 3. Удаляем временный файл архива
    if (fs.existsSync(tempMrpackPath)) {
      try { fs.unlinkSync(tempMrpackPath); } catch (e) {}
    }
    
    return resultName;
  } catch (err) {
    console.error('[FabricManager] Ошибка установки сборки модов:', err);
    throw err;
  }
}

const http = require('http');

/**
 * Получить информацию о файле CurseForge через прокси-API (с авто-редиректами)
 */
function fetchCurseForgeFileInfo(projectId, fileId) {
  return new Promise((resolve, reject) => {
    function get(url) {
      const client = url.startsWith('https') ? https : http;
      client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          get(res.headers.location);
          return;
        }
        
        if (res.statusCode !== 200) {
          reject(new Error(`Server status ${res.statusCode} for CF mod ${projectId} / file ${fileId}`));
          return;
        }
        
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed && parsed.data) {
              resolve(parsed.data);
            } else {
              reject(new Error('Неверный формат ответа от CurseForge API'));
            }
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    }
    
    get(`https://api.curse.tools/v1/cf/mods/${projectId}/files/${fileId}`);
  });
}

/**
 * Получить последнюю версию Forge для указанной версии Minecraft с Maven
 */
async function getLatestForgeVersionForMc(mcVersion) {
  try {
    console.log(`[ForgeInstaller] Запрос версий Forge для Minecraft ${mcVersion}...`);
    const resText = await httpGet('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
    const escapedMc = mcVersion.replace(/\./g, '\\.');
    const regex = new RegExp(`<version>${escapedMc}-([^<]+)</version>`);
    const match = regex.exec(resText);
    if (match && match[1]) {
      console.log(`[ForgeInstaller] Найдена последняя версия Forge для ${mcVersion}: ${match[1]}`);
      return match[1];
    }
  } catch (err) {
    console.warn(`[ForgeInstaller] Не удалось запросить Maven metadata для Forge: ${err.message}`);
  }
  return null;
}

/**
 * Скачать установщик Forge с Maven репозитория
 */
async function downloadForgeInstaller(mcVersion, forgeVersion, gameDir, mainWindow) {
  const installerDir = path.join(gameDir, 'forge-installers');
  if (!fs.existsSync(installerDir)) {
    fs.mkdirSync(installerDir, { recursive: true });
  }

  let resolvedForgeVersion = forgeVersion;
  if (!resolvedForgeVersion) {
    console.log(`[ForgeInstaller] Версия Forge не указана, пытаемся определить последнюю для ${mcVersion}...`);
    resolvedForgeVersion = await getLatestForgeVersionForMc(mcVersion);
    if (!resolvedForgeVersion) {
      // Фолбек на захардкоженные версии
      const DEFAULT_FORGE_VERSIONS = {
        '1.7.10': '10.13.4.1614',
        '1.12.2': '14.23.5.2860',
        '1.16.5': '36.2.39',
        '1.18.2': '40.2.10',
        '1.19.2': '43.3.0',
        '1.20.1': '47.2.20',
        '1.20.4': '49.0.22',
        '1.21': '51.0.8'
      };
      resolvedForgeVersion = DEFAULT_FORGE_VERSIONS[mcVersion] || '43.3.0';
      console.log(`[ForgeInstaller] Использован жестко заданный фолбек для Forge: ${resolvedForgeVersion}`);
    }
  }

  const filename = `forge-${mcVersion}-${resolvedForgeVersion}-installer.jar`;
  const installerPath = path.join(installerDir, filename);

  if (fs.existsSync(installerPath)) {
    console.log(`[ForgeInstaller] Установщик уже существует: ${installerPath}`);
    return installerPath;
  }

  // Для старых версий Minecraft (до 1.12) Forge Maven использует формат с суффиксом -mcVersion на конце:
  // /1.7.10-10.13.4.1558-1.7.10/forge-1.7.10-10.13.4.1558-1.7.10-installer.jar
  // А для более новых версий (1.12.2+) суффикс на конце отсутствует:
  // /1.12.2-14.23.5.2860/forge-1.12.2-14.23.5.2860-installer.jar
  const urls = [
    `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${resolvedForgeVersion}-${mcVersion}/forge-${mcVersion}-${resolvedForgeVersion}-${mcVersion}-installer.jar`,
    `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${resolvedForgeVersion}/forge-${mcVersion}-${resolvedForgeVersion}-installer.jar`
  ];

  // Если версия 1.12.2 и выше, меняем приоритет (сначала пробуем без суффикса)
  const isOldVersion = mcVersion.split('.').map(Number)[1] < 12;
  if (!isOldVersion) {
    urls.reverse();
  }

  const displayName = `Forge ${mcVersion} (${resolvedForgeVersion})`;
  let lastError = null;

  for (const downloadUrl of urls) {
    try {
      console.log(`[ForgeInstaller] Попытка скачивания установщика Forge по адресу: ${downloadUrl}`);
      await downloadFileWithProgress(downloadUrl, installerPath, displayName, mainWindow);
      console.log(`[ForgeInstaller] Успешно скачан установщик Forge`);
      return installerPath;
    } catch (err) {
      console.warn(`[ForgeInstaller] Не удалось скачать по адресу ${downloadUrl}: ${err.message}`);
      lastError = err;
      if (fs.existsSync(installerPath)) {
        try { fs.unlinkSync(installerPath); } catch(e){}
      }
    }
  }

  throw new Error(`Не удалось скачать установщик Forge. Последняя ошибка: ${lastError ? lastError.message : '404'}`);
}

/**
 * Установка локального ZIP или MRPACK архива
 * @param {string} filePath 
 * @param {string} gameDir 
 * @param {BrowserWindow} mainWindow 
 */
async function installLocalZip(filePath, gameDir, mainWindow, fallbackMeta = null) {
  const AdmZip = require('adm-zip');
  
  let currentLang = 'ru';
  try {
    const configManager = require('./config-manager');
    currentLang = configManager.getConfig().language || 'ru';
  } catch (e) {}
  
  try {
    console.log(`[FabricManager] Открытие локального архива: ${filePath}...`);
    const zip = new AdmZip(filePath);
    
    // Проверяем, является ли это Modrinth модпаком (.mrpack)
    const indexEntry = zip.getEntry('modpack.index.json') || zip.getEntry('modrinth.index.json');
    
    if (indexEntry) {
      console.log('[FabricManager] Обнаружен локальный Modrinth-модпак (.mrpack). Начало установки...');
      const indexJson = JSON.parse(indexEntry.getData().toString('utf8'));
      const totalFiles = indexJson.files.length;
      
      const modpackName = indexJson.name || (fallbackMeta && fallbackMeta.name) || 'Modrinth-Modpack';
      const mcVersion = indexJson.dependencies.minecraft || (fallbackMeta && fallbackMeta.mcVersion);
      const fabricVer = indexJson.dependencies['fabric-loader'] || (fallbackMeta && fallbackMeta.fabricVer);
      const forgeVer = indexJson.dependencies['forge'] || (fallbackMeta && fallbackMeta.forgeVer);
      
      const versionId = `${modpackName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '-')}-${mcVersion}`;
      const instanceDir = path.join(gameDir, 'versions', versionId);
      fs.mkdirSync(instanceDir, { recursive: true });
      
      const modpackStartTime = Date.now();
      
      // Скачиваем каждый мод из списка в папку инстанса
      for (let i = 0; i < totalFiles; i++) {
        const fileObj = indexJson.files[i];
        const fileUrl = fileObj.downloads[0];
        const relativePath = fileObj.path;
        const absolutePath = path.join(instanceDir, relativePath);
        
        const filename = relativePath.split('/').pop();
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        
        const remainingFiles = totalFiles - i;
        const elapsedSec = (Date.now() - modpackStartTime) / 1000;
        const filesPerSec = elapsedSec > 0 ? (i / elapsedSec) : 0;
        const timeLeftSec = filesPerSec > 0 ? Math.round(remainingFiles / filesPerSec) : -1;
        const speedMb = filesPerSec > 0 ? (filesPerSec * 1.5).toFixed(1) : '0.0';
        const percent = Math.round((i / totalFiles) * 100);
        
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-progress', {
            filename: `Файл ${i + 1} из ${totalFiles} (${filename})`,
            percent: percent,
            downloadedMb: (i * 1.5).toFixed(1),
            totalMb: (totalFiles * 1.5).toFixed(1),
            speedMb: speedMb,
            timeLeftSec: timeLeftSec
          });
        }
        
        // Скачиваем мод
        await new Promise((resolve, reject) => {
          const fileStream = fs.createWriteStream(absolutePath, { highWaterMark: 1024 * 1024 });
          const options = {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Connection': 'keep-alive'
            },
            timeout: 30000
          };
          
          function download(url) {
            https.get(url, options, (res) => {
              if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                download(res.headers.location);
                return;
              }
              if (res.statusCode !== 200) {
                fileStream.close();
                fs.unlinkSync(absolutePath);
                reject(new Error(`Status code ${res.statusCode}`));
                return;
              }
              res.pipe(fileStream);
              fileStream.on('finish', () => resolve());
              fileStream.on('error', (e) => reject(e));
            }).on('error', (e) => reject(e));
          }
          download(fileUrl);
        });
      }
      
      // Распаковываем overrides в инстанс
      console.log('[FabricManager] Извлечение overrides...');
      const zipEntries = zip.getEntries();
      for (const entry of zipEntries) {
        if (entry.entryName.startsWith('overrides/')) {
          const relPath = entry.entryName.substring('overrides/'.length);
          if (!relPath) continue;
          
          const absoluteDestPath = path.join(instanceDir, relPath);
          if (entry.isDirectory) {
            fs.mkdirSync(absoluteDestPath, { recursive: true });
          } else {
            fs.mkdirSync(path.dirname(absoluteDestPath), { recursive: true });
            await fs.promises.writeFile(absoluteDestPath, entry.getData());
          }
        }
        // Даем Electron перерисовывать UI
        await new Promise(r => setImmediate(r));
      }
      
      const versionFolder = path.join(gameDir, 'versions', versionId);
      fs.mkdirSync(versionFolder, { recursive: true });
      const jsonPath = path.join(versionFolder, `${versionId}.json`);

      let inheritsFromVersion = mcVersion;
      let loaderType = 'vanilla';
      let loaderVersion = '';

      if (fabricVer) {
        const fabricVerId = await installFabricProfileForVersion(gameDir, mcVersion, fabricVer);
        inheritsFromVersion = fabricVerId;
        loaderType = 'fabric';
        loaderVersion = fabricVer;
      } else if (forgeVer) {
        loaderType = 'forge';
        loaderVersion = forgeVer;
      }

      const inheritsJson = {
        id: versionId,
        inheritsFrom: inheritsFromVersion,
        type: "release",
        mainClass: loaderType === 'fabric' ? "net.fabricmc.loader.impl.launch.knot.KnotClient" : "net.minecraft.client.main.Main",
        arguments: {
          game: []
        },
        libraries: [],
        modLoader: {
          type: loaderType,
          version: loaderVersion
        }
      };

      fs.writeFileSync(jsonPath, JSON.stringify(inheritsJson, null, 2), 'utf8');
      console.log(`[FabricManager] Создан профиль Modrinth версии: ${versionId} (${loaderType})`);

      let configManager;
      try {
        configManager = require('./config-manager');
      } catch(e) {}
      
      if (configManager) {
        const config = configManager.getConfig();
        config.selectedVersion = versionId;
        config.selectedVersionType = 'custom';
        configManager.saveConfig(config);
      }
      
      return `${modpackName} (Minecraft ${mcVersion})`;
    } else {
      // Это обычный ZIP-архив или CurseForge zip
      console.log('[FabricManager] Обнаружен обычный ZIP-архив. Поиск CurseForge манифеста...');
      
      const manifestEntry = zip.getEntry('manifest.json');
      if (manifestEntry) {
        console.log('[FabricManager] Обнаружена CurseForge сборка модов!');
        const manifestJson = JSON.parse(manifestEntry.getData().toString('utf8'));
        const mcVersion = manifestJson.minecraft.version;
        const modpackName = manifestJson.name || 'CurseForge-Modpack';
        
        let loaderType = 'vanilla';
        let loaderVersion = '';
        if (manifestJson.minecraft.modLoaders && manifestJson.minecraft.modLoaders.length > 0) {
          const primaryLoader = manifestJson.minecraft.modLoaders.find(l => l.primary) || manifestJson.minecraft.modLoaders[0];
          const loaderId = primaryLoader.id; // e.g. "forge-36.2.26"
          const dashIdx = loaderId.indexOf('-');
          if (dashIdx !== -1) {
            loaderType = loaderId.substring(0, dashIdx).toLowerCase();
            loaderVersion = loaderId.substring(dashIdx + 1);
          }
        }

        const versionId = `${modpackName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '-')}-${mcVersion}`;
        const instanceDir = path.join(gameDir, 'versions', versionId);
        fs.mkdirSync(instanceDir, { recursive: true });

        // 1. Распаковываем overrides в папку инстанса
        console.log('[FabricManager] Извлечение overrides...');
        const zipEntries = zip.getEntries();
        for (const entry of zipEntries) {
          if (entry.entryName.startsWith('overrides/')) {
            const relPath = entry.entryName.substring('overrides/'.length);
            if (!relPath) continue;
            const absoluteDestPath = path.join(instanceDir, relPath);
            if (entry.isDirectory) {
              fs.mkdirSync(absoluteDestPath, { recursive: true });
            } else {
              fs.mkdirSync(path.dirname(absoluteDestPath), { recursive: true });
              await fs.promises.writeFile(absoluteDestPath, entry.getData());
            }
          }
          await new Promise(r => setImmediate(r));
        }

        // Поддержка архивов, где папки mods/config лежат прямо в корне (без overrides/)
        for (const entry of zipEntries) {
          const entryName = entry.entryName;
          if (entryName.startsWith('mods/') || entryName.startsWith('config/') || entryName.startsWith('saves/')) {
            const absoluteDestPath = path.join(instanceDir, entryName);
            if (entry.isDirectory) {
              fs.mkdirSync(absoluteDestPath, { recursive: true });
            } else {
              fs.mkdirSync(path.dirname(absoluteDestPath), { recursive: true });
              await fs.promises.writeFile(absoluteDestPath, entry.getData());
            }
          }
          await new Promise(r => setImmediate(r));
        }

        // 2. Скачиваем моды по списку из manifest.json
        const totalFiles = manifestJson.files ? manifestJson.files.length : 0;
        console.log(`[FabricManager] Найдено модов для скачивания: ${totalFiles}`);
        
        const modpackStartTime = Date.now();
        const tasks = [];
        const batchSize = 10;
        
        // Получаем ссылки на скачивание параллельно пачками
        for (let idx = 0; idx < totalFiles; idx += batchSize) {
          const batch = manifestJson.files.slice(idx, idx + batchSize);
          await Promise.all(batch.map(async (fileObj, bIdx) => {
            const currentIdx = idx + bIdx;
            const projectId = fileObj.projectID;
            const fileId = fileObj.fileID;
            
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('download-progress', {
                filename: currentLang === 'ru' 
                  ? `Сбор информации о моде ${currentIdx + 1} из ${totalFiles}...`
                  : `Gathering info for mod ${currentIdx + 1} of ${totalFiles}...`,
                percent: Math.round((currentIdx / totalFiles) * 20),
                downloadedMb: '0.0',
                totalMb: '0.0',
                speedMb: '0.0',
                timeLeftSec: -1
              });
            }
            
            try {
              const fileInfo = await fetchCurseForgeFileInfo(projectId, fileId);
              let downloadUrl = fileInfo.downloadUrl;
              
              if (!downloadUrl && fileInfo.fileName) {
                // Реконструируем прямую ссылку на CDN CurseForge
                const fileIdStr = String(fileId);
                if (fileIdStr.length > 4) {
                  const part1 = fileIdStr.substring(0, fileIdStr.length - 3);
                  const part2 = fileIdStr.substring(fileIdStr.length - 3);
                  downloadUrl = `https://edge.forgecdn.net/files/${part1}/${part2}/${encodeURIComponent(fileInfo.fileName)}`;
                  console.log(`[FabricManager] Реконструирован CDN URL для мода ${fileInfo.fileName}: ${downloadUrl}`);
                }
              }

              if (downloadUrl) {
                tasks.push({
                  url: downloadUrl,
                  path: path.join(instanceDir, 'mods', fileInfo.fileName)
                });
              }
            } catch (err) {
              console.error(`[FabricManager] Ошибка получения ссылки для CF мода ${projectId}: ${err.message}`);
            }
          }));
        }

        // Фильтруем пустые задачи
        const validTasks = tasks.filter(t => t.url && t.url.startsWith('http'));

        if (validTasks.length > 0) {
          console.log(`[FabricManager] Запуск параллельного JS-скачивания ${validTasks.length} модов CurseForge...`);
          validTasks.forEach(t => fs.mkdirSync(path.dirname(t.path), { recursive: true }));

          const downloadStartTime = Date.now();
          let completed = 0;
          let activeCount = 0;
          let taskIndex = 0;
          let lastReport = 0;
          const concurrency = 15;

          const http = require('http');

          await new Promise((resolve) => {
            function startNext() {
              if (completed === validTasks.length) {
                resolve();
                return;
              }

              while (activeCount < concurrency && taskIndex < validTasks.length) {
                const currentTaskIndex = taskIndex++;
                const task = validTasks[currentTaskIndex];
                const filename = task.path.split(/[\\/]/).pop();
                activeCount++;

                // Скачиваем один файл
                new Promise((resolveDownload, rejectDownload) => {
                  const fileStream = fs.createWriteStream(task.path, { highWaterMark: 1024 * 1024 });
                  const options = {
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                      'Connection': 'keep-alive'
                    },
                    timeout: 30000
                  };

                  function download(url) {
                    const client = url.startsWith('https') ? https : http;
                    client.get(url, options, (res) => {
                      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                        download(res.headers.location);
                        return;
                      }
                      if (res.statusCode !== 200) {
                        fileStream.close();
                        try { fs.unlinkSync(task.path); } catch (e) {}
                        rejectDownload(new Error(`Status ${res.statusCode}`));
                        return;
                      }
                      res.pipe(fileStream);
                      fileStream.on('finish', () => resolveDownload());
                      fileStream.on('error', rejectDownload);
                    }).on('error', rejectDownload);
                  }
                  download(task.url);
                })
                .then(() => {
                  activeCount--;
                  completed++;
                  reportProgress(filename);
                  startNext();
                })
                .catch((err) => {
                  console.error(`[FabricManager] Ошибка скачивания CF мода ${filename}:`, err.message);
                  activeCount--;
                  completed++;
                  reportProgress(filename);
                  startNext();
                });
              }
            }

            function reportProgress(lastFilename) {
              const now = Date.now();
              if (now - lastReport > 100 || completed === validTasks.length) {
                lastReport = now;
                const percent = 20 + Math.round((completed / validTasks.length) * 80);
                const elapsedSec = (now - downloadStartTime) / 1000;
                const filesPerSec = elapsedSec > 0 ? (completed / elapsedSec) : 0;
                const speedMb = filesPerSec > 0 ? (filesPerSec * 1.5).toFixed(1) : '0.0';
                const remainingFiles = validTasks.length - completed;
                const timeLeftSec = filesPerSec > 0 ? Math.round(remainingFiles / filesPerSec) : -1;

                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('download-progress', {
                    filename: `Файл ${completed} из ${validTasks.length} (${lastFilename})`,
                    percent: percent,
                    downloadedMb: (completed * 1.5).toFixed(1),
                    totalMb: (validTasks.length * 1.5).toFixed(1),
                    speedMb: speedMb,
                    timeLeftSec: timeLeftSec
                  });
                }
              }
            }

            startNext();
          });
        }

        // 3. Создаем наследуемый JSON-профиль в versions/
        const versionFolder = path.join(gameDir, 'versions', versionId);
        fs.mkdirSync(versionFolder, { recursive: true });
        const jsonPath = path.join(versionFolder, `${versionId}.json`);

        let inheritsFromVersion = mcVersion;
        if (loaderType === 'fabric') {
          const fabricVerId = await installFabricProfileForVersion(gameDir, mcVersion, loaderVersion);
          inheritsFromVersion = fabricVerId;
        } else if (loaderType === 'forge') {
          const forgeVerId = await installForge(mcVersion, loaderVersion, gameDir, mainWindow);
          inheritsFromVersion = forgeVerId;
        }

        const inheritsJson = {
          id: versionId,
          inheritsFrom: inheritsFromVersion,
          type: "release",
          mainClass: loaderType === 'fabric' ? "net.fabricmc.loader.impl.launch.knot.KnotClient" : "net.minecraft.client.main.Main",
          arguments: {
            game: []
          },
          libraries: [],
          modLoader: {
            type: loaderType,
            version: loaderVersion
          }
        };

        fs.writeFileSync(jsonPath, JSON.stringify(inheritsJson, null, 2), 'utf8');
        console.log(`[FabricManager] Создан кастомный профиль версии: ${versionId} (${loaderType})`);

        // 4. Автоматически переключаем выбранную версию в конфиге
        let configManager;
        try {
          configManager = require('./config-manager');
        } catch(e) {}

        if (configManager) {
          const config = configManager.getConfig();
          config.selectedVersion = versionId;
          config.selectedVersionType = 'custom';
          configManager.saveConfig(config);
        }

        return `${modpackName} (Minecraft ${mcVersion})`;
      } else {
        // Обычная распаковка для готовых ZIP сборок с модами внутри
        // Извлекаем имя сборки из названия ZIP-файла
        const zipBaseName = path.basename(filePath, path.extname(filePath))
          .replace(/[^a-zA-Z0-9_\-\s]/g, '')
          .trim()
          .replace(/\s+/g, '-');
        
        if (fallbackMeta) {
          // Если есть метаданные (скачивание с Modrinth), создаем нормальный профиль
          const modpackName = fallbackMeta.name || zipBaseName;
          const mcVersion = fallbackMeta.mcVersion;
          
          if (!mcVersion) {
            throw new Error("Не удалось определить версию Minecraft для скачанного архива.");
          }
          
          const versionId = `${modpackName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '-')}-${mcVersion}`;
          const instanceDir = path.join(gameDir, 'versions', versionId);
          console.log(`[FabricManager] Создание кастомного профиля из обычного ZIP: ${instanceDir}...`);
          fs.mkdirSync(instanceDir, { recursive: true });
          zip.extractAllTo(instanceDir, true);
          
          const jsonPath = path.join(instanceDir, `${versionId}.json`);
          let inheritsFromVersion = mcVersion;
          let loaderType = fallbackMeta.loaderType || 'vanilla';
          let loaderVersion = '';

          if (loaderType === 'fabric') {
            const fabricVerId = await installFabricProfileForVersion(gameDir, mcVersion, null);
            inheritsFromVersion = fabricVerId;
          } else if (loaderType === 'forge') {
            // Для Forge требуется указать версию, если null, он может упасть, но попытаемся использовать пустую строку или latest логику
            const forgeVerId = await installForge(mcVersion, null, gameDir, mainWindow);
            inheritsFromVersion = forgeVerId;
          }

          const inheritsJson = {
            id: versionId,
            inheritsFrom: inheritsFromVersion,
            type: "release",
            mainClass: loaderType === 'fabric' ? "net.fabricmc.loader.impl.launch.knot.KnotClient" : "net.minecraft.client.main.Main",
            arguments: { game: [] },
            libraries: [],
            modLoader: { type: loaderType, version: loaderVersion }
          };

          fs.writeFileSync(jsonPath, JSON.stringify(inheritsJson, null, 2), 'utf8');
          console.log(`[FabricManager] Создан кастомный профиль версии: ${versionId} (${loaderType})`);

          let configManager;
          try { configManager = require('./config-manager'); } catch(e) {}
          if (configManager) {
            const config = configManager.getConfig();
            config.selectedVersion = versionId;
            config.selectedVersionType = 'custom';
            configManager.saveConfig(config);
          }
          return `${modpackName} (Minecraft ${mcVersion})`;
        } else {
          // Если метаданных нет (локальный импорт неизвестного ZIP), предполагаем Cristalix
          let cristaloxDir = path.join(require('os').homedir(), 'Desktop', 'папки', 'cristalox');
          if (!fs.existsSync(cristaloxDir)) {
            const configManager = require('./config-manager');
            const config = configManager.getConfig();
            const gameDir = config.gameDirectory;
            cristaloxDir = path.join(gameDir, 'cristalox');
            if (!fs.existsSync(cristaloxDir)) {
              fs.mkdirSync(cristaloxDir, { recursive: true });
            }
          }
          const destDir = path.join(cristaloxDir, zipBaseName);
          
          console.log(`[FabricManager] Импорт кастомной сборки в: ${destDir}...`);
          fs.mkdirSync(destDir, { recursive: true });
          zip.extractAllTo(destDir, true);
          
          // Добавляем импортированную сборку в список разрешенных
          let configManager;
          try {
            configManager = require('./config-manager');
          } catch(e) {}
          
          if (configManager) {
            const config = configManager.getConfig();
            if (!config.allowedCristalixPacks) {
              config.allowedCristalixPacks = ['everyrage', 'skyvoid', 'magica', 'technomagic', 'galax', 'divinepvp'];
            }
            const lowerName = zipBaseName.toLowerCase();
            if (!config.allowedCristalixPacks.includes(lowerName)) {
              config.allowedCristalixPacks.push(lowerName);
            }
            // Автоматически выбираем импортированную сборку
            config.selectedVersion = `cristalix-${zipBaseName}`;
            config.selectedVersionType = 'cristalix';
            configManager.saveConfig(config);
          }
          
          console.log(`[FabricManager] Сборка ${zipBaseName} успешно импортирована как Cristalix.`);
          return `Сборка ${zipBaseName}`;
        }
      }
    }
  } catch (err) {
    console.error('[FabricManager] Ошибка импорта локального архива:', err);
    throw err;
  }
}

/**
 * Установка Forge через официальный CLI инсталлятора или программно
 */
async function installForge(mcVersion, forgeVersion, gameDir, mainWindow) {
  let resolvedForgeVersion = forgeVersion;
  if (!resolvedForgeVersion) {
    console.log(`[ForgeInstaller] Версия Forge не указана, пытаемся определить последнюю для ${mcVersion}...`);
    resolvedForgeVersion = await getLatestForgeVersionForMc(mcVersion);
    if (!resolvedForgeVersion) {
      const DEFAULT_FORGE_VERSIONS = {
        '1.7.10': '10.13.4.1614',
        '1.12.2': '14.23.5.2860',
        '1.16.5': '36.2.39',
        '1.18.2': '40.2.10',
        '1.19.2': '43.3.0',
        '1.20.1': '47.2.20',
        '1.20.4': '49.0.22',
        '1.21': '51.0.8'
      };
      resolvedForgeVersion = DEFAULT_FORGE_VERSIONS[mcVersion] || '43.3.0';
      console.log(`[ForgeInstaller] Использован жестко заданный фолбек для Forge: ${resolvedForgeVersion}`);
    }
  }

  const installerPath = await downloadForgeInstaller(mcVersion, resolvedForgeVersion, gameDir, mainWindow);
  
  let currentLang = 'ru';
  try {
    const configManager = require('./config-manager');
    if (configManager) {
      currentLang = configManager.getConfig().language || 'ru';
    }
  } catch (e) {}

  console.log(`[ForgeInstaller] Чтение структуры инсталлятора Forge ${mcVersion}-${resolvedForgeVersion}...`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('launch-progress', { 
      type: 'forge', 
      task: 1, 
      total: 2,
      desc: currentLang === 'ru' ? 'Подготовка Forge...' : 'Preparing Forge...' 
    });
  }

  const AdmZip = require('adm-zip');
  const zip = new AdmZip(installerPath);
  
  let installProfile = null;
  try {
    const profileText = zip.readAsText('install_profile.json');
    installProfile = JSON.parse(profileText);
  } catch (err) {
    console.error('[ForgeInstaller] Не удалось прочитать install_profile.json из инсталлятора:', err);
  }

  // Если это старый Forge (в install_profile.json есть versionInfo)
  if (installProfile && installProfile.versionInfo) {
    console.log('[ForgeInstaller] Обнаружен старый формат Forge. Выполняем быструю программную установку...');
    const versionInfo = installProfile.versionInfo;
    const profileId = versionInfo.id;
    
    // Форматируем библиотеки под стандарт MCLC (добавляем downloads.artifact), чтобы MCLC их увидела
    if (versionInfo.libraries) {
      versionInfo.libraries = versionInfo.libraries.map(lib => {
        if (lib.downloads && lib.downloads.artifact) return lib;
        
        const parts = lib.name.split(':');
        const group = parts[0].replace(/\./g, '/');
        const name = parts[1];
        const version = parts[2];
        const pathStr = `${group}/${name}/${version}/${name}-${version}.jar`;
        
        let baseUrl = lib.url || 'https://libraries.minecraft.net/';
        if (!baseUrl.endsWith('/')) baseUrl += '/';
        
        return {
          name: lib.name,
          downloads: {
            artifact: {
              path: pathStr,
              url: baseUrl + pathStr
            }
          }
        };
      });
    }

    // 1. Создаем папку версии и сохраняем JSON
    const versionDir = path.join(gameDir, 'versions', profileId);
    fs.mkdirSync(versionDir, { recursive: true });
    fs.writeFileSync(path.join(versionDir, `${profileId}.json`), JSON.stringify(versionInfo, null, 2), 'utf8');
    
    // 2. Распаковываем universal jar
    const forgeLibName = installProfile.install.path; // net.minecraftforge:forge:1.7.10-10.13.4.1558-1.7.10
    const parts = forgeLibName.split(':');
    const group = parts[0].replace(/\./g, '/');
    const name = parts[1];
    const version = parts[2];
    
    const targetJarPath = path.join(gameDir, 'libraries', group, name, version, `${name}-${version}.jar`);
    fs.mkdirSync(path.dirname(targetJarPath), { recursive: true });
    
    const entryName = installProfile.install.filePath; // forge-1.7.10-10.13.4.1558-1.7.10-universal.jar
    const entry = zip.getEntry(entryName);
    if (entry) {
      fs.writeFileSync(targetJarPath, zip.readFile(entry));
      console.log(`[ForgeInstaller] Распакован универсальный jar Forge по пути: ${targetJarPath}`);
    } else {
      console.warn(`[ForgeInstaller] Предупреждение: не найден ${entryName} внутри инсталлятора.`);
    }
    
    console.log(`[ForgeInstaller] Успешная программная установка старого Forge ${profileId}!`);
    return profileId;
  }

  // Если это новый Forge (нет versionInfo, используем CLI --installClient)
  console.log('[ForgeInstaller] Обнаружен новый формат Forge. Запуск официального CLI установщика...');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('launch-progress', { 
      type: 'forge', 
      task: 1, 
      total: 2,
      desc: currentLang === 'ru' ? 'Установка Forge через Java...' : 'Installing Forge via Java...' 
    });
  }

  const javaManager = require('./java-manager');
  const javaPath = await javaManager.findOrPrepareJava(mcVersion, gameDir, mainWindow);

  // Создаем или перезаписываем пустой launcher_profiles.json, чтобы инсталлятор Forge не падал
  const profilesPath = path.join(gameDir, 'launcher_profiles.json');
  const needsWrite = !fs.existsSync(profilesPath) || fs.statSync(profilesPath).size < 100;
  if (needsWrite) {
    try {
      const globalProfilesPath = path.join(process.env.APPDATA, '.minecraft', 'launcher_profiles.json');
      if (fs.existsSync(globalProfilesPath)) {
        fs.copyFileSync(globalProfilesPath, profilesPath);
        console.log(`[ForgeInstaller] Скопирован валидный launcher_profiles.json из .minecraft`);
      } else {
        fs.writeFileSync(profilesPath, JSON.stringify({ profiles: {}, settings: {}, version: 3 }, null, 2), 'utf8');
        console.log(`[ForgeInstaller] Создан фиктивный launcher_profiles.json с версией 3`);
      }
    } catch (e) {
      console.error('[ForgeInstaller] Ошибка подготовки launcher_profiles.json:', e);
    }
  }

  const { exec } = require('child_process');
  return new Promise((resolve, reject) => {
    const cmd = `"${javaPath}" -jar "${installerPath}" --installClient "${gameDir}"`;
    console.log(`[ForgeInstaller] Выполнение команды: ${cmd}`);
    
    exec(cmd, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
      console.log('[ForgeInstaller stdout]:', stdout);
      console.error('[ForgeInstaller stderr]:', stderr);
      
      if (error) {
        reject(new Error(`Ошибка установки Forge: ${error.message}`));
        return;
      }
      
      const versionsDir = path.join(gameDir, 'versions');
      if (!fs.existsSync(versionsDir)) {
        reject(new Error('Папка versions не найдена после установки Forge.'));
        return;
      }
      const dirs = fs.readdirSync(versionsDir);
      const forgeDir = dirs.find(d => 
        d.toLowerCase().includes('forge') && 
        d.includes(mcVersion) && 
        d.includes(resolvedForgeVersion)
      );
      
      if (forgeDir) {
        console.log(`[ForgeInstaller] Обнаружен установленный профиль Forge: ${forgeDir}`);
        resolve(forgeDir);
      } else {
        const fallbackForgeDir = dirs.find(d => 
          d.toLowerCase().includes('forge') && 
          d.includes(mcVersion)
        );
        if (fallbackForgeDir) {
          console.log(`[ForgeInstaller] Обнаружен профиль Forge (fallback): ${fallbackForgeDir}`);
          resolve(fallbackForgeDir);
        } else {
          reject(new Error('Не удалось найти установленный Forge в папке versions.'));
        }
      }
    });
  });
}

module.exports = {
  setupFabricOptimized,
  downloadSingleMod,
  installModpack,
  installFabricProfileForVersion,
  installLocalZip,
  downloadFileWithProgress,
  downloadForgeInstaller,
  installForge
};
