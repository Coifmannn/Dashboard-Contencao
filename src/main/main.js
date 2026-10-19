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
const { parseReportData, buildDashboardMetrics, classifyPriorityCategory, calculateHorasEPontos, setRoster, getRoster, cleanString } = require('../services/businessRules');
const { saveDashboardToFirebase, getDashboardsFromFirebase, saveAvatarToFirebase, getAvatarsFromFirebase, saveTeamToFirebase, subscribeTeam, getAdminConfigFromFirebase, saveAdminConfigToFirebase } = require('../services/firebase');
const { fetchSalesforceEndpoint } = require('../services/salesforceReports');
const crypto = require('crypto');

// --- Opções de administrador ---
const MASTER_ADMIN_EMAIL = 'felipe.wustemberg@doutoresdaweb.com.br';
let adminUnlocked = false; // liberado após informar a senha (vale até fechar o app / trocar de conta)

const normEmail = (e) => String(e || '').trim().toLowerCase();
const hashPassword = (pwd, salt) => crypto.scryptSync(String(pwd), salt, 64).toString('hex');

function currentUserEmail() {
  const tokens = loadTokens();
  return normEmail(tokens && tokens.user_email);
}

async function getAdminContext() {
  const email = currentUserEmail();
  let cfg = {};
  try {
    cfg = await getAdminConfigFromFirebase();
    // Semeia o banco com o administrador principal e a lista de admins na primeira leitura
    if (!cfg.masterEmail || !Array.isArray(cfg.admins)) {
      const seed = { masterEmail: cfg.masterEmail || MASTER_ADMIN_EMAIL, admins: Array.isArray(cfg.admins) ? cfg.admins : [] };
      await saveAdminConfigToFirebase(seed);
      cfg = { ...cfg, ...seed };
    }
  } catch (err) { console.error('[Admin] Erro ao ler config:', err.message); }
  const master = normEmail(cfg.masterEmail) || MASTER_ADMIN_EMAIL;
  const admins = (Array.isArray(cfg.admins) ? cfg.admins : []).map(normEmail);
  const isMaster = !!email && email === master;
  const isAdmin = isMaster || (!!email && admins.includes(email));
  return { email, cfg, master, admins, isMaster, isAdmin, hasPassword: !!cfg.passwordHash };
}

async function requireUnlockedAdmin() {
  const ctx = await getAdminContext();
  if (!ctx.isAdmin) return { ok: false, error: 'Acesso restrito a administradores.' };
  if (!adminUnlocked) return { ok: false, error: 'Desbloqueie as opções de administrador com a senha.' };
  return { ok: true, ctx };
}

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

// --- Equipe (roster): persistida em user_settings.json sob a chave 'team' ---
function readUserSettings() {
  try {
    ensureDataDir();
    const file = path.join(getDataDir(), 'user_settings.json');
    const fallback = path.join(LOCAL_DATA_DIR, 'user_settings.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (fs.existsSync(fallback)) return JSON.parse(fs.readFileSync(fallback, 'utf-8'));
  } catch (err) {}
  return {};
}

function writeUserSettings(updated) {
  ensureDataDir();
  const file = path.join(getDataDir(), 'user_settings.json');
  fs.writeFileSync(file, JSON.stringify(updated, null, 2));
  if (fs.existsSync(LOCAL_DATA_DIR)) {
    fs.writeFileSync(path.join(LOCAL_DATA_DIR, 'user_settings.json'), JSON.stringify(updated, null, 2));
  }
}

function applySavedRoster() {
  const settings = readUserSettings();
  if (settings && Array.isArray(settings.team) && settings.team.length > 0) {
    // O roster salvo é a fonte da verdade (permite remover também os membros originais)
    setRoster(settings.team);
  }
}
applySavedRoster();

// Salva a equipe localmente e no Firebase (compartilhado entre todos os usuários)
// Grava primeiro no Firebase; se falhar, restaura `previous` e propaga o erro (nada fica só local).
async function persistRoster(previous) {
  try {
    await saveTeamToFirebase(getRoster());
  } catch (err) {
    console.error('[Firebase] Erro ao salvar equipe:', err.code || '', err.message);
    if (previous) setRoster(previous);
    const denied = err.code === 'permission-denied';
    throw new Error(denied
      ? 'O Firebase recusou a gravação (permission-denied). Ajuste as regras do Firestore para config/team.'
      : `Não foi possível salvar no Firebase: ${err.message}`);
  }
  writeUserSettings({ ...readUserSettings(), team: getRoster() });
}

let teamUnsubscribe = null;
function startTeamSync() {
  if (teamUnsubscribe) teamUnsubscribe();
  teamUnsubscribe = subscribeTeam((remoteMembers) => {
    if (!remoteMembers || remoteMembers.length === 0) {
      // Banco ainda sem equipe: semeia com a lista local
      saveTeamToFirebase(getRoster()).catch(err => console.error('[Firebase] Erro ao semear equipe:', err.message));
      return;
    }
    const before = JSON.stringify(getRoster());
    setRoster(remoteMembers);
    if (JSON.stringify(getRoster()) === before) return; // sem mudança (eco da própria gravação)
    writeUserSettings({ ...readUserSettings(), team: getRoster() });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('team:updated', getRoster());
    }
  });
}

let inMemoryState = {
  lastSync: null,
  allTasks: [],
  selectedMonth: null
};

// Carrega cache na inicialização
const initialCache = loadCachedData();
if (initialCache && initialCache.allTasks) {
  // Reavalia tarefas do cache aplicando as regras vigentes (sem contaminação de domínio e sem falso-positivo de API)
  const updatedTasks = initialCache.allTasks.map(t => {
    const priorityCategory = classifyPriorityCategory(t.subject, '');
    const metrics = calculateHorasEPontos(t.taskId, t.analista, t.subject, '', 0, 0, t.isRework);
    return {
      ...t,
      tipo: priorityCategory,
      priorityCategory,
      horas: metrics.horas,
      pontos: metrics.pontos
    };
  });
  inMemoryState.allTasks = updatedTasks;
  inMemoryState.lastSync = initialCache.lastSync;
  inMemoryState.selectedMonth = initialCache.selectedMonth || null;
  saveCachedData({
    ...initialCache,
    allTasks: updatedTasks
  });
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

    return {
      success: true,
      data: dashboardMetrics,
      lastSync: timestamp,
      nextSync: nextSyncTimestamp
    };
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
    adminUnlocked = false;
    clearTokens();
    return { success: true };
  });

  // Trocar de conta (limpa anterior, faz login novo e sincroniza)
  ipcMain.handle('auth:switch-account', async () => {
    try {
      adminUnlocked = false;
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
      if (filters.analista === 'sem_analista') {
        list = list.filter(t => {
          if (!t.analista || t.analista.trim() === '' || t.analista === 'Sem Analista') return true;
          const low = t.analista.toLowerCase();
          if (low.includes('conten') || low.includes('fila') || low.includes('suporte') || low.includes('cs -')) return true;
          return false;
        });
      } else {
        list = list.filter(t => t.analista === filters.analista);
      }
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

  // Limpar Cache
  ipcMain.handle('system:clear-cache', async () => {
    try {
      const primary = getCacheFilePath();
      const fallback = path.join(LOCAL_DATA_DIR, 'cached_dashboard.json');
      if (fs.existsSync(primary)) fs.unlinkSync(primary);
      if (fs.existsSync(fallback)) fs.unlinkSync(fallback);
      
      inMemoryState.lastSync = null;
      inMemoryState.allTasks = [];
      inMemoryState.selectedMonth = null;
      
      return { success: true };
    } catch (err) {
      console.error('[Main] Erro ao limpar cache:', err);
      return { success: false, error: err.message };
    }
  });

  // --- Opções de administrador ---
  ipcMain.handle('admin:get-state', async () => {
    const ctx = await getAdminContext();
    if (!ctx.isAdmin) adminUnlocked = false;
    return { isAdmin: ctx.isAdmin, isMaster: ctx.isMaster, hasPassword: ctx.hasPassword, unlocked: ctx.isAdmin && adminUnlocked, email: ctx.email };
  });

  ipcMain.handle('admin:unlock', async (event, password) => {
    try {
      const ctx = await getAdminContext();
      if (!ctx.isAdmin) return { success: false, error: 'Acesso restrito a administradores.' };
      if (!ctx.hasPassword) return { success: false, error: 'Nenhuma senha definida ainda.', needsPassword: true };
      const ok = hashPassword(password, ctx.cfg.passwordSalt) === ctx.cfg.passwordHash;
      if (!ok) return { success: false, error: 'Senha incorreta.' };
      adminUnlocked = true;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('admin:lock', () => { adminUnlocked = false; return { success: true }; });

  // Define/altera a senha (somente conta master; se já existe, exige a senha atual)
  ipcMain.handle('admin:set-password', async (event, newPassword, currentPassword) => {
    try {
      const ctx = await getAdminContext();
      if (!ctx.isMaster) return { success: false, error: 'Somente o administrador principal pode definir a senha.' };
      if (String(newPassword || '').length < 4) return { success: false, error: 'A senha deve ter ao menos 4 caracteres.' };
      if (ctx.hasPassword && hashPassword(currentPassword, ctx.cfg.passwordSalt) !== ctx.cfg.passwordHash) {
        return { success: false, error: 'Senha atual incorreta.' };
      }
      const salt = crypto.randomBytes(16).toString('hex');
      await saveAdminConfigToFirebase({ passwordSalt: salt, passwordHash: hashPassword(newPassword, salt) });
      adminUnlocked = true;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('admin:list', async () => {
    const g = await requireUnlockedAdmin();
    if (!g.ok) return { success: false, error: g.error };
    return { success: true, master: g.ctx.master, admins: g.ctx.admins };
  });

  // Concede a mesma permissão a um e-mail cadastrado no Salesforce (somente master)
  ipcMain.handle('admin:add', async (event, emailRaw) => {
    try {
      const g = await requireUnlockedAdmin();
      if (!g.ok) return { success: false, error: g.error };
      if (!g.ctx.isMaster) return { success: false, error: 'Somente o administrador principal pode conceder acesso.' };
      const email = normEmail(emailRaw);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: 'E-mail inválido.' };
      if (email === g.ctx.master || g.ctx.admins.includes(email)) return { success: false, error: 'Este e-mail já é administrador.' };
      let sfName = '';
      try {
        const safe = email.replace(/'/g, "\\'");
        const q = encodeURIComponent(`SELECT Name, Email FROM User WHERE Email = '${safe}' AND IsActive = true LIMIT 1`);
        const result = await fetchSalesforceEndpoint(`/services/data/v61.0/query?q=${q}`);
        if (!result.records || result.records.length === 0) {
          return { success: false, error: 'E-mail não encontrado entre os usuários ativos do Salesforce.' };
        }
        sfName = result.records[0].Name;
      } catch (err) {
        return { success: false, error: `Não foi possível validar no Salesforce: ${err.message}` };
      }
      const admins = [...g.ctx.admins, email];
      await saveAdminConfigToFirebase({ admins });
      return { success: true, admins, name: sfName };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('admin:remove', async (event, emailRaw) => {
    try {
      const g = await requireUnlockedAdmin();
      if (!g.ok) return { success: false, error: g.error };
      if (!g.ctx.isMaster) return { success: false, error: 'Somente o administrador principal pode remover acesso.' };
      const email = normEmail(emailRaw);
      const admins = g.ctx.admins.filter(a => a !== email);
      await saveAdminConfigToFirebase({ admins });
      return { success: true, admins };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Equipe: listar
  ipcMain.handle('team:get', () => getRoster());

  // Equipe: habilitar/desabilitar membro
  ipcMain.handle('team:set-enabled', async (event, name, enabled) => {
    try {
      const g = await requireUnlockedAdmin();
      if (!g.ok) return { success: false, error: g.error };
      const roster = getRoster();
      const member = roster.find(m => m.name === name);
      if (!member) return { success: false, error: 'Funcionário não encontrado.' };
      if (!enabled && roster.filter(m => m.enabled).length <= 1 && member.enabled) {
        return { success: false, error: 'Ao menos um funcionário deve permanecer habilitado.' };
      }
      const previous = getRoster();
      member.enabled = !!enabled;
      setRoster(roster);
      await persistRoster(previous);
      return { success: true, team: getRoster() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Equipe: adicionar novo funcionário
  ipcMain.handle('team:add', async (event, fullName, cargaPadrao) => {
    try {
      const g = await requireUnlockedAdmin();
      if (!g.ok) return { success: false, error: g.error };
      const name = String(fullName || '').trim().replace(/\s+/g, ' ');
      if (name.length < 2) return { success: false, error: 'Informe o nome do funcionário.' };
      const roster = getRoster();
      const previous = getRoster();
      if (roster.some(m => cleanString(m.name) === cleanString(name))) {
        return { success: false, error: 'Este funcionário já existe.' };
      }
      // Chave de busca: primeiro nome; se já usado (ou contido em outro), usa o nome completo
      const firstKey = cleanString(name.split(' ')[0]);
      const conflict = roster.some(m => firstKey.includes(m.searchKey) || m.searchKey.includes(firstKey));
      const searchKey = conflict ? cleanString(name) : firstKey;
      roster.push({
        name,
        searchKey,
        cargaPadrao: Number(cargaPadrao) > 0 ? Number(cargaPadrao) : 7.5,
        enabled: true,
        custom: true
      });
      setRoster(roster);
      await persistRoster(previous);
      return { success: true, team: getRoster() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Equipe: remover funcionário adicionado manualmente
  ipcMain.handle('team:remove', async (event, name) => {
    try {
      const g = await requireUnlockedAdmin();
      if (!g.ok) return { success: false, error: g.error };
      const roster = getRoster();
      const member = roster.find(m => m.name === name);
      if (!member) return { success: false, error: 'Funcionário não encontrado.' };
      if (roster.length <= 1) return { success: false, error: 'A equipe precisa ter ao menos um funcionário.' };
      if (member.enabled && roster.filter(m => m.enabled).length <= 1) {
        return { success: false, error: 'Ao menos um funcionário deve permanecer habilitado.' };
      }
      const previous = getRoster();
      const next = roster.filter(m => m.name !== name);
      setRoster(next);
      await persistRoster(previous);
      return { success: true, team: getRoster() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Configurações do usuário
  ipcMain.handle('system:get-settings', () => {
    try {
      ensureDataDir();
      const file = path.join(getDataDir(), 'user_settings.json');
      const fallback = path.join(LOCAL_DATA_DIR, 'user_settings.json');
      
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (fs.existsSync(fallback)) return JSON.parse(fs.readFileSync(fallback, 'utf-8'));
    } catch (err) {}
    return {};
  });

  ipcMain.handle('system:save-settings', (event, settings) => {
    try {
      ensureDataDir();
      const file = path.join(getDataDir(), 'user_settings.json');
      let current = {};
      if (fs.existsSync(file)) {
        current = JSON.parse(fs.readFileSync(file, 'utf-8'));
      }
      const updated = { ...current, ...settings };
      fs.writeFileSync(file, JSON.stringify(updated, null, 2));
      
      if (fs.existsSync(LOCAL_DATA_DIR)) {
        fs.writeFileSync(path.join(LOCAL_DATA_DIR, 'user_settings.json'), JSON.stringify(updated, null, 2));
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  startTeamSync();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
