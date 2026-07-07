const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/**
 * Проверяет, должна ли эта версия Minecraft иметь 3D-панораму в меню.
 * Версии старше 1.7.10 (например, 1.5.2) используют грязевую текстуру (dirt).
 */
function shouldHavePanorama(versionId) {
  if (!versionId) return true;
  const id = versionId.toLowerCase();
  
  // Проверяем явные префиксы старых версий
  if (id.startsWith('1.0') || id.startsWith('1.1') || id.startsWith('1.2') || 
      id.startsWith('1.3') || id.startsWith('1.4') || id.startsWith('1.5') || 
      id.startsWith('1.6') || id.includes('alpha') || id.includes('beta') || 
      id.includes('classic') || id.includes('infdev')) {
      
    // Исключения для современных версий (1.20, 1.21, 1.10 - 1.19)
    if (id.startsWith('1.20') || id.startsWith('1.21') || id.startsWith('1.22')) {
      return true;
    }
    if (id.startsWith('1.10') || id.startsWith('1.11') || id.startsWith('1.12') || 
        id.startsWith('1.13') || id.startsWith('1.14') || id.startsWith('1.15') || 
        id.startsWith('1.16') || id.startsWith('1.17') || id.startsWith('1.18') || 
        id.startsWith('1.19')) {
      return true;
    }
    return false;
  }
  return true;
}

/**
 * Возвращает дефолтную тему в Base64 из локальных ресурсов лаунчера
 */
async function getDefaultTheme() {
  try {
    const themeDir = path.join(__dirname, '..', 'src', 'assets', 'default_theme');
    const result = {
      hasJar: false,
      panorama: [],
      logo: null,
      widgets: null,
      buttonNormal: null,
      buttonHighlight: null,
      dirt: null,
      font: null
    };

    // Читаем локальные файлы
    const logoPath = path.join(themeDir, 'minecraft.png');
    if (fs.existsSync(logoPath)) {
      result.logo = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
    }

    const widgetsPath = path.join(themeDir, 'widgets.png');
    if (fs.existsSync(widgetsPath)) {
      result.widgets = `data:image/png;base64,${fs.readFileSync(widgetsPath).toString('base64')}`;
    }

    const dirtPath = path.join(themeDir, 'dirt.png');
    if (fs.existsSync(dirtPath)) {
      result.dirt = `data:image/png;base64,${fs.readFileSync(dirtPath).toString('base64')}`;
    }

    const fontPath = path.join(themeDir, 'minecraft.ttf');
    if (fs.existsSync(fontPath)) {
      result.font = `data:application/x-font-ttf;base64,${fs.readFileSync(fontPath).toString('base64')}`;
    }

    for (let i = 0; i < 6; i++) {
      const pPath = path.join(themeDir, `panorama_${i}.png`);
      if (fs.existsSync(pPath)) {
        result.panorama.push(`data:image/png;base64,${fs.readFileSync(pPath).toString('base64')}`);
      }
    }

    return result;
  } catch (err) {
    console.error('[ThemeExtractor] Не удалось загрузить дефолтную тему из ресурсов:', err);
    return { hasJar: false, error: err.message };
  }
}

/**
 * Находит JAR-файл в папке версии (поддерживает стандартное имя, minecraft.jar, forge.jar, client.jar)
 */
function findJarPath(gameDir, versionId) {
  const versionFolder = path.join(gameDir, 'versions', versionId);
  if (!fs.existsSync(versionFolder)) return null;

  const standardJar = path.join(versionFolder, `${versionId}.jar`);
  if (fs.existsSync(standardJar)) return standardJar;

  const altJars = ['minecraft.jar', 'forge.jar', 'client.jar'];
  for (const alt of altJars) {
    const altPath = path.join(versionFolder, alt);
    if (fs.existsSync(altPath)) return altPath;
  }
  return null;
}

/**
 * Пробует извлечь ассеты напрямую из Mojang assets/objects по индексу версии
 */
async function tryExtractFromAssetsIndex(gameDir, versionId) {
  try {
    const versionJsonPath = path.join(gameDir, 'versions', versionId, `${versionId}.json`);
    if (!fs.existsSync(versionJsonPath)) return null;

    const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
    let assetsIndexId = versionJson.assets || (versionJson.assetIndex && versionJson.assetIndex.id);
    if (!assetsIndexId) return null;

    let indexPath = path.join(gameDir, 'assets', 'indexes', `${assetsIndexId}.json`);
    if (!fs.existsSync(indexPath)) {
      // Некоторые лаунчеры сохраняют индекс под именем версии (например, 1.21.4.json вместо 19.json)
      indexPath = path.join(gameDir, 'assets', 'indexes', `${versionId}.json`);
      if (!fs.existsSync(indexPath)) return null;
    }

    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const objects = index.objects;
    if (!objects) return null;

    const panoramaFiles = [
      'minecraft/textures/gui/title/background/panorama_0.png',
      'minecraft/textures/gui/title/background/panorama_1.png',
      'minecraft/textures/gui/title/background/panorama_2.png',
      'minecraft/textures/gui/title/background/panorama_3.png',
      'minecraft/textures/gui/title/background/panorama_4.png',
      'minecraft/textures/gui/title/background/panorama_5.png'
    ];

    const result = {
      panorama: [],
      logo: null,
      widgets: null,
      dirt: null
    };

    let hasPanorama = true;
    for (const key of panoramaFiles) {
      if (!objects[key]) {
        hasPanorama = false;
        break;
      }
      const hash = objects[key].hash;
      const fileDir = hash.substring(0, 2);
      const filePath = path.join(gameDir, 'assets', 'objects', fileDir, hash);
      if (!fs.existsSync(filePath)) {
        hasPanorama = false;
        break;
      }
      result.panorama.push(`data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`);
    }

    if (!hasPanorama) {
      result.panorama = [];
    }

    const widgetsKey = 'minecraft/textures/gui/widgets.png';
    if (objects[widgetsKey]) {
      const hash = objects[widgetsKey].hash;
      const filePath = path.join(gameDir, 'assets', 'objects', hash.substring(0, 2), hash);
      if (fs.existsSync(filePath)) {
        result.widgets = `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`;
      }
    }

    const dirtKeys = [
      'minecraft/textures/block/dirt.png',
      'minecraft/textures/blocks/dirt.png'
    ];
    for (const key of dirtKeys) {
      if (objects[key]) {
        const hash = objects[key].hash;
        const filePath = path.join(gameDir, 'assets', 'objects', hash.substring(0, 2), hash);
        if (fs.existsSync(filePath)) {
          result.dirt = `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`;
          break;
        }
      }
    }

    const logoKey = 'minecraft/textures/gui/title/minecraft.png';
    if (objects[logoKey]) {
      const hash = objects[logoKey].hash;
      const filePath = path.join(gameDir, 'assets', 'objects', hash.substring(0, 2), hash);
      if (fs.existsSync(filePath)) {
        result.logo = `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`;
      }
    }

    return result;
  } catch (err) {
    console.error('[ThemeExtractor] Ошибка поиска ресурсов в assets index:', err);
    return null;
  }
}

/**
 * Рекурсивно разрешает базовую версию (ванильную) для кастомных профилей (Forge, Fabric, Сборки)
 */
function resolveBaseVersion(gameDir, versionId) {
  let currentId = versionId;
  let maxDepth = 10;
  while (maxDepth > 0) {
    const versionJsonPath = path.join(gameDir, 'versions', currentId, `${currentId}.json`);
    if (!fs.existsSync(versionJsonPath)) {
      return currentId;
    }
    try {
      const json = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
      if (json.inheritsFrom) {
        currentId = json.inheritsFrom;
      } else {
        return currentId;
      }
    } catch (e) {
      return currentId;
    }
    maxDepth--;
  }
  return currentId;
}

const { app } = require('electron');

const getCachePath = (versionId) => {
  const baseDir = app && app.getPath
    ? path.join(app.getPath('userData'), 'theme-cache')
    : path.join(process.env.APPDATA || process.env.USERPROFILE || '', 'theme-cache');
  return path.join(baseDir, `${versionId}.json`);
};

/**
 * Извлекает ассеты оформления из .jar файла или папки assets/objects и возвращает их в Base64.
 * Если версия не скачана или не содержит нужных файлов, возвращает дефолтную тему.
 */
async function extractVersionTheme(gameDir, versionId) {
  const cleanId = versionId || 'default';
  const cachePath = getCachePath(cleanId);

  // 1. Попытка прочесть тему из кэша
  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      console.log(`[ThemeExtractor] Возвращаем оформление из кэша для: ${cleanId}`);
      return cached;
    } catch (e) {
      console.error('[ThemeExtractor] Ошибка чтения кэша темы:', e);
    }
  }

  // 2. Если кэша нет — извлекаем
  try {
    if (!versionId) {
      return await getDefaultTheme();
    }

    const defaultTheme = await getDefaultTheme();
    
    const result = {
      hasJar: false,
      panorama: [],
      logo: null,
      widgets: null,
      buttonNormal: null,
      buttonHighlight: null,
      dirt: null,
      font: defaultTheme.font
    };

    const baseVersionId = resolveBaseVersion(gameDir, versionId);

    const indexAssets = await tryExtractFromAssetsIndex(gameDir, baseVersionId);
    if (indexAssets) {
      if (indexAssets.panorama && indexAssets.panorama.length === 6) {
        result.panorama = indexAssets.panorama;
        result.hasJar = true;
      }
      if (indexAssets.logo) result.logo = indexAssets.logo;
      if (indexAssets.widgets) result.widgets = indexAssets.widgets;
      if (indexAssets.dirt) result.dirt = indexAssets.dirt;
    }

    if (result.panorama.length === 0) {
      const jarPath = findJarPath(gameDir, baseVersionId);
      if (jarPath) {
        console.log(`[ThemeExtractor] Извлечение темы из JAR: ${jarPath}`);
        const zip = new AdmZip(jarPath);
        
        let hasPanorama = false;
        const panoramaFiles = [
          'panorama_0.png',
          'panorama_1.png',
          'panorama_2.png',
          'panorama_3.png',
          'panorama_4.png',
          'panorama_5.png'
        ];

        const panoramaBaseDir = 'assets/minecraft/textures/gui/title/background/';
        const extractedPanorama = [];
        for (const file of panoramaFiles) {
          const entry = zip.getEntry(panoramaBaseDir + file);
          if (entry) {
            const data = entry.getData();
            if (data.length > 1000) {
              extractedPanorama.push(`data:image/png;base64,${data.toString('base64')}`);
            }
          }
        }

        if (extractedPanorama.length === 6) {
          result.panorama = extractedPanorama;
          result.hasJar = true;
          hasPanorama = true;
        }

        if (!result.logo) {
          const logoEntry = zip.getEntry('assets/minecraft/textures/gui/title/minecraft.png');
          if (logoEntry && logoEntry.getData().length > 1000) {
            result.logo = `data:image/png;base64,${logoEntry.getData().toString('base64')}`;
          }
        }

        if (!result.widgets) {
          const widgetsEntry = zip.getEntry('assets/minecraft/textures/gui/widgets.png');
          if (widgetsEntry && widgetsEntry.getData().length > 1000) {
            result.widgets = `data:image/png;base64,${widgetsEntry.getData().toString('base64')}`;
          }
        }

        if (!hasPanorama && !result.dirt) {
          let dirtEntry = zip.getEntry('assets/minecraft/textures/block/dirt.png') ||
                            zip.getEntry('assets/minecraft/textures/blocks/dirt.png');
          if (dirtEntry && dirtEntry.getData().length > 1000) {
            result.dirt = `data:image/png;base64,${dirtEntry.getData().toString('base64')}`;
          }
        }
      }
    }

    if (result.panorama.length === 0) {
      if (shouldHavePanorama(versionId)) {
        console.log('[ThemeExtractor] Панорама не найдена, но версия современная. Откатываемся на дефолтную панораму.');
        result.panorama = defaultTheme.panorama;
        result.hasJar = false;
      } else {
        console.log('[ThemeExtractor] Панорама не найдена, версия старая. Проверяем грязь...');
        if (!result.dirt) {
          result.dirt = defaultTheme.dirt;
        }
      }
    }

    if (!result.logo) result.logo = defaultTheme.logo;
    if (!result.widgets) result.widgets = defaultTheme.widgets;

    // 3. Кэшируем только если нашли реальные ассеты версии (не фоллбек)
    if (result.hasJar) {
      try {
        const parent = path.dirname(cachePath);
        if (!fs.existsSync(parent)) {
          fs.mkdirSync(parent, { recursive: true });
        }
        fs.writeFileSync(cachePath, JSON.stringify(result), 'utf8');
        console.log(`[ThemeExtractor] Тема успешно кэширована для: ${cleanId}`);
      } catch (cacheErr) {
        console.error('[ThemeExtractor] Ошибка сохранения темы в кэш:', cacheErr);
      }
    } else {
      console.log(`[ThemeExtractor] Ассеты версии ${cleanId} ещё не скачаны, кэш не сохранен.`);
    }

    return result;
  } catch (err) {
    console.error('[ThemeExtractor] Ошибка парсинга темы, откат к дефолтной:', err);
    return await getDefaultTheme();
  }
}

module.exports = {
  extractVersionTheme
};
