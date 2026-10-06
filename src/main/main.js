const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Configura o hot-reload (recarregamento em tempo real) em modo de desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  try {
    require('electron-reload')(path.join(__dirname, '..'), {
      electron: path.join(__dirname, '..', '..', 'node_modules', '.bin', 'electron'),
      awaitWriteFinish: true
    });
  } catch (err) {
    console.warn('O módulo electron-reload não foi encontrado.');
  }
}

const { loadTokens, clearTokens, startLoginFlow } = require('../services/salesforceAuth');
const { fetchAllReports } = require('../services/salesforceReports');
const { parseReportData, buildDashboardMetrics } = require('../services/businessRules');
const { saveDashboardToFirebase, getDashboardsFromFirebase, saveAvatarToFirebase, getAvatarsFromFirebase } = require('../services/firebase');

let mainWindow = null;
let autoSyncInterval = null;
let nextSyncTimestamp = null;
const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos

// Caminhos de persistência: usa userData do Electron (se disponível) ou fallback local
function getDataDir() {
  try {
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch (_) {}
  return path.join(__dirname, '..', '..', 'data');
}

const LOCAL_DATA_DIR = path.join(__dirname, '..', '..', 'data');

function ensureDataDir() {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getCacheFilePath() {
  return path.join(getDataDir(), 'cached_dashboard.json');
}

function loadCachedData() {
  try {
    ensureDataDir();
    const primary = getCacheFilePath();
    if (fs.existsSync(primary)) {
      const raw = fs.readFileSync(primary, 'utf-8');
      return JSON.parse(raw);
    }
    // Fallback para cache gerado localmente no workspace
    const fallback = path.join(LOCAL_DATA_DIR, 'cached_dashboard.json');
    if (fs.existsSync(fallback)) {
      const raw = fs.readFileSync(fallback, 'utf-8');
      const parsed = JSON.parse(raw);
      // Salva no primário
      saveCachedData(parsed);
      return parsed;
    }
  } catch (err) {
    console.error('[Main] Erro ao carregar cache:', err.message);
  }
  return null;
}

function saveCachedData(data) {
  try {
    ensureDataDir();
    fs.writeFileSync(getCacheFilePath(), JSON.stringify(data, null, 2), 'utf-8');
    // Salva cópia no fallback se acessível
    if (fs.existsSync(LOCAL_DATA_DIR)) {
      fs.writeFileSync(path.join(LOCAL_DATA_DIR, 'cached_dashboard.json'), JSON.stringify(data, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('[Main] Erro ao salvar cache:', err.message);
  }
}

let inMemoryState = {
  lastSync: null,
  allTasks: [],
  selectedMonth: null
};

// Carrega cache na inicialização
const initialCache = loadCachedData();
if (initialCache && initialCache.allTasks) {
  inMemoryState.allTasks = initialCache.allTasks;
  inMemoryState.lastSync = initialCache.lastSync;
  inMemoryState.selectedMonth = initialCache.selectedMonth || null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Painel de Contenção & Metas | Grupo Ideal Trends',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.ico'),
    backgroundColor: '#0b0f19',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  setupAutoSync();
}

async function performSync(notifyWebContents = true, targetMonth = null) {
  try {
    if (notifyWebContents && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync:status', { status: 'syncing', message: 'Conectando ao Salesforce e baixando relatórios...' });
    }

    const syncMonth = targetMonth || inMemoryState.selectedMonth;
    const { filaRaw, concluidasRaw, timestamp } = await fetchAllReports(syncMonth);

    if (notifyWebContents && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync:status', { status: 'syncing', message: 'Processando regras de negócio e compilando métricas...' });
    }

    const filaTasks = parseReportData(filaRaw, 'fila');
    const concluidasTasks = parseReportData(concluidasRaw, 'concluidas');

    const allTasks = [...concluidasTasks, ...filaTasks];
    inMemoryState.allTasks = allTasks;
    inMemoryState.lastSync = timestamp;
    if (targetMonth) {
      inMemoryState.selectedMonth = targetMonth;
    }

    saveCachedData({
      lastSync: timestamp,
      allTasks: allTasks,
      selectedMonth: inMemoryState.selectedMonth
    });

    nextSyncTimestamp = Date.now() + SYNC_INTERVAL_MS;

    const dashboardMetrics = buildDashboardMetrics(allTasks, inMemoryState.selectedMonth);

    // Auto-salva no Firebase (não precisamos esperar terminar para não travar a UI)
    if (dashboardMetrics && dashboardMetrics.activeMonth) {
      saveDashboardToFirebase(dashboardMetrics.activeMonth, dashboardMetrics)
        .then(() => console.log(`[Firebase] Auto-save do mês ${dashboardMetrics.activeMonth} concluído.`))
        .catch(err => console.error(`[Firebase] Erro no auto-save:`, err));
    }

    if (notifyWebContents && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync:status', {
        status: 'success',
        message: `Sincronização concluída com sucesso! ${concluidasTasks.length} concluídas e ${filaTasks.length} na fila.`,
        data: dashboardMetrics,
        lastSync: timestamp,
        nextSync: nextSyncTimestamp
      });
    }

    return { success: true, data: dashboardMetrics };
  } catch (err) {
    console.error('[Main] Falha na sincronização:', err);
    if (notifyWebContents && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync:status', {
        status: 'error',
        message: err.message
      });
    }
    return { success: false, error: err.message };
  }
}

function setupAutoSync() {
  if (autoSyncInterval) clearInterval(autoSyncInterval);

  nextSyncTimestamp = Date.now() + SYNC_INTERVAL_MS;

  // Intervalo de verificação a cada minuto para manter o relógio atualizado no frontend
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync:timer-tick', {
        nextSync: nextSyncTimestamp,
        lastSync: inMemoryState.lastSync
      });
    }
  }, 10000);

  // Intervalo real de 30 minutos
  autoSyncInterval = setInterval(async () => {
    console.log('[Main] Disparando auto-sincronização periódica de 30 minutos...');
    const tokens = loadTokens();
    if (tokens && tokens.access_token) {
      await performSync(true);
    }
  }, SYNC_INTERVAL_MS);
}

// Registro dos Handlers IPC
function registerIpcHandlers() {
  // Status de autenticação
  ipcMain.handle('auth:get-status', async () => {
    const tokens = loadTokens();
    if (!tokens || !tokens.access_token) {
      return { authenticated: false };
    }
    return {
      authenticated: true,
      userName: tokens.user_name || 'Usuário Salesforce',
      userEmail: tokens.user_email || '',
      instanceUrl: tokens.instance_url,
      connectedAt: tokens.connected_at || tokens.issued_at
    };
  });

  // Login interativo via OAuth PKCE
  ipcMain.handle('auth:login', async () => {
    try {
      const tokens = await startLoginFlow();
      return { success: true, user: tokens.user_name || tokens.user_email };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Logout
  ipcMain.handle('auth:logout', async () => {
    clearTokens();
    return { success: true };
  });

  // Trocar de conta (limpa anterior, faz login novo e sincroniza)
  ipcMain.handle('auth:switch-account', async () => {
    try {
      clearTokens();
      const tokens = await startLoginFlow();
      // Dispara sincronização automática com a nova conta
      await performSync(true);
      return {
        success: true,
        userName: tokens.user_name || tokens.user_email || 'Novo Usuário',
        userEmail: tokens.user_email || ''
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Disparo manual de sincronização
  ipcMain.handle('sync:now', async (event, targetMonth = null) => {
    return await performSync(true, targetMonth);
  });

  // Obter dados consolidados da dashboard
  ipcMain.handle('dashboard:get-data', async (event, targetMonth = null) => {
    inMemoryState.selectedMonth = targetMonth;
    const metrics = buildDashboardMetrics(inMemoryState.allTasks, targetMonth);
    return {
      metrics,
      lastSync: inMemoryState.lastSync,
      nextSync: nextSyncTimestamp
    };
  });

  // Obter tarefas detalhadas com filtros
  ipcMain.handle('tasks:get-list', async (event, filters = {}) => {
    let list = [...inMemoryState.allTasks];

    if (filters.category && filters.category !== 'todos') {
      if (filters.category === 'fila') {
        list = list.filter(t => t.category === 'fila');
      } else if (filters.category === 'concluidas') {
        list = list.filter(t => t.category === 'concluidas');
      }
    }

    if (filters.month && filters.month !== 'todos') {
      list = list.filter(t => t.monthYear === filters.month);
    }

    if (filters.analista && filters.analista !== 'todos') {
      list = list.filter(t => t.analista === filters.analista);
    }

    if (filters.prazo && filters.prazo !== 'todos') {
      list = list.filter(t => {
        const dateStr = t.dataVencimento || t.dataEntrega || '-';
        if (!dateStr || dateStr === '-') return false; // Se não tem data, não consideramos em atraso ou no prazo
        
        let dateParts, year, month, day;
        if (dateStr.match(/^\d{4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,2}/)) {
          dateParts = dateStr.split(/[\-\/\.]/);
          year = parseInt(dateParts[0], 10);
          month = parseInt(dateParts[1], 10) - 1;
          day = parseInt(dateParts[2], 10);
        } else if (dateStr.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/)) {
          dateParts = dateStr.split(/[\/\-]/);
          day = parseInt(dateParts[0], 10);
          month = parseInt(dateParts[1], 10) - 1;
          year = parseInt(dateParts[2], 10);
        } else {
          return false;
        }
        
        const dueDate = new Date(year, month, day);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const isOverdue = dueDate < today;
        
        if (filters.prazo === 'atraso') {
          return isOverdue && t.category === 'fila'; // Só consideramos em atraso as que estão em aberto
        } else if (filters.prazo === 'no_prazo') {
          // No prazo: ou não está em atraso, ou já foi concluída
          return !isOverdue || t.category === 'concluidas';
        }
        return true;
      });
    }

    if (filters.priority && filters.priority !== 'todos') {
      list = list.filter(t => t.priorityCategory === filters.priority);
    }

    if (filters.query) {
      const q = String(filters.query).toLowerCase();
      list = list.filter(t =>
        (t.subject && t.subject.toLowerCase().includes(q)) ||
        (t.taskId && t.taskId.toLowerCase().includes(q)) ||
        (t.analista && t.analista.toLowerCase().includes(q))
      );
    }

    return {
      total: list.length,
      tasks: list
    };
  });

  // Abertura de links externos
  ipcMain.handle('system:open-external', async (event, url) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url);
    }
  });

  // Salvar Dashboard no Firebase
  ipcMain.handle('db:save-dashboard', async (event, monthYear, metrics) => {
    try {
      if (!monthYear || !metrics) throw new Error("Parâmetros inválidos.");
      const result = await saveDashboardToFirebase(monthYear, metrics);
      return { success: true, docId: result.docId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Salvar Avatar no Firebase
  ipcMain.handle('db:save-avatar', async (event, analystName, base64Image) => {
    try {
      await saveAvatarToFirebase(analystName, base64Image);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Obter Avatares do Firebase
  ipcMain.handle('db:get-avatars', async () => {
    try {
      const avatars = await getAvatarsFromFirebase();
      return { success: true, data: avatars };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Obter todas Dashboards do Firebase
  ipcMain.handle('db:get-dashboards', async () => {
    try {
      const dashboards = await getDashboardsFromFirebase();
      return { success: true, data: dashboards };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Exportar tela para PDF
  ipcMain.handle('system:export-pdf', async (event, title) => {
    try {
      const { filePath } = await dialog.showSaveDialog({
        title: 'Salvar PDF da Dashboard',
        defaultPath: path.join(app.getPath('downloads'), `${title || 'Dashboard'}.pdf`),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });

      if (!filePath) return { success: false, canceled: true };

      const pdfData = await mainWindow.webContents.printToPDF({
        printBackground: true,
        landscape: true,
        preferCSSPageSize: true
      });

      fs.writeFileSync(filePath, pdfData);
      shell.showItemInFolder(filePath); // Abre a pasta para o usuário ver
      return { success: true, filePath };
    } catch (err) {
      console.error('[Main] Erro ao exportar PDF:', err);
      return { success: false, error: err.message };
    }
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
