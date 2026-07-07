// ============================================
// preload.js — Context Bridge (IPC)
// Безопасный мост между Node.js и Рендерером
// ============================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Управление окном
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  restoreWindow: () => ipcRenderer.send('window-restore'),

  // Настройки
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (data) => ipcRenderer.invoke('save-config', data),

  // Версии
  getVersions: () => ipcRenderer.invoke('get-versions'),
  getVersionDetails: (versionId) => ipcRenderer.invoke('get-version-details', { versionId }),

  // Запуск игры
  launchGame: (options) => ipcRenderer.invoke('launch-game', options),

  // Открытие папки игры
  openFolder: () => ipcRenderer.send('open-folder'),

  // Открытие внешних ссылок
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // Создание собственной сборки
  createInstance: (name, mcVersion, loaderType) => ipcRenderer.invoke('create-instance', { name, mcVersion, loaderType }),

  // Скачивание мода с Modrinth
  downloadMod: (projectId, type) => ipcRenderer.invoke('download-mod', { projectId, type }),

  // Импорт сборки из локального ZIP/MRPACK
  importZip: () => ipcRenderer.invoke('import-zip'),

  // Удаление кастомной сборки
  deleteVersion: (versionId) => ipcRenderer.invoke('delete-version', { versionId }),

  // Выбор папки на диске
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  // Скачивание и установка обновления лаунчера
  downloadAppUpdate: (url) => ipcRenderer.invoke('download-app-update', { url }),

  // Извлечение темы оформления версии
  extractVersionTheme: (versionId) => ipcRenderer.invoke('extract-version-theme', { versionId }),

  // События запуска игры (прогресс, логи, статус)
  onProgress: (callback) => ipcRenderer.on('launch-progress', (e, data) => callback(data)),
  onDownloadStatus: (callback) => ipcRenderer.on('download-status', (e, data) => callback(data)),
  onLaunchClose: (callback) => ipcRenderer.on('launch-close', (e, code) => callback(code)),
  onLaunchError: (callback) => ipcRenderer.on('launch-error', (e, msg) => callback(msg)),
  onLaunchDebug: (callback) => ipcRenderer.on('launch-debug', (e, data) => callback(data)),
  onLaunchData: (callback) => ipcRenderer.on('launch-data', (e, data) => callback(data)),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (e, data) => callback(data)),
  onLaunchStarted: (callback) => ipcRenderer.on('launch-started', () => callback()),
  onVersionsUpdated: (callback) => ipcRenderer.on('versions-updated', (e, data) => callback(data))
});
