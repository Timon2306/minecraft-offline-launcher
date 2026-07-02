// ============================================
// launcher-core.js вЂ” Launcher Logic wrapper
// РћР±С‘СЂС‚РєР° РЅР°Рґ РїР°РєРµС‚РѕРј minecraft-launcher-core
// ============================================

const { Client, Authenticator } = require('minecraft-launcher-core');
const path = require('path');
const fs = require('fs');

/**
 * Р—Р°РїСѓСЃС‚РёС‚СЊ Minecraft
 * @param {object} options 
 * @param {BrowserWindow} mainWindow 
 * @returns {Promise<object>}
 */
/**
 * Рекурсивно удаляет пустые (0 байт) .jar файлы в папке библиотек
 */
function cleanCorruptedLibraries(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      cleanCorruptedLibraries(filePath);
    } else if (stat.isFile() && filePath.endsWith('.jar') && stat.size === 0) {
      try {
        fs.unlinkSync(filePath);
        console.log(`[LauncherCore] Удален поврежденный 0-байт файл: ${filePath}`);
      } catch (e) {
        console.error(`[LauncherCore] Не удалось удалить поврежденный файл ${filePath}:`, e.message);
      }
    }
  }
}


/**
 * Ищет свежий краш-репорт в папке сборки
 */
function getLatestCrashReport(instanceDir) {
  const crashDir = path.join(instanceDir, 'crash-reports');
  if (!fs.existsSync(crashDir)) return null;
  
  try {
    const files = fs.readdirSync(crashDir);
    if (files.length === 0) return null;
    
    const crashFiles = files
      .map(file => ({
        name: file,
        path: path.join(crashDir, file),
        time: fs.statSync(path.join(crashDir, file)).mtimeMs
      }))
      .sort((a, b) => b.time - a.time);
      
    const latest = crashFiles[0];
    // Если файл создан менее 30 секунд назад
    if (Date.now() - latest.time < 30000) {
      const content = fs.readFileSync(latest.path, 'utf8');
      const lines = content.split('\n');
      const descIdx = lines.findIndex(l => l.startsWith('Description:'));
      if (descIdx !== -1) {
        return lines.slice(descIdx, descIdx + 10).join('\n');
      }
      return lines.slice(0, 12).join('\n');
    }
  } catch (e) {
    console.error('[LauncherCore] Ошибка чтения краш-репорта:', e);
  }
  return null;
}

/**
 * Ищет свежий лог падения JVM
 */
function getLatestJvmCrash(instanceDir) {
  if (!fs.existsSync(instanceDir)) return null;
  try {
    const files = fs.readdirSync(instanceDir);
    const jvmLogs = files
      .filter(f => f.startsWith('hs_err_pid') && f.endsWith('.log'))
      .map(file => ({
        name: file,
        path: path.join(instanceDir, file),
        time: fs.statSync(path.join(instanceDir, file)).mtimeMs
      }))
      .sort((a, b) => b.time - a.time);
      
    if (jvmLogs.length > 0) {
      const latest = jvmLogs[0];
      if (Date.now() - latest.time < 30000) {
        const content = fs.readFileSync(latest.path, 'utf8');
        return content.split('\n').slice(0, 8).join('\n');
      }
    }
  } catch (e) {
    console.error('[LauncherCore] Ошибка чтения JVM лога:', e);
  }
  return null;
}

async function launchMinecraft(options, mainWindow) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('[LauncherCore] РџРѕРґРіРѕС‚РѕРІРєР° Рє Р·Р°РїСѓСЃРєСѓ РёРіСЂС‹...');
      console.log('[LauncherCore] РџР°СЂР°РјРµС‚СЂС‹:', {
        nickname: options.nickname,
        versionId: options.versionId,
        versionType: options.versionType,
        ram: options.ram
      });

      // 1. РћС„С„Р»Р°Р№РЅ-Р°РІС‚РѕСЂРёР·Р°С†РёСЏ (UUID РіРµРЅРµСЂРёСЂСѓРµС‚СЃСЏ РїРѕ РЅРёРєСѓ)
      const auth = await Authenticator.getAuth(options.nickname);
      
      // 2. РћРїСЂРµРґРµР»РµРЅРёРµ РґРёСЂРµРєС‚РѕСЂРёРё РёРіСЂС‹
      const gameDir = options.gameDirectory || path.join(process.env.APPDATA, '.minecraft-launcher');

      // Очистка поврежденных 0-байтных библиотек перед запуском
      try {
        cleanCorruptedLibraries(path.join(gameDir, 'libraries'));
      } catch (err) {
        console.error('[LauncherCore] Ошибка при очистке библиотек:', err);
      }

      // 3. Р’С‹РґРµР»РµРЅРёРµ РїР°РјСЏС‚Рё (options.ram С‚РµРїРµСЂСЊ РїСЂРёС…РѕРґРёС‚ РІ РњР‘)
      const maxMem = `${options.ram || 4096}M`;
      // РњРёРЅРёРјР°Р»СЊРЅР°СЏ РїР°РјСЏС‚СЊ вЂ” РїРѕР»РѕРІРёРЅР° РјР°РєСЃРёРјР°Р»СЊРЅРѕР№, РЅРѕ РЅРµ РјРµРЅСЊС€Рµ 1024M
      const minMem = `${Math.max(1024, Math.floor((options.ram || 4096) / 2))}M`;

      // 4. JVM-Р°СЂРіСѓРјРµРЅС‚С‹
      const customJvmArgs = options.jvmArgs 
        ? options.jvmArgs.split(' ').filter(Boolean) 
        : [];

      // 5. РљРѕРЅС„РёРіСѓСЂР°С†РёСЏ Р·Р°РїСѓСЃРєР°
      const launchOpts = {
        authorization: auth,
        root: gameDir,
        version: {
          number: options.versionId,
          type: options.versionType === 'snapshot' ? 'snapshot' : 'release'
        },
        memory: {
          max: maxMem,
          min: minMem
        },
        customArgs: customJvmArgs,
        overrides: {
          maxSockets: 16 // РћРїС‚РёРјР°Р»СЊРЅРѕРµ С‡РёСЃР»Рѕ РїРѕС‚РѕРєРѕРІ, С‡С‚РѕР±С‹ РёР·Р±РµР¶Р°С‚СЊ С‚СЂРѕС‚С‚Р»РёРЅРіР° СЃРµСЂРІРµСЂРѕРІ Mojang
        }
      };

      // РџРµСЂРµРјРµРЅРЅР°СЏ РґР»СЏ С…СЂР°РЅРµРЅРёСЏ СЂРµР°Р»СЊРЅРѕР№ РІРµСЂСЃРёРё MC (РґР»СЏ РІС‹Р±РѕСЂР° Java)
      let resolvedMcVersion = null;

      // 6. РћР±СЂР°Р±РѕС‚РєР° Optimized Fabric РІРµСЂСЃРёРё (С‚РѕР»СЊРєРѕ РґР»СЏ РІСЃС‚СЂРѕРµРЅРЅРѕР№ СЃР±РѕСЂРєРё)
      if (options.versionId === 'optimized-fabric-1.20.4') {
        console.log('[LauncherCore] РћР±РЅР°СЂСѓР¶РµРЅ Р·Р°РїСЂРѕСЃ РЅР° Р·Р°РїСѓСЃРє Optimized Fabric. Р’С‹Р·РѕРІ Fabric Manager...');
        
        let fabricManager;
        try {
          fabricManager = require('./fabric-manager');
        } catch (err) {
          reject(new Error('Fabric Manager РЅРµ РЅР°Р№РґРµРЅ. Р’С‹РїРѕР»РЅРёС‚Рµ Р­С‚Р°Рї 7.'));
          return;
        }

        // Р’С‹РїРѕР»РЅСЏРµРј СѓСЃС‚Р°РЅРѕРІРєСѓ Fabric Рё Sodium
        mainWindow.webContents.send('launch-progress', { type: 'fabric', task: 1, total: 2 });
        const customVersionId = await fabricManager.setupFabricOptimized(gameDir, mainWindow);
        
        // Переопределяем параметры запуска для кастомного профиля Fabric
        launchOpts.version = {
          number: '1.20.4',
          type: 'release',
          custom: customVersionId
        };
      } else if (options.versionType === 'cristalix') {
        const buildName = options.versionId.replace('cristalix-', '');
        let cristaloxDir = path.join(require('os').homedir(), 'Desktop', 'папки', 'cristalox');
        if (!fs.existsSync(cristaloxDir)) {
          const configManager = require('./config-manager');
          const gameDir = configManager.getConfig().gameDirectory;
          cristaloxDir = path.join(gameDir, 'cristalox');
        }
        const buildDir = path.join(cristaloxDir, buildName);

        if (!fs.existsSync(buildDir)) {
          reject(new Error(`Папка сборки Cristalix не найдена по пути: ${buildDir}`));
          return;
        }

        // 1. Автоопределяем версию Minecraft
        let mcVersion = '1.19.2';
        try {
          const versionManager = require('./version-manager');
          mcVersion = versionManager.detectMinecraftVersion(buildDir);
        } catch (e) {
          console.error('[LauncherCore] РћС€РёР±РєР° Р°РІС‚РѕРѕРїСЂРµРґРµР»РµРЅРёСЏ РІРµСЂСЃРёРё, РёСЃРїРѕР»СЊР·СѓРµРј 1.19.2:', e);
        }

        resolvedMcVersion = mcVersion;
        console.log(`[LauncherCore] Запуск Cristalix сборки ${buildName}. Версия MC: ${mcVersion}`);

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
        const forgeVersion = DEFAULT_FORGE_VERSIONS[mcVersion] || '43.3.0';

        // Определяем тип загрузчика (forge или fabric) по наличию модов и имени файлов
        let loaderType = 'forge';
        const modsPath = path.join(buildDir, 'mods');
        const libModsPath = path.join(buildDir, 'libraries', 'mods');
        
        let hasMods = fs.existsSync(modsPath) || fs.existsSync(libModsPath);
        if (hasMods) {
          const checkDirs = [modsPath, libModsPath].filter(d => fs.existsSync(d));
          let foundFabric = false;
          for (const dir of checkDirs) {
            const files = fs.readdirSync(dir);
            if (files.some(f => f.toLowerCase().includes('fabric') || f.toLowerCase().includes('kotlin-fabric'))) {
              foundFabric = true;
              break;
            }
          }
          loaderType = foundFabric ? 'fabric' : 'forge';
        } else {
          // Если папки mods нет, по дефолту используем fabric
          loaderType = 'fabric';
        }

        // Ищем установленный профиль Forge/Fabric для этой версии в versions/
        let targetVersionId = '';
        const versionsDir = path.join(gameDir, 'versions');
        if (fs.existsSync(versionsDir)) {
          const localDirs = fs.readdirSync(versionsDir);
          if (loaderType === 'fabric') {
            const match = localDirs.find(d => d.startsWith('fabric-loader-') && d.endsWith(mcVersion));
            if (match) targetVersionId = match;
          } else {
            // Ищем установленный Forge именно с нужной нам версией
            const match = localDirs.find(d => 
              (d.startsWith(`${mcVersion}-Forge`) || d.startsWith(`${mcVersion}-forge`)) && 
              d.includes(forgeVersion)
            );
            if (match) targetVersionId = match;
          }
        }

        // Если профиль загрузчика не установлен, запускаем его установку
        if (!targetVersionId) {
          console.log(`[LauncherCore] Требуемый загрузчик ${loaderType} для версии ${mcVersion} (Forge ${forgeVersion}) не найден. Установка...`);
          
          let fabricManager;
          try {
            fabricManager = require('./fabric-manager');
          } catch (err) {
            reject(new Error('Fabric Manager не найден для установки загрузчика Cristalix.'));
            return;
          }

          if (loaderType === 'fabric') {
            const fabricVerId = await fabricManager.installFabricProfileForVersion(gameDir, mcVersion, '0.16.9');
            targetVersionId = fabricVerId;
          } else {
            const forgeProfileId = await fabricManager.installForge(mcVersion, forgeVersion, gameDir, mainWindow);
            targetVersionId = forgeProfileId;
          }
        }

        console.log(`[LauncherCore] Будет запущен профиль: ${targetVersionId}`);

        // Настраиваем параметры запуска для MCLC
        launchOpts.version = {
          number: mcVersion,
          type: 'release',
          custom: targetVersionId
        };

        // Р—Р°РґР°РµРј gameDirectory СЃР±РѕСЂРєРё (С‡С‚РѕР±С‹ РјРѕРґС‹ Рё РєРѕРЅС„РёРіРё С‡РёС‚Р°Р»РёСЃСЊ РѕС‚С‚СѓРґР°)
        launchOpts.overrides.gameDirectory = buildDir;
        // Р—Р°РґР°РµРј CWD РґРѕС‡РµСЂРЅРµРіРѕ РїСЂРѕС†РµСЃСЃР° СЂР°РІРЅС‹Рј buildDir
        launchOpts.overrides.cwd = buildDir;
        // Р—Р°РґР°РµРј root СЂР°РІРЅС‹Рј gameDir (С‡С‚РѕР±С‹ Р±РёР±Р»РёРѕС‚РµРєРё, РјРѕРґСѓР»Рё Рё JSON РІРµСЂСЃРёРё С‡РёС‚Р°Р»РёСЃСЊ РёР· РїР°РїРєРё Р»Р°СѓРЅС‡РµСЂР°)
        launchOpts.root = gameDir;

        // 3. РЎС‡РёС‚С‹РІР°РµРј modern JVM Р°СЂРіСѓРјРµРЅС‚С‹ Forge РёР· JSON РІРµСЂСЃРёРё (С‚Р°Рє РєР°Рє MCLC РїСЂРё custom-Р·Р°РїСѓСЃРєРµ РјРѕР¶РµС‚ РёС… РёРіРЅРѕСЂРёСЂРѕРІР°С‚СЊ)
        const versionJsonPath = path.join(gameDir, 'versions', targetVersionId, `${targetVersionId}.json`);
        if (fs.existsSync(versionJsonPath)) {
          try {
            const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
            if (versionJson.arguments && versionJson.arguments.jvm) {
              const libraryDirectory = path.join(gameDir, 'libraries').replace(/\\/g, '/');
              const classpathSeparator = ';';
              const versionName = targetVersionId;

              const parsedJvmArgs = versionJson.arguments.jvm.map(arg => {
                if (typeof arg !== 'string') return null;
                return arg
                  .replace(/\${library_directory}/g, libraryDirectory)
                  .replace(/\${classpath_separator}/g, classpathSeparator)
                  .replace(/\${version_name}/g, versionName);
              }).filter(Boolean);

              launchOpts.customArgs.push(...parsedJvmArgs);
              console.log(`[LauncherCore] РЈСЃРїРµС€РЅРѕ РёРјРїРѕСЂС‚РёСЂРѕРІР°РЅРѕ ${parsedJvmArgs.length} JVM Р°СЂРіСѓРјРµРЅС‚РѕРІ РёР· JSON Forge`);
            }
          } catch (err) {
            console.error('[LauncherCore] РћС€РёР±РєР° РёРјРїРѕСЂС‚Р° JVM Р°СЂРіСѓРјРµРЅС‚РѕРІ РёР· JSON Forge:', err);
          }
        }

        // 4. Р”РѕР±Р°РІР»СЏРµРј РєСЂРёС‚РёС‡РµСЃРєРё РІР°Р¶РЅС‹Рµ JVM-Р°СЂРіСѓРјРµРЅС‚С‹ РѕР±С…РѕРґР° Р·Р°С‰РёС‚С‹ РљСЂРёСЃС‚Р°Р»РёРєСЃР°
        const packNameLower = buildName.toLowerCase();
        launchOpts.customArgs.push(
          `-Dmjoddedprj=cristalix`,
          `-Dmjoddedpack=${packNameLower}`,
          `-Dservername=${packNameLower}client`
        );

        // РђСЂРіСѓРјРµРЅС‚С‹ --add-opens РЅСѓР¶РЅС‹ С‚РѕР»СЊРєРѕ РґР»СЏ Java 17+ (MC >= 1.17)
        const mcMajorMinor = parseInt(mcVersion.split('.')[1]) || 0;
        if (mcMajorMinor >= 17) {
          launchOpts.customArgs.push(
            '--add-opens=java.base/java.lang.invoke=ALL-UNNAMED',
            '--add-opens=java.base/java.lang=ALL-UNNAMED',
            '--add-opens=java.base/java.io=ALL-UNNAMED',
            '--add-opens=java.base/java.util=ALL-UNNAMED',
            '--add-opens=java.base/java.util.concurrent=ALL-UNNAMED',
            '--add-opens=java.base/java.text=ALL-UNNAMED',
            '--add-opens=java.base/java.lang.reflect=ALL-UNNAMED',
            '--add-opens=java.base/java.net=ALL-UNNAMED',
            '--add-opens=java.base/java.nio=ALL-UNNAMED'
          );
        }

        console.log(`[LauncherCore] Р”РѕР±Р°РІР»РµРЅС‹ JVM Р°СЂРіСѓРјРµРЅС‚С‹ Cristalix: -Dmjoddedprj=cristalix -Dmjoddedpack=${packNameLower} -Dservername=${packNameLower}client`);

        // 5. РљРѕРїРёСЂСѓРµРј РјРѕРґС‹ РёР· libraries/mods/ РІ mods/ (РґР»СЏ СЃС‚Р°СЂС‹С… СЃР±РѕСЂРѕРє С‚РёРїР° 1.7.10)
        const libModsDir = path.join(buildDir, 'libraries', 'mods');
        const mainModsDir = path.join(buildDir, 'mods');
        if (fs.existsSync(libModsDir)) {
          try {
            const libModFiles = fs.readdirSync(libModsDir).filter(f => f.endsWith('.jar'));
            if (libModFiles.length > 0) {
              if (!fs.existsSync(mainModsDir)) {
                fs.mkdirSync(mainModsDir, { recursive: true });
              }
              const subModsDir = path.join(mainModsDir, '1.7.10');
              if (!fs.existsSync(subModsDir)) {
                fs.mkdirSync(subModsDir, { recursive: true });
              }

              // РЈРґР°Р»СЏРµРј СЃС‚Р°СЂС‹Рµ РґСѓР±Р»РёРєР°С‚С‹, РєРѕС‚РѕСЂС‹Рµ РјРµС€Р°СЋС‚ Forge Р·Р°РїСѓСЃС‚РёС‚СЊСЃСЏ
              const duplicates = [
                path.join(mainModsDir, 'bspkrsCore-6.16.jar'),
                path.join(mainModsDir, 'CodeChickenLib-1.1.3.138.jar'),
                path.join(subModsDir, 'bspkrsCore-6.16.jar'),
                path.join(subModsDir, '[1.7.10]bspkrsCore-universal-6.16.jar'),
                path.join(subModsDir, 'CodeChickenLib-1.7.10-1.1.5.3-universal.jar'),
                path.join(subModsDir, 'CodeChickenLib-1.1.3.138.jar')
              ];
              for (const fileToDelete of duplicates) {
                if (fs.existsSync(fileToDelete)) {
                  try {
                    fs.unlinkSync(fileToDelete);
                    console.log(`[LauncherCore] РЈРґР°Р»РµРЅ РґСѓР±Р»РёРєР°С‚: ${path.basename(fileToDelete)}`);
                  } catch (e) {}
                }
              }

              let copied = 0;
              for (const modFile of libModFiles) {
                const src = path.join(libModsDir, modFile);
                
                if (modFile.toLowerCase().includes('bspkrscore')) {
                  // РљРѕРїРёСЂСѓРµРј С‚РѕР»СЊРєРѕ РІ РїРѕРґРїР°РїРєСѓ 1.7.10 СЃ РёРјРµРЅРµРј, РєРѕС‚РѕСЂРѕРµ РѕР¶РёРґР°РµС‚ DepLoader
                  const dst = path.join(subModsDir, '[1.7.10]bspkrsCore-universal-6.15.jar');
                  if (!fs.existsSync(dst)) {
                    fs.copyFileSync(src, dst);
                    copied++;
                  }
                } else if (modFile.toLowerCase().includes('codechickenlib')) {
                  // РљРѕРїРёСЂСѓРµРј С‚РѕР»СЊРєРѕ РІ РїРѕРґРїР°РїРєСѓ 1.7.10 СЃ РёРјРµРЅРµРј, РєРѕС‚РѕСЂРѕРµ РѕР¶РёРґР°РµС‚ DepLoader
                  const dst = path.join(subModsDir, 'CodeChickenLib-1.7.10-1.1.5.3.jar');
                  if (!fs.existsSync(dst)) {
                    fs.copyFileSync(src, dst);
                    copied++;
                  }
                } else {
                  // РћР±С‹С‡РЅС‹Р№ РјРѕРґ вЂ” РєРѕРїРёСЂСѓРµРј РІ РѕСЃРЅРѕРІРЅСѓСЋ РїР°РїРєСѓ mods
                  const dst = path.join(mainModsDir, modFile);
                  if (!fs.existsSync(dst)) {
                    fs.copyFileSync(src, dst);
                    copied++;
                  }
                }
              }
              if (copied > 0) {
                console.log(`[LauncherCore] РЎРєРѕРїРёСЂРѕРІР°РЅРѕ ${copied} С„Р°Р№Р»РѕРІ РјРѕРґРѕРІ/Р·Р°РІРёСЃРёРјРѕСЃС‚РµР№ РёР· libraries/mods/`);
              } else {
                console.log(`[LauncherCore] Р’СЃРµ РјРѕРґС‹ Рё Р·Р°РІРёСЃРёРјРѕСЃС‚Рё СѓР¶Рµ СЃРєРѕРїРёСЂРѕРІР°РЅС‹.`);
              }
            }
          } catch (modCopyErr) {
            console.error('[LauncherCore] РћС€РёР±РєР° РєРѕРїРёСЂРѕРІР°РЅРёСЏ РјРѕРґРѕРІ РёР· libraries/mods/:', modCopyErr);
          }
        }

        // 6. РџР°С‚С‡РёРј FancyMenu Рё РєРѕРїРёСЂСѓРµРј РєР°СЂС‚РёРЅРєРё
        try {
          const fmConfigPath = path.join(buildDir, 'config', 'fancymenu', 'customization', 'mainpink_x6.txt');
          if (fs.existsSync(fmConfigPath)) {
            let fmContent = fs.readFileSync(fmConfigPath, 'utf8');
            if (!fmContent.includes('SelectWorldScreen')) {
              console.log('[LauncherCore] РџР°С‚С‡РёРј С„Р°Р№Р» FancyMenu РґР»СЏ РґРѕР±Р°РІР»РµРЅРёСЏ РєРЅРѕРїРєРё РѕРґРёРЅРѕС‡РЅРѕР№ РёРіСЂС‹...');
              const patch = `
# Added by Antigravity Launcher
action = addbutton
buttonaction = opengui;net.minecraft.client.gui.screens.worldselection.SelectWorldScreen%btnaction_splitter_fm%
backgroundnormal = resources/cristalix/singleplayernew.png
backgroundhovered = resources/cristalix/singleplayernewblack.png
x = 266
y = 280
width = 102
height = 78
`;
              fs.appendFileSync(fmConfigPath, patch, 'utf8');
            }
          }

          // РљРѕРїРёСЂСѓРµРј РєР°СЂС‚РёРЅРєРё singleplayernew.png Рё singleplayernewblack.png РёР· .minecraft РІ Everyrage
          const globalResourcesDir = path.join(process.env.APPDATA, '.minecraft', 'resources', 'cristalix');
          const localResourcesDir = path.join(buildDir, 'resources', 'cristalix');

          if (fs.existsSync(globalResourcesDir)) {
            if (!fs.existsSync(localResourcesDir)) {
              fs.mkdirSync(localResourcesDir, { recursive: true });
            }

            ['singleplayernew.png', 'singleplayernewblack.png'].forEach(file => {
              const srcFile = path.join(globalResourcesDir, file);
              const destFile = path.join(localResourcesDir, file);
              if (fs.existsSync(srcFile) && !fs.existsSync(destFile)) {
                fs.copyFileSync(srcFile, destFile);
                console.log(`[LauncherCore] РўРµРєСЃС‚СѓСЂР° ${file} СЃРєРѕРїРёСЂРѕРІР°РЅР° РІ СЃР±РѕСЂРєСѓ.`);
              }
            });
          }
        } catch (fmErr) {
          console.error('[LauncherCore] РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕРїР°С‚С‡РёС‚СЊ FancyMenu РёР»Рё СЃРєРѕРїРёСЂРѕРІР°С‚СЊ СЂРµСЃСѓСЂСЃС‹:', fmErr);
        }
      } else if (options.versionType === 'custom') {
        // РљР°СЃС‚РѕРјРЅР°СЏ РІРµСЂСЃРёСЏ (РёРјРїРѕСЂС‚РёСЂРѕРІР°РЅРЅС‹Р№ РјРѕРґРїР°Рє РёР»Рё Fabric-РїСЂРѕС„РёР»СЊ)
        const customJsonPath = path.join(gameDir, 'versions', options.versionId, `${options.versionId}.json`);
        if (fs.existsSync(customJsonPath)) {
          try {
            const customJson = JSON.parse(fs.readFileSync(customJsonPath, 'utf8'));
            const baseVersion = customJson.inheritsFrom || options.versionId;
            launchOpts.version = {
              number: baseVersion,
              type: 'release',
              custom: options.versionId
            };
            // Парсим версию майнкрафта для правильного выбора Java
            const mcVerMatch = baseVersion.match(/1\.\d+(\.\d+)?/);
            if (mcVerMatch) {
              mcVersion = mcVerMatch[0];
              resolvedMcVersion = mcVersion;
            }

            // MCLC С‚СЂРµР±СѓРµС‚ РїРѕР»Рµ libraries РІ JSON (РІС‹Р·С‹РІР°РµС‚ .map())
            // Р•СЃР»Рё РµРіРѕ РЅРµС‚ вЂ” РґРѕР±Р°РІР»СЏРµРј РїСѓСЃС‚РѕР№ РјР°СЃСЃРёРІ Рё РїРµСЂРµР·Р°РїРёСЃС‹РІР°РµРј С„Р°Р№Р»
            if (!customJson.libraries) {
              customJson.libraries = [];
              for (const lib of formattedParentLibs) {
                    const libName = lib.name.split(':')[1];
                    if (!existingNames.has(libName)) {
                      customJson.libraries.push(lib);
                    }
                  }
                  
                  // РЎРѕС…СЂР°РЅСЏРµРј РѕР±СЉРµРґРёРЅРµРЅРЅС‹Р№ JSON
                  fs.writeFileSync(customJsonPath, JSON.stringify(customJson, null, 2), 'utf8');
              console.log(`[LauncherCore] Р”РѕР±Р°РІР»РµРЅРѕ РїРѕР»Рµ libraries РІ JSON РїСЂРѕС„РёР»СЏ ${options.versionId}`);
            }

            // Р•СЃР»Рё РІ РїСЂРѕС„РёР»Рµ СѓРєР°Р·Р°РЅ Р·Р°РіСЂСѓР·С‡РёРє Forge, Рё РѕРЅ РµС‰Рµ РЅРµ СѓСЃС‚Р°РЅРѕРІР»РµРЅ
            if (customJson.modLoader && customJson.modLoader.type === 'forge') {
              const forgeVersion = customJson.modLoader.version;
              const isForgeInstalled = customJson.inheritsFrom && customJson.inheritsFrom.toLowerCase().includes('forge');
              
              // РџСЂРѕРІРµСЂСЏРµРј, РЅРµ РІС‹РїРѕР»РЅРµРЅРѕ Р»Рё СѓР¶Рµ СЃР»РёСЏРЅРёРµ (РµСЃР»Рё inheritsFrom СЂР°РІРµРЅ РІР°РЅРёР»Р»Рµ, РЅРѕ РІ Р±РёР±Р»РёРѕС‚РµРєР°С… РµСЃС‚СЊ forge)
              const isAlreadyMerged = customJson.inheritsFrom && 
                                      !customJson.inheritsFrom.toLowerCase().includes('forge') && 
                                      customJson.libraries && 
                                      customJson.libraries.some(l => l.name.includes('forge'));
              
              if (!isForgeInstalled && !isAlreadyMerged) {
                console.log(`[LauncherCore] Forge Р·Р°РіСЂСѓР·С‡РёРє РЅРµ СѓСЃС‚Р°РЅРѕРІР»РµРЅ РґР»СЏ ${options.versionId}. Р—Р°РїСѓСЃРє Р»РµРЅРёРІРѕР№ СѓСЃС‚Р°РЅРѕРІРєРё...`);
                
                let fabricManager;
                try {
                  fabricManager = require('./fabric-manager');
                } catch (err) {
                  reject(new Error('Fabric Manager РЅРµ РЅР°Р№РґРµРЅ РґР»СЏ СѓСЃС‚Р°РЅРѕРІРєРё Forge.'));
                  return;
                }
                
                // Р’С‹Р·С‹РІР°РµРј СѓСЃС‚Р°РЅРѕРІРєСѓ Forge С‡РµСЂРµР· CLI РёР»Рё РїСЂРѕРіСЂР°РјРјРЅРѕ
                const forgeProfileId = await fabricManager.installForge(baseVersion, forgeVersion, gameDir, mainWindow);
                
                // РџСЂРёРІСЏР·С‹РІР°РµРј СѓСЃС‚Р°РЅРѕРІР»РµРЅРЅС‹Р№ РїСЂРѕС„РёР»СЊ Forge РІСЂРµРјРµРЅРЅРѕ Рє inheritsFrom
                customJson.inheritsFrom = forgeProfileId;
                fs.writeFileSync(customJsonPath, JSON.stringify(customJson, null, 2), 'utf8');
              }
              
              launchOpts.forge = null;
            }

            // Умная обработка кастомных сборок (Forge/Fabric)
            // Вместо ручного слияния JSON (которое ломает новые версии Forge 1.13+), 
            // мы указываем MCLC запустить оригинальный профиль загрузчика напрямую,
            // а изоляция папки (overrides.gameDirectory) направит игру в папку сборки.
            if (customJson.inheritsFrom && 
                (customJson.inheritsFrom.toLowerCase().includes('forge') || 
                 customJson.inheritsFrom.toLowerCase().includes('fabric-loader'))) {
              
              const parentJsonPath = path.join(gameDir, 'versions', customJson.inheritsFrom, `${customJson.inheritsFrom}.json`);
              if (fs.existsSync(parentJsonPath)) {
                try {
                  const parentJson = JSON.parse(fs.readFileSync(parentJsonPath, 'utf8'));
                  
                  // Устанавливаем ванильную версию как базу
                  launchOpts.version.number = parentJson.inheritsFrom || baseVersion;
                  // Устанавливаем сам загрузчик (Forge/Fabric) как custom версию для MCLC
                  launchOpts.version.custom = customJson.inheritsFrom;
                  
                  console.log(`[LauncherCore] Настроена MCLC делегация для сборки ${options.versionId}: base=${launchOpts.version.number}, custom=${launchOpts.version.custom}`);
                } catch (err) {
                  console.error('[LauncherCore] Ошибка чтения родительского профиля:', err);
                  launchOpts.version.number = baseVersion;
                  launchOpts.version.custom = customJson.inheritsFrom;
                }
              } else {
                launchOpts.version.number = baseVersion;
                launchOpts.version.custom = customJson.inheritsFrom;
              }
            } else {
              // Обычная ванильная сборка (без Forge/Fabric)
              launchOpts.version.number = customJson.inheritsFrom || baseVersion;
              launchOpts.version.custom = options.versionId;
              console.log(`[LauncherCore] Ванильная кастомная сборка: base=${launchOpts.version.number}, custom=${launchOpts.version.custom}`);
            }
          } catch (e) {
            console.error('[LauncherCore] Ошибка подготовки кастомной сборки:', e.message);
            reject(new Error(`Не удалось подготовить сборку к запуску: ${e.message}`));
            return;
          }
        }

        // РР·РѕР»СЏС†РёСЏ РјРѕРґРїР°РєРѕРІ: РєР°Р¶РґР°СЏ СЃР±РѕСЂРєР° РїРѕР»СѓС‡Р°РµС‚ СЃРІРѕСЋ РїР°РїРєСѓ РґР»СЏ mods/config/saves
        // (РєСЂРѕРјРµ РІРЅСѓС‚СЂРµРЅРЅРёС… fabric-loader РїСЂРѕС„РёР»РµР№ Рё Cristalix-СЃР±РѕСЂРѕРє, РєРѕС‚РѕСЂС‹Рµ СЂР°Р±РѕС‚Р°СЋС‚ РёР· СЃРІРѕРёС… РїР°РїРѕРє РЅР°РїСЂСЏРјСѓСЋ)
        if (!options.versionId.startsWith('fabric-loader-') && options.versionType !== 'cristalix') {
          const instanceDir = path.join(gameDir, 'instances', options.versionId);
          if (!fs.existsSync(instanceDir)) {
            fs.mkdirSync(instanceDir, { recursive: true });
          }
          launchOpts.overrides.gameDirectory = instanceDir;
          console.log(`[LauncherCore] РР·РѕР»РёСЂРѕРІР°РЅРЅР°СЏ РїР°РїРєР° РјРѕРґРїР°РєР°: ${instanceDir}`);
        }
      }

      // РџРѕРґРіРѕС‚РѕРІРєР° РїРѕРґС…РѕРґСЏС‰РµР№ РІРµСЂСЃРёРё Java
      let javaPath = 'java';
      try {
        const javaManager = require('./java-manager');
        javaPath = await javaManager.findOrPrepareJava(resolvedMcVersion || options.versionId, gameDir, mainWindow);
        console.log(`[LauncherCore] РСЃРїРѕР»СЊР·СѓРµРј Java: ${javaPath}`);
      } catch (javaErr) {
        console.error('[LauncherCore] РћС€РёР±РєР° РїСЂРё РїРѕРґРіРѕС‚РѕРІРєРµ Java, РёСЃРїРѕР»СЊР·СѓРµРј СЃРёСЃС‚РµРјРЅСѓСЋ:', javaErr);
      }
      launchOpts.javaPath = javaPath;

      // 7. РРЅРёС†РёР°Р»РёР·Р°С†РёСЏ РєР»РёРµРЅС‚Р° MCLC
      const launcher = new Client();

      // --- РџРѕРґРїРёСЃРєРё РЅР° СЃРѕР±С‹С‚РёСЏ MCLC ---
      
      // РџРµСЂРµРґР°С‡Р° РѕС‚Р»Р°РґРѕС‡РЅРѕР№ РёРЅС„РѕСЂРјР°С†РёРё
      launcher.on('debug', (msg) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('launch-debug', msg);
        }
      });

      // РџРµСЂРµРґР°С‡Р° stdout РґР°РЅРЅС‹С… РёРіСЂС‹ (Р»РѕРіРё Minecraft)
      launcher.on('data', (data) => {
        console.log('[Minecraft LOG]', data);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('launch-data', data);
        }
      });

      // РџРµСЂРµРґР°С‡Р° РѕР±С‰РµРіРѕ РїСЂРѕРіСЂРµСЃСЃР° СЃРєР°С‡РёРІР°РЅРёСЏ Р°СЃСЃРµС‚РѕРІ/Р»РёРЅРµР№РєРё Р±РёР±Р»РёРѕС‚РµРє
      launcher.on('progress', (progress) => {
        // progress = { type: 'assets' | 'natives' | 'classes', task: number, total: number }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('launch-progress', progress);
        }
      });

      // Р”РµС‚Р°Р»СЊРЅС‹Р№ СЃС‚Р°С‚СѓСЃ РїРѕС„Р°Р№Р»РѕРІРѕ
      launcher.on('download-status', (status) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-status', status);
        }
      });

      // Р—Р°РєСЂС‹С‚РёРµ РїСЂРѕС†РµСЃСЃР° Minecraft
            // Закрытие процесса Minecraft
      launcher.on('close', (code) => {
        console.log(`[LauncherCore] Игра закрылась с кодом: ${code}`);
        
        let crashReport = null;
        if (code !== 0) {
          const instanceDir = launchOpts.overrides.gameDirectory || gameDir;
          crashReport = getLatestCrashReport(instanceDir) || getLatestJvmCrash(instanceDir);
          if (crashReport) {
            console.log('[LauncherCore] Найден краш-репорт:\n' + crashReport);
          }
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('launch-close', { code, crashReport });
        }
        resolve({ status: 'closed', code, crashReport });
      });

      // РћС€РёР±РєРё Р·Р°РїСѓСЃРєР°
      launcher.on('error', (err) => {
        console.error('[LauncherCore] РћС€РёР±РєР° Р·Р°РїСѓСЃРєР° РёРіСЂС‹:', err);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('launch-error', err.toString());
        }
        reject(err);
      });

      // 8. Р—РђРџРЈРЎРљ!
      console.log('[LauncherCore] Р—Р°РїСѓСЃРє РєР»РёРµРЅС‚Р°...');
      console.log('[LauncherCore] launchOpts.javaPath:', launchOpts.javaPath);
      console.log('[LauncherCore] launchOpts.version:', JSON.stringify(launchOpts.version));
      const gameProcess = await launcher.launch(launchOpts);
      
      if (gameProcess) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('launch-started');
        }

        // РћС‚РІСЏР·С‹РІР°РµРј РґРѕС‡РµСЂРЅРёР№ РїСЂРѕС†РµСЃСЃ РѕС‚ Electron. РўРµРїРµСЂСЊ Electron РјРѕР¶РµС‚ Р·Р°РєСЂС‹С‚СЊСЃСЏ,
        // Р° Minecraft РїСЂРѕРґРѕР»Р¶РёС‚ СЂР°Р±РѕС‚Р°С‚СЊ РІ С„РѕРЅРµ.
        gameProcess.unref();
        console.log('[LauncherCore] РџСЂРѕС†РµСЃСЃ Minecraft РѕС‚РІСЏР·Р°РЅ (unrefed) СѓСЃРїРµС€РЅРѕ.');

        // Динамическое обновление заголовка окна игры в фоне
        if (gameProcess.pid) {
          const { exec } = require('child_process');
          let displayTitle = `Minecraft ${options.versionId}`;
          if (options.versionType === 'cristalix') {
            const buildName = options.versionId.replace('cristalix-', '');
            displayTitle = `Cristalix ${buildName} » ${options.nickname}`;
          } else {
            displayTitle = `Minecraft ${options.versionId} » ${options.nickname}`;
          }

          const psScript = `
            $sig = '[DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern bool SetWindowText(IntPtr hWnd, string lpString);';
            $type = Add-Type -MemberDefinition $sig -Name "Win32Utils" -Namespace "Win32" -PassThru;
            for ($i = 0; $i -lt 30; $i++) {
              $p = Get-Process -Id ${gameProcess.pid} -ErrorAction SilentlyContinue;
              if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) {
                [void]$type::SetWindowText($p.MainWindowHandle, "${displayTitle}");
                break;
              }
              Start-Sleep -Milliseconds 500;
            }
          `;
          
          const base64Script = Buffer.from(psScript, 'utf16le').toString('base64');
          exec(`powershell -NoProfile -EncodedCommand ${base64Script}`, (err) => {
            if (err) console.error('[LauncherCore] Ошибка установки заголовка окна:', err);
          });
        }
      } else {
        // MCLC РІРµСЂРЅСѓР» null вЂ” РїСЂРѕРёР·РѕС€Р»Р° РІРЅСѓС‚СЂРµРЅРЅСЏСЏ РѕС€РёР±РєР° РїСЂРё Р·Р°РїСѓСЃРєРµ
        console.error('[LauncherCore] MCLC РІРµСЂРЅСѓР» null вЂ” РЅРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РїСѓСЃС‚РёС‚СЊ Minecraft.');
        reject(new Error('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РїСѓСЃС‚РёС‚СЊ Minecraft. РџСЂРѕРІРµСЂСЊС‚Рµ РєРѕРЅСЃРѕР»СЊ РґР»СЏ РґРµС‚Р°Р»РµР№ (Ctrl+Shift+D).'));
      }
      
    } catch (err) {
      console.error('[LauncherCore] РљСЂРёС‚РёС‡РµСЃРєР°СЏ РѕС€РёР±РєР° РїСЂРё РїРѕРґРіРѕС‚РѕРІРєРµ Р·Р°РїСѓСЃРєР°:', err);
      reject(err);
    }
  });
}

module.exports = {
  launchMinecraft
};
