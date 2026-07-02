// ============================================
// main.js — Electron Main Process
// Minecraft Launcher — Главный процесс
// ============================================

// --- Перехват консоли для предотвращения кракозябр (трансляция логов на английский) ---
(function overrideConsole() {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  const translationDict = {
    "Конфиг успешно загружен с диска.": "Config successfully loaded from disk.",
    "Файл настроек отсутствует. Создание дефолтного...": "Config file missing. Creating default...",
    "Ошибка чтения/парсинга файла настроек. Используются дефолты.": "Error reading/parsing config file. Using defaults.",
    "Не удалось сохранить настройки:": "Failed to save config:",
    "Не удалось создать игровую папку:": "Failed to create game directory:",
    "Настройки сохранены:": "Config saved:",
    "Загрузка списка версий из API Mojang...": "Loading version list from Mojang API...",
    "Список версий кэширован локально.": "Version list cached locally.",
    "Определена версия": "Detected version",
    "по наличию": "by presence of",
    "Найдена сборка": "Found custom instance",
    "Скачивание обновления из": "Downloading update from",
    "Скачивание завершено, файл закрыт. Запуск установщика...": "Download finished, file closed. Starting installer...",
    "Некорректное название сборки": "Invalid instance name",
    "Используем стабильную версию Fabric": "Using stable Fabric version",
    "Создана новая сборка модов:": "New custom instance created:",
    "Ошибка при создании сборки:": "Error creating custom instance:",
    "Начало установки встроенной сборки": "Starting installation of built-in instance",
    "Скачивание одиночного мода": "Downloading single mod",
    "Ошибка парсинга JSON версии при скачивании мода:": "Error parsing version JSON while downloading mod:",
    "Моды можно скачивать только для сборок": "Mods can only be downloaded for custom instances",
    "Нельзя скачивать моды для чистой ванильной версии.": "Cannot download mods for clean vanilla version.",
    "Ошибка скачивания:": "Download error:",
    "Ошибка при получении деталей версии:": "Error getting version details:",
    "Ошибка импорта сборки:": "Error importing instance:",
    "Успешно скачан установщик Forge": "Successfully downloaded Forge installer",
    "Не удалось скачать по адресу": "Failed to download from",
    "Открытие локального архива:": "Opening local archive:",
    "Обнаружен локальный Modrinth-модпак": "Detected local Modrinth modpack",
    "Начало установки...": "Starting installation...",
    "Извлечение overrides...": "Extracting overrides...",
    "Создан профиль Modrinth версии:": "Modrinth profile created for version:",
    "Обнаружен обычный ZIP-архив. Поиск CurseForge манифеста...": "Detected standard ZIP. Searching for CurseForge manifest...",
    "Обнаружена CurseForge сборка модов!": "CurseForge instance detected!",
    "Найдено модов для скачивания:": "Found mods to download:",
    "Ошибка загрузки мода": "Error loading mod",
    "Создан кастомный профиль версии:": "Custom profile created for version:",
    "Импорт кастомной сборки в:": "Importing custom instance to:",
    "успешно импортирована.": "successfully imported.",
    "Ошибка импорта локального архива:": "Error importing local archive:",
    "Чтение структуры инсталлятора Forge": "Reading Forge installer structure",
    "Не удалось прочитать install_profile.json": "Failed to read install_profile.json",
    "Обнаружен старый формат Forge. Выполняем быструю программную установку...": "Detected old Forge format. Running quick programmatic installation...",
    "Запуск игры...": "Launching game...",
    "Попытка запуска:": "Attempting to launch:",
    "Игра запущена!": "Game launched!",
    "Ошибка при запуске игры:": "Error launching game:",
    "Игра закрыта с кодом:": "Game closed with code:",
    "Игра закрылась менее чем через 15 секунд": "Game closed in less than 15 seconds",
    "Краш-репорт не найден.": "Crash report not found.",
    "Игра закрылась корректно или краш-репорт не требуется.": "Game closed correctly or crash report is not required.",
    "Обнаружен файл краш-репорта:": "Crash report file detected:",
    "Содержимое краш-репорта отправлено в рендерер.": "Crash report content sent to renderer.",
    "Не удалось прочитать файл краш-репорта:": "Failed to read crash report file:",
    "Не удалось найти краш-репорты в папке crash-reports": "Failed to find crash reports in crash-reports folder",
    "Папка игры не существует:": "Game folder does not exist:",
    "Ошибка при открытии папки игры:": "Error opening game folder:",
    "Ошибка при открытии внешней ссылки:": "Error opening external link:"
  };

  const rus = {
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo', 'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch', 'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };

  function translateAndTransliterate(val) {
    if (typeof val !== 'string') return val;
    
    let text = val;
    for (const [key, value] of Object.entries(translationDict)) {
      text = text.replace(new RegExp(key, 'g'), value);
    }
    
    return text.split('').map(char => rus[char] !== undefined ? rus[char] : char).join('');
  }

  function processArgs(args) {
    return Array.from(args).map(arg => {
      if (typeof arg === 'string') {
        return translateAndTransliterate(arg);
      }
      if (arg instanceof Error) {
        return `${arg.name}: ${translateAndTransliterate(arg.message)}`;
      }
      return arg;
    });
  }

  console.log = function() { originalLog.apply(console, processArgs(arguments)); };
  console.warn = function() { originalWarn.apply(console, processArgs(arguments)); };
  console.error = function() { originalError.apply(console, processArgs(arguments)); };
})();

const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');

// Модули лаунчера
const configManager = require('./lib/config-manager');
const versionManager = require('./lib/version-manager');
const launcherCore = require('./lib/launcher-core');

let mainWindow = null;
let tray = null;

// --- Создание главного окна ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 650,
    frame: false,           // Без стандартной рамки ОС
    resizable: false,
    transparent: false,
    show: true,             // Показываем сразу для отладки
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, 'src', 'icon.png'), // Установка иконки окна
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Открыть DevTools в режиме разработки
  if (process.argv.includes('--enable-logging')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- IPC: Управление окном (кастомный тайтлбар) ---
ipcMain.on('window-minimize', () => {
  if (mainWindow) {
    mainWindow.hide(); // Полностью скрываем окно (убирает с панели задач в трей)
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('window-restore', () => {
  if (mainWindow) {
    mainWindow.show(); // Показываем окно обратно
    mainWindow.focus();
  }
});

// --- IPC: Открытие папки игры ---
ipcMain.on('open-folder', () => {
  const { shell } = require('electron');
  const fs = require('fs');
  try {
    const config = configManager ? configManager.getConfig() : {};
    const gameDir = config.gameDirectory;
    if (gameDir && fs.existsSync(gameDir)) {
      shell.openPath(gameDir);
    } else {
      console.warn('[IPC] Папка игры не существует:', gameDir);
    }
  } catch (err) {
    console.error('[IPC] Ошибка при открытии папки игры:', err);
  }
});

// --- IPC: Открытие внешних ссылок в браузере ---
ipcMain.on('open-external', (event, url) => {
  const { shell } = require('electron');
  try {
    shell.openExternal(url);
  } catch (err) {
    console.error('[IPC] Ошибка при открытии внешней ссылки:', err);
  }
});

// --- IPC: Конфигурация (заглушки, реализация в Этапе 5) ---
ipcMain.handle('get-config', async () => {
  if (configManager) {
    const conf = configManager.getConfig();
    const { app } = require('electron');
    conf.appVersion = app.getVersion();
    return conf;
  }
  return {};
});

ipcMain.handle('save-config', async (event, data) => {
  if (configManager) return configManager.saveConfig(data);
  return data;
});

ipcMain.handle('select-directory', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('download-app-update', async (event, { url }) => {
  const os = require('os');
  const fs = require('fs');
  const https = require('https');
  const { spawn } = require('child_process');
  
  const destPath = path.join(os.tmpdir(), 'minecraft-offline-launcher-setup.exe');
  if (fs.existsSync(destPath)) {
    try { fs.unlinkSync(destPath); } catch(e){}
  }
  
  console.log(`[Updater] Скачивание обновления из ${url} в ${destPath}...`);
  
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const options = {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 30000
    };
    
    function download(downloadUrl) {
      https.get(downloadUrl, options, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          download(res.headers.location);
          return;
        }
        
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          reject(new Error(`Server status ${res.statusCode}`));
          return;
        }
        
        const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
        let downloadedBytes = 0;
        
        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const percent = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-progress', {
              filename: 'Обновление лаунчера',
              percent: percent,
              downloadedMb: (downloadedBytes / 1024 / 1024).toFixed(1),
              totalMb: (totalBytes / 1024 / 1024).toFixed(1),
              speedMb: 0,
              timeLeftSec: -1
            });
          }
        });
        
        res.pipe(file);
        
        file.on('close', () => {
          console.log('[Updater] Скачивание завершено, файл закрыт. Запуск установщика...');
          
          // Запускаем установщик в отдельном процессе
          const child = spawn(destPath, [], {
            detached: true,
            stdio: 'ignore'
          });
          child.unref();
          
          // Немедленно выходим из приложения
          const { app } = require('electron');
          app.exit(0);
        });
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(err);
      });
    }
    
    download(url);
  });
});

// --- IPC: Версии (заглушка, реализация в Этапе 4) ---
ipcMain.handle('get-versions', async () => {
  if (versionManager) return versionManager.getVersions();
  return { latest: { release: '1.20.4', snapshot: '1.20.4' }, versions: [] };
});

// --- IPC: Запуск игры (заглушка, реализация в Этапе 6) ---
ipcMain.handle('launch-game', async (event, options) => {
  console.log('[IPC] launch-game', options);
  if (launcherCore) {
    const config = configManager ? configManager.getConfig() : {};
    const mergedOptions = { ...config, ...options };
    return launcherCore.launchMinecraft(mergedOptions, mainWindow);
  }
  return { status: 'not-implemented' };
});

// --- IPC: Создание собственной сборки модов ---
ipcMain.handle('create-instance', async (event, { name, mcVersion, loaderType }) => {
  console.log('[IPC] create-instance', name, mcVersion, loaderType);
  const fs = require('fs');
  try {
    const config = configManager ? configManager.getConfig() : {};
    const gameDir = config.gameDirectory;

    // 1. Валидация и формирование ID сборки
    const safeName = name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '-');
    if (!safeName) throw new Error('Некорректное название сборки');

    const versionId = `${safeName}-${mcVersion}`;
    const instanceDir = path.join(gameDir, 'instances', versionId);
    fs.mkdirSync(instanceDir, { recursive: true });
    fs.mkdirSync(path.join(instanceDir, 'mods'), { recursive: true });
    fs.mkdirSync(path.join(instanceDir, 'config'), { recursive: true });

    // 2. Определение версий загрузчиков
    let inheritsFromVersion = mcVersion;
    let loaderVersion = '';

    if (loaderType === 'fabric') {
      loaderVersion = '0.16.9'; // Используем стабильную версию Fabric
      const fabricManager = require('./lib/fabric-manager');
      // Устанавливаем Fabric профиль в versions/
      const fabricVerId = await fabricManager.installFabricProfileForVersion(gameDir, mcVersion, loaderVersion);
      inheritsFromVersion = fabricVerId;
    } else if (loaderType === 'forge') {
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
      loaderVersion = DEFAULT_FORGE_VERSIONS[mcVersion] || '';
      if (!loaderVersion && mcVersion.startsWith('1.20.')) loaderVersion = '47.2.20';
      if (!loaderVersion) {
        throw new Error(`Автоматическая установка Forge для версии ${mcVersion} пока не поддерживается. Пожалуйста, используйте чистую ваниллу или Fabric.`);
      }
    }

    // 3. Создаем наследуемый JSON-профиль версии в versions/
    const versionFolder = path.join(gameDir, 'versions', versionId);
    fs.mkdirSync(versionFolder, { recursive: true });
    const jsonPath = path.join(versionFolder, `${versionId}.json`);

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
    console.log(`[LauncherCore] Создана новая сборка модов: ${versionId} (${loaderType})`);

    // 4. Переключаем на созданную сборку в конфиге
    config.selectedVersion = versionId;
    config.selectedVersionType = 'custom';
    configManager.saveConfig(config);

    return { status: 'success', versionId };
  } catch (err) {
    console.error('[IPC] Ошибка при создании сборки:', err);
    throw err;
  }
});

// --- IPC: Скачивание мода/сборки с Modrinth ---
ipcMain.handle('download-mod', async (event, { projectId, type }) => {
  console.log('[IPC] download-mod', projectId, type);
  try {
    const fs = require('fs');
    const fabricManager = require('./lib/fabric-manager');
    const config = configManager ? configManager.getConfig() : {};
    const gameDir = config.gameDirectory;
    
    let filename = '';
    if (projectId === 'optimized-fabric-1.20.4') {
      console.log('[IPC] Начало установки встроенной сборки Optimized Fabric 1.20.4...');
      const customVersionId = await fabricManager.setupFabricOptimized(gameDir, mainWindow);
      
      // Автоматически переключаем выбранную версию на свежеустановленную
      config.selectedVersion = customVersionId;
      config.selectedVersionType = 'custom';
      configManager.saveConfig(config);
      
      filename = '1.20.4 Optimized Fabric';
    } else if (type === 'modpack') {
      filename = await fabricManager.installModpack(projectId, gameDir, mainWindow);
    } else {
      // Скачивание одиночного мода
      const selectedVer = config.selectedVersion || 'optimized-fabric-1.20.4';
      let mcVersion = '1.20.4';
      let loaderType = 'fabric';
      let instanceId = '';

      if (selectedVer === 'optimized-fabric-1.20.4') {
        mcVersion = '1.20.4';
        loaderType = 'fabric';
      } else {
        const versionJsonPath = path.join(gameDir, 'versions', selectedVer, `${selectedVer}.json`);
        if (fs.existsSync(versionJsonPath)) {
          try {
            const json = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
            instanceId = selectedVer;
            
            const javaManager = require('./lib/java-manager');
            mcVersion = javaManager.getBaseMinecraftVersion(selectedVer, gameDir);
            
            if (json.modLoader) {
              loaderType = json.modLoader.type || 'vanilla';
            } else if (json.mainClass && json.mainClass.includes('fabric')) {
              loaderType = 'fabric';
            } else if (json.mainClass && json.mainClass.includes('forge')) {
              loaderType = 'forge';
            } else {
              loaderType = 'vanilla';
            }
          } catch (e) {
            console.error('[IPC] Ошибка парсинга JSON версии при скачивании мода:', e);
          }
        } else {
          // Если json не существует на диске (официальная ванилла)
          throw new Error('Моды можно скачивать только для сборок (с Fabric или Forge). Выберите сборку модов в списке версий!');
        }
      }

      if (loaderType === 'vanilla') {
        throw new Error('Нельзя скачивать моды для чистой ванильной версии. Пожалуйста, создайте сборку на Fabric или Forge!');
      }

      filename = await fabricManager.downloadSingleMod(projectId, gameDir, mainWindow, mcVersion, loaderType, instanceId);
    }
    
    return { status: 'success', filename };
  } catch (err) {
    console.error('[IPC] Ошибка скачивания:', err);
    throw err;
  }
});

// --- IPC: Получение детальной информации о конкретной версии ---
ipcMain.handle('get-version-details', async (event, { versionId }) => {
  const fs = require('fs');
  try {
    const config = configManager ? configManager.getConfig() : {};
    const gameDir = config.gameDirectory;

    if (versionId === 'optimized-fabric-1.20.4') {
      return { mcVersion: '1.20.4', loaderType: 'fabric', isCustom: true };
    }

    const versionJsonPath = path.join(gameDir, 'versions', versionId, `${versionId}.json`);
    if (fs.existsSync(versionJsonPath)) {
      const json = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
      const javaManager = require('./lib/java-manager');
      const mcVersion = javaManager.getBaseMinecraftVersion(versionId, gameDir);
      
      let loaderType = 'vanilla';
      if (json.modLoader) {
        loaderType = json.modLoader.type || 'vanilla';
      } else if (json.mainClass && json.mainClass.includes('fabric')) {
        loaderType = 'fabric';
      } else if (json.mainClass && json.mainClass.includes('forge')) {
        loaderType = 'forge';
      }

      return { mcVersion, loaderType, isCustom: true };
    } else {
      return { mcVersion: versionId, loaderType: 'vanilla', isCustom: false };
    }
  } catch (err) {
    console.error('[IPC] Ошибка при получении деталей версии:', err);
    return { mcVersion: versionId, loaderType: 'vanilla', isCustom: false };
  }
});

// --- IPC: Импорт сборки из локального ZIP/MRPACK файла ---
ipcMain.handle('import-zip', async () => {
  const { dialog } = require('electron');
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите архив сборки модов (.zip или .mrpack)',
      filters: [
        { name: 'Архивы сборок модов', extensions: ['zip', 'mrpack'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { status: 'cancelled' };
    }

    const filePath = result.filePaths[0];
    const fabricManager = require('./lib/fabric-manager');
    const config = configManager ? configManager.getConfig() : {};
    const gameDir = config.gameDirectory;

    const name = await fabricManager.installLocalZip(filePath, gameDir, mainWindow);
    return { status: 'success', name };
  } catch (err) {
    console.error('[IPC] Ошибка импорта сборки:', err);
    throw err;
  }
});

// --- IPC: Удаление кастомной сборки ---
ipcMain.handle('delete-version', async (event, { versionId }) => {
  console.log('[IPC] delete-version', versionId);
  const fs = require('fs');
  
  if (!versionId || versionId.includes('..') || versionId.includes('/') || versionId.includes('\\')) {
    throw new Error('Некорректный ID версии');
  }

  if (versionId === 'optimized-fabric-1.20.4') {
    throw new Error('Нельзя удалить встроенную сборку Optimized Fabric');
  }

  try {
    const config = configManager ? configManager.getConfig() : {};
    const gameDir = config.gameDirectory;
    const versionFolder = path.join(gameDir, 'versions', versionId);

    if (fs.existsSync(versionFolder)) {
      // Удаляем рекурсивно
      fs.rmSync(versionFolder, { recursive: true, force: true });
      console.log(`[VersionManager] Успешно удалена папка версии: ${versionId}`);

      // Если удаленная версия была выбрана в конфиге, сбрасываем ее на дефолтную
      if (config.selectedVersion === versionId) {
        config.selectedVersion = '1.20.4';
        config.selectedVersionType = 'release';
        configManager.saveConfig(config);
      }

      return { status: 'success' };
    } else {
      throw new Error('Папка версии не найдена');
    }
  } catch (err) {
    console.error('[VersionManager] Ошибка удаления версии:', err);
    throw err;
  }
});

// --- IPC: Извлечение ассетов оформления из .jar ---
ipcMain.handle('extract-version-theme', async (event, { versionId }) => {
  console.log('[IPC] extract-version-theme', versionId);
  const themeExtractor = require('./lib/theme-extractor');
  const config = configManager ? configManager.getConfig() : {};
  const gameDir = config.gameDirectory;
  return await themeExtractor.extractVersionTheme(gameDir, versionId);
});

// --- Создание иконки в системном трее ---
function createTray() {
  const iconPath = path.join(__dirname, 'src', 'icon.png');
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Открыть лаунчер', 
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      } 
    },
    { type: 'separator' },
    { 
      label: 'Выход', 
      click: () => {
        app.quit();
      } 
    }
  ]);
  
  tray.setToolTip('Minecraft Offline Launcher');
  tray.setContextMenu(contextMenu);
  
  // При клике на иконку трея показываем/скрываем лаунчер
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    }
  });
}

// --- Обработка ошибок ---
process.on('uncaughtException', (error) => {
  console.error('[FATAL]', error);
});

// --- Запуск приложения ---
app.whenReady().then(() => {
  configManager.loadConfig();
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // Не выходим из приложения автоматически при закрытии всех окон,
  // если хотим держать приложение в фоне. Но так как у нас window-close
  // реально закрывает приложение, оставим обычный выход при закрытии окон:
  app.quit();
});
