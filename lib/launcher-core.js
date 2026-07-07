// ============================================
// launcher-core.js РІР‚вЂќ Launcher Logic wrapper
// Р С›Р В±РЎвЂРЎР‚РЎвЂљР С”Р В° Р Р…Р В°Р Т‘ Р С—Р В°Р С”Р ВµРЎвЂљР С•Р С minecraft-launcher-core
// ============================================

const { Client, Authenticator } = require('minecraft-launcher-core');
const Handler = require('minecraft-launcher-core/components/handler');
const path = require('path');
const fs = require('fs');

// Подключаем нативный Rust-модуль
let nativeModule = null;
try {
  nativeModule = require('../src-rust/launcher-native.win32-x64-msvc.node');
  console.log('[LauncherCore] Успешно загружен нативный Rust модуль скачивания.');
} catch (e) {
  console.warn('[LauncherCore] Не удалось загрузить нативный Rust модуль, используется стандартный:', e.message);
}

if (nativeModule) {
  let downloadQueue = [];
  let batchTimeout = null;

  Handler.prototype.downloadAsync = function(url, directory, name, retry, type) {
    return new Promise((resolve) => {
      try { fs.mkdirSync(directory, { recursive: true }); } catch (e) {}

      const fullPath = path.join(directory, name);
      let sha1 = null;
      if (type === 'assets' && /^[0-9a-f]{40}$/i.test(name)) {
        sha1 = name;
      }

      downloadQueue.push({
        url,
        path: fullPath,
        sha1,
        resolve,
        type,
        name
      });

      if (!batchTimeout) {
        batchTimeout = setTimeout(() => {
          const currentQueue = downloadQueue;
          downloadQueue = [];
          batchTimeout = null;

          console.log(`[NativeDownload] Запуск параллельного скачивания ${currentQueue.length} файлов через Rust...`);

          const tasks = currentQueue.map(t => ({
            url: t.url,
            path: t.path,
            sha1: t.sha1 || undefined
          }));

          nativeModule.downloadFiles(tasks, 48, (err, progress) => {
            if (err) {
              console.error('[NativeDownload] Ошибка Rust при скачивании:', err);
              // Resolve all pending tasks as failed so MCLC doesn't hang
              currentQueue.forEach(t => t.resolve({ failed: true }));
              return;
            }
            
            const task = currentQueue[progress.taskIndex];
            if (task) {
              if (progress.status === 'failed') {
                console.error(`[NativeDownload] Ошибка скачивания ${task.name}:`, progress.error);
                task.resolve({ failed: true });
              } else {
                task.resolve({ failed: false, asset: null });
              }
            }
          });
        }, 10);
      }
    });
  };
}

/**
 * Р вЂ”Р В°Р С—РЎС“РЎРѓРЎвЂљР С‘РЎвЂљРЎРЉ Minecraft
 * @param {object} options 
 * @param {BrowserWindow} mainWindow 
 * @returns {Promise<object>}
 */
/**
 * Р РµРєСѓСЂСЃРёРІРЅРѕ СѓРґР°Р»СЏРµС‚ РїСѓСЃС‚С‹Рµ (0 Р±Р°Р№С‚) .jar С„Р°Р№Р»С‹ РІ РїР°РїРєРµ Р±РёР±Р»РёРѕС‚РµРє
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
        console.log(`[LauncherCore] РЈРґР°Р»РµРЅ РїРѕРІСЂРµР¶РґРµРЅРЅС‹Р№ 0-Р±Р°Р№С‚ С„Р°Р№Р»: ${filePath}`);
      } catch (e) {
        console.error(`[LauncherCore] РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ РїРѕРІСЂРµР¶РґРµРЅРЅС‹Р№ С„Р°Р№Р» ${filePath}:`, e.message);
      }
    }
  }
}


/**
 * РС‰РµС‚ СЃРІРµР¶РёР№ РєСЂР°С€-СЂРµРїРѕСЂС‚ РІ РїР°РїРєРµ СЃР±РѕСЂРєРё
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
    // Р•СЃР»Рё С„Р°Р№Р» СЃРѕР·РґР°РЅ РјРµРЅРµРµ 30 СЃРµРєСѓРЅРґ РЅР°Р·Р°Рґ
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
    console.error('[LauncherCore] РћС€РёР±РєР° С‡С‚РµРЅРёСЏ РєСЂР°С€-СЂРµРїРѕСЂС‚Р°:', e);
  }
  return null;
}

/**
 * РС‰РµС‚ СЃРІРµР¶РёР№ Р»РѕРі РїР°РґРµРЅРёСЏ JVM
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
    console.error('[LauncherCore] РћС€РёР±РєР° С‡С‚РµРЅРёСЏ JVM Р»РѕРіР°:', e);
  }
  return null;
}

async function launchMinecraft(options, mainWindow) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('[LauncherCore] Р СџР С•Р Т‘Р С–Р С•РЎвЂљР С•Р Р†Р С”Р В° Р С” Р В·Р В°Р С—РЎС“РЎРѓР С”РЎС“ Р С‘Р С–РЎР‚РЎвЂ№...');
      console.log('[LauncherCore] Р СџР В°РЎР‚Р В°Р СР ВµРЎвЂљРЎР‚РЎвЂ№:', {
        nickname: options.nickname,
        versionId: options.versionId,
        versionType: options.versionType,
        ram: options.ram
      });

      // 1. Р С›РЎвЂћРЎвЂћР В»Р В°Р в„–Р Р…-Р В°Р Р†РЎвЂљР С•РЎР‚Р С‘Р В·Р В°РЎвЂ Р С‘РЎРЏ (UUID Р С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµРЎвЂљРЎРѓРЎРЏ Р С—Р С• Р Р…Р С‘Р С”РЎС“)
      const auth = await Authenticator.getAuth(options.nickname);
      
      // 2. Р С›Р С—РЎР‚Р ВµР Т‘Р ВµР В»Р ВµР Р…Р С‘Р Вµ Р Т‘Р С‘РЎР‚Р ВµР С”РЎвЂљР С•РЎР‚Р С‘Р С‘ Р С‘Р С–РЎР‚РЎвЂ№
      const gameDir = options.gameDirectory || path.join(process.env.APPDATA, '.minecraft-launcher');

      // РћС‡РёСЃС‚РєР° РїРѕРІСЂРµР¶РґРµРЅРЅС‹С… 0-Р±Р°Р№С‚РЅС‹С… Р±РёР±Р»РёРѕС‚РµРє РїРµСЂРµРґ Р·Р°РїСѓСЃРєРѕРј
      try {
        cleanCorruptedLibraries(path.join(gameDir, 'libraries'));
      } catch (err) {
        console.error('[LauncherCore] РћС€РёР±РєР° РїСЂРё РѕС‡РёСЃС‚РєРµ Р±РёР±Р»РёРѕС‚РµРє:', err);
      }

      // 3. Р вЂ™РЎвЂ№Р Т‘Р ВµР В»Р ВµР Р…Р С‘Р Вµ Р С—Р В°Р СРЎРЏРЎвЂљР С‘ (options.ram РЎвЂљР ВµР С—Р ВµРЎР‚РЎРЉ Р С—РЎР‚Р С‘РЎвЂ¦Р С•Р Т‘Р С‘РЎвЂљ Р Р† Р СљР вЂ)
      const maxMem = `${options.ram || 4096}M`;
      // Р СљР С‘Р Р…Р С‘Р СР В°Р В»РЎРЉР Р…Р В°РЎРЏ Р С—Р В°Р СРЎРЏРЎвЂљРЎРЉ РІР‚вЂќ Р С—Р С•Р В»Р С•Р Р†Р С‘Р Р…Р В° Р СР В°Р С”РЎРѓР С‘Р СР В°Р В»РЎРЉР Р…Р С•Р в„–, Р Р…Р С• Р Р…Р Вµ Р СР ВµР Р…РЎРЉРЎв‚¬Р Вµ 1024M
      const minMem = `${Math.max(1024, Math.floor((options.ram || 4096) / 2))}M`;

      // 4. JVM-Р В°РЎР‚Р С–РЎС“Р СР ВµР Р…РЎвЂљРЎвЂ№
      const customJvmArgs = options.jvmArgs 
        ? options.jvmArgs.split(' ').filter(Boolean) 
        : [];

      // 5. Р С™Р С•Р Р…РЎвЂћР С‘Р С–РЎС“РЎР‚Р В°РЎвЂ Р С‘РЎРЏ Р В·Р В°Р С—РЎС“РЎРѓР С”Р В°
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
          maxSockets: 16 // Р С›Р С—РЎвЂљР С‘Р СР В°Р В»РЎРЉР Р…Р С•Р Вµ РЎвЂЎР С‘РЎРѓР В»Р С• Р С—Р С•РЎвЂљР С•Р С”Р С•Р Р†, РЎвЂЎРЎвЂљР С•Р В±РЎвЂ№ Р С‘Р В·Р В±Р ВµР В¶Р В°РЎвЂљРЎРЉ РЎвЂљРЎР‚Р С•РЎвЂљРЎвЂљР В»Р С‘Р Р…Р С–Р В° РЎРѓР ВµРЎР‚Р Р†Р ВµРЎР‚Р С•Р Р† Mojang
        }
      };

      // Р СџР ВµРЎР‚Р ВµР СР ВµР Р…Р Р…Р В°РЎРЏ Р Т‘Р В»РЎРЏ РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ РЎР‚Р ВµР В°Р В»РЎРЉР Р…Р С•Р в„– Р Р†Р ВµРЎР‚РЎРѓР С‘Р С‘ MC (Р Т‘Р В»РЎРЏ Р Р†РЎвЂ№Р В±Р С•РЎР‚Р В° Java)
      let resolvedMcVersion = null;

      // 6. Р С›Р В±РЎР‚Р В°Р В±Р С•РЎвЂљР С”Р В° Optimized Fabric Р Р†Р ВµРЎР‚РЎРѓР С‘Р С‘ (РЎвЂљР С•Р В»РЎРЉР С”Р С• Р Т‘Р В»РЎРЏ Р Р†РЎРѓРЎвЂљРЎР‚Р С•Р ВµР Р…Р Р…Р С•Р в„– РЎРѓР В±Р С•РЎР‚Р С”Р С‘)
      if (options.versionId === 'optimized-fabric-1.20.4') {
        console.log('[LauncherCore] Р С›Р В±Р Р…Р В°РЎР‚РЎС“Р В¶Р ВµР Р… Р В·Р В°Р С—РЎР‚Р С•РЎРѓ Р Р…Р В° Р В·Р В°Р С—РЎС“РЎРѓР С” Optimized Fabric. Р вЂ™РЎвЂ№Р В·Р С•Р Р† Fabric Manager...');
        
        let fabricManager;
        try {
          fabricManager = require('./fabric-manager');
        } catch (err) {
          reject(new Error('Fabric Manager Р Р…Р Вµ Р Р…Р В°Р в„–Р Т‘Р ВµР Р…. Р вЂ™РЎвЂ№Р С—Р С•Р В»Р Р…Р С‘РЎвЂљР Вµ Р В­РЎвЂљР В°Р С— 7.'));
          return;
        }

        // Р вЂ™РЎвЂ№Р С—Р С•Р В»Р Р…РЎРЏР ВµР С РЎС“РЎРѓРЎвЂљР В°Р Р…Р С•Р Р†Р С”РЎС“ Fabric Р С‘ Sodium
        mainWindow.webContents.send('launch-progress', { type: 'fabric', task: 1, total: 2 });
        const customVersionId = await fabricManager.setupFabricOptimized(gameDir, mainWindow);
        
        // РџРµСЂРµРѕРїСЂРµРґРµР»СЏРµРј РїР°СЂР°РјРµС‚СЂС‹ Р·Р°РїСѓСЃРєР° РґР»СЏ РєР°СЃС‚РѕРјРЅРѕРіРѕ РїСЂРѕС„РёР»СЏ Fabric
        launchOpts.version = {
          number: '1.20.4',
          type: 'release',
          custom: customVersionId
        };
      } else if (options.versionType === 'cristalix') {
        const buildName = options.versionId.replace('cristalix-', '');
        let cristaloxDir = path.join(require('os').homedir(), 'Desktop', 'РїР°РїРєРё', 'cristalox');
        if (!fs.existsSync(cristaloxDir)) {
          const configManager = require('./config-manager');
          const gameDir = configManager.getConfig().gameDirectory;
          cristaloxDir = path.join(gameDir, 'cristalox');
        }
        const buildDir = path.join(cristaloxDir, buildName);

        if (!fs.existsSync(buildDir)) {
          reject(new Error(`РџР°РїРєР° СЃР±РѕСЂРєРё Cristalix РЅРµ РЅР°Р№РґРµРЅР° РїРѕ РїСѓС‚Рё: ${buildDir}`));
          return;
        }

        // 1. РђРІС‚РѕРѕРїСЂРµРґРµР»СЏРµРј РІРµСЂСЃРёСЋ Minecraft
        let mcVersion = '1.19.2';
        try {
          const versionManager = require('./version-manager');
          mcVersion = versionManager.detectMinecraftVersion(buildDir);
        } catch (e) {
          console.error('[LauncherCore] Р С›РЎв‚¬Р С‘Р В±Р С”Р В° Р В°Р Р†РЎвЂљР С•Р С•Р С—РЎР‚Р ВµР Т‘Р ВµР В»Р ВµР Р…Р С‘РЎРЏ Р Р†Р ВµРЎР‚РЎРѓР С‘Р С‘, Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р ВµР С 1.19.2:', e);
        }

        resolvedMcVersion = mcVersion;
        console.log(`[LauncherCore] Р—Р°РїСѓСЃРє Cristalix СЃР±РѕСЂРєРё ${buildName}. Р’РµСЂСЃРёСЏ MC: ${mcVersion}`);

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

        // РћРїСЂРµРґРµР»СЏРµРј С‚РёРї Р·Р°РіСЂСѓР·С‡РёРєР° (forge РёР»Рё fabric) РїРѕ РЅР°Р»РёС‡РёСЋ РјРѕРґРѕРІ Рё РёРјРµРЅРё С„Р°Р№Р»РѕРІ
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
          // Р•СЃР»Рё РїР°РїРєРё mods РЅРµС‚, РїРѕ РґРµС„РѕР»С‚Сѓ РёСЃРїРѕР»СЊР·СѓРµРј fabric
          loaderType = 'fabric';
        }

        // РС‰РµРј СѓСЃС‚Р°РЅРѕРІР»РµРЅРЅС‹Р№ РїСЂРѕС„РёР»СЊ Forge/Fabric РґР»СЏ СЌС‚РѕР№ РІРµСЂСЃРёРё РІ versions/
        let targetVersionId = '';
        const versionsDir = path.join(gameDir, 'versions');
        if (fs.existsSync(versionsDir)) {
          const localDirs = fs.readdirSync(versionsDir);
          if (loaderType === 'fabric') {
            const match = localDirs.find(d => d.startsWith('fabric-loader-') && d.endsWith(mcVersion));
            if (match) targetVersionId = match;
          } else {
            // РС‰РµРј СѓСЃС‚Р°РЅРѕРІР»РµРЅРЅС‹Р№ Forge РёРјРµРЅРЅРѕ СЃ РЅСѓР¶РЅРѕР№ РЅР°Рј РІРµСЂСЃРёРµР№
            const match = localDirs.find(d => 
              (d.startsWith(`${mcVersion}-Forge`) || d.startsWith(`${mcVersion}-forge`)) && 
              d.includes(forgeVersion)
            );
            if (match) targetVersionId = match;
          }
        }

        // Р•СЃР»Рё РїСЂРѕС„РёР»СЊ Р·Р°РіСЂСѓР·С‡РёРєР° РЅРµ СѓСЃС‚Р°РЅРѕРІР»РµРЅ, Р·Р°РїСѓСЃРєР°РµРј РµРіРѕ СѓСЃС‚Р°РЅРѕРІРєСѓ
        if (!targetVersionId) {
          console.log(`[LauncherCore] РўСЂРµР±СѓРµРјС‹Р№ Р·Р°РіСЂСѓР·С‡РёРє ${loaderType} РґР»СЏ РІРµСЂСЃРёРё ${mcVersion} (Forge ${forgeVersion}) РЅРµ РЅР°Р№РґРµРЅ. РЈСЃС‚Р°РЅРѕРІРєР°...`);
          
          let fabricManager;
          try {
            fabricManager = require('./fabric-manager');
          } catch (err) {
            reject(new Error('Fabric Manager РЅРµ РЅР°Р№РґРµРЅ РґР»СЏ СѓСЃС‚Р°РЅРѕРІРєРё Р·Р°РіСЂСѓР·С‡РёРєР° Cristalix.'));
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

        console.log(`[LauncherCore] Р‘СѓРґРµС‚ Р·Р°РїСѓС‰РµРЅ РїСЂРѕС„РёР»СЊ: ${targetVersionId}`);

        // РќР°СЃС‚СЂР°РёРІР°РµРј РїР°СЂР°РјРµС‚СЂС‹ Р·Р°РїСѓСЃРєР° РґР»СЏ MCLC
        launchOpts.version = {
          number: mcVersion,
          type: 'release',
          custom: targetVersionId
        };

        // Р вЂ”Р В°Р Т‘Р В°Р ВµР С gameDirectory РЎРѓР В±Р С•РЎР‚Р С”Р С‘ (РЎвЂЎРЎвЂљР С•Р В±РЎвЂ№ Р СР С•Р Т‘РЎвЂ№ Р С‘ Р С”Р С•Р Р…РЎвЂћР С‘Р С–Р С‘ РЎвЂЎР С‘РЎвЂљР В°Р В»Р С‘РЎРѓРЎРЉ Р С•РЎвЂљРЎвЂљРЎС“Р Т‘Р В°)
        launchOpts.overrides.gameDirectory = buildDir;
        // Р вЂ”Р В°Р Т‘Р В°Р ВµР С CWD Р Т‘Р С•РЎвЂЎР ВµРЎР‚Р Р…Р ВµР С–Р С• Р С—РЎР‚Р С•РЎвЂ Р ВµРЎРѓРЎРѓР В° РЎР‚Р В°Р Р†Р Р…РЎвЂ№Р С buildDir
        launchOpts.overrides.cwd = buildDir;
        // Р вЂ”Р В°Р Т‘Р В°Р ВµР С root РЎР‚Р В°Р Р†Р Р…РЎвЂ№Р С gameDir (РЎвЂЎРЎвЂљР С•Р В±РЎвЂ№ Р В±Р С‘Р В±Р В»Р С‘Р С•РЎвЂљР ВµР С”Р С‘, Р СР С•Р Т‘РЎС“Р В»Р С‘ Р С‘ JSON Р Р†Р ВµРЎР‚РЎРѓР С‘Р С‘ РЎвЂЎР С‘РЎвЂљР В°Р В»Р С‘РЎРѓРЎРЉ Р С‘Р В· Р С—Р В°Р С—Р С”Р С‘ Р В»Р В°РЎС“Р Р…РЎвЂЎР ВµРЎР‚Р В°)
        launchOpts.root = gameDir;

        // 3. Р РЋРЎвЂЎР С‘РЎвЂљРЎвЂ№Р Р†Р В°Р ВµР С modern JVM Р В°РЎР‚Р С–РЎС“Р СР ВµР Р…РЎвЂљРЎвЂ№ Forge Р С‘Р В· JSON Р Р†Р ВµРЎР‚РЎРѓР С‘Р С‘ (РЎвЂљР В°Р С” Р С”Р В°Р С” MCLC Р С—РЎР‚Р С‘ custom-Р В·Р В°Р С—РЎС“РЎРѓР С”Р Вµ Р СР С•Р В¶Р ВµРЎвЂљ Р С‘РЎвЂ¦ Р С‘Р С–Р Р…Р С•РЎР‚Р С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ)
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
              console.log(`[LauncherCore] Р Р€РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С• Р С‘Р СР С—Р С•РЎР‚РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С• ${parsedJvmArgs.length} JVM Р В°РЎР‚Р С–РЎС“Р СР ВµР Р…РЎвЂљР С•Р Р† Р С‘Р В· JSON Forge`);
            }
          } catch (err) {
            console.error('[LauncherCore] Р С›РЎв‚¬Р С‘Р В±Р С”Р В° Р С‘Р СР С—Р С•РЎР‚РЎвЂљР В° JVM Р В°РЎР‚Р С–РЎС“Р СР ВµР Р…РЎвЂљР С•Р Р† Р С‘Р В· JSON Forge:', err);
          }
        }

        // 4. Р вЂќР С•Р В±Р В°Р Р†Р В»РЎРЏР ВµР С Р С”РЎР‚Р С‘РЎвЂљР С‘РЎвЂЎР ВµРЎРѓР С”Р С‘ Р Р†Р В°Р В¶Р Р…РЎвЂ№Р Вµ JVM-Р В°РЎР‚Р С–РЎС“Р СР ВµР Р…РЎвЂљРЎвЂ№ Р С•Р В±РЎвЂ¦Р С•Р Т‘Р В° Р В·Р В°РЎвЂ°Р С‘РЎвЂљРЎвЂ№ Р С™РЎР‚Р С‘РЎРѓРЎвЂљР В°Р В»Р С‘Р С”РЎРѓР В°
        const packNameLower = buildName.toLowerCase();
        launchOpts.customArgs.push(
          `-Dmjoddedprj=cristalix`,
          `-Dmjoddedpack=${packNameLower}`,
          `-Dservername=${packNameLower}client`
        );

        // Р С’РЎР‚Р С–РЎС“Р СР ВµР Р…РЎвЂљРЎвЂ№ --add-opens Р Р…РЎС“Р В¶Р Р…РЎвЂ№ РЎвЂљР С•Р В»РЎРЉР С”Р С• Р Т‘Р В»РЎРЏ Java 17+ (MC >= 1.17)
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

        console.log(`[LauncherCore] Р вЂќР С•Р В±Р В°Р Р†Р В»Р ВµР Р…РЎвЂ№ JVM Р В°РЎР‚Р С–РЎС“Р СР ВµР Р…РЎвЂљРЎвЂ№ Cristalix: -Dmjoddedprj=cristalix -Dmjoddedpack=${packNameLower} -Dservername=${packNameLower}client`);

        // 5. Р С™Р С•Р С—Р С‘РЎР‚РЎС“Р ВµР С Р СР С•Р Т‘РЎвЂ№ Р С‘Р В· libraries/mods/ Р Р† mods/ (Р Т‘Р В»РЎРЏ РЎРѓРЎвЂљР В°РЎР‚РЎвЂ№РЎвЂ¦ РЎРѓР В±Р С•РЎР‚Р С•Р С” РЎвЂљР С‘Р С—Р В° 1.7.10)
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

              // Р Р€Р Т‘Р В°Р В»РЎРЏР ВµР С РЎРѓРЎвЂљР В°РЎР‚РЎвЂ№Р Вµ Р Т‘РЎС“Р В±Р В»Р С‘Р С”Р В°РЎвЂљРЎвЂ№, Р С”Р С•РЎвЂљР С•РЎР‚РЎвЂ№Р Вµ Р СР ВµРЎв‚¬Р В°РЎР‹РЎвЂљ Forge Р В·Р В°Р С—РЎС“РЎРѓРЎвЂљР С‘РЎвЂљРЎРЉРЎРѓРЎРЏ
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
                    console.log(`[LauncherCore] Р Р€Р Т‘Р В°Р В»Р ВµР Р… Р Т‘РЎС“Р В±Р В»Р С‘Р С”Р В°РЎвЂљ: ${path.basename(fileToDelete)}`);
                  } catch (e) {}
                }
              }

              let copied = 0;
              for (const modFile of libModFiles) {
                const src = path.join(libModsDir, modFile);
                
                if (modFile.toLowerCase().includes('bspkrscore')) {
                  // Р С™Р С•Р С—Р С‘РЎР‚РЎС“Р ВµР С РЎвЂљР С•Р В»РЎРЉР С”Р С• Р Р† Р С—Р С•Р Т‘Р С—Р В°Р С—Р С”РЎС“ 1.7.10 РЎРѓ Р С‘Р СР ВµР Р…Р ВµР С, Р С”Р С•РЎвЂљР С•РЎР‚Р С•Р Вµ Р С•Р В¶Р С‘Р Т‘Р В°Р ВµРЎвЂљ DepLoader
                  const dst = path.join(subModsDir, '[1.7.10]bspkrsCore-universal-6.15.jar');
                  if (!fs.existsSync(dst)) {
                    fs.copyFileSync(src, dst);
                    copied++;
                  }
                } else if (modFile.toLowerCase().includes('codechickenlib')) {
                  // Р С™Р С•Р С—Р С‘РЎР‚РЎС“Р ВµР С РЎвЂљР С•Р В»РЎРЉР С”Р С• Р Р† Р С—Р С•Р Т‘Р С—Р В°Р С—Р С”РЎС“ 1.7.10 РЎРѓ Р С‘Р СР ВµР Р…Р ВµР С, Р С”Р С•РЎвЂљР С•РЎР‚Р С•Р Вµ Р С•Р В¶Р С‘Р Т‘Р В°Р ВµРЎвЂљ DepLoader
                  const dst = path.join(subModsDir, 'CodeChickenLib-1.7.10-1.1.5.3.jar');
                  if (!fs.existsSync(dst)) {
                    fs.copyFileSync(src, dst);
                    copied++;
                  }
                } else {
                  // Р С›Р В±РЎвЂ№РЎвЂЎР Р…РЎвЂ№Р в„– Р СР С•Р Т‘ РІР‚вЂќ Р С”Р С•Р С—Р С‘РЎР‚РЎС“Р ВµР С Р Р† Р С•РЎРѓР Р…Р С•Р Р†Р Р…РЎС“РЎР‹ Р С—Р В°Р С—Р С”РЎС“ mods
                  const dst = path.join(mainModsDir, modFile);
                  if (!fs.existsSync(dst)) {
                    fs.copyFileSync(src, dst);
                    copied++;
                  }
                }
              }
              if (copied > 0) {
                console.log(`[LauncherCore] Р РЋР С”Р С•Р С—Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С• ${copied} РЎвЂћР В°Р в„–Р В»Р С•Р Р† Р СР С•Р Т‘Р С•Р Р†/Р В·Р В°Р Р†Р С‘РЎРѓР С‘Р СР С•РЎРѓРЎвЂљР ВµР в„– Р С‘Р В· libraries/mods/`);
              } else {
                console.log(`[LauncherCore] Р вЂ™РЎРѓР Вµ Р СР С•Р Т‘РЎвЂ№ Р С‘ Р В·Р В°Р Р†Р С‘РЎРѓР С‘Р СР С•РЎРѓРЎвЂљР С‘ РЎС“Р В¶Р Вµ РЎРѓР С”Р С•Р С—Р С‘РЎР‚Р С•Р Р†Р В°Р Р…РЎвЂ№.`);
              }
            }
          } catch (modCopyErr) {
            console.error('[LauncherCore] Р С›РЎв‚¬Р С‘Р В±Р С”Р В° Р С”Р С•Р С—Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ Р СР С•Р Т‘Р С•Р Р† Р С‘Р В· libraries/mods/:', modCopyErr);
          }
        }

        // 6. Р СџР В°РЎвЂљРЎвЂЎР С‘Р С FancyMenu Р С‘ Р С”Р С•Р С—Р С‘РЎР‚РЎС“Р ВµР С Р С”Р В°РЎР‚РЎвЂљР С‘Р Р…Р С”Р С‘
        try {
          const fmConfigPath = path.join(buildDir, 'config', 'fancymenu', 'customization', 'mainpink_x6.txt');
          if (fs.existsSync(fmConfigPath)) {
            let fmContent = fs.readFileSync(fmConfigPath, 'utf8');
            if (!fmContent.includes('SelectWorldScreen')) {
              console.log('[LauncherCore] Р СџР В°РЎвЂљРЎвЂЎР С‘Р С РЎвЂћР В°Р в„–Р В» FancyMenu Р Т‘Р В»РЎРЏ Р Т‘Р С•Р В±Р В°Р Р†Р В»Р ВµР Р…Р С‘РЎРЏ Р С”Р Р…Р С•Р С—Р С”Р С‘ Р С•Р Т‘Р С‘Р Р…Р С•РЎвЂЎР Р…Р С•Р в„– Р С‘Р С–РЎР‚РЎвЂ№...');
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

          // Копируем карту singleplayernew.png и singleplayernewblack.png из .minecraft в Everyrage
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
                console.log(`[LauncherCore] Ресурс ${file} скопирован в сборку.`);
              }
            });
          }
        } catch (fmErr) {
          console.error('[LauncherCore] Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ Р С—РЎР‚Р С•Р С—Р В°РЎвЂљРЎвЂЎР С‘РЎвЂљРЎРЉ FancyMenu Р С‘Р В»Р С‘ РЎРѓР С”Р С•Р С—Р С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ РЎР‚Р ВµРЎРѓРЎС“РЎР‚РЎРѓРЎвЂ№:', fmErr);
        }
      } else if (options.versionType === 'custom') {
        // Р С™Р В°РЎРѓРЎвЂљР С•Р СР Р…Р В°РЎРЏ Р Р†Р ВµРЎР‚РЎРѓР С‘РЎРЏ (Р С‘Р СР С—Р С•РЎР‚РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р Р…РЎвЂ№Р в„– Р СР С•Р Т‘Р С—Р В°Р С” Р С‘Р В»Р С‘ Fabric-Р С—РЎР‚Р С•РЎвЂћР С‘Р В»РЎРЉ)
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
            // РџР°СЂСЃРёРј РІРµСЂСЃРёСЋ РјР°Р№РЅРєСЂР°С„С‚Р° РґР»СЏ РїСЂР°РІРёР»СЊРЅРѕРіРѕ РІС‹Р±РѕСЂР° Java
            const mcVerMatch = baseVersion.match(/1\.\d+(\.\d+)?/);
            if (mcVerMatch) {
              mcVersion = mcVerMatch[0];
              resolvedMcVersion = mcVersion;
            }

            // MCLC РЎвЂљРЎР‚Р ВµР В±РЎС“Р ВµРЎвЂљ Р С—Р С•Р В»Р Вµ libraries Р Р† JSON (Р Р†РЎвЂ№Р В·РЎвЂ№Р Р†Р В°Р ВµРЎвЂљ .map())
            // Р вЂўРЎРѓР В»Р С‘ Р ВµР С–Р С• Р Р…Р ВµРЎвЂљ РІР‚вЂќ Р Т‘Р С•Р В±Р В°Р Р†Р В»РЎРЏР ВµР С Р С—РЎС“РЎРѓРЎвЂљР С•Р в„– Р СР В°РЎРѓРЎРѓР С‘Р Р† Р С‘ Р С—Р ВµРЎР‚Р ВµР В·Р В°Р С—Р С‘РЎРѓРЎвЂ№Р Р†Р В°Р ВµР С РЎвЂћР В°Р в„–Р В»
            if (!customJson.libraries) {
              customJson.libraries = [];
              for (const lib of formattedParentLibs) {
                    const libName = lib.name.split(':')[1];
                    if (!existingNames.has(libName)) {
                      customJson.libraries.push(lib);
                    }
                  }
                  
                  // Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…РЎРЏР ВµР С Р С•Р В±РЎР‰Р ВµР Т‘Р С‘Р Р…Р ВµР Р…Р Р…РЎвЂ№Р в„– JSON
                  fs.writeFileSync(customJsonPath, JSON.stringify(customJson, null, 2), 'utf8');
              console.log(`[LauncherCore] Р вЂќР С•Р В±Р В°Р Р†Р В»Р ВµР Р…Р С• Р С—Р С•Р В»Р Вµ libraries Р Р† JSON Р С—РЎР‚Р С•РЎвЂћР С‘Р В»РЎРЏ ${options.versionId}`);
              console.log(`[LauncherCore] Добавлено поле libraries в JSON профиля ${options.versionId}`);
            }

            if (customJson.modLoader && customJson.modLoader.type === 'forge') {
              const forgeVersion = customJson.modLoader.version;
              const isForgeInstalled = customJson.inheritsFrom && customJson.inheritsFrom.toLowerCase().includes('forge');
              
              const isAlreadyMerged = customJson.inheritsFrom && 
                                      !customJson.inheritsFrom.toLowerCase().includes('forge') && 
                                      customJson.libraries && 
                                      customJson.libraries.some(l => l.name.includes('forge'));
              
              if (!isForgeInstalled && !isAlreadyMerged) {
                console.log(`[LauncherCore] Forge загрузчик не установлен для ${options.versionId}. Запуск линейной установки...`);
                
                let fabricManager;
                try {
                  fabricManager = require('./fabric-manager');
                } catch (err) {
                  reject(new Error('Fabric Manager не найден для установки Forge.'));
                  return;
                }
                
                const forgeProfileId = await fabricManager.installForge(baseVersion, forgeVersion, gameDir, mainWindow);
                
                customJson.inheritsFrom = forgeProfileId;
                fs.writeFileSync(customJsonPath, JSON.stringify(customJson, null, 2), 'utf8');
              }
              
              launchOpts.forge = null;
            }

            if (customJson.inheritsFrom && 
                (customJson.inheritsFrom.toLowerCase().includes('forge') || 
                 customJson.inheritsFrom.toLowerCase().includes('fabric-loader'))) {
              
              const parentJsonPath = path.join(gameDir, 'versions', customJson.inheritsFrom, `${customJson.inheritsFrom}.json`);
              if (fs.existsSync(parentJsonPath)) {
                try {
                  const parentJson = JSON.parse(fs.readFileSync(parentJsonPath, 'utf8'));
                  
                  launchOpts.version.number = parentJson.inheritsFrom || baseVersion;
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
              launchOpts.version.number = customJson.inheritsFrom || baseVersion;
              launchOpts.version.custom = options.versionId;
            }
          } catch (e) {
            console.error('[LauncherCore] РћС€РёР±РєР° РїРѕРґРіРѕС‚РѕРІРєРё РєР°СЃС‚РѕРјРЅРѕР№ СЃР±РѕСЂРєРё:', e.message);
            reject(new Error(`РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРіРѕС‚РѕРІРёС‚СЊ СЃР±РѕСЂРєСѓ Рє Р·Р°РїСѓСЃРєСѓ: ${e.message}`));
            return;
          }
        }

        // Р ВР В·Р С•Р В»РЎРЏРЎвЂ Р С‘РЎРЏ Р СР С•Р Т‘Р С—Р В°Р С”Р С•Р Р†: Р С”Р В°Р В¶Р Т‘Р В°РЎРЏ РЎРѓР В±Р С•РЎР‚Р С”Р В° Р С—Р С•Р В»РЎС“РЎвЂЎР В°Р ВµРЎвЂљ РЎРѓР Р†Р С•РЎР‹ Р С—Р В°Р С—Р С”РЎС“ Р Т‘Р В»РЎРЏ mods/config/saves
        // (Р С”РЎР‚Р С•Р СР Вµ Р Р†Р Р…РЎС“РЎвЂљРЎР‚Р ВµР Р…Р Р…Р С‘РЎвЂ¦ fabric-loader Р С—РЎР‚Р С•РЎвЂћР С‘Р В»Р ВµР в„– Р С‘ Cristalix-РЎРѓР В±Р С•РЎР‚Р С•Р С”, Р С”Р С•РЎвЂљР С•РЎР‚РЎвЂ№Р Вµ РЎР‚Р В°Р В±Р С•РЎвЂљР В°РЎР‹РЎвЂљ Р С‘Р В· РЎРѓР Р†Р С•Р С‘РЎвЂ¦ Р С—Р В°Р С—Р С•Р С” Р Р…Р В°Р С—РЎР‚РЎРЏР СРЎС“РЎР‹)
        if (!options.versionId.startsWith('fabric-loader-') && options.versionType !== 'cristalix') {
          const instanceDir = path.join(gameDir, 'versions', options.versionId);
          if (!fs.existsSync(instanceDir)) {
            fs.mkdirSync(instanceDir, { recursive: true });
          }
          
          // Создаем базовую структуру папок сразу, чтобы пользователь мог закинуть файлы до первого запуска игры
          const defaultFolders = ['mods', 'saves', 'resourcepacks', 'shaderpacks', 'config'];
          for (const folder of defaultFolders) {
            const folderPath = path.join(instanceDir, folder);
            if (!fs.existsSync(folderPath)) {
              fs.mkdirSync(folderPath, { recursive: true });
            }
          }
          
          launchOpts.overrides.gameDirectory = instanceDir;
          console.log(`[LauncherCore] Р ВР В·Р С•Р В»Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р Р…Р В°РЎРЏ Р С—Р В°Р С—Р С”Р В° Р СР С•Р Т‘Р С—Р В°Р С”Р В°: ${instanceDir}`);
        }
      }

      // Р СџР С•Р Т‘Р С–Р С•РЎвЂљР С•Р Р†Р С”Р В° Р С—Р С•Р Т‘РЎвЂ¦Р С•Р Т‘РЎРЏРЎвЂ°Р ВµР в„– Р Р†Р ВµРЎР‚РЎРѓР С‘Р С‘ Java
      let javaPath = 'java';
      try {
        const javaManager = require('./java-manager');
        javaPath = await javaManager.findOrPrepareJava(resolvedMcVersion || options.versionId, gameDir, mainWindow);
        console.log(`[LauncherCore] Р ВРЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р ВµР С Java: ${javaPath}`);
      } catch (javaErr) {
        console.error('[LauncherCore] Р С›РЎв‚¬Р С‘Р В±Р С”Р В° Р С—РЎР‚Р С‘ Р С—Р С•Р Т‘Р С–Р С•РЎвЂљР С•Р Р†Р С”Р Вµ Java, Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р ВµР С РЎРѓР С‘РЎРѓРЎвЂљР ВµР СР Р…РЎС“РЎР‹:', javaErr);
      }
      launchOpts.javaPath = javaPath;

      // 7. Р ВР Р…Р С‘РЎвЂ Р С‘Р В°Р В»Р С‘Р В·Р В°РЎвЂ Р С‘РЎРЏ Р С”Р В»Р С‘Р ВµР Р…РЎвЂљР В° MCLC
      const launcher = new Client();

      // --- Р СџР С•Р Т‘Р С—Р С‘РЎРѓР С”Р С‘ Р Р…Р В° РЎРѓР С•Р В±РЎвЂ№РЎвЂљР С‘РЎРЏ MCLC ---
      
      // Р СџР ВµРЎР‚Р ВµР Т‘Р В°РЎвЂЎР В° Р С•РЎвЂљР В»Р В°Р Т‘Р С•РЎвЂЎР Р…Р С•Р в„– Р С‘Р Р…РЎвЂћР С•РЎР‚Р СР В°РЎвЂ Р С‘Р С‘
      launcher.on('debug', (msg) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('launch-debug', msg);
        }
      });

      // Р СџР ВµРЎР‚Р ВµР Т‘Р В°РЎвЂЎР В° stdout Р Т‘Р В°Р Р…Р Р…РЎвЂ№РЎвЂ¦ Р С‘Р С–РЎР‚РЎвЂ№ (Р В»Р С•Р С–Р С‘ Minecraft)
      launcher.on('data', (data) => {
        console.log('[Minecraft LOG]', data);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('launch-data', data);
        }
      });

      // Р СџР ВµРЎР‚Р ВµР Т‘Р В°РЎвЂЎР В° Р С•Р В±РЎвЂ°Р ВµР С–Р С• Р С—РЎР‚Р С•Р С–РЎР‚Р ВµРЎРѓРЎРѓР В° РЎРѓР С”Р В°РЎвЂЎР С‘Р Р†Р В°Р Р…Р С‘РЎРЏ Р В°РЎРѓРЎРѓР ВµРЎвЂљР С•Р Р†/Р В»Р С‘Р Р…Р ВµР в„–Р С”Р С‘ Р В±Р С‘Р В±Р В»Р С‘Р С•РЎвЂљР ВµР С”
      launcher.on('progress', (progress) => {
        // progress = { type: 'assets' | 'natives' | 'classes', task: number, total: number }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('launch-progress', progress);
        }
      });

      // Р вЂќР ВµРЎвЂљР В°Р В»РЎРЉР Р…РЎвЂ№Р в„– РЎРѓРЎвЂљР В°РЎвЂљРЎС“РЎРѓ Р С—Р С•РЎвЂћР В°Р в„–Р В»Р С•Р Р†Р С•
      launcher.on('download-status', (status) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-status', status);
        }
      });

      // Р вЂ”Р В°Р С”РЎР‚РЎвЂ№РЎвЂљР С‘Р Вµ Р С—РЎР‚Р С•РЎвЂ Р ВµРЎРѓРЎРѓР В° Minecraft
            // Р—Р°РєСЂС‹С‚РёРµ РїСЂРѕС†РµСЃСЃР° Minecraft
      launcher.on('close', (code) => {
        console.log(`[LauncherCore] РРіСЂР° Р·Р°РєСЂС‹Р»Р°СЃСЊ СЃ РєРѕРґРѕРј: ${code}`);
        
        let crashReport = null;
        if (code !== 0) {
          const instanceDir = launchOpts.overrides.gameDirectory || gameDir;
          crashReport = getLatestCrashReport(instanceDir) || getLatestJvmCrash(instanceDir);
          if (crashReport) {
            console.log('[LauncherCore] РќР°Р№РґРµРЅ РєСЂР°С€-СЂРµРїРѕСЂС‚:\n' + crashReport);
          }
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('launch-close', { code, crashReport });
        }
        resolve({ status: 'closed', code, crashReport });
      });

      // Ошибки запуска
      launcher.on('error', (err) => {
        console.error('[LauncherCore] Ошибка запуска игры:', err);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('launch-error', err.toString());
        }
        reject(err);
      });

      // 8. Очистка битых JSON файлов (если загрузка прервалась)
      try {
        const checkJson = (filePath) => {
          if (!fs.existsSync(filePath)) return;
          try {
            const data = fs.readFileSync(filePath, 'utf8');
            JSON.parse(data);
          } catch (e) {
            console.log(`[LauncherCore] Удален поврежденный файл: ${filePath}`);
            fs.unlinkSync(filePath);
          }
        };
        const root = launchOpts.root;
        if (root) {
          const vPath = path.join(root, 'versions', launchOpts.version.number, `${launchOpts.version.number}.json`);
          checkJson(vPath);
          const iPath = path.join(root, 'assets', 'indexes', `${launchOpts.version.number}.json`);
          checkJson(iPath);
          const mPath = path.join(root, 'version_manifest_v2.json');
          checkJson(mPath);
        }
      } catch (err) {
        console.error('[LauncherCore] Ошибка при очистке JSON:', err);
      }

      console.log('[LauncherCore] Начинаем запуск (launch)...');
      console.log('[LauncherCore] launchOpts.javaPath:', launchOpts.javaPath);
      console.log('[LauncherCore] launchOpts.version:', JSON.stringify(launchOpts.version));
      const gameProcess = await launcher.launch(launchOpts);
      
      if (gameProcess) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('launch-started');
        }

        // Отвязываем дочерний процесс от Electron
        gameProcess.unref();
        console.log('[LauncherCore] Процесс Minecraft отвязан (unrefed) успешно.');

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
        // MCLC вернул null — не удалось запустить Minecraft
        console.error('[LauncherCore] MCLC вернул null — не удалось запустить Minecraft.');
        reject(new Error('Не удалось запустить Minecraft. Проверьте консоль для деталей (Ctrl+Shift+D).'));
      }
      
    } catch (err) {
      console.error('[LauncherCore] Критическая ошибка при подготовке запуска:', err);
      reject(err);
    }
  });
}

module.exports = {
  launchMinecraft
};
