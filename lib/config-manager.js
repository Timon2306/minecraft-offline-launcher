// ============================================
// config-manager.js — Config Management
// Сохранение и загрузка настроек лаунчера
// ============================================

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Путь к файлу настроек
const configPath = path.join(app.getPath('userData'), 'config.json');

// Дефолтная конфигурация
const DEFAULT_CONFIG = {
  nickname: '',
  selectedVersion: '', // Дефолтный выбор при первом запуске
  showSnapshots: false,
  ram: 4096, // 4096 МБ RAM по умолчанию
  jvmArgs: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions',
  gameDirectory: path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft-launcher'),
  language: 'ru', // Язык по умолчанию
  themeMode: 'auto', // Тема по умолчанию: Хамелеон Minecraft (было 'custom')
  allowedCristalixPacks: ['everyrage', 'skyvoid', 'magica', 'technomagic', 'galax', 'divinepvp']
};

let currentConfig = { ...DEFAULT_CONFIG };

/**
 * Загрузить конфигурацию из файла
 * @returns {object}
 */
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const fileData = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(fileData);
      
      // Объединяем с дефолтной, чтобы при обновлении структуры не ломалось
      currentConfig = { ...DEFAULT_CONFIG, ...parsed };
      
      // Если RAM записана в старом формате (например, 4 или 8 ГБ), автоматически переводим в МБ
      if (currentConfig.ram <= 64) {
        currentConfig.ram = currentConfig.ram * 1024;
      }
      
      console.log('[ConfigManager] Конфиг успешно загружен с диска.');
    } else {
      console.log('[ConfigManager] Файл настроек отсутствует. Создание дефолтного...');
      saveConfig(DEFAULT_CONFIG);
    }
  } catch (err) {
    console.error('[ConfigManager] Ошибка чтения/парсинга файла настроек. Используются дефолты.', err);
    currentConfig = { ...DEFAULT_CONFIG };
  }

  // Создаем папку игры, если она не существует
  try {
    if (!fs.existsSync(currentConfig.gameDirectory)) {
      fs.mkdirSync(currentConfig.gameDirectory, { recursive: true });
    }
  } catch (dirErr) {
    console.error('[ConfigManager] Не удалось создать игровую папку:', dirErr);
  }

  return currentConfig;
}

/**
 * Сохранить настройки в файл
 * @param {object} newData 
 * @returns {object}
 */
function saveConfig(newData) {
  try {
    currentConfig = { ...currentConfig, ...newData };
    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
    console.log('[ConfigManager] Настройки сохранены:', newData);
  } catch (err) {
    console.error('[ConfigManager] Не удалось сохранить настройки:', err);
  }
  return currentConfig;
}

/**
 * Получить текущие настройки
 * @returns {object}
 */
function getConfig() {
  const totalMemGb = Math.floor(os.totalmem() / (1024 * 1024 * 1024));
  return {
    ...currentConfig,
    systemTotalRamGb: totalMemGb
  };
}

module.exports = {
  loadConfig,
  saveConfig,
  getConfig
};
