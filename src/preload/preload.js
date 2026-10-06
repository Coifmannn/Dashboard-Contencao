const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Autenticação
  getAuthStatus: () => ipcRenderer.invoke('auth:get-status'),
  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  switchAccount: () => ipcRenderer.invoke('auth:switch-account'),

  // Sincronização & Dashboard
  syncNow: (targetMonth = null) => ipcRenderer.invoke('sync:now', targetMonth),
  getDashboardData: (selectedMonth) => ipcRenderer.invoke('dashboard:get-data', selectedMonth),
  getTasksList: (filters) => ipcRenderer.invoke('tasks:get-list', filters),

  // Banco de Dados (Firebase)
  saveDashboardToDb: (monthYear, metrics) => ipcRenderer.invoke('db:save-dashboard', monthYear, metrics),
  getDashboardsFromDb: () => ipcRenderer.invoke('db:get-dashboards'),
  saveAvatarToDb: (analystName, base64Image) => ipcRenderer.invoke('db:save-avatar', analystName, base64Image),
  getAvatarsFromDb: () => ipcRenderer.invoke('db:get-avatars'),

  // Sistema
  openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
  exportPdf: (title) => ipcRenderer.invoke('system:export-pdf', title),

  // Ouvintes de Eventos em Tempo Real
  onSyncStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('sync:status', handler);
    return () => ipcRenderer.removeListener('sync:status', handler);
  },
  onTimerTick: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('sync:timer-tick', handler);
    return () => ipcRenderer.removeListener('sync:timer-tick', handler);
  }
});
