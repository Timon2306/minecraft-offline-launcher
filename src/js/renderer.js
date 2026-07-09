// ==========================================================
// renderer.js — Renderer Process
// UI Logic, Dropdowns, IPC Event Listeners
// ==========================================================

import Ferrofluid from './ferrofluid.js';

const API = window.electronAPI;

// Элементы DOM
const btnMinimize = document.getElementById('btn-minimize');
const btnClose = document.getElementById('btn-close');

const nicknameInput = document.getElementById('nickname-input');
const versionDropdown = document.getElementById('version-dropdown');
const versionSelected = document.getElementById('version-selected');
const versionList = document.getElementById('version-list');
const versionListDynamic = document.getElementById('version-list-dynamic');
const snapshotsToggle = document.getElementById('snapshots-toggle');

const playButton = document.getElementById('play-button');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const statusText = document.getElementById('status-text');

const settingsIcon = document.getElementById('settings-icon');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsClose = document.getElementById('settings-close');
const ramSlider = document.getElementById('ram-slider');
const ramInput = document.getElementById('ram-input');
const jvmArgsInput = document.getElementById('jvm-args-input');
const languageSelect = document.getElementById('language-select');
const gameDirInput = document.getElementById('game-dir-input');
const browseGameDirBtn = document.getElementById('browse-game-dir-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const debugOverlay = document.getElementById('debug-overlay');
const copyLogBtn = document.getElementById('copy-log-btn');
const updateBlock = document.getElementById('update-block');
const installUpdateBtn = document.getElementById('install-update-btn');
const lblUpdateDesc = document.getElementById('lbl-update-desc');

const themeModeSelect = document.getElementById('theme-mode-select');
const hideOnLaunchCheckbox = document.getElementById('hide-on-launch-checkbox');

const minecraftBgContainer = document.getElementById('minecraft-bg-container');

let updateDownloadUrl = '';
let latestVersionStr = '';
let lastLaunchTime = 0;

// Навигация и Каталог модов
const modsBtn = document.getElementById('mods-btn');
const folderBtn = document.getElementById('folder-btn');
const githubBtn = document.getElementById('github-btn');
const githubBadge = document.getElementById('github-badge');
const catalogOverlay = document.getElementById('catalog-overlay');
const catalogClose = document.getElementById('catalog-close');
const catalogSearch = document.getElementById('catalog-search');
const catalogVersionFilter = document.getElementById('catalog-version-filter');
const catalogGrid = document.getElementById('catalog-grid');
const filterButtons = document.querySelectorAll('.filter-btn');
const importZipBtn = document.getElementById('import-zip-btn');
const createInstanceBtn = document.getElementById('create-instance-btn');

// Элементы создания сборки
const createModpackOverlay = document.getElementById('create-modpack-overlay');
const createModpackClose = document.getElementById('create-modpack-close');
const modpackNameInput = document.getElementById('modpack-name-input');
const modpackVersionSelect = document.getElementById('modpack-version-select');
const modpackLoaderSelect = document.getElementById('modpack-loader-select');
const createModpackBtn = document.getElementById('create-modpack-btn');

let allVersionsData = null; // Будет хранить весь манифест версий для селектора сборок

// Локализация лаунчера
const TRANSLATIONS = {
  ru: {
    play: "ИГРАТЬ",
    launching: "ЗАПУСК...",
    launched: "Игра запущена!",
    loadingVersions: "Загрузка версий...",
    snapshots: "Снапшоты",
    ramLabel: "Выделение оперативной памяти",
    jvmLabel: "Аргументы JVM",
    langLabel: "Язык интерфейса",
    saveBtn: "СОХРАНИТЬ",
    searchPlaceholder: "Поиск модов и сборок...",
    filterModpacks: "СБОРКИ",
    filterMods: "МОДЫ",
    settingsTitle: "Настройки",
    download: "Скачать",
    downloading: "Скачивание",
    downloadingSpeed: "Скачивание {file}: {mb} МБ ({percent}%) — {speed} МБ/с | Осталось: {time}",
    installed: "Установлено",
    error: "Ошибка",
    close: "Закрыть",
    nicknamePlaceholder: "Никнейм",
    tabCatalog: "Моды и сборки",
    gameDirLabel: "Папка игры",
    gameDirHint: "При смене папки игры старые моды и сборки не переносятся автоматически.",
    browseBtn: "Обзор...",
    updateAvailable: "Доступно обновление!",
    updateDesc: "Доступна новая версия v{version}. Хотите обновиться?",
    updateBtn: "ОБНОВИТЬ СЕЙЧАС",
    tabGeneral: "Основные",
    tabJava: "Запуск и Java",
    tabAppearance: "Внешний вид",
    hideOnLaunch: "Сворачивать лаунчер в трей при запуске",
    themeLabel: "Оформление лаунчера",
    themeCustom: "Кастомный (React-жидкость)",
    themeAuto: "Автоматический (Хамелеон Minecraft) (BETA)",
    importZip: "ИМПОРТ ZIP",
    importZipTitle: "Установить локальную сборку из .zip или .mrpack",
    createInstance: "СОЗДАТЬ СБОРКУ",
    createInstanceTitle: "Создать собственную сборку",
    statusInit: "Инициализация...",
    minimize: "Свернуть",
    openFolder: "Открыть папку игры",
    githubRepo: "Репозиторий GitHub",
    
    // Новые ключи перевода
    allVersions: "Все версии",
    createTitle: "Создать сборку модов",
    modpackNameLabel: "Название сборки",
    modpackNamePlaceholder: "Например: Custom Pack",
    minecraftVersionLabel: "Версия Minecraft",
    loaderLabel: "Загрузчик модов",
    loaderVanilla: "Чистая ванилла (без модов)",
    createBtn: "СОЗДАТЬ",
    creating: "СОЗДАНИЕ...",
    preparingDownload: "Подготовка скачивания {title}...",
    successInstalled: "Успешно установлено: {title}!",
    vanillaDownloadError: "Нельзя скачивать моды на чистую ванильную версию! Пожалуйста, выберите сборку (например, Optimized Fabric или создайте свою) в главном меню.",
    unknownDownloadError: "Неизвестная ошибка скачивания",
    errorLoadingData: "Ошибка загрузки данных. Проверьте соединение с интернетом.",
    nothingFound: "Ничего не найдено",
    loadingFromModrinth: "Загрузка данных с Modrinth...",
    gameStartedWaiting: "Игра запущена! Ожидание окна...",
    inGame: "В ИГРЕ",
    gameCrash: "Вылет игры! {error}",
    gameLaunchError: "Ошибка запуска игры (код {code}). Нажмите Ctrl+Shift+D для логов.",
    preparingGameFiles: "Подготовка файлов игры...",
    libraries: "Библиотеки",
    assets: "Ассеты",
    preparing: "Подготовка",
    unpackingNatives: "Распаковка нативных библиотек...",
    installingFabric: "Установка Fabric Loader...",
    installingMods: "Установка модов...",
    calculating: "расчет...",
    minShort: "мин.",
    secShort: "сек.",
    done: "завершено",
    selectModpackError: "Сначала выберите или создайте сборку на главном экране!",
    modsOnlyForModpacks: "Скачивание модов доступно только для сборок (Forge/Fabric)!",
    versionLockedForBuild: "Версия заблокирована под выбранную сборку",
    filterByGameVersion: "Фильтр по версии игры",
    versionSelectedAuto: "версия выбирается автоматически",
    modpackCreated: "Сборка \"{name}\" успешно создана!",
    enterModpackNameAlert: "Пожалуйста, введите название сборки!",
    zipExtracting: "Распаковка архива сборки...",
    zipImportSuccess: "Сборка модов успешно импортирована: {name}",
    errorLabel: "Ошибка: {msg}",
    deleteModpackConfirm: "Вы уверены, что хотите удалить сборку \"{name}\" и ВСЕ её моды?"
  },
  en: {
    play: "PLAY",
    launching: "LAUNCHING...",
    launched: "Game launched!",
    loadingVersions: "Loading versions...",
    snapshots: "Snapshots",
    ramLabel: "RAM Allocation",
    jvmLabel: "JVM Arguments",
    langLabel: "Interface Language",
    saveBtn: "SAVE",
    searchPlaceholder: "Search mods and modpacks...",
    filterModpacks: "MODPACKS",
    filterMods: "MODS",
    settingsTitle: "Settings",
    download: "Download",
    downloading: "Downloading",
    downloadingSpeed: "Downloading {file}: {mb} MB ({percent}%) — {speed} MB/s | ETA: {time}",
    installed: "Installed",
    error: "Error",
    close: "Close",
    nicknamePlaceholder: "Nickname",
    tabCatalog: "Mods & Packs",
    gameDirLabel: "Game Folder",
    gameDirHint: "Changing game folder won't transfer existing mods and versions automatically.",
    browseBtn: "Browse...",
    updateAvailable: "Update Available!",
    updateDesc: "A new version v{version} is available. Update now?",
    updateBtn: "UPDATE NOW",
    tabGeneral: "General",
    tabJava: "Launch & Java",
    tabAppearance: "Appearance",
    hideOnLaunch: "Minimize launcher to tray on start",
    themeLabel: "Launcher Theme",
    themeCustom: "Custom (React-Liquid)",
    themeAuto: "Automatic (Minecraft Chameleon) (BETA)",
    importZip: "IMPORT ZIP",
    importZipTitle: "Install local modpack from .zip or .mrpack",
    createInstance: "CREATE INSTANCE",
    createInstanceTitle: "Create your own instance",
    statusInit: "Initializing...",
    minimize: "Minimize",
    openFolder: "Open Game Folder",
    githubRepo: "GitHub Repository",
    
    // New translation keys
    allVersions: "All versions",
    createTitle: "Create Modpack",
    modpackNameLabel: "Modpack Name",
    modpackNamePlaceholder: "e.g. Custom Pack",
    minecraftVersionLabel: "Minecraft Version",
    loaderLabel: "Mod Loader",
    loaderVanilla: "Vanilla (no mods)",
    createBtn: "CREATE",
    creating: "CREATING...",
    preparingDownload: "Preparing download for {title}...",
    successInstalled: "Successfully installed: {title}!",
    vanillaDownloadError: "Cannot download mods to a pure vanilla version! Please choose a modpack (e.g. Optimized Fabric or create your own) in the main menu.",
    unknownDownloadError: "Unknown download error",
    errorLoadingData: "Error loading data. Please check your internet connection.",
    nothingFound: "Nothing found",
    loadingFromModrinth: "Loading data from Modrinth...",
    gameStartedWaiting: "Game started! Waiting for window...",
    inGame: "IN GAME",
    gameCrash: "Game crashed! {error}",
    gameLaunchError: "Game launch error (code {code}). Press Ctrl+Shift+D for logs.",
    preparingGameFiles: "Preparing game files...",
    libraries: "Libraries",
    assets: "Assets",
    preparing: "Preparing",
    unpackingNatives: "Unpacking native libraries...",
    installingFabric: "Installing Fabric Loader...",
    installingMods: "Installing mods...",
    calculating: "calculating...",
    minShort: "min.",
    secShort: "sec.",
    done: "done",
    selectModpackError: "Please select or create a modpack on the main screen first!",
    modsOnlyForModpacks: "Downloading mods is only available for modpacks (Forge/Fabric)!",
    versionLockedForBuild: "Version locked for selected modpack",
    filterByGameVersion: "Filter by game version",
    versionSelectedAuto: "version selected automatically",
    modpackCreated: "Modpack \"{name}\" created successfully!",
    enterModpackNameAlert: "Please enter a name for the modpack!",
    zipExtracting: "Extracting modpack archive...",
    zipImportSuccess: "Modpack successfully imported: {name}",
    errorLabel: "Error: {msg}",
    deleteModpackConfirm: "Are you sure you want to delete the modpack \"{name}\" and ALL its mods?"
  }
};

let currentLang = 'ru';

// Применить локализацию к элементам интерфейса
const applyLanguage = (lang) => {
  currentLang = lang || 'ru';
  const t = TRANSLATIONS[currentLang];

  // Главный экран
  if (playButton.textContent === 'ИГРАТЬ' || playButton.textContent === 'PLAY') {
    playButton.textContent = t.play;
  }
  nicknameInput.placeholder = t.nicknamePlaceholder;
  
  // Выпадающий список версий
  const snapshotsSpan = versionList.querySelector('.snapshots-toggle-container span');
  if (snapshotsSpan) snapshotsSpan.textContent = t.snapshots;
  
  // Настройки
  const modalTitle = settingsOverlay.querySelector('.modal-header h2');
  if (modalTitle) modalTitle.textContent = t.settingsTitle;
  
  const ramLabel = document.getElementById('lbl-ram');
  if (ramLabel) ramLabel.textContent = t.ramLabel;
  
  const ramUnit = document.getElementById('lbl-ram-unit');
  if (ramUnit) ramUnit.textContent = currentLang === 'ru' ? 'МБ' : 'MB';
  
  const jvmLabel = document.getElementById('lbl-jvm');
  if (jvmLabel) jvmLabel.textContent = t.jvmLabel;
  
  const langLabel = document.getElementById('lbl-language');
  if (langLabel) langLabel.textContent = t.langLabel;

  const lblGameDir = document.getElementById('lbl-game-directory');
  if (lblGameDir) lblGameDir.textContent = t.gameDirLabel;
  const lblGameDirHint = document.getElementById('lbl-game-directory-hint');
  if (lblGameDirHint) lblGameDirHint.textContent = t.gameDirHint;
  const btnBrowse = document.getElementById('browse-game-dir-btn');
  if (btnBrowse) btnBrowse.textContent = t.browseBtn;
  
  const lblUpdateAvailable = document.getElementById('lbl-update-available');
  if (lblUpdateAvailable) lblUpdateAvailable.textContent = t.updateAvailable;
  if (lblUpdateDesc) lblUpdateDesc.textContent = t.updateDesc.replace('{version}', latestVersionStr || '1.0.1');
  if (installUpdateBtn) installUpdateBtn.textContent = t.updateBtn;

  // Вкладки настроек
  const tabGeneral = document.querySelector('.settings-tab-btn[data-tab="general"]');
  if (tabGeneral) tabGeneral.textContent = t.tabGeneral;
  
  const tabJava = document.getElementById('btn-tab-launch');
  if (tabJava) tabJava.textContent = t.tabJava;

  const tabAppearance = document.querySelector('.settings-tab-btn[data-tab="appearance"]');
  if (tabAppearance) tabAppearance.textContent = t.tabAppearance;

  // Доп настройки
  const lblHide = document.getElementById('lbl-hide-on-launch');
  if (lblHide) lblHide.textContent = t.hideOnLaunch;
  
  const lblTheme = document.getElementById('lbl-theme-mode');
  if (lblTheme) lblTheme.textContent = t.themeLabel;

  if (themeModeSelect) {
    const optCustom = themeModeSelect.querySelector('option[value="custom"]');
    if (optCustom) optCustom.textContent = t.themeCustom;

    const optAuto = themeModeSelect.querySelector('option[value="auto"]');
    if (optAuto) optAuto.textContent = t.themeAuto;
  }

  saveSettingsBtn.textContent = t.saveBtn;

  // Каталог модов
  const catalogTitle = document.getElementById('lbl-catalog-title');
  if (catalogTitle) catalogTitle.textContent = t.tabCatalog;
  catalogSearch.placeholder = t.searchPlaceholder;
  filterButtons.forEach(btn => {
    const type = btn.dataset.type;
    if (type === 'modpack') btn.textContent = t.filterModpacks;
    if (type === 'mod') btn.textContent = t.filterMods;
  });

  // Остальные мелкие элементы
  const btnMinimize = document.getElementById('btn-minimize');
  if (btnMinimize) btnMinimize.title = t.minimize;
  const btnClose = document.getElementById('btn-close');
  if (btnClose) btnClose.title = t.close;
  const modsBtn = document.getElementById('mods-btn');
  if (modsBtn) modsBtn.title = t.tabCatalog;
  const folderBtn = document.getElementById('folder-btn');
  if (folderBtn) folderBtn.title = t.openFolder;
  const githubBtn = document.getElementById('github-btn');
  if (githubBtn) githubBtn.title = t.githubRepo;
  const catalogClose = document.getElementById('catalog-close');
  if (catalogClose) catalogClose.title = t.close;
  const settingsClose = document.getElementById('settings-close');
  if (settingsClose) settingsClose.title = t.close;

  const importZipBtn = document.getElementById('import-zip-btn');
  if (importZipBtn) {
    importZipBtn.textContent = t.importZip;
    importZipBtn.title = t.importZipTitle;
  }
  const createInstanceBtn = document.getElementById('create-instance-btn');
  if (createInstanceBtn) {
    createInstanceBtn.textContent = t.createInstance;
    createInstanceBtn.title = t.createInstanceTitle;
  }

  // Оверлей создания сборки (Модалка)
  const createModpackTitle = document.querySelector('#create-modpack-modal h2');
  if (createModpackTitle) createModpackTitle.textContent = t.createTitle;
  
  const createModpackClose = document.getElementById('create-modpack-close');
  if (createModpackClose) createModpackClose.title = t.close;

  const lblModpackName = document.querySelector('#create-modpack-modal label[for="modpack-name-input"]');
  if (lblModpackName) lblModpackName.textContent = t.modpackNameLabel;
  if (modpackNameInput) modpackNameInput.placeholder = t.modpackNamePlaceholder;

  const lblModpackVersion = document.querySelector('#create-modpack-modal label[for="modpack-version-select"]');
  if (lblModpackVersion) lblModpackVersion.textContent = t.minecraftVersionLabel;

  const lblModpackLoader = document.querySelector('#create-modpack-modal label[for="modpack-loader-select"]');
  if (lblModpackLoader) lblModpackLoader.textContent = t.loaderLabel;

  if (modpackLoaderSelect) {
    const optVanilla = modpackLoaderSelect.querySelector('option[value="vanilla"]');
    if (optVanilla) optVanilla.textContent = t.loaderVanilla;
  }

  if (createModpackBtn && createModpackBtn.textContent !== 'СОЗДАНИЕ...' && createModpackBtn.textContent !== 'CREATING...') {
    createModpackBtn.textContent = t.createBtn;
  }

  // Каталог версий фильтр
  if (catalogVersionFilter) {
    const optAll = catalogVersionFilter.querySelector('option[value=""]');
    if (optAll) optAll.textContent = t.allVersions;
  }

  const statusText = document.getElementById('status-text');
  if (statusText && (statusText.textContent === "Инициализация..." || statusText.textContent === "Initializing...")) {
    statusText.textContent = t.statusInit;
  }
};

// Красивое форматирование названий версий для UI
const formatVersionName = (versionId) => {
  
  if (versionId.startsWith('cristalix-')) {
    return `🌌 ${versionId.replace('cristalix-', '')} (Cristalix)`;
  }
  
  if (versionId.startsWith('fabric-loader-')) {
    const parts = versionId.split('-');
    if (parts.length >= 4) {
      const loaderVer = parts[2];
      const mcVer = parts[3];
      return `Fabric ${mcVer} (Loader ${loaderVer})`;
    }
    return versionId.replace('fabric-loader-', 'Fabric ');
  }
  
  return versionId;
};

// Глобальные переменные UI
let selectedVersionId = '';
let selectedVersionType = '';
let config = {};
let backgroundFluid = null;

// ==========================================================
// 1. УПРАВЛЕНИЕ ОКНОМ (Тайтлбар)
// ==========================================================
btnMinimize.addEventListener('click', () => API.minimizeWindow());
btnClose.addEventListener('click', () => API.closeWindow());

// ==========================================================
// 2. ОТКРЫТИЕ И ЗАКРЫТИЕ НАСТРОЕК
// ==========================================================
settingsIcon.addEventListener('click', () => {
  settingsOverlay.classList.add('open');
});

const closeSettings = () => {
  settingsOverlay.classList.remove('open');
};

settingsClose.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) closeSettings();
});

// Переключение вкладок в меню настроек
const tabButtons = document.querySelectorAll('.settings-tab-btn');
const tabContents = document.querySelectorAll('.settings-tab-content');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.getAttribute('data-tab');
    
    // Снимаем active со всех вкладок-кнопок
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Показываем только выбранную вкладку
    tabContents.forEach(c => {
      if (c.id === `tab-${tabId}`) {
        c.classList.remove('hidden');
      } else {
        c.classList.add('hidden');
      }
    });
  });
});

// Закрытие окон на Escape
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (settingsOverlay.classList.contains('open')) closeSettings();
    if (catalogOverlay.classList.contains('open')) closeCatalog();
  }
});

// Синхронизация слайдера и инпута RAM
ramSlider.addEventListener('input', (e) => {
  ramInput.value = parseInt(e.target.value) * 1024;
});

ramInput.addEventListener('input', (e) => {
  const mbValue = parseInt(e.target.value) || 1024;
  ramSlider.value = Math.round(mbValue / 1024);
});

ramInput.addEventListener('change', (e) => {
  let val = parseInt(e.target.value) || 1024;
  const minVal = parseInt(ramInput.min) || 1024;
  const maxVal = parseInt(ramInput.max) || 16384;
  
  if (val < minVal) val = minVal;
  if (val > maxVal) val = maxVal;
  
  ramInput.value = val;
  ramSlider.value = Math.round(val / 1024);
});

// Кнопка выбора папки игры
browseGameDirBtn.addEventListener('click', async () => {
  const selectedPath = await API.selectDirectory();
  if (selectedPath) {
    gameDirInput.value = selectedPath;
  }
});

// Сохранение настроек из модалки
saveSettingsBtn.addEventListener('click', async () => {
  const ram = parseInt(ramInput.value) || 4096;
  const jvmArgs = jvmArgsInput.value.trim();
  const language = languageSelect.value;
  const gameDirectory = gameDirInput.value;
  const themeMode = themeModeSelect.value;
  const hideOnLaunch = hideOnLaunchCheckbox.checked;

  const directoryChanged = config.gameDirectory !== gameDirectory;

  config.ram = ram;
  config.jvmArgs = jvmArgs;
  config.language = language;
  config.gameDirectory = gameDirectory;
  config.themeMode = themeMode;
  config.hideOnLaunch = hideOnLaunch;

  await API.saveConfig({ ram, jvmArgs, language, gameDirectory, themeMode, hideOnLaunch });
  applyLanguage(language);
  
  // Применяем тему
  applyThemeMode(themeMode, selectedVersionId);
  
  if (directoryChanged) {
    console.log(`[Renderer] Папка игры изменена. Перезагрузка версий из: ${gameDirectory}`);
    await initVersions();
  }
  
  closeSettings();
});

// ==========================================================
// 3. КАСТОМНЫЙ ВЫПАДАЮЩИЙ СПИСОК (Dropdown)
// ==========================================================
versionSelected.addEventListener('click', (e) => {
  e.stopPropagation();
  versionDropdown.classList.toggle('open');
});

document.addEventListener('click', () => {
  versionDropdown.classList.remove('open');
});

// Выбор версии
const selectVersion = (id, type, displayText) => {
  selectedVersionId = id;
  selectedVersionType = type;
  versionSelected.textContent = displayText;
  versionSelected.classList.remove('shimmer');
  versionDropdown.classList.remove('open');

  // Сохранить выбранную версию
  API.saveConfig({ selectedVersion: id });
  
  // Обновляем тему хамелеона
  if (config.themeMode === 'auto') {
    applyThemeMode('auto', id);
  }
};

// Отрисовка элементов списка версий
const renderVersions = (data) => {
  versionListDynamic.innerHTML = '';
  data.versions.forEach(v => {
    const item = document.createElement('div');
    item.className = 'version-item';
    
    if (v.type === 'snapshot') {
      item.classList.add('version-snapshot');
      if (!snapshotsToggle.checked) {
        item.style.display = 'none';
      }
    } else if (v.type === 'custom') {
      item.classList.add('custom-version');
    } else if (v.type === 'cristalix') {
      item.classList.add('cristalix-version');
    }
    
    item.dataset.versionId = v.id;
    item.dataset.versionType = v.type;
    
    let badge = '';
    if (v.type === 'snapshot') badge = ' ⚡';
    else if (v.type === 'custom') badge = ' 📦';
    
    const textSpan = document.createElement('span');
    textSpan.className = 'version-item-title';
    textSpan.textContent = `${formatVersionName(v.id)}${badge}`;
    item.appendChild(textSpan);
    
    if (v.type === 'custom' || v.type === 'cristalix') {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-version-btn';
      deleteBtn.dataset.versionId = v.id;
      deleteBtn.title = currentLang === 'ru' ? 'Удалить сборку' : 'Delete modpack';
      deleteBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" style="pointer-events: none;">
          <path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
        </svg>
      `;
      item.appendChild(deleteBtn);
    }
    
    versionListDynamic.appendChild(item);
  });
};

// Восстановление выбранной версии из конфига
const restoreSelectedVersion = (data) => {
  let savedVer = config.selectedVersion;
  let exists = false;
  
  if (savedVer) {
    const items = versionListDynamic.querySelectorAll('.version-item');
    for (const item of items) {
      if (item.dataset.versionId === savedVer) {
        selectVersion(item.dataset.versionId, item.dataset.versionType, item.textContent.trim());
        exists = true;
        break;
      }
    }
  }

  if (!exists) {
    if (data.latest && data.latest.release) {
      selectVersion(data.latest.release, 'release', data.latest.release);
    } else {
      selectVersion('1.20.4', 'release', '1.20.4');
    }
  }
};

// Флаг, чтобы повесить обработчик кликов по списку только один раз
let isVersionListListenerAttached = false;

// Загрузка версий с бэкенда (Mojang API + кэш)
const initVersions = async () => {
  versionSelected.classList.add('shimmer');
  
  try {
    const data = await API.getVersions();
    allVersionsData = data;
    
    renderVersions(data);

    // Вешаем обработчик кликов один раз при первом запуске
    if (!isVersionListListenerAttached) {
      isVersionListListenerAttached = true;
      
      versionList.addEventListener('click', async (e) => {
        e.stopPropagation();

        const deleteBtn = e.target.closest('.delete-version-btn');
        if (deleteBtn) {
          const versionId = deleteBtn.dataset.versionId;
          const formattedName = formatVersionName(versionId);
          const t = TRANSLATIONS[currentLang];
          const confirmMsg = t.deleteModpackConfirm.replace('{name}', formattedName);
          
          if (confirm(confirmMsg)) {
            try {
              const res = await API.deleteVersion(versionId);
              if (res && res.status === 'success') {
                config = await API.getConfig();
                await initVersions();
              }
            } catch (err) {
              console.error('Ошибка при удалении версии:', err);
              showError(err.message);
            }
          }
          return;
        }

        const item = e.target.closest('.version-item');
        if (!item) return;

        const id = item.dataset.versionId;
        const type = item.dataset.versionType;
        const text = item.textContent.trim();
        selectVersion(id, type, text);
      });

      const toggleContainer = versionList.querySelector('.snapshots-toggle-container');
      toggleContainer.addEventListener('click', (e) => {
        if (e.target !== snapshotsToggle && !e.target.closest('label')) {
          snapshotsToggle.checked = !snapshotsToggle.checked;
          snapshotsToggle.dispatchEvent(new Event('change'));
        }
      });
    }

    config = await API.getConfig();
    restoreSelectedVersion(data);

  } catch (err) {
    console.error('Ошибка загрузки версий:', err);
    versionSelected.textContent = 'Ошибка загрузки';
    versionSelected.classList.remove('shimmer');
  }
};

// Подписка на обновление версий в фоне
if (API.onVersionsUpdated) {
  API.onVersionsUpdated((data) => {
    console.log('[Renderer] Список версий обновился в фоне.');
    allVersionsData = data;
    renderVersions(data);
    
    // Проверяем, на месте ли выбранная версия
    let savedVer = config.selectedVersion;
    if (savedVer) {
      const items = versionListDynamic.querySelectorAll('.version-item');
      let stillExists = false;
      for (const item of items) {
        if (item.dataset.versionId === savedVer) {
          stillExists = true;
          break;
        }
      }
      if (!stillExists) {
        restoreSelectedVersion(data);
      }
    }
  });
}

// Тоггл снапшотов
snapshotsToggle.addEventListener('change', (e) => {
  const checked = e.target.checked;
  const snapshotItems = versionListDynamic.querySelectorAll('.version-snapshot');
  snapshotItems.forEach(item => {
    item.style.display = checked ? 'block' : 'none';
  });

  // Сохранить в конфиг
  API.saveConfig({ showSnapshots: checked });
});

// ==========================================================
// 4. ЗАПУСК ИГРЫ И ВАЛИДАЦИЯ
// ==========================================================
playButton.addEventListener('click', async () => {
  const nickname = nicknameInput.value.trim();

  // Валидация никнейма
  const nickRegex = /^[a-zA-Z0-9_]{3,16}$/;
  if (!nickRegex.test(nickname)) {
    nicknameInput.classList.add('error-border', 'shake');
    setTimeout(() => {
      nicknameInput.classList.remove('shake');
    }, 400);

    setTimeout(() => {
      nicknameInput.classList.remove('error-border');
    }, 2000);
    return;
  }

  if (!selectedVersionId) {
    versionSelected.classList.add('error-border', 'shake');
    setTimeout(() => {
      versionSelected.classList.remove('shake', 'error-border');
    }, 1000);
    return;
  }

  // Блокируем интерфейс
  nicknameInput.disabled = true;
  versionSelected.style.pointerEvents = 'none';
  playButton.disabled = true;
  
  const t = TRANSLATIONS[currentLang];
  playButton.textContent = t.launching;
  playButton.classList.add('pulse-glow');
  
  progressFill.style.width = '0%';
  progressContainer.style.display = 'flex';
  statusText.textContent = t.preparingGameFiles;

  // Сохраняем имя игрока в конфиг
  await API.saveConfig({ nickname });

  lastLaunchTime = Date.now();

  // Запуск через IPC
  try {
    const result = await API.launchGame({
      nickname,
      versionId: selectedVersionId,
      versionType: selectedVersionType
    });
    console.log('[Launcher]', result);
  } catch (err) {
    showError(err.message);
  }
});

// Сброс кнопки играть в дефолт
const resetPlayButton = () => {
  const t = TRANSLATIONS[currentLang];
  nicknameInput.disabled = false;
  versionSelected.style.pointerEvents = 'auto';
  playButton.disabled = false;
  playButton.textContent = t.play;
  playButton.className = ''; // Сброс классов glow
  playButton.style.backgroundColor = '';
  playButton.style.borderColor = '';
  progressContainer.style.display = 'none';
};

const showError = (msg) => {
  const t = TRANSLATIONS[currentLang];
  resetPlayButton();
  statusText.textContent = t.errorLabel.replace('{msg}', msg);
  progressContainer.style.display = 'flex';
  progressFill.style.width = '100%';
  
  playButton.classList.add('error-glow');
  playButton.textContent = t.error.toUpperCase() + '!';
  
  setTimeout(() => {
    playButton.classList.remove('error-glow');
    playButton.textContent = t.play;
  }, 3000);
};

// ==========================================================
// 5. IPC СОБЫТИЯ ОТ ЛАУНЧЕРА
// ==========================================================

// Переменные для расчета скорости и ETA Mojang-загрузок
let currentProgressType = '';
let downloadStartTime = 0;
let lastTaskCount = 0;
let lastSpeedCalcTime = 0;
let currentSpeedFilesPerSec = 0;

// Отслеживание прогресса загрузки
API.onProgress((data) => {
  // data = { type, task, total }
  let percent = 0;
  if (data.total > 0) {
    percent = Math.floor((data.task / data.total) * 100);
    progressFill.style.width = `${percent}%`;
  }

  // Если начался новый этап, сбрасываем счетчики времени
  if (data.type !== currentProgressType) {
    currentProgressType = data.type;
    downloadStartTime = Date.now();
    lastTaskCount = data.task;
    lastSpeedCalcTime = Date.now();
    currentSpeedFilesPerSec = 0;
  }

  // Расчет скорости каждые 500мс
  const now = Date.now();
  const elapsedSinceLastCalc = now - lastSpeedCalcTime;
  if (elapsedSinceLastCalc >= 500) {
    const deltaFiles = data.task - lastTaskCount;
    currentSpeedFilesPerSec = Math.round(deltaFiles / (elapsedSinceLastCalc / 1000));
    lastTaskCount = data.task;
    lastSpeedCalcTime = now;
  }

  // Средняя скорость от начала этапа (на случай, если прошло меньше 500мс)
  const elapsedFromStart = (now - downloadStartTime) / 1000;
  const avgSpeed = elapsedFromStart > 0 ? (data.task / elapsedFromStart) : 0;
  const speed = currentSpeedFilesPerSec || Math.round(avgSpeed) || 0;

  // Определение среднего размера файла в КБ для перевода скорости в МБ/с
  const avgSizeKb = data.type === 'assets' ? 120 : (data.type === 'classes' ? 850 : 300);
  const speedMb = ((speed * avgSizeKb) / 1024).toFixed(1);

  // Оставшееся время (ETA)
  const remainingFiles = data.total - data.task;
  let timeLeftSec = 0;
  if (speed > 0) {
    timeLeftSec = Math.round(remainingFiles / speed);
  } else if (avgSpeed > 0) {
    timeLeftSec = Math.round(remainingFiles / avgSpeed);
  }

  const t = TRANSLATIONS[currentLang];
  let timeStr = t.calculating;
  if (timeLeftSec > 0) {
    const mins = Math.floor(timeLeftSec / 60);
    const secs = timeLeftSec % 60;
    const minText = t.minShort;
    const secText = t.secShort;
    timeStr = mins > 0 ? `${mins} ${minText} ${secs} ${secText}` : `${secs} ${secText}`;
  } else if (remainingFiles === 0) {
    timeStr = t.done;
  }

  // Формирование текста в зависимости от языка
  let text = t.downloading + '...';

  switch (data.type) {
    case 'natives':
      text = t.unpackingNatives;
      break;
    case 'classes':
      text = `${t.libraries}: ${data.task}/${data.total} (${percent}%) — ${speedMb} ${currentLang === 'ru' ? 'МБ/с' : 'MB/s'} | ${currentLang === 'ru' ? 'Осталось' : 'ETA'}: ${timeStr}`;
      break;
    case 'assets':
      text = `${t.assets}: ${data.task}/${data.total} (${percent}%) — ${speedMb} ${currentLang === 'ru' ? 'МБ/с' : 'MB/s'} | ${currentLang === 'ru' ? 'Осталось' : 'ETA'}: ${timeStr}`;
      break;
    case 'fabric':
      text = t.installingFabric;
      break;
    case 'forge':
      text = t.installingMods;
      break;
    default:
      text = `${t.preparing}: ${data.task}/${data.total} (${percent}%) — ${speedMb} ${currentLang === 'ru' ? 'МБ/с' : 'MB/s'} | ${currentLang === 'ru' ? 'Осталось' : 'ETA'}: ${timeStr}`;
  }
  statusText.textContent = text;
});

// Отслеживание детального прогресса скачивания файлов (скорость, байты, ETA)
API.onDownloadProgress((data) => {
  // data = { filename, percent, downloadedMb, totalMb, speedMb, timeLeftSec }
  progressFill.style.width = `${data.percent}%`;
  
  const t = TRANSLATIONS[currentLang];
  let timeStr = t.calculating;
  if (data.timeLeftSec > 0) {
    const mins = Math.floor(data.timeLeftSec / 60);
    const secs = data.timeLeftSec % 60;
    const minText = t.minShort;
    const secText = t.secShort;
    timeStr = mins > 0 ? `${mins} ${minText} ${secs} ${secText}` : `${secs} ${secText}`;
  } else if (data.timeLeftSec === 0 && data.percent === 100) {
    timeStr = t.done;
  }

  // Подставляем значения в шаблон downloadingSpeed
  statusText.textContent = t.downloadingSpeed
    .replace('{file}', data.filename)
    .replace('{mb}', `${data.downloadedMb} ${currentLang === 'ru' ? 'из' : 'of'} ${data.totalMb}`)
    .replace('{percent}', data.percent)
    .replace('{speed}', data.speedMb)
    .replace('{time}', timeStr);
});

// Событие старта Minecraft (появление логов игры)
let autoMinTimer = null;
API.onLaunchData((data) => {
  const t = TRANSLATIONS[currentLang];
  playButton.textContent = t.launching;
  playButton.className = 'launching-glow';
  statusText.textContent = t.launched;

  // Останавливаем рендеринг фона для экономии GPU во время игры
  if (backgroundFluid) {
    backgroundFluid.pause();
  }
  
  // Авто-свернуть лаунчер через 3 секунды, если это включено в настройках
  if (config.hideOnLaunch !== false) {
    if (!autoMinTimer) {
      autoMinTimer = setTimeout(() => {
        API.minimizeWindow();
        autoMinTimer = null;
      }, 3000);
    }
  }
});

// Закрытие игры (возврат в лаунчер)
API.onLaunchClose((data) => {
  const code = (data && typeof data === 'object') ? data.code : data;
  const crashReport = (data && typeof data === 'object') ? data.crashReport : null;

  console.log(`Игра закрылась с кодом ${code}`);
  resetPlayButton();
  
  const duration = lastLaunchTime ? (Date.now() - lastLaunchTime) : 0;
  console.log(`Время игры составило: ${(duration / 1000).toFixed(1)} сек`);
  
  if (code && code !== 0) {
    // Показываем ошибку только если есть реальный краш-репорт ИЛИ если игра проработала меньше 15 секунд (вылетела при запуске)
    const isRealCrash = crashReport || (duration < 15000);
    
    if (isRealCrash) {
      const t = TRANSLATIONS[currentLang];
      if (crashReport) {
        // Показываем первую строчку описания ошибки
        const firstLine = crashReport.split('\n')[0] || '';
        showError(t.gameCrash.replace('{error}', firstLine));
      } else {
        showError(t.gameLaunchError.replace('{code}', code));
      }
    } else {
      console.log('[Launcher] Игра закрылась с ненулевым кодом, но вероятно это просто краш при закрытии (sound/shutdown hook), игнорируем.');
    }
  }

  // Обновляем панораму с небольшой задержкой (1 секунда).
  // Причина: Windows может удерживать файловую блокировку .jar файла еще некоторое время 
  // после того как процесс Java формально завершился. Если попытаться извлечь панораму мгновенно,
  // мы получим ошибку доступа (EPERM/EBUSY) и лаунчер сбросится на дефолтную панораму.
  if (selectedVersionId) {
    setTimeout(() => {
      loadVersionTheme(selectedVersionId);
    }, 1000);
  }
  
  // Возобновляем рендеринг фона при возвращении
  if (backgroundFluid) {
    backgroundFluid.play();
  }

  // Сбрасываем таймер авто-сворачивания, чтобы он не свернул лаунчер после закрытия игры
  if (autoMinTimer) {
    clearTimeout(autoMinTimer);
    autoMinTimer = null;
  }

  API.restoreWindow(); // Восстанавливаем окно при выходе из игры
});

// Ошибка запуска
API.onLaunchError((msg) => {
  if (autoMinTimer) {
    clearTimeout(autoMinTimer);
    autoMinTimer = null;
  }
  
  // Обновляем панораму на случай, если часть ресурсов успела скачаться
  if (selectedVersionId) {
    loadVersionTheme(selectedVersionId);
  }

  showError(msg);
});

// Отладочные логи в оверлей
const maxDebugLines = 20;
const debugLogs = [];
const fullSessionLogs = []; // Хранит полный лог запуска для копирования (до 2000 строк)

API.onLaunchDebug((data) => {
  // Добавляем в полный лог
  fullSessionLogs.push(data);
  if (fullSessionLogs.length > 2000) fullSessionLogs.shift();
  
  // Добавляем на экран (ограниченное количество)
  debugLogs.push(data);
  if (debugLogs.length > maxDebugLines) debugLogs.shift();
  debugOverlay.innerHTML = debugLogs.map(line => `<div>${line}</div>`).join('');
  debugOverlay.scrollTop = debugOverlay.scrollHeight;
});

// Добавляем логи ошибок запуска в лог сессии
API.onLaunchError((msg) => {
  fullSessionLogs.push(`[LAUNCH ERROR] ${msg}`);
});

// Toggle дебаг-слоя по Ctrl+Shift+D
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') {
    const isHidden = debugOverlay.style.display === 'none';
    debugOverlay.style.display = isHidden ? 'block' : 'none';
    copyLogBtn.style.display = isHidden ? 'block' : 'none';
  }
});

// Копирование логов в буфер обмена
copyLogBtn.addEventListener('click', async () => {
  if (fullSessionLogs.length === 0) {
    const originalText = copyLogBtn.textContent;
    const t = TRANSLATIONS[currentLang];
    copyLogBtn.textContent = t.currentLang === 'ru' ? 'ЛОГ ПУСТ!' : 'LOG IS EMPTY!'; // keep fallback for safety
    if (currentLang === 'en') copyLogBtn.textContent = 'LOG IS EMPTY!';
    else copyLogBtn.textContent = 'ЛОГ ПУСТ!';
    setTimeout(() => copyLogBtn.textContent = originalText, 1500);
    return;
  }
  
  try {
    await navigator.clipboard.writeText(fullSessionLogs.join('\n'));
    const originalText = copyLogBtn.textContent;
    const t = TRANSLATIONS[currentLang];
    copyLogBtn.textContent = currentLang === 'ru' ? 'ЛОГ СКОПИРОВАН!' : 'LOG COPIED!';
    copyLogBtn.style.background = 'rgba(0, 255, 100, 0.2)';
    copyLogBtn.style.color = '#00ff64';
    copyLogBtn.style.borderColor = 'rgba(0, 255, 100, 0.4)';
    
    setTimeout(() => {
      copyLogBtn.textContent = originalText;
      copyLogBtn.style.background = 'rgba(0, 180, 255, 0.15)';
      copyLogBtn.style.color = '#00b4ff';
      copyLogBtn.style.borderColor = 'rgba(0, 180, 255, 0.3)';
    }, 2000);
  } catch (err) {
    console.error('Не удалось скопировать логи:', err);
  }
});

// ==========================================================
// 6. ЛОГИКА ВКЛАДОК И КАТАЛОГА МОДОВ (Modrinth API)
// ==========================================================

let currentCatalogType = 'modpack'; // 'modpack' или 'mod'
let searchTimeout = null;

// Функция закрытия каталога
const closeCatalog = () => {
  catalogOverlay.classList.remove('open');
};

// Функция обновления состояния фильтра версий в каталоге
const updateCatalogVersionFilterState = async () => {
  const t = TRANSLATIONS[currentLang];
  if (currentCatalogType === 'mod') {
    try {
      if (selectedVersionId) {
        const details = await API.getVersionDetails(selectedVersionId);
        if (details.isCustom && details.loaderType !== 'vanilla') {
          catalogVersionFilter.value = details.mcVersion;
        } else {
          catalogVersionFilter.value = '';
        }
      } else {
        catalogVersionFilter.value = '';
      }
    } catch (e) {
      catalogVersionFilter.value = '';
    }
    catalogVersionFilter.disabled = true;
    catalogVersionFilter.title = t.versionLockedForBuild;
  } else {
    catalogVersionFilter.disabled = false;
    catalogVersionFilter.title = t.filterByGameVersion;
  }
};

// Открытие каталога модов
modsBtn.addEventListener('click', async () => {
  catalogOverlay.classList.add('open');
  
  const targetInfo = document.getElementById('catalog-target-info');
  if (targetInfo) {
    const t = TRANSLATIONS[currentLang];
    targetInfo.innerHTML = currentLang === 'ru' ? 'Получение данных о сборке...' : 'Fetching build details...';
    try {
      if (!selectedVersionId) {
        targetInfo.innerHTML = `<span style="color: var(--error);">${t.selectModpackError}</span>`;
      } else {
        const details = await API.getVersionDetails(selectedVersionId);
        if (details.isCustom && details.loaderType !== 'vanilla') {
          const capitalizedLoader = details.loaderType.charAt(0).toUpperCase() + details.loaderType.slice(1);
          const formattedName = formatVersionName(selectedVersionId);
          if (currentLang === 'ru') {
            targetInfo.innerHTML = `Сборка: <strong style="color: var(--accent-light);">${formattedName}</strong> (${capitalizedLoader} ${details.mcVersion}) — <span style="color: var(--success);">${t.versionSelectedAuto}</span>`;
          } else {
            targetInfo.innerHTML = `Pack: <strong style="color: var(--accent-light);">${formattedName}</strong> (${capitalizedLoader} ${details.mcVersion}) — <span style="color: var(--success);">${t.versionSelectedAuto}</span>`;
          }
        } else {
          targetInfo.innerHTML = `<span style="color: var(--error);">${t.modsOnlyForModpacks}</span>`;
        }
      }
    } catch (err) {
      console.error(err);
      targetInfo.innerHTML = '';
    }
  }

  await updateCatalogVersionFilterState();
  loadCatalogData('', currentCatalogType);
});

// Открытие папки игры
folderBtn.addEventListener('click', () => {
  API.openFolder();
});

// Открытие репозитория GitHub
githubBtn.addEventListener('click', () => {
  API.openExternal('https://github.com/Timon2306/minecraft-offline-launcher');
});

// ==========================================================
// 6.1. ЛОГИКА СОЗДАНИЯ СВОЕЙ СБОРКИ МОДОВ
// ==========================================================

// Открытие модального окна создания сборки
const openCreateModpackModal = () => {
  modpackNameInput.value = '';
  modpackVersionSelect.innerHTML = '';
  
  if (allVersionsData && allVersionsData.versions) {
    // Выбираем только официальные релизные версии (исключаем снапшоты и пре-релизы)
    const vanillaVersions = allVersionsData.versions.filter(v => v.type === 'release');
    
    vanillaVersions.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.id;
      modpackVersionSelect.appendChild(opt);
    });
  } else {
    // Дефолтный fallback
    const defaultVers = ['1.20.4', '1.20.1', '1.16.5', '1.12.2', '1.7.10'];
    defaultVers.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = `${v} (Release)`;
      modpackVersionSelect.appendChild(opt);
    });
  }
  
  createModpackOverlay.classList.add('open');
};

const closeCreateModpackModal = () => {
  createModpackOverlay.classList.remove('open');
};

// Открытие по кнопке в каталоге
createInstanceBtn.addEventListener('click', () => {
  openCreateModpackModal();
});

// Закрытие по кнопке или клику по фону
createModpackClose.addEventListener('click', closeCreateModpackModal);
createModpackOverlay.addEventListener('click', (e) => {
  if (e.target === createModpackOverlay) closeCreateModpackModal();
});

// Обработка кнопки "СОЗДАТЬ"
createModpackBtn.addEventListener('click', async () => {
  const name = modpackNameInput.value.trim();
  const version = modpackVersionSelect.value;
  const loader = modpackLoaderSelect.value;
  
  const t = TRANSLATIONS[currentLang];
  if (!name) {
    alert(t.enterModpackNameAlert);
    return;
  }
  
  createModpackBtn.textContent = t.creating;
  createModpackBtn.disabled = true;
  
  try {
    const res = await API.createInstance(name, version, loader);
    if (res && res.status === 'success') {
      closeCreateModpackModal();
      closeCatalog(); // Закрываем каталог модов
      
      // Обновляем список версий (он сам выставит новую сборку активной)
      await initVersions();
      
      // Показываем сообщение об успехе
      statusText.textContent = t.modpackCreated.replace('{name}', name);
      
      progressFill.style.width = '100%';
      progressContainer.style.opacity = 1;
      
      setTimeout(() => {
        progressContainer.style.opacity = 0;
      }, 4000);
    }
  } catch (err) {
    console.error('Ошибка создания сборки:', err);
    alert((currentLang === 'ru' ? 'Ошибка создания сборки: ' : 'Error creating modpack: ') + err.message);
  } finally {
    createModpackBtn.textContent = t.createBtn;
    createModpackBtn.disabled = false;
  }
});

// Закрытие каталога модов
catalogClose.addEventListener('click', closeCatalog);
catalogOverlay.addEventListener('click', (e) => {
  if (e.target === catalogOverlay) closeCatalog();
});

// Клик по Импорт ZIP
importZipBtn.addEventListener('click', async () => {
  const originalText = importZipBtn.textContent;
  const t = TRANSLATIONS[currentLang];
  importZipBtn.textContent = currentLang === 'ru' ? 'Импорт...' : 'Importing...';
  importZipBtn.disabled = true;

  try {
    progressContainer.style.display = 'flex';
    progressFill.style.width = '0%';
    statusText.textContent = t.zipExtracting;

    const res = await API.importZip();

    if (res && res.status === 'success') {
      statusText.textContent = t.zipImportSuccess.replace('{name}', res.name);
      
      progressFill.style.width = '100%';

      // Обновляем настройки и список версий, чтобы подхватить импортированную сборку
      config = await API.getConfig();
      await initVersions();

      setTimeout(() => {
        progressContainer.style.display = 'none';
        closeCatalog();
      }, 3500);
    } else {
      // Отменено пользователем
      progressContainer.style.display = 'none';
    }
  } catch (err) {
    console.error('Ошибка импорта сборки:', err);
    progressContainer.style.display = 'none';
    showError(err.message);
  } finally {
    importZipBtn.textContent = originalText;
    importZipBtn.disabled = false;
  }
});

// Переключение фильтров (Сборки / Моды)
filterButtons.forEach(btn => {
  btn.addEventListener('click', async () => {
    filterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    currentCatalogType = btn.dataset.type;
    await updateCatalogVersionFilterState();
    loadCatalogData(catalogSearch.value.trim(), currentCatalogType);
  });
});

// Фильтрация при смене версии
catalogVersionFilter.addEventListener('change', () => {
  loadCatalogData(catalogSearch.value.trim(), currentCatalogType);
});

// Поиск с дебаунсом (400мс)
catalogSearch.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    loadCatalogData(catalogSearch.value.trim(), currentCatalogType);
  }, 400);
});

// Клик по контейнеру поиска фокусирует сам инпут
if (catalogSearch.parentElement) {
  catalogSearch.parentElement.addEventListener('click', () => {
    catalogSearch.focus();
  });
}

// Загрузка модов/сборок с Modrinth
const loadCatalogData = async (query = '', type = 'modpack') => {
  // Выводим скелетоны (заглушку загрузки)
  catalogGrid.innerHTML = `
    <div style="grid-column: span 2; text-align: center; padding: 40px; color: var(--text-dimmed); font-size: 14px;">
      <span class="shimmer-text">Загрузка данных с Modrinth...</span>
    </div>
  `;

  try {
    // Определяем активные параметры версии и лоадера для фильтрации
    let activeMcVersion = catalogVersionFilter ? catalogVersionFilter.value : '';
    let activeLoader = '';

    if (type === 'mod') {
      try {
        if (selectedVersionId) {
          const details = await API.getVersionDetails(selectedVersionId);
          if (details.isCustom && details.loaderType !== 'vanilla') {
            activeMcVersion = details.mcVersion;
            activeLoader = details.loaderType;
          }
        }
      } catch (err) {
        console.error('Ошибка получения деталей сборки для фильтрации:', err);
      }
      
      if (!activeMcVersion) activeMcVersion = '1.20.4';
      if (!activeLoader) activeLoader = 'fabric';
    }

    const facetsArray = [
      [`project_type:${type}`]
    ];

    if (activeMcVersion) {
      facetsArray.push([`versions:${activeMcVersion}`]);
    }
    
    if (type === 'mod' && activeLoader) {
      facetsArray.push([`categories:${activeLoader}`]);
    }

    const facets = JSON.stringify(facetsArray);

    const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}&limit=16`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MinecraftOfflineLauncher/1.0.0 (contact@launcher.local)' }
    });

    if (!response.ok) throw new Error(`Modrinth API error: ${response.status}`);
    const data = await response.json();

    catalogGrid.innerHTML = '';
    const t = TRANSLATIONS[currentLang];

    let hits = data.hits || [];

    if (hits.length === 0) {
      catalogGrid.innerHTML = `
        <div style="grid-column: span 2; text-align: center; padding: 40px; color: var(--text-dimmed); font-size: 14px;">
          ${t.nothingFound}
        </div>
      `;
      return;
    }

    hits.forEach(item => {
      const card = document.createElement('div');
      card.className = 'catalog-card';
      
      const iconUrl = item.icon_url || '';
      const iconHtml = iconUrl 
        ? `<img src="${iconUrl}" alt="${item.title}" onerror="this.src=''; this.innerHTML='📦'">`
        : `<svg viewBox="0 0 24 24" width="32" height="32"><path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/></svg>`;

      card.innerHTML = `
        <div class="card-icon">
          ${iconHtml}
        </div>
        <div class="card-info">
          <div class="card-title" title="${item.title}">${item.title}</div>
          <div class="card-desc" title="${item.description}">${item.description}</div>
        </div>
        <button class="card-download-btn" data-project-id="${item.project_id}">${t.download}</button>
      `;

      catalogGrid.appendChild(card);
    });

    // Добавляем обработчики на кнопки скачивания
    catalogGrid.querySelectorAll('.card-download-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const projectId = btn.dataset.projectId;
        const cardTitle = btn.parentElement.querySelector('.card-title').textContent;
        
        btn.classList.add('downloading');
        btn.textContent = t.downloading + '...';
        btn.disabled = true;

        progressContainer.style.display = 'flex';
        progressFill.style.width = '0%';
        statusText.textContent = t.preparingDownload.replace('{title}', cardTitle);

        // Защита: одиночные моды можно качать только для кастомных сборок
        if (currentCatalogType === 'mod' && selectedVersionType !== 'custom') {
          alert(t.vanillaDownloadError);
          btn.classList.remove('downloading');
          btn.textContent = t.download;
          btn.disabled = false;
          progressContainer.style.display = 'none';
          return;
        }

        try {
          // Вызываем установку мода/сборки через IPC
          const res = await API.downloadMod(projectId, currentCatalogType);
          
          if (res && res.status === 'success') {
            btn.className = 'card-download-btn installed';
            btn.textContent = t.installed;
            statusText.textContent = t.successInstalled.replace('{title}', cardTitle);
            progressFill.style.width = '100%';
            
            // Если была установлена версия, обновляем настройки и список версий
            config = await API.getConfig();
            await initVersions();

            setTimeout(() => {
              progressContainer.style.display = 'none';
            }, 3000);
          } else {
            throw new Error(t.unknownDownloadError);
          }
        } catch (err) {
          console.error('Ошибка установки мода:', err);
          btn.classList.remove('downloading');
          btn.textContent = t.error;
          btn.disabled = false;
          showError(err.message);
        }
      });
    });

  } catch (err) {
    console.error('Ошибка загрузки данных с Modrinth:', err);
    const t = TRANSLATIONS[currentLang];
    catalogGrid.innerHTML = `
      <div style="grid-column: span 2; text-align: center; padding: 40px; color: var(--error); font-size: 14px;">
        ${t.errorLoadingData}
      </div>
    `;
  }
};

// Функция для применения темы оформления (Кастомная / Авто-Майнкрафт)
async function applyThemeMode(mode, versionId) {
  console.log(`[Theme] Применение режима темы: ${mode}, версия: ${versionId}`);

  if (mode === 'custom' || !versionId) {
    // 1. Отключаем майнкрафт-тему
    document.body.classList.remove('theme-minecraft-active');
    
    // Скрываем контейнеры
    minecraftBgContainer.style.display = 'none';
    
    // Возобновляем WebGL-анимацию
    if (backgroundFluid) {
      backgroundFluid.play();
    }
    
    // Очищаем переменные CSS для widgets.png
    document.documentElement.style.removeProperty('--widgets-url');
    
    return;
  }
  
  // 2. Включаем майнкрафт-тему
  document.body.classList.add('theme-minecraft-active');
  
  // Приостанавливаем WebGL-анимацию для экономии производительности
  if (backgroundFluid) {
    backgroundFluid.pause();
  }
  
  // Показываем контейнеры
  minecraftBgContainer.style.display = 'block';
  
  try {
    // Запрашиваем извлечение текстур через API
    const themeData = await API.extractVersionTheme(versionId);
    
    if (themeData) {
      
      // 2.2 Устанавливаем widgets.png (кнопки)
      if (themeData.widgets) {
        document.documentElement.style.setProperty('--widgets-url', `url(${themeData.widgets})`);
      }
      
      // 2.3 Динамически регистрируем шрифт, если он прилетел из бэкенда
      if (themeData.font) {
        try {
          const font = new FontFace('Minecraftia', `url(${themeData.font})`);
          const loadedFont = await font.load();
          document.fonts.add(loadedFont);
          console.log('[Theme] Шрифт Minecraftia успешно загружен');
        } catch (fontErr) {
          console.error('[Theme] Ошибка регистрации шрифта:', fontErr);
        }
      }
      
      // 2.4 Устанавливаем 3D панораму или блок земли
      const faces = ['front', 'right', 'back', 'left', 'top', 'bottom'];
      const panoramaCube = document.querySelector('.panorama-cube');
      const dirtOverlay = document.querySelector('.minecraft-dirt-overlay');
      
      // Плавно замыливаем старую панораму перед переключением
      minecraftBgContainer.classList.add('blur-transition');
      await new Promise(resolve => setTimeout(resolve, 250));
      
      if (themeData.panorama && themeData.panorama.length === 6) {
        // Включаем 3D-куб для настоящей панорамы!
        panoramaCube.style.display = 'block';
        dirtOverlay.style.display = 'none';
        minecraftBgContainer.style.backgroundImage = 'none';
        
        panoramaCube.querySelector('.face.front').style.backgroundImage = `url(${themeData.panorama[0]})`;
        panoramaCube.querySelector('.face.right').style.backgroundImage = `url(${themeData.panorama[1]})`;
        panoramaCube.querySelector('.face.back').style.backgroundImage = `url(${themeData.panorama[2]})`;
        panoramaCube.querySelector('.face.left').style.backgroundImage = `url(${themeData.panorama[3]})`;
        panoramaCube.querySelector('.face.top').style.backgroundImage = `url(${themeData.panorama[4]})`;
        panoramaCube.querySelector('.face.bottom').style.backgroundImage = `url(${themeData.panorama[5]})`;
      } else if (themeData.dirt) {
        // Показываем плитку земли для старых версий
        panoramaCube.style.display = 'none';
        dirtOverlay.style.display = 'block';
        minecraftBgContainer.style.backgroundImage = 'none';
        dirtOverlay.style.backgroundImage = `url(${themeData.dirt})`;
      } else {
        // Фоллбек на локальную статическую картинку
        panoramaCube.style.display = 'none';
        dirtOverlay.style.display = 'none';
        minecraftBgContainer.style.backgroundImage = "url('assets/default_theme/panorama_0.png')";
        minecraftBgContainer.style.backgroundSize = 'cover';
      }
      
      // Убираем замыливание плавно
      minecraftBgContainer.classList.remove('blur-transition');
    }
  } catch (e) {
    console.error('Ошибка применения темы:', e);
    minecraftBgContainer.classList.remove('blur-transition');
  }
}

// ==========================================================
// 7. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАПУСКЕ
// ==========================================================
const init = async () => {
  // 1. Инициализация интерактивного WebGL фона Ferrofluid
  try {
    const bgContainer = document.getElementById('bg-container');
    backgroundFluid = new Ferrofluid(bgContainer, {
      colors: ['#000000', '#111111', '#2c2c2c', '#666666', '#b5b5b5', '#ffffff'], // Монохромный (черный/серебро)
      speed: 0.12, // Замедленный, медитативный темп
      scale: 1.6,
      opacity: 0.8, // Выше контрастность для черных волн
      mouseInteraction: false // Отключить реакцию на мышь
    });
  } catch (bgErr) {
    console.error('Не удалось запустить WebGL-анимацию:', bgErr);
  }

  // 2. Загрузка конфигурации
  try {
    config = await API.getConfig();
    nicknameInput.value = config.nickname || '';
    
    // Динамический лимит ОЗУ на основе физической памяти ПК
    const totalRamGb = config.systemTotalRamGb || 16;
    ramSlider.max = totalRamGb;
    ramInput.max = totalRamGb * 1024;
    
    // Загружаем сохраненную RAM в МБ
    const savedRamMb = config.ram || 4096;
    ramInput.value = savedRamMb;
    ramSlider.value = Math.round(savedRamMb / 1024);
    
    jvmArgsInput.value = config.jvmArgs || '';
    gameDirInput.value = config.gameDirectory || '';
    snapshotsToggle.checked = config.showSnapshots || false;
    
    // Инициализация языка
    const savedLang = config.language || 'ru';
    languageSelect.value = savedLang;
    applyLanguage(savedLang);

    // Инициализация темы и свертывания
    themeModeSelect.value = config.themeMode || 'auto';
    hideOnLaunchCheckbox.checked = config.hideOnLaunch !== false;
  } catch (err) {
    console.error('Не удалось загрузить конфиг:', err);
  }

  // 3. Загрузка версий
  await initVersions();

  // 4. Применение сохраненной темы
  applyThemeMode(config.themeMode || 'auto', selectedVersionId);

  // 5. Проверка обновлений на GitHub
  checkUpdates();
};

// Сравнение семантических версий (проверяет, новее ли remote по сравнению с local)
function isNewerVersion(local, remote) {
  const parse = v => v.replace('v', '').split('.').map(x => parseInt(x) || 0);
  const l = parse(local);
  const r = parse(remote);
  for (let i = 0; i < Math.max(l.length, r.length); i++) {
    const lVal = l[i] || 0;
    const rVal = r[i] || 0;
    if (rVal > lVal) return true;
    if (lVal > rVal) return false;
  }
  return false;
}

// Автопроверка обновлений на GitHub
async function checkUpdates() {
  const repo = 'Timon2306/minecraft-offline-launcher'; // Измени на свой никнейм на GitHub
  const currentVersion = config.appVersion || '1.0.1';
  
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`);
    if (res.ok) {
      const data = await res.json();
      const latestVersion = data.tag_name.replace('v', '').trim();
      
      if (isNewerVersion(currentVersion, latestVersion)) {
        githubBadge.style.display = 'block';
        console.log(`[UpdateChecker] Доступна новая версия: ${latestVersion}`);
        
        // Находим EXE установщик в ассетах релиза
        const setupAsset = data.assets.find(asset => asset.name.endsWith('.exe'));
        if (setupAsset) {
          updateDownloadUrl = setupAsset.browser_download_url;
          latestVersionStr = latestVersion;
          
          // Локализуем описание и показываем блок обновления
          applyLanguage(currentLang);
          updateBlock.style.display = 'block';
        }
      }
    }
  } catch (err) {
    console.warn('[UpdateChecker] Не удалось проверить обновления:', err);
  }
}

// Слушатель для кнопки установки обновления
installUpdateBtn.addEventListener('click', async () => {
  if (!updateDownloadUrl) return;
  
  try {
    const t = TRANSLATIONS[currentLang];
    installUpdateBtn.disabled = true;
    installUpdateBtn.style.opacity = '0.5';
    installUpdateBtn.textContent = t.creating; // Используем t.creating/t.downloading в зависимости от контекста
    if (currentLang === 'ru') installUpdateBtn.textContent = 'СКАЧИВАНИЕ...';
    else installUpdateBtn.textContent = 'DOWNLOADING...';
    
    // Блокируем кнопку "Играть" и показываем общий прогресс скачивания обновления
    playButton.disabled = true;
    statusText.textContent = currentLang === 'ru' ? 'Скачивание обновления лаунчера...' : 'Downloading launcher update...';
    progressContainer.style.display = 'flex';
    progressFill.style.width = '0%';
    
    await API.downloadAppUpdate(updateDownloadUrl);
  } catch (err) {
    console.error('[Updater] Ошибка при автообновлении:', err);
    installUpdateBtn.disabled = false;
    installUpdateBtn.style.opacity = '1';
    installUpdateBtn.textContent = currentLang === 'ru' ? 'ОШИБКА!' : 'ERROR!';
    playButton.disabled = false;
    statusText.textContent = currentLang === 'ru' ? `Не удалось обновить: ${err.message}` : `Update failed: ${err.message}`;
  }
});

// Когда игра успешно запущена (скачивание завершено) - обновляем панораму в фоне!
if (window.electronAPI.onLaunchStarted) {
  window.electronAPI.onLaunchStarted(() => {
    console.log('[Renderer] Игра запущена, процесс стартовал!');
    
    // Меняем UI, чтобы пользователь понимал, что игра уже открывается
    const t = TRANSLATIONS[currentLang];
    statusText.textContent = t.gameStartedWaiting;
    playButton.textContent = t.inGame;
    playButton.classList.remove('pulse-glow');
    playButton.style.backgroundColor = 'rgba(46, 204, 113, 0.2)'; // Зеленоватый оттенок
    playButton.style.borderColor = '#2ecc71';
    
    if (selectedVersionId) {
      window.electronAPI.extractVersionTheme(selectedVersionId).then(applyThemeData => {
        // Заново загружаем тему текущей версии, так как ассеты теперь скачаны
        loadVersionTheme(selectedVersionId);
      });
    }
  });
}

init();

