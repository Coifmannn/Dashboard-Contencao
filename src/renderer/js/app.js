// Controlador Principal do Frontend (Renderer)

let currentMetrics = null;
let currentTasks = [];
let nextSyncTimestamp = null;
let countdownInterval = null;

// Elementos do DOM
const monthSelect = document.getElementById('monthSelect');
const connectionDot = document.getElementById('connectionDot');
const connectionTitle = document.getElementById('connectionTitle');
const connectionUser = document.getElementById('connectionUser');
const switchAccountBtn = document.getElementById('switchAccountBtn');
const authBtn = document.getElementById('authBtn');
const lastSyncTimeEl = document.getElementById('lastSyncTime');
const nextSyncCountdownEl = document.getElementById('nextSyncCountdown');
const syncNowBtn = document.getElementById('syncNowBtn');
const saveMonthToDbBtn = document.getElementById('saveMonthToDbBtn');
const exportPdfBtnMensal = document.getElementById('exportPdfBtnMensal');
const exportPdfBtnSemanal = document.getElementById('exportPdfBtnSemanal');
const syncIcon = document.getElementById('syncIcon');
const workdaysText = document.getElementById('workdaysText');
const navTasksCount = document.getElementById('navTasksCount');
const toastContainer = document.getElementById('toastContainer');

// Elementos de KPIs
const kpiSaldoCard = document.getElementById('kpiSaldoCard');
const kpiSaldoValue = document.getElementById('kpiSaldoValue');
const kpiSaldoBadge = document.getElementById('kpiSaldoBadge');
const kpiHorasTrabValue = document.getElementById('kpiHorasTrabValue');
const kpiHorasTrabMeta = document.getElementById('kpiHorasTrabMeta');
const kpiPrevisaoValue = document.getElementById('kpiPrevisaoValue');
const kpiFilaValue = document.getElementById('kpiFilaValue');

// Elementos de Tabelas da Dashboard
const tabelaMetasBody = document.getElementById('tabelaMetasBody');
const tabelaMetasFoot = document.getElementById('tabelaMetasFoot');
const tabelaMetasHomeBody = document.getElementById('tabelaMetasHomeBody');
const tabelaMetasHomeFoot = document.getElementById('tabelaMetasHomeFoot');
const tabelaPrioridadesBody = document.getElementById('tabelaPrioridadesBody');
const tabelaPrioridadesFoot = document.getElementById('tabelaPrioridadesFoot');
const tabelaHorasSemanaisBody = document.getElementById('tabelaHorasSemanaisBody');
const tabelaHorasSemanaisFoot = document.getElementById('tabelaHorasSemanaisFoot');
const tabelaTarefasSemanaisBody = document.getElementById('tabelaTarefasSemanaisBody');
const tabelaTarefasSemanaisFoot = document.getElementById('tabelaTarefasSemanaisFoot');

// Elementos de Tarefas
const taskSearchInput = document.getElementById('taskSearchInput');
const filterCategory = document.getElementById('filterCategory');
const filterAnalyst = document.getElementById('filterAnalyst');
const filterPriority = document.getElementById('filterPriority');
const filteredCount = document.getElementById('filteredCount');
const tasksListBody = document.getElementById('tasksListBody');

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupEventListeners();
  await checkAuthStatus();
  await loadDashboard();
  setupSyncListeners();
});

// Alternância de Abas
function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  const rankingSubmenu = document.getElementById('rankingSubmenu');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.id === 'tabBtnRanking') {
        const isExpanded = rankingSubmenu.style.display === 'flex';
        rankingSubmenu.style.display = isExpanded ? 'none' : 'flex';
      } else {
        if (rankingSubmenu) rankingSubmenu.style.display = 'none';
      }

      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(tab.dataset.tab);
      if (targetPane) {
        targetPane.classList.add('active');
      }

      if (tab.dataset.tab === 'tab-tasks') {
        loadTasksList();
      }

      const rankingMetricContainer = document.getElementById('rankingMetricContainer');
      if (rankingMetricContainer) {
        rankingMetricContainer.style.display = tab.dataset.tab === 'tab-ranking' ? 'block' : 'none';
      }
    });
  });

  const subtabs = document.querySelectorAll('.sidebar-subtab');
  subtabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      subtabs.forEach(t => {
        t.classList.remove('active');
        t.style.background = 'transparent';
        t.style.color = '#94a3b8';
      });
      document.querySelectorAll('.ranking-pane').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
      });
      tab.classList.add('active');
      tab.style.background = 'rgba(56, 189, 248, 0.1)';
      tab.style.color = '#38bdf8';
      
      const targetPane = document.getElementById(tab.dataset.subtab);
      if (targetPane) {
        targetPane.classList.add('active');
        targetPane.style.display = 'block';
      }
    });
  });
}

function setupEventListeners() {
  monthSelect.addEventListener('change', async () => {
    const selected = monthSelect.value;
    await triggerManualSync(selected);
  });

  const rankingMetricSelect = document.getElementById('rankingMetricSelect');
  const rankingPriorityContainer = document.getElementById('rankingPriorityContainer');
  const rankingPrioritySelect = document.getElementById('rankingPrioritySelect');

  const updateRankings = () => {
    if (currentMetrics) {
      if (rankingMetricSelect.value === 'tarefas') {
        if (rankingPriorityContainer) rankingPriorityContainer.style.display = 'block';
      } else {
        if (rankingPriorityContainer) rankingPriorityContainer.style.display = 'none';
      }
      
      renderRankingPodium(currentMetrics.tabelaMetas, 'podiumContainer', rankingMetricSelect.value);
      
      const weekFilter = document.getElementById('filterSemanalWeek')?.value || currentMetrics.tabelaMetasSemanal.currentWeek;
      const weekRows = currentMetrics.tabelaMetasSemanal.porSemana[weekFilter] || currentMetrics.tabelaMetasSemanal.rows;
      renderRankingPodium({ rows: weekRows }, 'podiumSemanalContainer', rankingMetricSelect.value);
      
      const dayFilterInput = document.getElementById('filterDiarioDate')?.value;
      let dayRows = currentMetrics.tabelaMetasDiaria.rows;
      if (dayFilterInput) {
        const dParts = dayFilterInput.split('-');
        const dayStr = `${dParts[2]}/${dParts[1]}/${dParts[0]}`;
        if (currentMetrics.tabelaMetasDiaria.porDia[dayStr]) {
          dayRows = currentMetrics.tabelaMetasDiaria.porDia[dayStr];
        }
      }
      renderRankingPodium({ rows: dayRows }, 'podiumDiarioContainer', rankingMetricSelect.value);
      
      renderTabelaMetas(currentMetrics.tabelaMetas, rankingMetricSelect.value);
      renderTabelaMetasSemanal({ rows: weekRows }, rankingMetricSelect.value);
      renderTabelaMetasDiaria({ rows: dayRows }, rankingMetricSelect.value);
    }
    if (customRangeData) {
      renderTabelaMetasPersonalizado(customRangeData, rankingMetricSelect.value);
      renderRankingPodium(customRangeData, 'podiumPersonalizadoContainer', rankingMetricSelect.value);
    }
  };

  if (rankingMetricSelect) {
    rankingMetricSelect.addEventListener('change', updateRankings);
  }
  if (rankingPrioritySelect) {
    rankingPrioritySelect.addEventListener('change', updateRankings);
  }

  const filterSemanalWeek = document.getElementById('filterSemanalWeek');
  if (filterSemanalWeek) {
    filterSemanalWeek.addEventListener('change', () => {
      if (!currentMetrics) return;
      const week = filterSemanalWeek.value;
      const weekRows = currentMetrics.tabelaMetasSemanal.porSemana[week] || currentMetrics.tabelaMetasSemanal.rows;
      const metric = rankingMetricSelect?.value || 'horas';
      renderTabelaMetasSemanal({ rows: weekRows }, metric);
      renderRankingPodium({ rows: weekRows }, 'podiumSemanalContainer', metric);
    });
  }

  const filterDiarioDate = document.getElementById('filterDiarioDate');
  if (filterDiarioDate) {
    filterDiarioDate.addEventListener('change', () => {
      if (!currentMetrics) return;
      const dateVal = filterDiarioDate.value; // YYYY-MM-DD
      if (!dateVal) return;
      const parts = dateVal.split('-');
      const str = `${parts[2]}/${parts[1]}/${parts[0]}`;
      
      let dayRows = currentMetrics.tabelaMetasDiaria.porDia[str];
      if (!dayRows) {
        dayRows = currentMetrics.tabelaMetasDiaria.rows.map(r => ({ ...r, horasTrabalhadas: 0, saldo: -r.metaDiaria, pontosTotais: 0, percentualAtingido: 0, statusMeta: 'Abaixo da meta', totalTarefasConcluidas: 0 }));
      }
      const metric = rankingMetricSelect?.value || 'horas';
      renderTabelaMetasDiaria({ rows: dayRows }, metric);
      renderRankingPodium({ rows: dayRows }, 'podiumDiarioContainer', metric);
    });
  }

  setupRankingPersonalizado();

  // Para adicionar um tema: crie o bloco [data-theme="id"] no style.css e uma linha aqui.
  const THEMES = [
    { id: 'default',   label: 'Padrão',     bg: '#0b1120', card: '#141c2f', accent: '#38bdf8', text: '#f8fafc' },
    { id: 'dracula',   label: 'Drácula',    bg: '#282a36', card: '#44475a', accent: '#ff79c6', text: '#f8f8f2' },
    { id: 'light',     label: 'Claro',      bg: '#f1f5f9', card: '#ffffff', accent: '#0ea5e9', text: '#0f172a' },
    { id: 'neon',      label: 'Neon',       bg: '#000000', card: '#111111', accent: '#39ff14', text: '#ffffff' },
    { id: 'nord',      label: 'Nord',       bg: '#2e3440', card: '#3b4252', accent: '#88c0d0', text: '#eceff4' },
    { id: 'midnight',  label: 'Midnight',   bg: '#0a0a1f', card: '#15153a', accent: '#818cf8', text: '#eef0ff' },
    { id: 'solarized', label: 'Solarized',  bg: '#002b36', card: '#073642', accent: '#2aa198', text: '#fdf6e3' },
    { id: 'floresta',  label: 'Floresta',   bg: '#0b1410', card: '#12231a', accent: '#4ade80', text: '#ecfdf3' },
    { id: 'sunset',    label: 'Sunset',     bg: '#1a0f1f', card: '#2c1838', accent: '#fb923c', text: '#fff1f2' },
    { id: 'contraste', label: 'Alto contraste', bg: '#000000', card: '#0a0a0a', accent: '#ffd400', text: '#ffffff' }
  ];
  const themeContainer = document.getElementById('themeSelectorContainer');
  themeContainer.innerHTML = '';
  THEMES.forEach(t => {
    const el = document.createElement('div');
    el.className = 'theme-option';
    el.dataset.theme = t.id;
    el.style.cssText = `cursor:pointer; border:2px solid transparent; border-radius:8px; padding:10px; width:120px; text-align:center; background:${t.bg}; transition:0.2s;`;
    el.innerHTML = `
      <div style="height:40px; background:${t.card}; border-radius:4px; margin-bottom:8px; display:flex; align-items:center; justify-content:center; border:1px solid ${t.accent}55;">
        <span style="color:${t.accent};">✦</span>
      </div>
      <span style="font-size:13px; color:${t.text}; font-weight:500;">${t.label}</span>`;
    themeContainer.appendChild(el);
  });

  const themeOptions = document.querySelectorAll('.theme-option');
  let currentTheme = localStorage.getItem('dashTheme') || 'default';
  
  window.api.getSettings().then(settings => {
    if (settings && settings.theme) {
      currentTheme = settings.theme;
      applyTheme(currentTheme);
    }
  });
  
  const applyTheme = (themeName) => {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('dashTheme', themeName);
    window.api.saveSettings({ theme: themeName }).catch(err => console.error(err));

    
    themeOptions.forEach(opt => {
      if (opt.dataset.theme === themeName) {
        opt.classList.add('active');
        opt.style.borderColor = 'var(--primary)';
      } else {
        opt.classList.remove('active');
        opt.style.borderColor = 'transparent';
      }
    });
  };

  // Apply on load
  applyTheme(currentTheme);

  themeOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      applyTheme(opt.dataset.theme);
    });
  });

  // --- LOGICA DE AVATAR ---
  const btnUploadAvatar = document.getElementById('btnUploadAvatar');
  const customAvatarInput = document.getElementById('customAvatarInput');
  const btnResetAvatar = document.getElementById('btnResetAvatar');
  const avatarPresetBtns = document.querySelectorAll('.avatar-preset-btn');
  const settingsAvatarPreview = document.getElementById('settingsAvatarPreview');

  window.avatarsDict = window.avatarsDict || {};

  const updateAvatarEverywhere = () => {
    const userName = connectionUser.textContent;
    if (userName && userName !== 'Requer login' && userName !== 'Salesforce Org') {
      const avatarUrl = getAvatarForAnalyst(userName);
      if (settingsAvatarPreview) settingsAvatarPreview.src = avatarUrl;
      const topbarAvatarImg = document.querySelector('.user-avatar img');
      if (topbarAvatarImg) topbarAvatarImg.src = avatarUrl;
      
      // Update podiums and team progress if they exist
      if (currentMetrics) {
        const metric = document.getElementById('rankingMetricSelect')?.value || 'horas';
        renderRankingPodium(currentMetrics.tabelaMetas, 'podiumContainer', metric);
        renderRankingPodium(currentMetrics.tabelaMetasSemanal, 'podiumSemanalContainer', metric);
        renderTeamProgress(currentMetrics.tabelaMetas);
      }
    }
  };

  const saveAvatar = async (userName, dataUrl) => {
    window.avatarsDict[userName] = dataUrl;
    updateAvatarEverywhere();
    if (dataUrl.startsWith('data:')) {
      await window.api.saveAvatarToDb(userName, dataUrl);
    } else {
      await window.api.saveAvatarToDb(userName, dataUrl); // Save URL as well
    }
  };

  if (btnUploadAvatar && customAvatarInput) {
    btnUploadAvatar.addEventListener('click', () => customAvatarInput.click());
    
    customAvatarInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Str = event.target.result;
        const userName = connectionUser.textContent;
        if (userName && userName !== 'Requer login') {
          showToast('Salvando avatar...', 'info');
          await saveAvatar(userName, base64Str);
          showToast('Foto de perfil atualizada!', 'success');
        }
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnResetAvatar) {
    btnResetAvatar.addEventListener('click', async () => {
      const userName = connectionUser.textContent;
      if (userName && userName !== 'Requer login') {
        const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(userName)}&backgroundColor=b6e3f4`;
        await saveAvatar(userName, defaultAvatar);
        showToast('Foto de perfil resetada para o padrão.', 'info');
      }
    });
  }

  avatarPresetBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const seed = btn.dataset.seed;
      const url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&backgroundColor=b6e3f4`;
      const userName = connectionUser.textContent;
      if (userName && userName !== 'Requer login') {
        await saveAvatar(userName, url);
        showToast('Avatar padrão selecionado!', 'success');
      }
    });
  });

  // --- GERENCIAMENTO DA EQUIPE ---
  const teamManageList = document.getElementById('teamManageList');
  const newMemberName = document.getElementById('newMemberName');
  const newMemberCarga = document.getElementById('newMemberCarga');
  const btnAddMember = document.getElementById('btnAddMember');

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const refreshAfterTeamChange = async () => {
    await renderTeamManager();
    await loadDashboard(monthSelect.value || null);
  };

  const renderTeamManager = async (forceAvatars = false) => {
    if (!teamManageList) return;
    if (forceAvatars || !window.avatarsLoadedFromDb) {
      try {
        const avatarsRes = await window.api.getAvatarsFromDb();
        if (avatarsRes && avatarsRes.success) {
          avatarsRes.data.forEach(a => { window.avatarsDict[a.analystName] = a.image; });
          window.avatarsLoadedFromDb = true;
        }
      } catch (err) {
        console.error('Erro ao buscar avatares:', err);
      }
    }
    const team = await window.api.getTeam();
    teamManageList.innerHTML = '';
    team.forEach(m => {
      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:center;gap:12px;padding:8px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-dark);${m.enabled ? '' : 'opacity:0.6;'}`;
      row.innerHTML = `
        <img src="${getAvatarForAnalyst(m.name)}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">
        <div style="flex:1;">
          <div style="font-weight:600;">${escapeHtml(m.name)}</div>
          <div style="font-size:12px;color:var(--text-dim);">${m.enabled ? 'Ativo na contenção' : 'Desabilitado (fora das metas)'} · ${m.cargaPadrao}h/dia</div>
        </div>
        <button class="btn-ghost-sm team-remove" style="cursor:pointer;color:var(--danger);border:1px solid var(--danger);">Remover</button>
        <label class="switch" title="${m.enabled ? 'Desabilitar' : 'Habilitar'}">
          <input type="checkbox" class="team-toggle" ${m.enabled ? 'checked' : ''}>
          <span class="switch-slider"></span>
        </label>`;
      row.querySelector('.team-toggle').addEventListener('change', async (e) => {
        const res = await window.api.setTeamMemberEnabled(m.name, e.target.checked);
        if (!res.success) {
          showToast(res.error, 'error');
          e.target.checked = !e.target.checked;
          return;
        }
        showToast(`${m.name} ${e.target.checked ? 'habilitado' : 'desabilitado'}.`, 'success');
        await refreshAfterTeamChange();
      });
      const rm = row.querySelector('.team-remove');
      if (rm) {
        rm.addEventListener('click', async () => {
          if (!confirm(`Remover ${m.name} da equipe?`)) return;
          const res = await window.api.removeTeamMember(m.name);
          if (!res.success) return showToast(res.error, 'error');
          showToast(`${m.name} removido.`, 'info');
          await refreshAfterTeamChange();
        });
      }
      teamManageList.appendChild(row);
    });
  };

  if (btnAddMember) {
    btnAddMember.addEventListener('click', async () => {
      const res = await window.api.addTeamMember(newMemberName.value, newMemberCarga.value);
      if (!res.success) return showToast(res.error, 'error');
      showToast('Funcionário adicionado! Sincronize para carregar as tarefas dele.', 'success');
      newMemberName.value = '';
      await refreshAfterTeamChange();
    });
  }
  renderTeamManager().catch(err => console.error('Erro ao carregar equipe:', err));
  window.api.onTeamUpdated(() => {
    refreshAfterTeamChange().catch(err => console.error('Erro ao atualizar equipe:', err));
    showToast('A equipe foi atualizada por outro usuário.', 'info');
  });
  const tabBtnSettings = document.getElementById('tabBtnSettings');
  if (tabBtnSettings) {
    tabBtnSettings.addEventListener('click', () => {
      refreshAdminUI().catch(err => console.error(err));
    });
  }

  // --- OPÇÕES DE ADMINISTRADOR ---
  const adminCard = document.getElementById('adminCard');
  const adminHeader = document.getElementById('adminHeader');
  const adminChevron = document.getElementById('adminChevron');
  const adminLockPanel = document.getElementById('adminLockPanel');
  const adminLockMsg = document.getElementById('adminLockMsg');
  const adminPasswordInput = document.getElementById('adminPasswordInput');
  const btnAdminUnlock = document.getElementById('btnAdminUnlock');
  const adminContent = document.getElementById('adminContent');
  const adminMasterOnly = document.getElementById('adminMasterOnly');
  const adminListEl = document.getElementById('adminList');
  let adminState = { isAdmin: false, isMaster: false, hasPassword: false, unlocked: false };
  let adminExpanded = false;

  const renderAdminPanels = async () => {
    if (!adminCard) return;
    adminCard.style.display = adminState.isAdmin ? '' : 'none';
    if (!adminState.isAdmin) return;
    adminChevron.style.transform = adminExpanded ? 'rotate(90deg)' : '';
    const showBody = adminExpanded;
    adminLockPanel.style.display = showBody && !adminState.unlocked ? '' : 'none';
    adminContent.style.display = showBody && adminState.unlocked ? '' : 'none';
    if (showBody && !adminState.unlocked) {
      if (!adminState.hasPassword && !adminState.isMaster) {
        adminLockMsg.textContent = 'A senha de administrador ainda não foi definida pelo administrador principal.';
        btnAdminUnlock.disabled = true;
      } else if (!adminState.hasPassword) {
        adminLockMsg.textContent = 'Defina a senha de administrador (mín. 4 caracteres). Ela será exigida para abrir estas opções.';
        btnAdminUnlock.textContent = 'Definir senha';
        btnAdminUnlock.disabled = false;
      } else {
        adminLockMsg.textContent = 'Informe a senha de administrador para continuar.';
        btnAdminUnlock.textContent = 'Desbloquear';
        btnAdminUnlock.disabled = false;
      }
    }
    if (showBody && adminState.unlocked) {
      adminMasterOnly.style.display = adminState.isMaster ? '' : 'none';
      await renderTeamManager(true);
      if (adminState.isMaster) await renderAdminList();
    }
  };

  const refreshAdminUI = async () => {
    try {
      adminState = await window.api.adminGetState();
    } catch (err) {
      adminState = { isAdmin: false, isMaster: false, hasPassword: false, unlocked: false };
    }
    await renderAdminPanels();
  };
  window.refreshAdminUI = refreshAdminUI;

  const renderAdminList = async () => {
    const res = await window.api.adminList();
    if (!res.success) return;
    adminListEl.innerHTML = '';
    const rowStyle = 'display:flex;align-items:center;gap:12px;padding:8px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-dark);';
    const master = document.createElement('div');
    master.style.cssText = rowStyle;
    master.innerHTML = `<div style="flex:1;font-weight:600;">${escapeHtml(res.master)}</div><span style="font-size:12px;color:var(--text-dim);">Principal</span>`;
    adminListEl.appendChild(master);
    res.admins.forEach(email => {
      const row = document.createElement('div');
      row.style.cssText = rowStyle;
      row.innerHTML = `<div style="flex:1;">${escapeHtml(email)}</div><button class="btn-ghost-sm" style="cursor:pointer;color:var(--danger);border:1px solid var(--danger);">Remover</button>`;
      row.querySelector('button').addEventListener('click', async () => {
        if (!confirm(`Remover acesso de administrador de ${email}?`)) return;
        const r = await window.api.adminRemove(email);
        if (!r.success) return showToast(r.error, 'error');
        showToast('Acesso removido.', 'info');
        await renderAdminList();
      });
      adminListEl.appendChild(row);
    });
  };

  if (adminHeader) {
    adminHeader.addEventListener('click', async () => {
      adminExpanded = !adminExpanded;
      if (adminExpanded) adminState = await window.api.adminGetState();
      else if (adminState.unlocked) { await window.api.adminLock(); adminState.unlocked = false; }
      await renderAdminPanels();
      if (adminExpanded && !adminState.unlocked && adminPasswordInput) adminPasswordInput.focus();
    });
  }

  const submitAdminPassword = async () => {
    const pwd = adminPasswordInput.value;
    const res = adminState.hasPassword
      ? await window.api.adminUnlock(pwd)
      : await window.api.adminSetPassword(pwd, '');
    if (!res.success) return showToast(res.error, 'error');
    adminPasswordInput.value = '';
    showToast(adminState.hasPassword ? 'Opções desbloqueadas.' : 'Senha definida!', 'success');
    await refreshAdminUI();
  };
  if (btnAdminUnlock) btnAdminUnlock.addEventListener('click', submitAdminPassword);
  if (adminPasswordInput) adminPasswordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAdminPassword(); });

  const btnAdminLock = document.getElementById('btnAdminLock');
  if (btnAdminLock) {
    btnAdminLock.addEventListener('click', async () => {
      await window.api.adminLock();
      adminExpanded = false;
      await refreshAdminUI();
    });
  }

  const btnAdminChangePwd = document.getElementById('btnAdminChangePwd');
  if (btnAdminChangePwd) {
    btnAdminChangePwd.addEventListener('click', async () => {
      const cur = document.getElementById('adminCurrentPwd');
      const nw = document.getElementById('adminNewPwd');
      const res = await window.api.adminSetPassword(nw.value, cur.value);
      if (!res.success) return showToast(res.error, 'error');
      cur.value = ''; nw.value = '';
      showToast('Senha alterada com sucesso!', 'success');
    });
  }

  const btnAddAdmin = document.getElementById('btnAddAdmin');
  if (btnAddAdmin) {
    btnAddAdmin.addEventListener('click', async () => {
      const input = document.getElementById('newAdminEmail');
      btnAddAdmin.disabled = true;
      try {
        const res = await window.api.adminAdd(input.value);
        if (!res.success) return showToast(res.error, 'error');
        showToast(`Acesso concedido a ${res.name || input.value}.`, 'success');
        input.value = '';
        await renderAdminList();
      } finally {
        btnAddAdmin.disabled = false;
      }
    });
  }
  refreshAdminUI().catch(err => console.error(err));

  syncNowBtn.addEventListener('click', async () => {
    await triggerManualSync(monthSelect.value);
  });

  if (saveMonthToDbBtn) {
    saveMonthToDbBtn.addEventListener('click', async () => {
      if (!currentMetrics) {
        showToast('Nenhum dado carregado para salvar.', 'error');
        return;
      }
      
      try {
        saveMonthToDbBtn.disabled = true;
        showToast('Salvando dados no Firebase...', 'info');
        
        const monthYear = monthSelect.value || currentMetrics.activeMonth;
        const res = await window.api.saveDashboardToDb(monthYear, currentMetrics);
        
        if (res.success) {
          showToast(`Dashboard de ${monthYear} salva com sucesso!`, 'success');
        } else {
          showToast(`Erro ao salvar: ${res.error}`, 'error');
        }
      } catch (err) {
        showToast(`Falha: ${err.message}`, 'error');
      } finally {
        saveMonthToDbBtn.disabled = false;
      }
    });
  }

  const handleExportClick = async (btn, prefix) => {
    btn.disabled = true;
    showToast('Gerando PDF... Aguarde a janela de salvamento.', 'info');
    try {
      const monthYear = monthSelect.value || currentMetrics?.activeMonth || 'Atual';
      const res = await window.api.exportPdf(`${prefix}_Contencao_${monthYear}`);
      if (res.success) {
        showToast('PDF exportado com sucesso!', 'success');
      } else if (res.canceled) {
        showToast('Exportação cancelada.', 'info');
      } else {
        showToast(`Erro ao exportar: ${res.error}`, 'error');
      }
    } catch (err) {
      showToast(`Erro ao exportar PDF: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  };

  if (exportPdfBtnMensal) {
    exportPdfBtnMensal.addEventListener('click', () => handleExportClick(exportPdfBtnMensal, 'Ranking_Mensal'));
  }

  if (exportPdfBtnSemanal) {
    exportPdfBtnSemanal.addEventListener('click', () => handleExportClick(exportPdfBtnSemanal, 'Ranking_Semanal'));
  }

  // Botão Trocar Conta (para outro analista fazer login)
  if (switchAccountBtn) {
    switchAccountBtn.addEventListener('click', async () => {
      showToast('Abrindo navegador para autenticação do novo analista...', 'info');
      try {
        switchAccountBtn.disabled = true;
        const res = await window.api.switchAccount();
        if (res.success) {
          showToast(`Conta conectada com sucesso: ${res.userName}!`, 'success');
          await checkAuthStatus();
          await loadDashboard();
        } else {
          showToast(`Falha na troca de conta: ${res.error}`, 'error');
        }
      } catch (err) {
        showToast(`Erro: ${err.message}`, 'error');
      } finally {
        switchAccountBtn.disabled = false;
      }
    });
  }

  // Botão Sair / Login
  authBtn.addEventListener('click', async () => {
    const status = await window.api.getAuthStatus();
    if (status.authenticated) {
      if (confirm(`Deseja desconectar a conta de ${status.userName || 'Salesforce'} deste computador?`)) {
        await window.api.logout();
        showToast('Desconectado do Salesforce.', 'info');
        await checkAuthStatus();
      }
    } else {
      showToast('Iniciando autenticação no navegador...', 'info');
      try {
        const res = await window.api.login();
        if (res.success) {
          showToast(`Conectado com sucesso: ${res.user}`, 'success');
          await checkAuthStatus();
          await triggerManualSync();
        } else {
          showToast(`Falha no login: ${res.error}`, 'error');
        }
      } catch (err) {
        showToast(`Erro: ${err.message}`, 'error');
      }
    }
  });

  const filterPrazo = document.getElementById('filterPrazo');

  // Filtros da Central de Tarefas
  [taskSearchInput, filterCategory, filterAnalyst, filterPriority, filterPrazo].forEach(el => {
    if (el) el.addEventListener('input', () => debounce(loadTasksList, 250)());
  });

  // Modal expandir pódio
  const podiumModal = document.getElementById('podiumModal');
  const closePodiumModal = document.getElementById('closePodiumModal');
  const podiumModalTitle = document.getElementById('podiumModalTitle');

  if (closePodiumModal) {
    closePodiumModal.addEventListener('click', () => {
      podiumModal.style.display = 'none';
    });
  }

  document.querySelectorAll('.btn-expand-podium').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      const metric = document.getElementById('rankingMetricSelect')?.value || 'horas';
      let dataToRender = null;
      let title = '';
      
      if (!currentMetrics) return;

      if (target === 'mensal') {
        dataToRender = currentMetrics.tabelaMetas;
        title = '🏆 Destaques do Mês (Expandido)';
      } else if (target === 'semanal') {
        const weekFilter = document.getElementById('filterSemanalWeek')?.value || currentMetrics.tabelaMetasSemanal.currentWeek;
        const weekRows = currentMetrics.tabelaMetasSemanal.porSemana[weekFilter] || currentMetrics.tabelaMetasSemanal.rows;
        dataToRender = { rows: weekRows };
        title = '🏆 Destaques da Semana (Expandido)';
      } else if (target === 'diario') {
        const dayFilterInput = document.getElementById('filterDiarioDate')?.value;
        let dayRows = currentMetrics.tabelaMetasDiaria.rows;
        if (dayFilterInput) {
          const dParts = dayFilterInput.split('-');
          const dayStr = `${dParts[2]}/${dParts[1]}/${dParts[0]}`;
          if (currentMetrics.tabelaMetasDiaria.porDia[dayStr]) {
            dayRows = currentMetrics.tabelaMetasDiaria.porDia[dayStr];
          }
        }
        dataToRender = { rows: dayRows };
        title = '🏆 Destaques do Dia (Expandido)';
      } else if (target === 'personalizado') {
        if (!customRangeData) return;
        dataToRender = customRangeData;
        title = `🏆 Destaques do Período ${formatIsoBr(customRangeData.startDate)} a ${formatIsoBr(customRangeData.endDate)} (Expandido)`;
      }

      if (dataToRender) {
        podiumModalTitle.textContent = title;
        podiumModal.style.display = 'flex';
        renderRankingPodium(dataToRender, 'podiumModalContainer', metric, 6);
      }
    });
  });
}

function mapFrontendAnalystName(rawName) {
  if (!rawName) return 'Desconhecido';
  const clean = String(rawName).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (clean.includes('anderson')) return 'Anderson Almeida';
  if (clean.includes('gustavo')) return 'Gustavo Chagas';
  if (clean.includes('mariane') || clean.includes('mary')) return 'Mariane Oliveira';
  if (clean.includes('thiago')) return 'Thiago Santos';
  if (clean.includes('felipe')) return 'Felipe Wustemberg';
  if (clean.includes('helo')) return 'Heloisa Yamanaka';
  return rawName;
}

function getAvatarForAnalyst(analystName) {
  const saved = window.avatarsDict[analystName];
  if (saved) return saved;
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(analystName)}&backgroundColor=b6e3f4`;
}

async function checkAuthStatus() {
  try {
    const status = await window.api.getAuthStatus();
    if (status.authenticated) {
      const mappedName = mapFrontendAnalystName(status.userName || status.userEmail);
      connectionDot.className = 'status-pulse-dot online';
      connectionTitle.textContent = 'Conectado';
      connectionUser.textContent = mappedName;
      authBtn.textContent = 'Sair';
      if (switchAccountBtn) switchAccountBtn.style.display = 'inline-flex';
      syncNowBtn.disabled = false;
      // Carregar avatares do banco antes de setar a imagem
      try {
        const avatarsRes = await window.api.getAvatarsFromDb();
        if (avatarsRes.success) {
          avatarsRes.data.forEach(a => {
            window.avatarsDict[a.analystName] = a.image;
          });
        }
      } catch (err) {
        console.error('Erro ao buscar avatares:', err);
      }

      const topbarAvatarImg = document.querySelector('.user-avatar img');
      if (topbarAvatarImg) topbarAvatarImg.src = getAvatarForAnalyst(mappedName);
      const settingsAvatarPreview = document.getElementById('settingsAvatarPreview');
      if (settingsAvatarPreview) settingsAvatarPreview.src = getAvatarForAnalyst(mappedName);
    } else {
      connectionDot.className = 'status-pulse-dot offline';
      connectionTitle.textContent = 'Desconectado';
      connectionUser.textContent = 'Requer login';
      authBtn.textContent = 'Login';
      if (switchAccountBtn) switchAccountBtn.style.display = 'none';
      syncNowBtn.disabled = false;
    }
    if (window.refreshAdminUI) window.refreshAdminUI().catch(() => {});
  } catch (err) {
    console.error('Erro ao verificar status:', err);
  }
}

function updateLastSyncDisplay(timestamp) {
  if (!timestamp || !lastSyncTimeEl) return;
  const d = new Date(timestamp);
  if (!isNaN(d.getTime())) {
    lastSyncTimeEl.textContent = `Última sinc: ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
}

async function loadDashboard(selectedMonth = null) {
  try {
    const res = await window.api.getDashboardData(selectedMonth);
    currentMetrics = res.metrics;
    nextSyncTimestamp = res.nextSync;

    console.log("=== DEBUG TAREFAS (FRONTEND) ===");
    if (currentMetrics && currentMetrics.recentTasks) {
      currentMetrics.recentTasks.forEach(t => {
        console.log(`- Tarefa: ${t.taskId} | SemanaCalc: ${t.semana} | Entrega: ${t.dataEntrega}`);
      });
      console.log("=== DEBUG WEEKLY ROWS ===");
      console.log(currentMetrics.tabelaMetasSemanal.rows);
    }

    updateMonthSelector(currentMetrics.availableMonths, currentMetrics.activeMonth);
    renderDashboard(currentMetrics);

    if (res.lastSync) {
      updateLastSyncDisplay(res.lastSync);
    }

    startCountdownTimer(nextSyncTimestamp);

  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
    showToast(`Erro ao carregar dados: ${err.message}`, 'error');
  }
}

function updateMonthSelector(availableMonths, activeMonth) {
  monthSelect.innerHTML = '';
  availableMonths.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    if (m === activeMonth) {
      opt.selected = true;
    }
    monthSelect.appendChild(opt);
  });
}

function renderDashboard(metrics) {
  if (!metrics) return;

  // 1. Dias úteis e Título
  const subtitleEl = document.getElementById('dashboardSubtitle');
  if (subtitleEl) {
    subtitleEl.innerHTML = `Resumo das atividades (${metrics.activeMonth}) - <span id="workdaysText">Dias úteis: ${metrics.workdays.currentWorkday} / ${metrics.workdays.totalWorkdays}</span>`;
  }
  const workdaysText = document.getElementById('workdaysText');
  if (workdaysText) {
    workdaysText.textContent = `Dias úteis: ${metrics.workdays.currentWorkday} / ${metrics.workdays.totalWorkdays}`;
  }

  // 2. Cards de KPI
  const k = metrics.kpis;

  // Saldo
  const isPositivo = k.saldoGeral >= 0;
  kpiSaldoValue.textContent = `${isPositivo ? '+' : ''}${k.saldoGeral.toFixed(1)} h`;
  kpiSaldoCard.className = `kpi-card kpi-saldo ${isPositivo ? 'positivo' : 'negativo'}`;
  kpiSaldoBadge.textContent = isPositivo ? 'Acima da Meta' : 'Abaixo da Meta';

  // Horas Trabalhadas
  kpiHorasTrabValue.textContent = `${k.horasTrabalhadas.toFixed(1)} h`;
  kpiHorasTrabMeta.textContent = `Meta Mensal: ${k.metaMensal.toFixed(1)} h (${k.percentualAtingido}%)`;

  // Previsão Parcial
  kpiPrevisaoValue.textContent = `${k.previsaoParcial.toFixed(1)} h`;

  // Fila em Aberto
  kpiFilaValue.textContent = k.filaCount;

  // Atualiza contador da aba
  navTasksCount.textContent = k.concluidasCount + k.filaCount;
  const currentMetric = document.getElementById('rankingMetricSelect')?.value || 'horas';

  // 3. Tabela 1: Metas por Analista
  renderTabelaMetas(metrics.tabelaMetas, currentMetric);
  renderTeamProgress(metrics.tabelaMetas);
  renderRankingPodium(metrics.tabelaMetas, 'podiumContainer', currentMetric);

  if (metrics.tabelaMetasSemanal) {
    const weekSelect = document.getElementById('filterSemanalWeek');
    if (weekSelect && metrics.semanasList) {
      weekSelect.innerHTML = '';
      metrics.semanasList.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s + (s === metrics.tabelaMetasSemanal.currentWeek ? ' (Atual)' : '');
        weekSelect.appendChild(opt);
      });
      weekSelect.value = metrics.tabelaMetasSemanal.currentWeek;
    }
    const currentWeekRows = metrics.tabelaMetasSemanal.porSemana[metrics.tabelaMetasSemanal.currentWeek] || metrics.tabelaMetasSemanal.rows;
    renderTabelaMetasSemanal({ rows: currentWeekRows }, currentMetric);
    renderRankingPodium({ rows: currentWeekRows }, 'podiumSemanalContainer', currentMetric);
  }

  if (metrics.tabelaMetasDiaria) {
    const dateInput = document.getElementById('filterDiarioDate');
    if (dateInput) {
      // currentDate comes as DD/MM/YYYY, format to YYYY-MM-DD
      const dParts = metrics.tabelaMetasDiaria.currentDay.split('/');
      dateInput.value = `${dParts[2]}-${dParts[1]}-${dParts[0]}`;
    }
    renderTabelaMetasDiaria(metrics.tabelaMetasDiaria, currentMetric);
    renderRankingPodium(metrics.tabelaMetasDiaria, 'podiumDiarioContainer', currentMetric);
  }

  // 4. Tabela 2: Volume por Prioridade
  renderTabelaPrioridades(metrics.tabelaPrioridades);

  // 5. Tabela 3: Horas Semanais
  renderTabelaHorasSemanais(metrics.tabelaHorasSemanais);

  // 6. Tabela 4: Tarefas Semanais
  renderTabelaTarefasSemanais(metrics.tabelaTarefasSemanais);

  // Popula o filtro de analistas da aba de tarefas
  populateAnalystFilter(metrics.tabelaMetas.rows);
}

function renderTeamProgress(data) {
  const teamProgressList = document.getElementById('teamProgressList');
  if (!teamProgressList) return;
  
  teamProgressList.innerHTML = '';
  
  // Clona o array e ordena de forma decrescente pelas horas trabalhadas
  const sortedRows = [...data.rows].sort((a, b) => b.horasTrabalhadas - a.horasTrabalhadas);
  
  sortedRows.forEach(r => {
    const isAcima = r.saldo >= 0;
    const progressColor = isAcima ? '#10b981' : '#f59e0b';
    const percent = Math.min(r.percentualAtingido, 100);
    
    // Get avatar from localStorage or fallback to dicebear
    const avatarUrl = getAvatarForAnalyst(r.analista);
    
    const card = document.createElement('div');
    card.className = 'team-member-card';
    card.innerHTML = `
      <div class="team-member-avatar">
        <img src="${avatarUrl}" alt="${r.analista}">
      </div>
      <div class="team-member-info">
        <div class="team-member-name">
          ${r.analista}
          <span style="font-size: 11px; color: ${isAcima ? '#34d399' : '#f87171'}">${r.percentualAtingido}%</span>
        </div>
        <div class="team-member-stats">
          <span>${r.horasTrabalhadas.toFixed(1)}h / ${r.metaMensal.toFixed(1)}h</span>
          <span style="color: ${isAcima ? '#34d399' : '#f87171'}">${isAcima ? '+' : ''}${r.saldo.toFixed(1)}h saldo</span>
        </div>
        <div class="team-progress-bar-bg">
          <div class="team-progress-bar-fill" style="width: ${percent}%; background: ${progressColor};"></div>
        </div>
      </div>
    `;
    teamProgressList.appendChild(card);
  });
}

function getTaskValue(row) {
  const prioritySelect = document.getElementById('rankingPrioritySelect');
  const pri = prioritySelect ? prioritySelect.value : 'todas';
  if (pri === 'alta') return row.totalTarefasAlta || 0;
  if (pri === 'media') return row.totalTarefasMedia || 0;
  if (pri === 'baixa') return row.totalTarefasBaixa || 0;
  if (row.priorityCounts && row.priorityCounts[pri] !== undefined) return row.priorityCounts[pri];
  return row.totalTarefasConcluidas || 0;
}

function renderRankingPodium(data, containerId = 'podiumContainer', metric = 'horas', maxPlaces = 3) {
  const podiumContainer = document.getElementById(containerId);
  if (!podiumContainer) return;
  
  podiumContainer.innerHTML = '';
  
  // Ordenação dinâmica
  let sorted = [...data.rows];
  if (metric === 'pontos') {
    sorted.sort((a, b) => b.pontosTotais - a.pontosTotais);
  } else if (metric === 'tarefas') {
    sorted.sort((a, b) => getTaskValue(b) - getTaskValue(a));
  } else {
    sorted.sort((a, b) => b.horasTrabalhadas - a.horasTrabalhadas);
  }
  
  if (sorted.length === 0) return;
  
  let topN = [];
  if (maxPlaces === 3) {
    topN = [
      { rank: 2, data: sorted[1], class: 'second', medal: '🥈', step: '2º' },
      { rank: 1, data: sorted[0], class: 'first', medal: '🏆', step: '1º' },
      { rank: 3, data: sorted[2], class: 'third', medal: '🥉', step: '3º' }
    ];
  } else {
    topN = [
      { rank: 6, data: sorted[5], class: 'sixth', medal: '', step: '6º' },
      { rank: 4, data: sorted[3], class: 'fourth', medal: '', step: '4º' },
      { rank: 2, data: sorted[1], class: 'second', medal: '🥈', step: '2º' },
      { rank: 1, data: sorted[0], class: 'first', medal: '🏆', step: '1º' },
      { rank: 3, data: sorted[2], class: 'third', medal: '🥉', step: '3º' },
      { rank: 5, data: sorted[4], class: 'fifth', medal: '', step: '5º' }
    ];
  }
  
  topN.forEach(item => {
    if (!item.data) return; 
    
    const avatarUrl = getAvatarForAnalyst(item.data.analista);
    
    let displayValue = '';
    if (metric === 'pontos') displayValue = `${item.data.pontosTotais.toFixed(1)} pts`;
    else if (metric === 'tarefas') displayValue = `${getTaskValue(item.data)} tasks`;
    else displayValue = `${item.data.horasTrabalhadas.toFixed(1)}h`;

    const el = document.createElement('div');
    el.className = `podium-item ${item.class}`;
    el.innerHTML = `
      <div class="medal-icon">${item.medal}</div>
      <div class="podium-avatar">
        <img src="${avatarUrl}" alt="${item.data.analista}">
      </div>
      <div class="podium-name">${item.data.analista}</div>
      <div class="podium-hours">${displayValue}</div>
      <div class="podium-step">${item.step}</div>
    `;
    podiumContainer.appendChild(el);
  });
}

function renderTabelaMetas(data, metric = 'horas') {
  tabelaMetasBody.innerHTML = '';
  if (tabelaMetasHomeBody) tabelaMetasHomeBody.innerHTML = '';
  
  let sorted = [...data.rows];
  if (metric === 'pontos') sorted.sort((a, b) => b.pontosTotais - a.pontosTotais);
  else if (metric === 'tarefas') sorted.sort((a, b) => getTaskValue(b) - getTaskValue(a));
  else sorted.sort((a, b) => b.horasTrabalhadas - a.horasTrabalhadas);

  sorted.forEach(r => {
    const tr = document.createElement('tr');
    const isAcima = r.saldo >= 0;
    tr.innerHTML = `
      <td class="analyst-name">${r.analista}</td>
      <td class="num-cell">${r.cargaDiaria}h</td>
      <td class="num-cell">${r.metaMensal.toFixed(1)}h</td>
      <td class="num-cell">${r.previsaoParcial.toFixed(1)}h</td>
      <td class="num-cell font-bold" style="color: #60a5fa;">${r.horasTrabalhadas.toFixed(1)}h</td>
      <td class="num-cell font-bold" style="color: ${isAcima ? '#34d399' : '#f87171'};">
        ${isAcima ? '+' : ''}${r.saldo.toFixed(1)}h
      </td>
      <td class="num-cell font-bold">${r.pontosTotais.toFixed(1)}</td>
      <td class="num-cell">
        <div>${r.percentualAtingido}%</div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${Math.min(r.percentualAtingido, 100)}%; background: ${isAcima ? '#10b981' : '#f59e0b'};"></div>
        </div>
      </td>
      <td class="num-cell">
        <span class="status-pill ${isAcima ? 'acima' : 'abaixo'}">${r.statusMeta}</span>
      </td>
      <td class="num-cell" style="color: #f472b6;">${r.capacidadeFilaHoras.toFixed(1)}h</td>
    `;
    tabelaMetasBody.appendChild(tr);
    if (tabelaMetasHomeBody) tabelaMetasHomeBody.appendChild(tr.cloneNode(true));
  });

  const tot = data.total;
  const isTotAcima = tot.saldo >= 0;
  tabelaMetasFoot.innerHTML = `
    <tr>
      <td>${tot.analista}</td>
      <td class="num-cell">${tot.cargaDiaria}</td>
      <td class="num-cell">${tot.metaMensal.toFixed(1)}h</td>
      <td class="num-cell">${tot.previsaoParcial.toFixed(1)}h</td>
      <td class="num-cell font-bold" style="color: #60a5fa;">${tot.horasTrabalhadas.toFixed(1)}h</td>
      <td class="num-cell font-bold" style="color: ${isTotAcima ? '#34d399' : '#f87171'};">
        ${isTotAcima ? '+' : ''}${tot.saldo.toFixed(1)}h
      </td>
      <td class="num-cell font-bold">${tot.pontosTotais.toFixed(1)}</td>
      <td class="num-cell font-bold">${tot.percentualAtingido}%</td>
      <td class="num-cell">
        <span class="status-pill ${isTotAcima ? 'acima' : 'abaixo'}">${tot.statusMeta}</span>
      </td>
      <td class="num-cell" style="color: #f472b6;">${tot.capacidadeFilaHoras.toFixed(1)}h</td>
    </tr>
  `;
  if (tabelaMetasHomeFoot) tabelaMetasHomeFoot.innerHTML = tabelaMetasFoot.innerHTML;
}

function renderTabelaMetasSemanal(data, metric = 'horas') {
  const tbody = document.getElementById('tabelaMetasSemanalBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  let sorted = [...data.rows];
  if (metric === 'pontos') sorted.sort((a, b) => b.pontosTotais - a.pontosTotais);
  else if (metric === 'tarefas') sorted.sort((a, b) => getTaskValue(b) - getTaskValue(a));
  else sorted.sort((a, b) => b.horasTrabalhadas - a.horasTrabalhadas);

  sorted.forEach(r => {
    const tr = document.createElement('tr');
    const isAcima = r.saldo >= 0;
    tr.innerHTML = `
      <td class="analyst-name">${r.analista}</td>
      <td class="num-cell">${r.metaSemanalCompleta.toFixed(1)}h</td>
      <td class="num-cell">${r.previsaoParcialSemanal.toFixed(1)}h</td>
      <td class="num-cell font-bold" style="color: #60a5fa;">${r.horasTrabalhadas.toFixed(1)}h</td>
      <td class="num-cell font-bold" style="color: ${isAcima ? '#34d399' : '#f87171'};">
        ${isAcima ? '+' : ''}${r.saldo.toFixed(1)}h
      </td>
      <td class="num-cell font-bold">${r.pontosTotais.toFixed(1)}</td>
      <td class="num-cell">
        <div>${r.percentualAtingido}%</div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${Math.min(r.percentualAtingido, 100)}%; background: ${isAcima ? '#10b981' : '#f59e0b'};"></div>
        </div>
      </td>
      <td class="num-cell">
        <span class="status-pill ${isAcima ? 'acima' : 'abaixo'}">${r.statusMeta}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTabelaMetasDiaria(data, metric = 'horas') {
  const tbody = document.getElementById('tabelaMetasDiariaBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  let sorted = [...data.rows];
  if (metric === 'pontos') sorted.sort((a, b) => b.pontosTotais - a.pontosTotais);
  else if (metric === 'tarefas') sorted.sort((a, b) => getTaskValue(b) - getTaskValue(a));
  else sorted.sort((a, b) => b.horasTrabalhadas - a.horasTrabalhadas);

  sorted.forEach(r => {
    const tr = document.createElement('tr');
    const isAcima = r.saldo >= 0;
    tr.innerHTML = `
      <td class="analyst-name">${r.analista}</td>
      <td class="num-cell">${r.metaDiaria.toFixed(1)}h</td>
      <td class="num-cell font-bold" style="color: #60a5fa;">${r.horasTrabalhadas.toFixed(1)}h</td>
      <td class="num-cell font-bold" style="color: ${isAcima ? '#34d399' : '#f87171'};">
        ${isAcima ? '+' : ''}${r.saldo.toFixed(1)}h
      </td>
      <td class="num-cell font-bold">${r.pontosTotais.toFixed(1)}</td>
      <td class="num-cell">
        <div>${r.percentualAtingido}%</div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${Math.min(r.percentualAtingido, 100)}%; background: ${isAcima ? '#10b981' : '#f59e0b'};"></div>
        </div>
      </td>
      <td class="num-cell">
        <span class="status-pill ${isAcima ? 'acima' : 'abaixo'}">${r.statusMeta}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Ranking Personalizado (intervalo de datas) ---
let customRangeData = null;

function formatIsoBr(iso) {
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

function toIsoLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function computePresetRange(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (preset === 'mes') return [new Date(y, m, 1), new Date(y, m + 1, 0)];
  if (preset === 'trimestre') {
    const q = Math.floor(m / 3) * 3;
    return [new Date(y, q, 1), new Date(y, q + 3, 0)];
  }
  if (preset === 'semestre') {
    const s = m < 6 ? 0 : 6;
    return [new Date(y, s, 1), new Date(y, s + 6, 0)];
  }
  if (preset === 'ano') return [new Date(y, 0, 1), new Date(y, 11, 31)];
  return null;
}

function setupRankingPersonalizado() {
  const startEl = document.getElementById('filterPersonalizadoStart');
  const endEl = document.getElementById('filterPersonalizadoEnd');
  const presetEl = document.getElementById('personalizadoPreset');
  const exportBtn = document.getElementById('exportPdfBtnPersonalizado');
  if (!startEl || !endEl) return;

  let busy = false;
  let lastKey = '';
  let debounceTimer = null;

  // Busca o período atual das duas datas. Chamado automaticamente ao escolher datas/atalhos.
  const applyRange = async (force = false) => {
    const start = startEl.value;
    const end = endEl.value;
    // Datas incompletas (usuário ainda digitando) ou ano absurdo: espera
    if (!start || !end || start.slice(0, 4) < '2000' || end.slice(0, 4) < '2000') return;
    if (start > end) {
      showToast('A data inicial não pode ser maior que a final.', 'error');
      return;
    }
    const key = `${start}|${end}`;
    if (busy || (!force && key === lastKey && customRangeData)) return;
    busy = true;
    const label = document.getElementById('personalizadoPeriodLabel');
    if (label) label.textContent = 'Buscando...';
    try {
      const res = await window.api.getRankingRange(start, end);
      if (!res || !res.success) {
        showToast(`Erro ao buscar período: ${res?.error || 'falha desconhecida'}`, 'error');
        if (label && customRangeData) renderTabelaMetasPersonalizado(customRangeData, document.getElementById('rankingMetricSelect')?.value || 'horas');
        return;
      }
      lastKey = key;
      customRangeData = res.data;
      const metric = document.getElementById('rankingMetricSelect')?.value || 'horas';
      renderTabelaMetasPersonalizado(customRangeData, metric);
      renderRankingPodium(customRangeData, 'podiumPersonalizadoContainer', metric);
      if (customRangeData.totalTarefas === 0) {
        showToast('Nenhuma tarefa concluída encontrada nesse período.', 'info');
      }
    } catch (err) {
      showToast(`Erro ao buscar período: ${err.message}`, 'error');
    } finally {
      busy = false;
    }
  };

  // Escolher as datas já busca (com pequeno atraso para não disparar a cada dígito).
  // Não deixa escolher fim antes do início (e vice-versa) direto no calendário.
  const onManualDateChange = () => {
    endEl.min = startEl.value || '';
    startEl.max = endEl.value || '';
    if (presetEl) presetEl.value = ''; // datas manuais: nenhum atalho ativo
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => applyRange(), 400);
  };
  startEl.addEventListener('change', onManualDateChange);
  endEl.addEventListener('change', onManualDateChange);

  const fillPreset = (preset) => {
    const range = computePresetRange(preset);
    if (!range) return false;
    startEl.value = toIsoLocalDate(range[0]);
    endEl.value = toIsoLocalDate(range[1]);
    endEl.min = startEl.value;
    startEl.max = endEl.value;
    if (presetEl) presetEl.value = preset;
    return true;
  };

  if (presetEl) {
    presetEl.addEventListener('change', () => {
      if (fillPreset(presetEl.value)) applyRange();
    });
  }

  // Padrão: mês atual. Já preenche as datas e carrega o ranking ao abrir a aba pela primeira vez
  fillPreset('mes');
  const subtabBtn = document.querySelector('.sidebar-subtab[data-subtab="ranking-personalizado"]');
  if (subtabBtn) {
    subtabBtn.addEventListener('click', () => {
      if (!customRangeData) applyRange();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      if (!customRangeData) {
        showToast('Aplique um período antes de exportar.', 'info');
        return;
      }
      exportBtn.disabled = true;
      showToast('Gerando PDF... Aguarde a janela de salvamento.', 'info');
      try {
        const label = `${customRangeData.startDate}_a_${customRangeData.endDate}`;
        const res = await window.api.exportPdf(`Ranking_Personalizado_Contencao_${label}`);
        if (res.success) showToast('PDF exportado com sucesso!', 'success');
        else if (res.canceled) showToast('Exportação cancelada.', 'info');
        else showToast(`Erro ao exportar: ${res.error}`, 'error');
      } catch (err) {
        showToast(`Erro ao exportar PDF: ${err.message}`, 'error');
      } finally {
        exportBtn.disabled = false;
      }
    });
  }
}

// Três tabelas (horas, pontos, tarefas): uma coluna por mês do período + total e variação vs. mês anterior
function renderComparativoMeses(data) {
  const box = document.getElementById('comparativoMesesContainer');
  if (!box) return;
  if (!data.meses) {
    // Resposta sem o comparativo: o processo principal ainda roda a versão antiga do código
    box.innerHTML = '<p style="color: #f59e0b; font-size: 13px; padding: 10px 16px;">Comparativo indisponível: feche e abra o app novamente (o processo principal precisa reiniciar para carregar a atualização).</p>';
    return;
  }
  if (data.meses.length === 0) { box.innerHTML = ''; return; }

  const defs = [
    { key: 'horas', title: 'Horas', suffix: 'h', digits: 1, color: '#60a5fa' },
    { key: 'pontos', title: 'Pontos', suffix: '', digits: 1, color: '#fbbf24' },
    { key: 'tarefas', title: 'Tarefas', suffix: '', digits: 0, color: '#34d399' }
  ];
  const fmt = (v, d) => Number(v).toFixed(d);
  const delta = (cur, prev) => {
    if (prev === undefined) return '';
    if (prev === 0) return cur > 0 ? '<span style="color:#34d399;font-size:11px;">▲ novo</span>' : '';
    const pct = ((cur - prev) / prev) * 100;
    if (Math.abs(pct) < 0.05) return '<span style="color:#94a3b8;font-size:11px;">= 0%</span>';
    const up = pct > 0;
    return `<span style="color:${up ? '#34d399' : '#f87171'};font-size:11px;">${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%</span>`;
  };

  const head = data.meses.map(m =>
    `<th>${m.label}${m.parcial ? ' <span title="Mês parcial: o período não cobre o mês inteiro" style="color:#f59e0b;">*</span>' : ''}</th>`
  ).join('');

  box.innerHTML = defs.map(def => {
    const rows = [...data.porMes]
      .map(r => ({ ...r, total: r.valores.reduce((a, v) => a + v[def.key], 0) }))
      .sort((a, b) => b.total - a.total);
    const colTotals = data.meses.map((_, i) => rows.reduce((a, r) => a + r.valores[i][def.key], 0));
    const grand = colTotals.reduce((a, v) => a + v, 0);

    const body = rows.map(r => `
      <tr>
        <td class="analyst-name">${r.analista}</td>
        ${r.valores.map((v, i) => `<td class="num-cell">
          <div style="color:${def.color};font-weight:600;">${fmt(v[def.key], def.digits)}${def.suffix}</div>
          <div>${delta(v[def.key], i > 0 ? r.valores[i - 1][def.key] : undefined)}</div>
        </td>`).join('')}
        <td class="num-cell font-bold">${fmt(r.total, def.digits)}${def.suffix}</td>
      </tr>`).join('');

    const foot = `
      <tr>
        <td>TOTAL</td>
        ${colTotals.map((v, i) => `<td class="num-cell font-bold">
          <div>${fmt(v, def.digits)}${def.suffix}</div>
          <div>${delta(v, i > 0 ? colTotals[i - 1] : undefined)}</div>
        </td>`).join('')}
        <td class="num-cell font-bold">${fmt(grand, def.digits)}${def.suffix}</td>
      </tr>`;

    return `
      <h3 style="margin: 14px 16px 6px; font-size: 14px; color: #cbd5e1;">${def.title} por mês</h3>
      <div class="table-container">
        <table class="data-table styled-table ranking-table">
          <thead><tr><th>Analista</th>${head}<th>Total</th></tr></thead>
          <tbody>${body}</tbody>
          <tfoot>${foot}</tfoot>
        </table>
      </div>`;
  }).join('') + (data.meses.some(m => m.parcial)
    ? '<p style="margin: 8px 16px 0; font-size: 11px; color: #f59e0b;">* mês parcial: o período escolhido não cobre o mês inteiro, então a comparação com ele não é de igual para igual.</p>'
    : '');
}

function renderTabelaMetasPersonalizado(data, metric = 'horas') {
  const tbody = document.getElementById('tabelaMetasPersonalizadoBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  renderComparativoMeses(data);

  const label = document.getElementById('personalizadoPeriodLabel');
  if (label) label.textContent = `${formatIsoBr(data.startDate)} a ${formatIsoBr(data.endDate)} · ${data.totalWorkdays} dias úteis`;

  let sorted = [...data.rows];
  if (metric === 'pontos') sorted.sort((a, b) => b.pontosTotais - a.pontosTotais);
  else if (metric === 'tarefas') sorted.sort((a, b) => getTaskValue(b) - getTaskValue(a));
  else sorted.sort((a, b) => b.horasTrabalhadas - a.horasTrabalhadas);

  sorted.forEach(r => {
    const tr = document.createElement('tr');
    const isAcima = r.saldo >= 0;
    tr.innerHTML = `
      <td class="analyst-name">${r.analista}</td>
      <td class="num-cell">${r.metaPeriodo.toFixed(1)}h</td>
      <td class="num-cell">${r.previsaoParcial.toFixed(1)}h</td>
      <td class="num-cell font-bold" style="color: #60a5fa;">${r.horasTrabalhadas.toFixed(1)}h</td>
      <td class="num-cell font-bold" style="color: ${isAcima ? '#34d399' : '#f87171'};">
        ${isAcima ? '+' : ''}${r.saldo.toFixed(1)}h
      </td>
      <td class="num-cell font-bold">${r.pontosTotais.toFixed(1)}</td>
      <td class="num-cell">${r.totalTarefasConcluidas}</td>
      <td class="num-cell">
        <div>${r.percentualAtingido}%</div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${Math.min(r.percentualAtingido, 100)}%; background: ${isAcima ? '#10b981' : '#f59e0b'};"></div>
        </div>
      </td>
      <td class="num-cell">
        <span class="status-pill ${isAcima ? 'acima' : 'abaixo'}">${r.statusMeta}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTabelaPrioridades(data) {
  if (!data || !data.rows) return;
  const list = data.prioridadesList || [
    'CRIAÇÃO DE BLOG', 'ERRO BLOG', 'BLOG',
    'CRIAÇÃO DE TOKEN', 'ALTERAR TOKEN', 'API/TOKEN',
    'ERRO SIG', 'URGENTE', 'ALTA', 'MÉDIA', 'BAIXA', 'BACKUP', 'T. DE BANCO', 'CHATBOT', 'PLANO DE AÇÃO'
  ];

  tabelaPrioridadesBody.innerHTML = '';
  data.rows.forEach(r => {
    const tr = document.createElement('tr');
    const cells = list.map(p => `<td class="num-cell">${r[p] !== undefined ? r[p] : 0}</td>`).join('');
    tr.innerHTML = `
      <td class="analyst-name">${r.analista}</td>
      ${cells}
      <td class="num-cell font-bold" style="color: #38bdf8;">${r.total !== undefined ? r.total : 0}</td>
    `;
    tabelaPrioridadesBody.appendChild(tr);
  });

  const tot = data.total || {};
  const totCells = list.map(p => `<td class="num-cell">${tot[p] !== undefined ? tot[p] : 0}</td>`).join('');
  tabelaPrioridadesFoot.innerHTML = `
    <tr>
      <td>${tot.analista || 'TOTAL GERAL'}</td>
      ${totCells}
      <td class="num-cell font-bold" style="color: #38bdf8;">${tot.total !== undefined ? tot.total : 0}</td>
    </tr>
  `;
}

function renderTabelaHorasSemanais(data) {
  tabelaHorasSemanaisBody.innerHTML = '';
  data.rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="analyst-name">${r.analista}</td>
      <td class="num-cell">${r['Semana 1'].toFixed(1)}h</td>
      <td class="num-cell">${r['Semana 2'].toFixed(1)}h</td>
      <td class="num-cell">${r['Semana 3'].toFixed(1)}h</td>
      <td class="num-cell">${r['Semana 4'].toFixed(1)}h</td>
      <td class="num-cell">${r['Semana 5'].toFixed(1)}h</td>
      <td class="num-cell font-bold" style="color: #60a5fa;">${r.totalMensal.toFixed(1)}h</td>
    `;
    tabelaHorasSemanaisBody.appendChild(tr);
  });

  const tot = data.totalRealizado;
  tabelaHorasSemanaisFoot.innerHTML = `
    <tr>
      <td>${tot.analista}</td>
      <td class="num-cell">${tot['Semana 1'].toFixed(1)}h</td>
      <td class="num-cell">${tot['Semana 2'].toFixed(1)}h</td>
      <td class="num-cell">${tot['Semana 3'].toFixed(1)}h</td>
      <td class="num-cell">${tot['Semana 4'].toFixed(1)}h</td>
      <td class="num-cell">${tot['Semana 5'].toFixed(1)}h</td>
      <td class="num-cell font-bold" style="color: #60a5fa;">${tot.totalMensal.toFixed(1)}h</td>
    </tr>
    <tr>
      <td colspan="6" style="background:#111927; color:#94a3b8;">TOTAL ESPERADO (META MENSAL DE HORAS)</td>
      <td class="num-cell font-bold" style="background:#111927; color:#f8fafc;">${data.totalEsperado.toFixed(1)}h</td>
    </tr>
    <tr>
      <td colspan="6" style="background:#131c2d; color:#fbbf24;">PREVISÃO PARCIAL (DIAS ÚTEIS)</td>
      <td class="num-cell font-bold" style="background:#131c2d; color:#fbbf24;">${data.previsaoParcial.toFixed(1)}h</td>
    </tr>
    <tr>
      <td colspan="6" style="background:#111927; color:#cbd5e1;">STATUS ATUAL (RITMO DE HORAS)</td>
      <td class="num-cell" style="background:#111927;">
        <span class="status-pill ${data.statusRitmo.includes('Dentro') ? 'acima' : 'abaixo'}">${data.statusRitmo}</span>
      </td>
    </tr>
  `;
}

function renderTabelaTarefasSemanais(data) {
  tabelaTarefasSemanaisBody.innerHTML = '';
  data.rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="analyst-name">${r.analista}</td>
      <td class="num-cell">${r['Semana 1']}</td>
      <td class="num-cell">${r['Semana 2']}</td>
      <td class="num-cell">${r['Semana 3']}</td>
      <td class="num-cell">${r['Semana 4']}</td>
      <td class="num-cell">${r['Semana 5']}</td>
      <td class="num-cell font-bold" style="color: #38bdf8;">${r.totalMensal}</td>
    `;
    tabelaTarefasSemanaisBody.appendChild(tr);
  });

  const tot = data.total;
  tabelaTarefasSemanaisFoot.innerHTML = `
    <tr>
      <td>${tot.analista}</td>
      <td class="num-cell">${tot['Semana 1']}</td>
      <td class="num-cell">${tot['Semana 2']}</td>
      <td class="num-cell">${tot['Semana 3']}</td>
      <td class="num-cell">${tot['Semana 4']}</td>
      <td class="num-cell">${tot['Semana 5']}</td>
      <td class="num-cell font-bold" style="color: #38bdf8;">${tot.totalMensal}</td>
    </tr>
    <tr>
      <td colspan="6" style="background:#111927; color:#94a3b8;">TOTAL ESPERADO (PROPORÇÃO DA META DE HORAS)</td>
      <td class="num-cell font-bold" style="background:#111927; color:#f8fafc;">~${data.totalEsperadoTarefas} tasks</td>
    </tr>
  `;
}

function populateAnalystFilter(analysts) {
  filterAnalyst.innerHTML = '<option value="todos">Todos os Analistas</option>';
  analysts.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.analista;
    opt.textContent = a.analista;
    filterAnalyst.appendChild(opt);
  });
  
  const optSem = document.createElement('option');
  optSem.value = 'sem_analista';
  optSem.textContent = 'Filas / Não Alocado';
  filterAnalyst.appendChild(optSem);
}

// Carrega lista detalhada de tarefas
async function loadTasksList() {
  try {
    const filterPrazo = document.getElementById('filterPrazo');
    const filters = {
      query: taskSearchInput.value.trim(),
      category: filterCategory.value,
      analista: filterAnalyst.value,
      priority: filterPriority.value,
      prazo: filterPrazo ? filterPrazo.value : 'todos',
      month: filterCategory.value === 'concluidas' ? monthSelect.value : 'todos'
    };

    const res = await window.api.getTasksList(filters);
    currentTasks = res.tasks;
    filteredCount.textContent = res.total;

    renderTasksTable(currentTasks);
  } catch (err) {
    console.error('Erro ao buscar tarefas:', err);
  }
}

function formatDateDDMMYY(dateStr) {
  if (!dateStr || dateStr === '-') return '-';
  let dateParts, year, month, day;
  if (dateStr.match(/^\d{4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,2}/)) {
    dateParts = dateStr.split('T')[0].split(/[\-\/\.]/);
    year = dateParts[0];
    month = dateParts[1].padStart(2, '0');
    day = dateParts[2].padStart(2, '0');
  } else if (dateStr.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/)) {
    dateParts = dateStr.split(/[\/\-]/);
    day = dateParts[0].padStart(2, '0');
    month = dateParts[1].padStart(2, '0');
    year = dateParts[2];
  } else if (dateStr.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2}$/)) {
    dateParts = dateStr.split(/[\/\-]/);
    day = dateParts[0].padStart(2, '0');
    month = dateParts[1].padStart(2, '0');
    year = '20' + dateParts[2];
  } else {
    return dateStr;
  }
  return `${day}/${month}/${year}`;
}

function isTaskOverdue(dateStr) {
  if (!dateStr || dateStr === '-') return false;
  
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
  
  return dueDate < today;
}

function renderTasksTable(tasks) {
  tasksListBody.innerHTML = '';
  if (tasks.length === 0) {
    tasksListBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center; padding:30px; color:#64748b;">
          Nenhuma tarefa encontrada com os filtros aplicados.
        </td>
      </tr>
    `;
    return;
  }

  const limit = Math.min(tasks.length, 300); // Exibe até 300 para máxima fluidez
  for (let i = 0; i < limit; i++) {
    const t = tasks[i];
    const tr = document.createElement('tr');
    const isFila = t.category === 'fila';
    const dateStr = t.dataVencimento || t.dataEntrega || '-';
    const isOverdue = isFila && isTaskOverdue(dateStr);
    const formattedDate = formatDateDDMMYY(dateStr);

    tr.innerHTML = `
      <td class="analyst-name">${t.analista || 'Sem Analista'}</td>
      <td style="max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${t.subject}">
        ${t.subject || '-'}
      </td>
      <td class="num-cell">
        <span class="badge-tab-count" style="font-size: 11px;">${t.priorityCategory || t.tipo}</span>
      </td>
      <td class="num-cell font-bold" style="color: #60a5fa;">${(t.horas || 0).toFixed(1)}h</td>
      <td class="num-cell">
        <span class="status-pill ${t.category === 'cancelada' ? 'abaixo' : (isFila ? 'abaixo' : 'acima')}">${t.category === 'cancelada' ? 'Cancelada' : (isFila ? 'Fila / Aberto' : 'Concluída')}</span>
      </td>
      <td class="num-cell" style="font-size: 12px; color: ${isOverdue ? '#ef4444' : '#94a3b8'}; ${isOverdue ? 'font-weight: 700;' : ''}">
        ${formattedDate}
      </td>
    `;
    tasksListBody.appendChild(tr);
  }

  // Links para abrir tarefa no Salesforce
  document.querySelectorAll('.task-id-link, .btn-link-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sfId = e.currentTarget.dataset.id;
      if (sfId && sfId.startsWith('00T')) {
        const url = `https://grupo-ideal-trends.lightning.force.com/lightning/r/Task/${sfId}/view`;
        window.api.openExternal(url);
      } else {
        showToast('Esta tarefa não possui ID válido de Salesforce.', 'info');
      }
    });
  });
}

// Disparo manual de sincronização
async function triggerManualSync(targetMonth = null) {
  syncNowBtn.disabled = true;
  syncIcon.classList.add('spinning');
  showToast('Buscando dados no Salesforce...', 'info');

  try {
    const res = await window.api.syncNow(targetMonth);
    if (res.success) {
      currentMetrics = res.data;
      if (res.lastSync) {
        updateLastSyncDisplay(res.lastSync);
      }
      if (res.nextSync) {
        startCountdownTimer(res.nextSync);
      }
      renderDashboard(currentMetrics);
      showToast('Sincronização concluída com sucesso!', 'success');
      loadTasksList();
    } else {
      showToast(`Erro na sincronização: ${res.error}`, 'error');
    }
  } catch (err) {
    showToast(`Falha: ${err.message}`, 'error');
  } finally {
    syncNowBtn.disabled = false;
    syncIcon.classList.remove('spinning');
  }
}

// Ouvintes de eventos em tempo real
function setupSyncListeners() {
  window.api.onSyncStatus(data => {
    if (data.status === 'syncing') {
      syncIcon.classList.add('spinning');
      syncNowBtn.disabled = true;
    } else {
      syncIcon.classList.remove('spinning');
      syncNowBtn.disabled = false;
    }

    if (data.status === 'success') {
      if (data.data) {
        renderDashboard(data.data);
      }
      if (data.lastSync) {
        updateLastSyncDisplay(data.lastSync);
      }
      if (data.nextSync) {
        startCountdownTimer(data.nextSync);
      }
      loadTasksList();
    }
  });

  window.api.onTimerTick(data => {
    if (data.nextSync) {
      nextSyncTimestamp = data.nextSync;
      updateCountdownDisplay();
    }
    if (data.lastSync) {
      updateLastSyncDisplay(data.lastSync);
    }
  });
}

// Timer regressivo para os 30 minutos
function startCountdownTimer(targetTimestamp) {
  if (!targetTimestamp) return;
  nextSyncTimestamp = targetTimestamp;
  if (countdownInterval) clearInterval(countdownInterval);

  updateCountdownDisplay();
  countdownInterval = setInterval(updateCountdownDisplay, 1000);
}

function updateCountdownDisplay() {
  if (!nextSyncTimestamp) return;
  const remainingMs = Math.max(0, nextSyncTimestamp - Date.now());
  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  nextSyncCountdownEl.textContent = `Auto em ${mm}:${ss}`;
}

// Sistema de Toasts
function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}


// --- Modal de atualização do app ---
(function initUpdateModal() {
  const modal = document.getElementById('updateModal');
  if (!modal || !window.api) return;
  const icon = document.getElementById('updateIcon');
  const title = document.getElementById('updateTitle');
  const text = document.getElementById('updateText');
  const progressWrap = document.getElementById('updateProgressWrap');
  const bar = document.getElementById('updateProgressBar');
  const percent = document.getElementById('updatePercent');
  const actions = document.getElementById('updateActions');

  const setActions = (buttons) => {
    actions.innerHTML = '';
    buttons.forEach(b => {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.primary) el.className = 'primary';
      el.addEventListener('click', b.onClick);
      actions.appendChild(el);
    });
  };

  const render = (s) => {
    if (!s || s.status === 'idle' || s.dismissed) { modal.hidden = true; return; }
    modal.hidden = false;
    const v = s.version ? ` ${s.version}` : '';
    icon.classList.remove('spin');

    if (s.status === 'downloading' || s.status === 'progress') {
      const pct = s.percent || 0;
      icon.textContent = '⬇';
      icon.classList.add('spin');
      title.textContent = `Baixando versão${v}`;
      text.textContent = 'Você pode continuar usando o painel enquanto isso.';
      progressWrap.style.display = '';
      bar.style.width = pct + '%';
      percent.textContent = pct + '%';
      setActions([]);
    } else if (s.status === 'ready') {
      icon.textContent = '✓';
      title.textContent = `Versão${v} pronta`;
      text.textContent = 'Reinicie para aplicar a atualização. Se escolher "Depois", ela será instalada quando você fechar o app.';
      progressWrap.style.display = 'none';
      percent.textContent = '';
      setActions([
        { label: 'Depois', onClick: () => { modal.hidden = true; window.api.dismissUpdate(); } },
        { label: 'Atualizar agora', primary: true, onClick: () => window.api.installUpdate() }
      ]);
    } else if (s.status === 'error') {
      icon.textContent = '!';
      title.textContent = 'Falha na atualização';
      text.textContent = s.message || 'Não foi possível baixar a atualização.';
      progressWrap.style.display = 'none';
      percent.textContent = '';
      setActions([
        { label: 'Fechar', onClick: () => { modal.hidden = true; } },
        { label: 'Tentar de novo', primary: true, onClick: () => window.api.retryUpdate() }
      ]);
    }
  };

  window.api.onUpdaterStatus(render);
  window.api.getUpdaterStatus().then(render).catch(() => {});

  // Pré-visualização para desenvolvimento: no DevTools, rode previewUpdate('progress'|'ready'|'error'|'off')
  window.previewUpdate = (state = 'progress') => {
    const states = {
      progress: { status: 'progress', version: '9.9.9', percent: 42 },
      ready: { status: 'ready', version: '9.9.9' },
      error: { status: 'error', version: '9.9.9', message: 'Sem conexão com o servidor de atualização.' },
      off: { status: 'idle' }
    };
    render(states[state] || states.progress);
  };
})();
