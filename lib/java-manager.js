// ============================================
// java-manager.js — Java Runtime Manager
// Автоматический поиск и загрузка нужных версий Java
// ============================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

/**
 * Извлекает базовую версию Minecraft из ID выбранной версии
 * @param {string} versionId 
 * @param {string} gameDir 
 * @returns {string} Базовая версия Minecraft (например, '1.20.4')
 */
function getBaseMinecraftVersion(versionId, gameDir) {
  // 1. Встроенная сборка
  if (versionId === 'optimized-fabric-1.20.4') {
    return '1.20.4';
  }

  // 2. Читаем из JSON кастомной версии
  const customJsonPath = path.join(gameDir, 'versions', versionId, `${versionId}.json`);
  if (fs.existsSync(customJsonPath)) {
    try {
      const json = JSON.parse(fs.readFileSync(customJsonPath, 'utf8'));
      if (json.inheritsFrom) {
        return json.inheritsFrom;
      }
    } catch (e) {
      console.warn(`[JavaManager] Не удалось прочитать inheritsFrom из JSON версии:`, e.message);
    }
  }

  // 3. Парсим регулярным выражением (например, '26.3-snapshot-1' -> '26.3', '1.20.4' -> '1.20.4')
  const match = versionId.match(/((\d+\.)+\d+)/);
  if (match) {
    return match[1];
  }

  // Дефолтный фоллбек на современную версию
  return '1.20.4';
}

/**
 * Определяет требуемую мажорную версию Java по версии игры
 * @param {string} mcVersion 
 * @param {string} versionId 
 * @returns {number} Мажорная версия Java (8, 17, 21, 25)
 */
function getRequiredJavaVersion(mcVersion, versionId = '') {
  // Обработка снапшотов по году выпуска (например, 25w14a)
  if (versionId && /^\d+w/.test(versionId)) {
    const year = parseInt(versionId.substring(0, 2), 10);
    if (year >= 25) {
      return 25; // Снапшоты 2025 года и новее требуют Java 25
    }
    if (year >= 24) {
      return 21; // Снапшоты 2024 года требуют Java 21
    }
    if (year >= 21) {
      return 17; // Снапшоты 2021-2023 требуют Java 17
    }
  }

  const parts = mcVersion.split('.').map(Number);
  const major = parts[0] || 0;
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;

  // Если мажорная версия больше 1 (например, 26.3 или 25.0)
  if (major > 1) {
    if (major >= 25) {
      return 25;
    }
    return 21;
  }

  // Для версий 1.x.y
  if (major === 1) {
    // Minecraft 1.25+ требует Java 25
    if (minor >= 25) {
      return 25;
    }
    // Minecraft 1.20.5+ требует Java 21
    if (minor > 20 || (minor === 20 && patch >= 5)) {
      return 21;
    }
    // Minecraft 1.18 - 1.20.4 требует Java 17
    if (minor >= 18) {
      return 17;
    }
    // Minecraft 1.17 требует Java 16/17 (используем 17 LTS для совместимости)
    if (minor === 17) {
      return 17;
    }
    // Minecraft 1.16.5 и ниже требует Java 8
    return 8;
  }

  return 17;
}

/**
 * Ищет Java нужной версии в папке официального лаунчера Minecraft
 * @param {number} requiredVersion 
 * @returns {string|null} Путь к java.exe или null
 */
function findOfficialLauncherJava(requiredVersion) {
  if (process.platform !== 'win32') return null;

  const appData = process.env.APPDATA;
  const localAppData = process.env.LOCALAPPDATA;

  const searchPaths = [];
  if (appData) {
    searchPaths.push(path.join(appData, '.minecraft', 'runtime'));
  }
  if (localAppData) {
    searchPaths.push(path.join(localAppData, 'Packages', 'Microsoft.4297127D64ECE_8wekyb3d8bbwe', 'LocalCache', 'Local', 'runtime'));
  }

  // Маппинг требуемой версии на названия папок рантайма Mojang
  let runtimeNames = [];
  if (requiredVersion === 8) {
    runtimeNames = ['jre-legacy'];
  } else if (requiredVersion === 17) {
    runtimeNames = ['java-runtime-gamma', 'java-runtime-beta', 'java-runtime-alpha'];
  } else if (requiredVersion === 21) {
    runtimeNames = ['java-runtime-delta'];
  }

  for (const basePath of searchPaths) {
    if (!fs.existsSync(basePath)) continue;

    for (const name of runtimeNames) {
      const runtimeDir = path.join(basePath, name);
      if (!fs.existsSync(runtimeDir)) continue;

      const foundPath = findJavaExecutableRecursive(runtimeDir, 0);
      if (foundPath) {
        console.log(`[JavaManager] Найден Java ${requiredVersion} в официальном рантайме: ${foundPath}`);
        return foundPath;
      }
    }
  }

  return null;
}

/**
 * Рекурсивный поиск java.exe во вложенных папках
 */
function findJavaExecutableRecursive(dir, depth) {
  if (depth > 4) return null;
  try {
    const files = fs.readdirSync(dir);

    // Сначала ищем в текущей папке
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && file.toLowerCase() === 'java.exe') {
        return fullPath;
      }
    }

    // Идём глубже
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const res = findJavaExecutableRecursive(fullPath, depth + 1);
        if (res) return res;
      }
    }
  } catch (e) {
    // Игнорируем ошибки доступа
  }
  return null;
}

/**
 * Ищет Java нужной версии в системных папках (Program Files)
 * @param {number} requiredVersion 
 * @returns {string|null} Путь к java.exe или null
 */
function findSystemJava(requiredVersion) {
  if (process.platform !== 'win32') return null;

  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env['ProgramFiles(x86)'];

  const searchDirs = [];
  if (programFiles) {
    searchDirs.push(path.join(programFiles, 'Java'));
    searchDirs.push(path.join(programFiles, 'Eclipse Adoptium'));
    searchDirs.push(path.join(programFiles, 'BellSoft'));
    searchDirs.push(path.join(programFiles, 'Microsoft'));
  }
  if (programFilesX86) {
    searchDirs.push(path.join(programFilesX86, 'Java'));
  }

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      const subdirs = fs.readdirSync(dir);
      for (const subdir of subdirs) {
        const fullSubdirPath = path.join(dir, subdir);
        let match = false;

        if (requiredVersion === 8) {
          match = subdir.includes('1.8') || subdir.toLowerCase().includes('jre8') || subdir.toLowerCase().includes('jdk8');
        } else {
          match = subdir.includes(String(requiredVersion));
        }

        if (match) {
          const javaExe = findJavaExecutableRecursive(fullSubdirPath, 0);
          if (javaExe) {
            console.log(`[JavaManager] Найден системный Java ${requiredVersion} в папке: ${javaExe}`);
            return javaExe;
          }
        }
      }
    } catch (e) {
      // Игнорируем ошибки чтения папки
    }
  }

  return null;
}

/**
 * Проверяет, соответствует ли системная Java по умолчанию требуемой версии
 * @param {number} requiredVersion 
 * @returns {boolean}
 */
function isDefaultJavaCorrect(requiredVersion) {
  try {
    // java -version пишет в stderr, а не stdout!
    // Используем execSync с stdio: 'pipe' и перехватываем stderr из ошибки
    let output = '';
    try {
      output = execSync('java -version 2>&1', { stdio: 'pipe', shell: true }).toString();
    } catch (e) {
      // Некоторые JVM возвращают ненулевой exit code,
      // но всё равно пишут версию в stderr
      output = (e.stderr ? e.stderr.toString() : '') + (e.stdout ? e.stdout.toString() : '');
    }
    
    console.log(`[JavaManager] Системная Java: ${output.split('\n')[0]}`);
    
    if (requiredVersion === 8) {
      return output.includes('1.8.') || output.includes('version "8"');
    } else {
      return output.includes(`version "${requiredVersion}.`) || output.includes(` "${requiredVersion}.`);
    }
  } catch (e) {
    return false;
  }
}

/**
 * Скачивает портативную версию JRE с Adoptium и распаковывает её
 * @param {number} requiredVersion 
 * @param {string} gameDir 
 * @param {BrowserWindow} mainWindow 
 * @returns {Promise<string>} Путь к java.exe
 */
async function downloadPortableJava(requiredVersion, gameDir, mainWindow) {
  const archMap = {
    x64: 'x64',
    ia32: 'x86',
    arm64: 'aarch64'
  };
  const arch = archMap[process.arch] || 'x64';
  
  // Получаем ссылку Adoptium JRE
  const downloadUrl = `https://api.adoptium.net/v3/binary/latest/${requiredVersion}/ga/windows/${arch}/jre/hotspot/normal/eclipse`;
  
  const runtimeFolder = path.join(gameDir, 'runtime');
  if (!fs.existsSync(runtimeFolder)) {
    fs.mkdirSync(runtimeFolder, { recursive: true });
  }

  const zipPath = path.join(runtimeFolder, `temp-java-${requiredVersion}.zip`);
  const tempExtractDir = path.join(runtimeFolder, `temp-java-${requiredVersion}-extract`);
  const finalDir = path.join(runtimeFolder, `java-${requiredVersion}`);
  const finalJavaExe = path.join(finalDir, 'bin', 'java.exe');

  try {
    // 1. Скачиваем архив с отображением прогресса в UI
    const filenameForUI = `Java ${requiredVersion} JRE`;
    console.log(`[JavaManager] Запуск скачивания Java ${requiredVersion} с: ${downloadUrl}`);
    
    const { downloadFileWithProgress } = require('./fabric-manager');
    await downloadFileWithProgress(downloadUrl, zipPath, filenameForUI, mainWindow);
    
    // 2. Распаковываем ZIP-архив
    console.log(`[JavaManager] Распаковка Java ${requiredVersion} во временную папку...`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-progress', {
        filename: `Распаковка Java ${requiredVersion}...`,
        percent: 50,
        downloadedMb: '0',
        totalMb: '0',
        speedMb: 0,
        timeLeftSec: -1
      });
    }

    if (fs.existsSync(tempExtractDir)) {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempExtractDir, { recursive: true });

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempExtractDir, true);

    // 3. Ищем извлеченную корневую директорию и переносим в финальную
    const files = fs.readdirSync(tempExtractDir);
    const rootDirName = files.find(f => fs.statSync(path.join(tempExtractDir, f)).isDirectory());
    if (!rootDirName) {
      throw new Error('Некорректная структура архива JRE (отсутствует корневая директория)');
    }

    const extractedRootPath = path.join(tempExtractDir, rootDirName);
    
    if (fs.existsSync(finalDir)) {
      fs.rmSync(finalDir, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(finalDir), { recursive: true });
    
    fs.renameSync(extractedRootPath, finalDir);
    console.log(`[JavaManager] Java ${requiredVersion} успешно установлена: ${finalJavaExe}`);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-progress', {
        filename: `Установка Java ${requiredVersion} завершена`,
        percent: 100,
        downloadedMb: '0',
        totalMb: '0',
        speedMb: 0,
        timeLeftSec: 0
      });
    }

    return finalJavaExe;
  } catch (err) {
    console.error(`[JavaManager] Ошибка при установке Java ${requiredVersion}:`, err);
    if (fs.existsSync(finalDir)) {
      fs.rmSync(finalDir, { recursive: true, force: true });
    }
    throw new Error(`Не удалось автоматически скачать и настроить Java ${requiredVersion}: ${err.message}`);
  } finally {
    // Чистим временные папки и файлы
    try {
      if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true, force: true });
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    } catch (e) {
      console.warn('[JavaManager] Предупреждение при очистке временных файлов:', e.message);
    }
  }
}

async function findOrPrepareJava(versionId, gameDir, mainWindow) {
  let javaPath = await _findOrPrepareJavaRaw(versionId, gameDir, mainWindow);
  
  if (process.platform === 'win32') {
    if (javaPath === 'java') {
      javaPath = 'javaw';
    } else {
      const javawPath = javaPath.replace(/\\java\.exe$/i, '\\javaw.exe');
      if (fs.existsSync(javawPath)) {
        javaPath = javawPath;
      }
    }
  }
  return javaPath;
}

async function _findOrPrepareJavaRaw(versionId, gameDir, mainWindow) {
  const mcVersion = getBaseMinecraftVersion(versionId, gameDir);
  const requiredVersion = getRequiredJavaVersion(mcVersion, versionId);

  console.log(`[JavaManager] Требуется версия Java: ${requiredVersion} (Minecraft: ${mcVersion}, ID: ${versionId})`);

  // 1. Проверяем уже скачанную нами локальную версию
  const localJavaPath = path.join(gameDir, 'runtime', `java-${requiredVersion}`, 'bin', 'java.exe');
  if (fs.existsSync(localJavaPath)) {
    console.log(`[JavaManager] Найдена локальная Java лаунчера: ${localJavaPath}`);
    return localJavaPath;
  }

  // 2. Проверяем системную Java по умолчанию
  if (isDefaultJavaCorrect(requiredVersion)) {
    console.log(`[JavaManager] Системная Java по умолчанию соответствует требуемой версии.`);
    return 'java';
  }

  // 3. Проверяем рантаймы официального лаунчера Minecraft
  const officialJavaPath = findOfficialLauncherJava(requiredVersion);
  if (officialJavaPath) {
    return officialJavaPath;
  }

  // 4. Проверяем системные папки (Program Files)
  const systemJavaPath = findSystemJava(requiredVersion);
  if (systemJavaPath) {
    return systemJavaPath;
  }

  // 5. Если ничего не нашли — скачиваем портативную версию
  console.log(`[JavaManager] Подходящая Java ${requiredVersion} не найдена на ПК. Начинаем автоматическую загрузку...`);
  return await downloadPortableJava(requiredVersion, gameDir, mainWindow);
}

module.exports = {
  findOrPrepareJava,
  getBaseMinecraftVersion,
  getRequiredJavaVersion
};
