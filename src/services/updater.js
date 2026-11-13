const { app, ipcMain } = require('electron');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hora

let autoUpdater = null;
let checking = false;
let getWindowFn = () => null;

// Último estado enviado ao renderer (reenviado se a janela recarregar)
let lastStatus = { status: 'idle' };

function emit(payload) {
  lastStatus = payload;
  const win = getWindowFn();
  if (win && !win.isDestroyed()) win.webContents.send('updater:status', payload);
}

function registerIpc() {
  ipcMain.handle('updater:get-status', () => lastStatus);
  ipcMain.handle('updater:install', () => {
    if (autoUpdater && lastStatus.status === 'ready') autoUpdater.quitAndInstall();
  });
  ipcMain.handle('updater:retry', () => check());
  ipcMain.handle('updater:get-version', () => ({ version: app.getVersion(), packaged: app.isPackaged }));
  ipcMain.handle('updater:check-manual', () => checkManual());
  ipcMain.handle('updater:dismiss', () => {
    // "Depois": mantém autoInstallOnAppQuit; só esconde o modal
    if (lastStatus.status === 'ready') lastStatus = { ...lastStatus, dismissed: true };
  });
}

async function check() {
  if (!autoUpdater || checking) return;
  checking = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.error('[Updater] Falha ao verificar:', err.message);
  } finally {
    checking = false;
  }
}

function isNewer(remote, local) {
  const a = String(remote).split('.').map(n => parseInt(n, 10) || 0);
  const b = String(local).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

// Verificação pedida pelo usuário: devolve o resultado para a tela de Configurações.
// O download/modal seguem pelos eventos normais do autoUpdater.
async function checkManual() {
  const current = app.getVersion();
  if (!autoUpdater) return { result: 'dev', current };
  if (lastStatus.status === 'ready') {
    emit({ status: 'ready', version: lastStatus.version }); // reabre o modal se estava dispensado
    return { result: 'ready', current, version: lastStatus.version };
  }
  if (lastStatus.status === 'downloading' || lastStatus.status === 'progress') {
    return { result: 'downloading', current, version: lastStatus.version };
  }
  if (checking) return { result: 'busy', current };
  checking = true;
  try {
    const res = await autoUpdater.checkForUpdates();
    const remote = res && res.updateInfo && res.updateInfo.version;
    if (remote && isNewer(remote, current)) {
      // Se um update-downloaded já foi emitido (arquivo em cache), reexibe o modal
      return { result: 'available', current, version: remote };
    }
    return { result: 'up-to-date', current, version: remote };
  } catch (err) {
    console.error('[Updater] Falha na verificação manual:', err.message);
    return { result: 'error', current, message: err.message };
  } finally {
    checking = false;
  }
}

function init(getWindow) {
  getWindowFn = getWindow;
  registerIpc();

  // Só atualiza o app instalado (em desenvolvimento não há app-update.yml)
  if (!app.isPackaged) return;

  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    console.warn('[Updater] electron-updater indisponível:', err.message);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // se o usuário clicar em "Depois", instala ao fechar

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Erro:', err && err.message);
    checking = false;
    const win = getWindowFn();
    if (win && !win.isDestroyed()) win.setProgressBar(-1);
    // Só mostra erro se já havia um download em andamento (falha de rede ao checar não incomoda)
    if (lastStatus.status === 'downloading' || lastStatus.status === 'progress') {
      emit({ status: 'error', version: lastStatus.version, message: (err && err.message) || 'Falha ao baixar a atualização.' });
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Nova versão encontrada:', info.version);
    emit({ status: 'downloading', version: info.version, percent: 0 });
  });

  autoUpdater.on('download-progress', (p) => {
    const win = getWindowFn();
    if (win && !win.isDestroyed()) win.setProgressBar(p.percent / 100);
    emit({ status: 'progress', version: lastStatus.version, percent: Math.round(p.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    checking = false;
    const win = getWindowFn();
    if (win && !win.isDestroyed()) win.setProgressBar(-1);
    emit({ status: 'ready', version: info.version });
  });

  check();
  setInterval(check, CHECK_INTERVAL_MS);
}

module.exports = { init };
