const { app, dialog } = require('electron');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hora

let autoUpdater = null;
let checking = false;
let promptOpen = false;

function init(getWindow) {
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
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Nova versão encontrada:', info.version);
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('updater:status', { status: 'downloading', version: info.version });
  });

  autoUpdater.on('download-progress', (p) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.setProgressBar(p.percent / 100);
      win.webContents.send('updater:status', { status: 'progress', percent: Math.round(p.percent) });
    }
  });

  autoUpdater.on('update-downloaded', async (info) => {
    checking = false;
    const win = getWindow();
    if (win && !win.isDestroyed()) win.setProgressBar(-1);
    if (promptOpen) return;
    promptOpen = true;
    const { response } = await dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, {
      type: 'info',
      title: 'Atualização disponível',
      message: `A versão ${info.version} do Painel de Contenção está pronta.`,
      detail: 'Deseja reiniciar agora para atualizar? Se escolher "Depois", a atualização será instalada quando você fechar o app.',
      buttons: ['Atualizar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1
    });
    promptOpen = false;
    if (response === 0) autoUpdater.quitAndInstall();
  });

  const check = async () => {
    if (checking) return;
    checking = true;
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      console.error('[Updater] Falha ao verificar:', err.message);
    } finally {
      checking = false;
    }
  };

  check();
  setInterval(check, CHECK_INTERVAL_MS);
}

module.exports = { init };
