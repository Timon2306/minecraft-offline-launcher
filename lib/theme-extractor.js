const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');

const DEFAULT_ASSETS = [
  { name: 'minecraft.png', url: 'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.12.2/assets/minecraft/textures/gui/title/minecraft.png' },
  { name: 'widgets.png', url: 'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.12.2/assets/minecraft/textures/gui/widgets.png' },
  { name: 'dirt.png', url: 'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.12.2/assets/minecraft/textures/blocks/dirt.png' },
  { name: 'minecraft.ttf', url: 'https://github.com/google/fonts/raw/main/ofl/pressstart2p/PressStart2P-Regular.ttf' },
  ...Array.from({ length: 6 }, (_, i) => ({
    name: `panorama_${i}.png`,
    url: `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.12.2/assets/minecraft/textures/gui/title/background/panorama_${i}.png`
  }))
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Status ${res.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve());
      });
    }).on('error', (err) => {
      if (fs.existsSync(dest)) {
        try { fs.unlinkSync(dest); } catch (e) {}
      }
      reject(err);
    });
  });
}

/**
 * Обеспечивает наличие дефолтных ассетов Minecraft темы в папке кэша
 */
async function ensureDefaultTheme(gameDir) {
  const themeDir = path.join(gameDir, 'theme', 'default');
  if (!fs.existsSync(themeDir)) {
    fs.mkdirSync(themeDir, { recursive: true });
  }

  // Проверяем, все ли файлы скачаны и имеют нормальный размер
  let missingAny = false;
  for (const asset of DEFAULT_ASSETS) {
    const filePath = path.join(themeDir, asset.name);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 100) {
      missingAny = true;
      break;
    }
  }

  if (!missingAny) {
    return themeDir;
  }

  console.log('[ThemeExtractor] Дефолтная тема отсутствует или неполная. Скачивание на лету...');
  
  for (const asset of DEFAULT_ASSETS) {
    const filePath = path.join(themeDir, asset.name);
    try {
      await downloadFile(asset.url, filePath);
      console.log(`[ThemeExtractor] Успешно скачан ассет: ${asset.name}`);
    } catch (err) {
      console.error(`[ThemeExtractor] Ошибка скачивания ${asset.name}:`, err.message);
      // Если это критический файл, прокидываем ошибку
      if (asset.name === 'widgets.png' || asset.name === 'minecraft.png') {
        throw new Error(`Не удалось скачать базовые текстуры темы: ${err.message}`);
      }
    }
  }

  return themeDir;
}

/**
 * Возвращает дефолтную тему в Base64
 */
async function getDefaultTheme(gameDir) {
  try {
    const themeDir = await ensureDefaultTheme(gameDir);
    const result = {
      hasJar: false, // Флаг того, что это дефолтная тема (из кэша, а не из jar)
      panorama: [],
      logo: null,
      widgets: null,
      buttonNormal: null,
      buttonHighlight: null,
      dirt: null,
      font: null
    };

    // Читаем файлы
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
    console.error('[ThemeExtractor] Не удалось загрузить дефолтную тему:', err);
    return { hasJar: false, error: err.message };
  }
}

/**
 * Извлекает ассеты оформления из .jar файла версии Minecraft и возвращает их в Base64.
 * Если версия не скачана или не содержит нужных файлов, возвращает дефолтную тему.
 */
async function extractVersionTheme(gameDir, versionId) {
  try {
    if (!versionId) {
      return await getDefaultTheme(gameDir);
    }

    const jarPath = path.join(gameDir, 'versions', versionId, `${versionId}.jar`);
    if (!fs.existsSync(jarPath)) {
      console.log(`[ThemeExtractor] JAR не найден для ${versionId}. Отдаем дефолтную тему.`);
      return await getDefaultTheme(gameDir);
    }

    console.log(`[ThemeExtractor] Извлечение темы из ${versionId}.jar...`);
    const zip = new AdmZip(jarPath);
    
    // Получаем шрифт из дефолтной темы в любом случае (чтобы не дублировать в jar)
    const defaultTheme = await getDefaultTheme(gameDir);
    
    const result = {
      hasJar: true,
      panorama: [],
      logo: null,
      widgets: null,
      buttonNormal: null,
      buttonHighlight: null,
      dirt: null,
      font: defaultTheme.font // Используем скачанный TTF шрифт
    };

    // 1. Извлекаем панораму
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
    for (const file of panoramaFiles) {
      const entry = zip.getEntry(panoramaBaseDir + file);
      if (entry) {
        result.panorama.push(`data:image/png;base64,${entry.getData().toString('base64')}`);
        hasPanorama = true;
      }
    }

    if (!hasPanorama) {
      console.log('[ThemeExtractor] Панорама не найдена в JAR. Ищем текстуру земли...');
      let dirtEntry = zip.getEntry('assets/minecraft/textures/block/dirt.png');
      if (!dirtEntry) {
        dirtEntry = zip.getEntry('assets/minecraft/textures/blocks/dirt.png');
      }
      if (dirtEntry) {
        result.dirt = `data:image/png;base64,${dirtEntry.getData().toString('base64')}`;
      }
    }

    // 2. Извлекаем логотип
    const logoEntry = zip.getEntry('assets/minecraft/textures/gui/title/minecraft.png');
    if (logoEntry) {
      result.logo = `data:image/png;base64,${logoEntry.getData().toString('base64')}`;
    } else {
      result.logo = defaultTheme.logo;
    }

    // 3. Извлекаем кнопки
    const widgetsEntry = zip.getEntry('assets/minecraft/textures/gui/widgets.png');
    if (widgetsEntry) {
      result.widgets = `data:image/png;base64,${widgetsEntry.getData().toString('base64')}`;
    } else {
      // Если в JAR нет widgets.png, откатываемся на дефолтные widgets.png
      result.widgets = defaultTheme.widgets;
    }

    return result;
  } catch (err) {
    console.error('[ThemeExtractor] Ошибка парсинга темы, откат к дефолтной:', err);
    return await getDefaultTheme(gameDir);
  }
}

module.exports = {
  extractVersionTheme
};
