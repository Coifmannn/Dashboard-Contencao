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
  if (rankingMetricSelect) {
    rankingMetricSelect.addEventListener('change', () => {
      if (currentMetrics) {
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
    });
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
  } catch (err) {
    console.error('Erro ao verificar status:', err);
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
      const d = new Date(res.lastSync);
      lastSyncTimeEl.textContent = `Última sinc: ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
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

  // 3. Tabela 1: Metas por Analista
  renderTabelaMetas(metrics.tabelaMetas);
  renderTeamProgress(metrics.tabelaMetas);
  renderRankingPodium(metrics.tabelaMetas, 'podiumContainer');

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
    renderTabelaMetasSemanal({ rows: currentWeekRows });
    renderRankingPodium({ rows: currentWeekRows }, 'podiumSemanalContainer');
  }

  if (metrics.tabelaMetasDiaria) {
    const dateInput = document.getElementById('filterDiarioDate');
    if (dateInput) {
      // currentDate comes as DD/MM/YYYY, format to YYYY-MM-DD
      const dParts = metrics.tabelaMetasDiaria.currentDay.split('/');
      dateInput.value = `${dParts[2]}-${dParts[1]}-${dParts[0]}`;
    }
    renderTabelaMetasDiaria(metrics.tabelaMetasDiaria);
    renderRankingPodium(metrics.tabelaMetasDiaria, 'podiumDiarioContainer');
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

function renderRankingPodium(data, containerId = 'podiumContainer', metric = 'horas') {
  const podiumContainer = document.getElementById(containerId);
  if (!podiumContainer) return;
  
  podiumContainer.innerHTML = '';
  
  // Ordenação dinâmica
  let sorted = [...data.rows];
  if (metric === 'pontos') {
    sorted.sort((a, b) => b.pontosTotais - a.pontosTotais);
  } else if (metric === 'tarefas') {
    // Para mensal temos totalTarefasConcluidas. Para semanal, podemos não ter isso explícito na tabela,
    // mas se tivermos ou precisarmos adaptar:
    sorted.sort((a, b) => (b.totalTarefasConcluidas || 0) - (a.totalTarefasConcluidas || 0));
  } else {
    sorted.sort((a, b) => b.horasTrabalhadas - a.horasTrabalhadas);
  }
  
  if (sorted.length === 0) return;
  
  const top3 = [
    { rank: 2, data: sorted[1], class: 'second', medal: '🥈', step: '2º' },
    { rank: 1, data: sorted[0], class: 'first', medal: '🏆', step: '1º' },
    { rank: 3, data: sorted[2], class: 'third', medal: '🥉', step: '3º' }
  ];
  
  top3.forEach(item => {
    if (!item.data) return; 
    
    const avatarUrl = getAvatarForAnalyst(item.data.analista);
    
    let displayValue = '';
    if (metric === 'pontos') displayValue = `${item.data.pontosTotais.toFixed(1)} pts`;
    else if (metric === 'tarefas') displayValue = `${item.data.totalTarefasConcluidas || 0} tasks`;
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
  else if (metric === 'tarefas') sorted.sort((a, b) => (b.totalTarefasConcluidas || 0) - (a.totalTarefasConcluidas || 0));
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
  else if (metric === 'tarefas') sorted.sort((a, b) => (b.totalTarefasConcluidas || 0) - (a.totalTarefasConcluidas || 0));
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
  else if (metric === 'tarefas') sorted.sort((a, b) => (b.totalTarefasConcluidas || 0) - (a.totalTarefasConcluidas || 0));
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

function renderTabelaPrioridades(data) {
  tabelaPrioridadesBody.innerHTML = '';
  data.rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="analyst-name">${r.analista}</td>
      <td class="num-cell">${r['BLOG']}</td>
      <td class="num-cell">${r['API/TOKEN']}</td>
      <td class="num-cell">${r['URGENTE']}</td>
      <td class="num-cell">${r['ALTA']}</td>
      <td class="num-cell">${r['MÉDIA']}</td>
      <td class="num-cell">${r['BAIXA']}</td>
      <td class="num-cell">${r['BACKUP']}</td>
      <td class="num-cell">${r['T. DE BANCO']}</td>
      <td class="num-cell">${r['CHATBOT']}</td>
      <td class="num-cell font-bold" style="color: #38bdf8;">${r.total}</td>
    `;
    tabelaPrioridadesBody.appendChild(tr);
  });

  const tot = data.total;
  tabelaPrioridadesFoot.innerHTML = `
    <tr>
      <td>${tot.analista}</td>
      <td class="num-cell">${tot['BLOG']}</td>
      <td class="num-cell">${tot['API/TOKEN']}</td>
      <td class="num-cell">${tot['URGENTE']}</td>
      <td class="num-cell">${tot['ALTA']}</td>
      <td class="num-cell">${tot['MÉDIA']}</td>
      <td class="num-cell">${tot['BAIXA']}</td>
      <td class="num-cell">${tot['BACKUP']}</td>
      <td class="num-cell">${tot['T. DE BANCO']}</td>
      <td class="num-cell">${tot['CHATBOT']}</td>
      <td class="num-cell font-bold" style="color: #38bdf8;">${tot.total}</td>
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
        <span class="status-pill ${isFila ? 'abaixo' : 'acima'}">${isFila ? 'Fila / Aberto' : 'Concluída'}</span>
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

    if (data.status === 'success' && data.data) {
      renderDashboard(data.data);
      if (data.nextSync) {
        startCountdownTimer(data.nextSync);
      }
    }
  });

  window.api.onTimerTick(data => {
    if (data.nextSync) {
      nextSyncTimestamp = data.nextSync;
      updateCountdownDisplay();
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
