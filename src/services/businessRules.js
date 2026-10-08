/**
 * Motor de Regras de Negócio do Painel de Contenção
 * Replicado fielmente a partir de Codigo.gs e dashsalesforce.xlsx
 */

const ACTIVE_ANALYSTS = [
  { name: 'Anderson Almeida', searchKey: 'anderson', cargaPadrao: 7.5 },
  { name: 'Gustavo Chagas', searchKey: 'gustavo', cargaPadrao: 7.5 },
  { name: 'Mariane Oliveira', searchKey: 'mariane', cargaPadrao: 7.5 },
  { name: 'Thiago Santos', searchKey: 'thiago', cargaPadrao: 7.5 },
  { name: 'Felipe Wustemberg', searchKey: 'felipe', cargaPadrao: 7.5 },
  { name: 'Heloisa Yamanaka', searchKey: 'helo', cargaPadrao: 7.5 }
];

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

function cleanString(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function mapAnalystName(rawName) {
  if (!rawName) return null;
  const clean = cleanString(rawName);

  // Exclusão de ex-membros
  if (clean.includes('lucas') || clean.includes('vinycios') || clean.includes('navarro')) {
    return null;
  }

  for (const a of ACTIVE_ANALYSTS) {
    if (clean.includes(a.searchKey)) {
      return a.name;
    }
  }

  return rawName.trim();
}

function calculateHorasEPontos(taskId, colaborador, subject, rawTipo, rawHoras, rawPontos, isRework) {
  const tIdStr = String(taskId || '');
  const sStr = cleanString(subject);
  const tpStr = cleanString(rawTipo);

  let h = parseFloat(String(rawHoras || 0).replace(',', '.'));
  let p = parseFloat(String(rawPontos || 0).replace(',', '.'));

  // Exceção especial: Tarefa 00TbL00000cL4scUAC ou assunto com proarbaloes = 12h / 12pts
  if (tIdStr.includes('00TbL00000cL4scUAC') || sStr.includes('proarbaloes')) {
    return { horas: 12.0, pontos: 12.0 };
  }

  if (isNaN(h) || h === 0) {
    const withoutDomain = sStr.replace(/[a-z0-9\-]+\.com(\.br)?/g, '');
    if (withoutDomain.includes('chatbot') || tpStr.includes('chatbot')) {
      h = 2.0; p = 2.0;
    } else if (sStr.includes('criacao do blog') || tpStr.includes('blog') || sStr.includes('blog')) {
      h = 5.0; p = 5.0;
    } else if (sStr.includes('criacao token') || sStr.includes('alterar token') || tpStr.includes('token') || tpStr.includes('api') || sStr.includes('token') || sStr.includes('api')) {
      h = 2.0; p = 2.0;
    } else if (sStr.includes('imagem quebrada') || tpStr.includes('imagem') || sStr.includes('quebrada')) {
      h = 1.0; p = 1.0;
    } else if (sStr.includes('erro no banco') || sStr.includes('erro sig') || tpStr.includes('banco') || tpStr.includes('sig') || sStr.includes('t.')) {
      h = 1.0; p = 1.0;
    } else if (tpStr.includes('baixa') || tpStr.includes('facil') || sStr.includes('baixa') || sStr.includes('facil')) {
      h = 4.0; p = 4.0;
    } else if (tpStr.includes('med') || sStr.includes('med')) {
      h = 2.5; p = 3.0;
    } else if (sStr.includes('cont') && sStr.includes('seo')) {
      h = 2.0; p = 3.5;
    } else if (tpStr.includes('alta') || sStr.includes('alta')) {
      h = 1.0; p = 2.0;
    } else if (tpStr.includes('urg') || sStr.includes('urg')) {
      h = 0.5; p = 1.0;
    } else if (tpStr.includes('backup') || sStr.includes('backup')) {
      h = 1.0; p = 1.0;
    } else {
      h = 1.0; p = 1.0;
    }
  }

  const finalHours = isNaN(h) || h === 0 ? 1.0 : Number(h.toFixed(1));

  return {
    horas: finalHours,
    pontos: finalHours
  };
}

function classifyPriorityCategory(subject, rawTipo) {
  const sStr = cleanString(subject);
  const tpStr = cleanString(rawTipo);
  const withoutDomain = sStr.replace(/[a-z0-9\-]+\.com(\.br)?/g, '');

  if (withoutDomain.includes('chatbot') || tpStr.includes('chatbot')) return 'CHATBOT';
  if (tpStr.includes('blog') || sStr.includes('blog')) return 'BLOG';
  if (tpStr.includes('token') || tpStr.includes('api') || sStr.includes('token') || sStr.includes('api')) return 'API/TOKEN';
  if (tpStr.includes('urg') || sStr.includes('urg')) return 'URGENTE';
  if (tpStr.includes('alta') || sStr.includes('alta')) return 'ALTA';
  if (tpStr.includes('med') || sStr.includes('med')) return 'MÉDIA';
  if (tpStr.includes('baixa') || tpStr.includes('facil') || sStr.includes('baixa') || sStr.includes('facil')) return 'BAIXA';
  if (tpStr.includes('backup') || sStr.includes('backup')) return 'BACKUP';
  if (tpStr.includes('banco') || tpStr.includes('sig') || sStr.includes('banco') || sStr.includes('sig')) return 'T. DE BANCO';
  return 'ALTA';
}

function getWeekOfMonth(dateStr) {
  if (!dateStr || dateStr === '-') return 'Semana 1';
  const str = String(dateStr).trim();

  let year = new Date().getFullYear();
  let month = new Date().getMonth();
  let dayNumber = 1;

  const isoMatch = str.match(/^(\d{4})[\-\/\.](\d{1,2})[\-\/\.](\d{1,2})/);
  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10) - 1;
    dayNumber = parseInt(isoMatch[3], 10);
  } else {
    const slashMatch = str.match(/^(\d{1,2})[\/\-]\d{1,2}[\/\-]\d{4}/);
    if (slashMatch) {
      const parts = str.split(/[\/\-]/);
      dayNumber = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2], 10);
      if (year < 100) year += 2000;
    } else {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        year = d.getFullYear();
        month = d.getMonth();
        dayNumber = d.getDate();
      }
    }
  }

  if (isNaN(dayNumber) || dayNumber < 1) dayNumber = 1;

  const firstDay = new Date(year, month, 1);
  let firstDayOfWeek = firstDay.getDay(); 
  // Ajustando para que a semana comece na Segunda-feira (0 = Segunda, 6 = Domingo)
  let adjustedFirstDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  
  const weekNum = Math.ceil((dayNumber + adjustedFirstDay) / 7);
  return `Semana ${weekNum}`;
}

function parseMonthYear(dateStr) {
  if (!dateStr || dateStr === '-') return 'Outros';
  const str = String(dateStr).trim();

  let year = null;
  let month = null;

  const isoMatch = str.match(/^(\d{4})[\-\/\.](\d{1,2})[\-\/\.]\d{1,2}/);
  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
  } else {
    const slashMatch = str.match(/^\d{1,2}[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (slashMatch) {
      month = parseInt(slashMatch[1], 10);
      year = parseInt(slashMatch[2], 10);
    } else {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        year = d.getFullYear();
        month = d.getMonth() + 1;
      }
    }
  }

  if (year && month && month >= 1 && month <= 12) {
    return `${MONTH_NAMES_PT[month - 1]} ${year}`;
  }

  return 'Outros';
}

function parseTargetMonthInfo(monthYearStr) {
  const now = new Date();
  if (!monthYearStr || monthYearStr === 'Outros') {
    return {
      name: `${MONTH_NAMES_PT[now.getMonth()]} ${now.getFullYear()}`,
      year: now.getFullYear(),
      monthIndex: now.getMonth()
    };
  }

  const parts = monthYearStr.trim().split(/\s+/);
  const mName = parts[0];
  const year = parts[1] ? parseInt(parts[1], 10) : now.getFullYear();

  let monthIndex = now.getMonth();
  MONTH_NAMES_PT.forEach((name, idx) => {
    if (cleanString(name) === cleanString(mName)) {
      monthIndex = idx;
    }
  });

  return { name: monthYearStr, year, monthIndex };
}

function getMonthWorkdays(year, monthIndex) {
  const holidays = [
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21',
    '2026-05-01', '2026-06-04', '2026-07-09', '2026-09-07', '2026-10-12',
    '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25'
  ];

  const totalDaysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  let totalWorkdays = 0;
  let currentWorkday = 0;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth();
  const todayDate = now.getDate();

  const isCurrentMonth = (year === currentYear && monthIndex === currentMonthIndex);
  const isPastMonth = (year < currentYear || (year === currentYear && monthIndex < currentMonthIndex));

  for (let day = 1; day <= totalDaysInMonth; day++) {
    const mm = String(monthIndex + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const dStr = `${year}-${mm}-${dd}`;
    const d = new Date(year, monthIndex, day);
    const dayOfWeek = d.getDay();

    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.includes(dStr)) {
      totalWorkdays++;
      if (isCurrentMonth) {
        if (day <= todayDate) currentWorkday++;
      } else if (isPastMonth) {
        currentWorkday++;
      }
    }
  }

  if (isCurrentMonth && currentWorkday <= 2) {
    currentWorkday = 1;
  }
  if (!isCurrentMonth && !isPastMonth) {
    currentWorkday = 0;
  }

  return {
    totalWorkdays: totalWorkdays > 0 ? totalWorkdays : 21,
    currentWorkday: currentWorkday > 0 ? currentWorkday : 1
  };
}

/**
 * Normaliza e mapeia as colunas de detailColumns do relatório
 */
function mapReportColumns(detailColumns = []) {
  let col_analista = -1;
  let col_subject = -1;
  let col_tipo = -1;
  let col_status = -1;
  let col_data_venc = -1;
  let col_data_entr = -1;
  let col_refacao = -1;
  let col_task_id = -1;
  let col_horas = -1;
  let col_pontos = -1;

  detailColumns.forEach((col, idx) => {
    const c = cleanString(col);
    if (c.includes('atribuido') || c.includes('proprietario') || c.includes('owner')) col_analista = idx;
    else if (c.includes('assunto') || c.includes('subject')) col_subject = idx;
    else if (c.includes('tipo') || c.includes('complexidade') || c.includes('type')) col_tipo = idx;
    else if (c.includes('status')) col_status = idx;
    else if (c.includes('vencimento') || c.includes('due')) col_data_venc = idx;
    else if (c.includes('conclusao') || c.includes('entrega') || c.includes('completed') || c.includes('closed') || c.includes('data') || c.includes('date')) {
      if (col_data_entr === -1) col_data_entr = idx;
    }
    else if (c.includes('refacao') || c.includes('rework')) col_refacao = idx;
    else if (c.includes('id da tarefa') || c.includes('task id') || c.includes('activityid')) col_task_id = idx;
    else if (c.includes('horas') || c.includes('hours')) col_horas = idx;
    else if (c.includes('pontos') || c.includes('points')) col_pontos = idx;
  });

  return {
    analista: col_analista,
    subject: col_subject !== -1 ? col_subject : 0,
    tipo: col_tipo,
    status: col_status,
    data_vencimento: col_data_venc,
    data_entrega: col_data_entr,
    refacao: col_refacao,
    task_id: col_task_id,
    horas: col_horas,
    pontos: col_pontos
  };
}

function extractDateFromCells(cells = []) {
  for (const c of cells) {
    if (!c) continue;
    const val = String(c.value || '').trim();
    const lbl = String(c.label || '').trim();
    if (/^\d{4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,2}/.test(val)) return val;
    if (/^\d{4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,2}/.test(lbl)) return lbl;
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(lbl)) return lbl;
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(val)) return val;
  }
  return '';
}

function buildGroupingsMap(groupingsDown) {
  const map = {};
  if (!groupingsDown || !groupingsDown.groupings) return map;

  function traverse(groupList, parentAnalyst) {
    groupList.forEach(g => {
      const gKey = String(g.key);
      const gLabel = String(g.label || '');
      const mapped = mapAnalystName(gLabel);
      const currentAnalyst = (mapped && mapped !== 'Sem Analista') ? mapped : parentAnalyst;
      map[gKey] = currentAnalyst;

      if (g.groupings && Array.isArray(g.groupings) && g.groupings.length > 0) {
        traverse(g.groupings, currentAnalyst);
      }
    });
  }

  traverse(groupingsDown.groupings, '');
  return map;
}

/**
 * Converte o relatório JSON do Salesforce para uma lista de tarefas tipadas
 */
function parseReportData(rawReport, category = 'concluidas') {
  if (!rawReport || !rawReport.reportMetadata) return [];

  const detailColumns = rawReport.reportMetadata.detailColumns || [];
  const cols = mapReportColumns(detailColumns);
  const groupingsMap = buildGroupingsMap(rawReport.groupingsDown);

  const tasksList = [];
  const factMap = rawReport.factMap || {};

  Object.keys(factMap).forEach(mapKey => {
    const factItem = factMap[mapKey];
    if (!factItem || !factItem.rows || factItem.rows.length === 0) return;

    const groupKey = mapKey.split('!')[0];
    const groupAnalyst = groupingsMap[groupKey] || '';

    factItem.rows.forEach(row => {
      const cells = row.dataCells || [];
      if (cells.length === 0) return;

      let mappedAnalyst = mapAnalystName(groupAnalyst);

      if (!mappedAnalyst || mappedAnalyst === 'Sem Analista') {
        if (cols.analista !== -1 && cells[cols.analista]) {
          mappedAnalyst = mapAnalystName(cells[cols.analista].label || cells[cols.analista].value);
        }
      }

      if (!mappedAnalyst || mappedAnalyst === 'Sem Analista') {
        for (const c of cells) {
          const m = mapAnalystName(c ? (c.label || c.value) : '');
          if (m && m !== 'Sem Analista') {
            mappedAnalyst = m;
            break;
          }
        }
      }

      // Se for ex-membro, ignora
      if (mappedAnalyst === null) return;
      if (!mappedAnalyst) mappedAnalyst = 'Outros / Fila';

      const subject = cols.subject !== -1 && cells[cols.subject] ? (cells[cols.subject].label || cells[cols.subject].value || '') : '';
      let tipo = cols.tipo !== -1 && cells[cols.tipo] ? (cells[cols.tipo].label || cells[cols.tipo].value || '') : '';
      const status = cols.status !== -1 && cells[cols.status] ? (cells[cols.status].label || cells[cols.status].value || '') : '';

      const cleanSt = cleanString(status);
      let finalCategory = category;

      if (cleanSt.includes('abert') || cleanSt.includes('andamento') || cleanSt.includes('progress') || cleanSt.includes('aguard') || cleanSt.includes('pendent') || cleanSt.includes('novo') || cleanSt.includes('nova')) {
        finalCategory = 'fila';
      } else if (cleanSt.includes('conclu') || cleanSt.includes('fechad') || cleanSt.includes('finaliz') || cleanSt.includes('realiz') || cleanSt.includes('entreg') || cleanSt.includes('done')) {
        finalCategory = 'concluidas';
      }

      let dataVencimento = (cols.data_vencimento !== -1 && cells[cols.data_vencimento]) ? (cells[cols.data_vencimento].value || cells[cols.data_vencimento].label || '') : '';
      let dataEntrega = (cols.data_entrega !== -1 && cells[cols.data_entrega]) ? (cells[cols.data_entrega].value || cells[cols.data_entrega].label || '') : '';

      if (finalCategory === 'concluidas' && !dataEntrega) {
        dataEntrega = extractDateFromCells(cells);
      }
      if (!dataVencimento) {
        dataVencimento = extractDateFromCells(cells);
      }

      let taskId = '';
      if (cols.task_id !== -1 && cols.task_id < cells.length) {
        taskId = cells[cols.task_id].value;
      }
      if (!taskId || !String(taskId).startsWith('00T')) {
        for (const c of cells) {
          const val = String(c ? c.value : '');
          if (val.startsWith('00T') && (val.length === 15 || val.length === 18)) {
            taskId = val;
            break;
          }
        }
      }

      // Verificação de Refação
      let isRework = false;
      if (cols.refacao !== -1 && cols.refacao < cells.length && cells[cols.refacao]) {
        const refLabel = String(cells[cols.refacao].label || cells[cols.refacao].value).toLowerCase();
        isRework = refLabel.includes('sim') || refLabel.includes('true') || refLabel === '1';
      }
      if (cleanString(subject).includes('[refa') || cleanString(subject).includes('refacao')) {
        isRework = true;
      }

      const rawH = cols.horas !== -1 && cells[cols.horas] ? cells[cols.horas].value : 0;
      const rawP = cols.pontos !== -1 && cells[cols.pontos] ? cells[cols.pontos].value : 0;

      const metrics = calculateHorasEPontos(taskId, mappedAnalyst, subject, tipo, rawH, rawP, isRework);
      const priorityCategory = classifyPriorityCategory(subject, tipo);
      const week = getWeekOfMonth(dataEntrega || dataVencimento);
      const monthYear = finalCategory === 'concluidas' ? parseMonthYear(dataEntrega || dataVencimento) : 'Outros';

      tasksList.push({
        taskId: taskId || `SF-${Math.random().toString(36).substring(2, 9)}`,
        analista: mappedAnalyst,
        subject: subject,
        tipo: tipo || priorityCategory,
        priorityCategory,
        horas: metrics.horas,
        pontos: metrics.pontos,
        isRework,
        status: status,
        dataVencimento: dataVencimento,
        dataEntrega: dataEntrega,
        category: finalCategory,
        semana: week,
        monthYear: monthYear
      });
    });
  });

  return tasksList;
}

/**
 * Consolida todas as métricas para a Dashboard completa
 */
function buildDashboardMetrics(allTasks = [], selectedMonth = null) {
  const now = new Date();
  const defaultMonth = `${MONTH_NAMES_PT[now.getMonth()]} ${now.getFullYear()}`;

  // Gera últimos 12 meses para o dropdown dinamicamente
  const availableMonths = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    availableMonths.push(`${MONTH_NAMES_PT[d.getMonth()]} ${d.getFullYear()}`);
  }

  const activeMonth = selectedMonth && availableMonths.includes(selectedMonth) ? selectedMonth : (availableMonths[0] || defaultMonth);

  // Filtra tarefas do mês selecionado e tarefas em aberto (fila)
  const monthTasks = allTasks.filter(t => t.category === 'concluidas' && t.monthYear === activeMonth);
  const filaTasks = allTasks.filter(t => t.category === 'fila' || t.monthYear === 'Outros');

  // Cálculos de dias úteis
  const monthInfo = parseTargetMonthInfo(activeMonth);
  const workdays = getMonthWorkdays(monthInfo.year, monthInfo.monthIndex);
  const totalWorkdays = workdays.totalWorkdays;
  const currentWorkday = workdays.currentWorkday;

  const isSetembro2026 = cleanString(activeMonth).includes('setembro 2026');

  // 1. Tabela 1: Metas por Analista
  const tabelaMetas = ACTIVE_ANALYSTS.map(analista => {
    let cargaDiaria = analista.cargaPadrao;
    let metaMensal = cargaDiaria * totalWorkdays;
    let previsaoParcial = cargaDiaria * currentWorkday;

    // Regra específica para Anderson Almeida em Setembro 2026
    if (analista.name === 'Anderson Almeida' && isSetembro2026) {
      metaMensal = 48.0;
      previsaoParcial = totalWorkdays > 0 ? Number((48.0 * (currentWorkday / totalWorkdays)).toFixed(1)) : 48.0;
      cargaDiaria = totalWorkdays > 0 ? Number((48.0 / totalWorkdays).toFixed(2)) : 2.3;
    }

    const analistaTasks = monthTasks.filter(t => t.analista === analista.name);
    const horasTrabalhadas = Number(analistaTasks.reduce((acc, t) => acc + (t.horas || 0), 0).toFixed(1));
    const pontosTotais = Number(analistaTasks.reduce((acc, t) => acc + (t.pontos || 0), 0).toFixed(1));
    const saldo = Number((horasTrabalhadas - previsaoParcial).toFixed(1));
    const percentualAtingido = metaMensal > 0 ? Number(((horasTrabalhadas / metaMensal) * 100).toFixed(1)) : 0;
    const statusMeta = saldo >= 0 ? 'Acima da meta' : 'Abaixo da meta';

    // Fila atribuída a este analista
    const analistaFila = filaTasks.filter(t => t.analista === analista.name);
    const capacidadeFilaHoras = Number(analistaFila.reduce((acc, t) => acc + (t.horas || 0), 0).toFixed(1));

    return {
      analista: analista.name,
      cargaDiaria,
      metaMensal: Number(metaMensal.toFixed(1)),
      previsaoParcial: Number(previsaoParcial.toFixed(1)),
      horasTrabalhadas,
      saldo,
      pontosTotais,
      percentualAtingido,
      statusMeta,
      capacidadeFilaHoras,
      totalTarefasConcluidas: analistaTasks.length
    };
  });

  // Totais Tabela 1
  const totalMetaMensal = Number(tabelaMetas.reduce((a, b) => a + b.metaMensal, 0).toFixed(1));
  const totalPrevisaoParcial = Number(tabelaMetas.reduce((a, b) => a + b.previsaoParcial, 0).toFixed(1));
  const totalHorasTrabalhadas = Number(tabelaMetas.reduce((a, b) => a + b.horasTrabalhadas, 0).toFixed(1));
  const totalSaldoGeral = Number((totalHorasTrabalhadas - totalPrevisaoParcial).toFixed(1));
  const totalPontos = Number(tabelaMetas.reduce((a, b) => a + b.pontosTotais, 0).toFixed(1));
  const totalPercentual = totalMetaMensal > 0 ? Number(((totalHorasTrabalhadas / totalMetaMensal) * 100).toFixed(1)) : 0;
  const totalCapacidadeFila = Number(tabelaMetas.reduce((a, b) => a + b.capacidadeFilaHoras, 0).toFixed(1));
  const totalFilaTarefas = filaTasks.length;

  const totalMetasRow = {
    analista: 'TOTAL GERAL',
    cargaDiaria: '-',
    metaMensal: totalMetaMensal,
    previsaoParcial: totalPrevisaoParcial,
    horasTrabalhadas: totalHorasTrabalhadas,
    saldo: totalSaldoGeral,
    pontosTotais: totalPontos,
    percentualAtingido: totalPercentual,
    statusMeta: totalSaldoGeral >= 0 ? 'Dentro da Meta' : 'Fora da Meta',
    capacidadeFilaHoras: totalCapacidadeFila,
    totalTarefasConcluidas: monthTasks.length
  };

  // 1.5 Ranking Semanal
  const todayDateStr = now.toISOString();
  const currentWeekStr = getWeekOfMonth(todayDateStr);
  const weekTasks = monthTasks.filter(t => t.semana === currentWeekStr);
  
  // Vamos inferir quantos dias úteis já se passaram nesta semana
  const dayOfWeek = now.getDay(); // 0 = Dom, 1 = Seg, 2 = Ter, 3 = Qua, 4 = Qui, 5 = Sex, 6 = Sáb
  let currentWeekWorkdays = dayOfWeek; 
  if (dayOfWeek === 0) currentWeekWorkdays = 0; // Domingo = 0
  else if (dayOfWeek === 6) currentWeekWorkdays = 5; // Sábado = 5
  // Proteção para evitar 0 na divisão
  if (currentWeekWorkdays === 0) currentWeekWorkdays = 1;

  const tabelaMetasSemanal = ACTIVE_ANALYSTS.map(analista => {
    let cargaDiaria = analista.cargaPadrao;
    let metaSemanalCompleta = cargaDiaria * 5; // Meta de uma semana inteira
    let previsaoParcialSemanal = cargaDiaria * currentWeekWorkdays; // Meta até o dia de hoje na semana

    // Regra Anderson (proporcional)
    if (analista.name === 'Anderson Almeida' && isSetembro2026) {
      cargaDiaria = totalWorkdays > 0 ? (48.0 / totalWorkdays) : 2.3;
      metaSemanalCompleta = cargaDiaria * 5;
      previsaoParcialSemanal = cargaDiaria * currentWeekWorkdays;
    }

    const analistaWeekTasks = weekTasks.filter(t => t.analista === analista.name);
    const horasTrabalhadas = Number(analistaWeekTasks.reduce((acc, t) => acc + (t.horas || 0), 0).toFixed(1));
    const pontosTotais = Number(analistaWeekTasks.reduce((acc, t) => acc + (t.pontos || 0), 0).toFixed(1));
    const saldo = Number((horasTrabalhadas - previsaoParcialSemanal).toFixed(1));
    const percentualAtingido = metaSemanalCompleta > 0 ? Number(((horasTrabalhadas / metaSemanalCompleta) * 100).toFixed(1)) : 0;
    const statusMeta = saldo >= 0 ? 'Acima da meta' : 'Abaixo da meta';

    return {
      analista: analista.name,
      metaSemanalCompleta: Number(metaSemanalCompleta.toFixed(1)),
      previsaoParcialSemanal: Number(previsaoParcialSemanal.toFixed(1)),
      horasTrabalhadas,
      saldo,
      pontosTotais,
      percentualAtingido,
      statusMeta,
      totalTarefasConcluidas: analistaWeekTasks.length
    };
  });


  // 2. Tabela 2: Tarefas por Nível de Prioridade (Volume de Entregas)
  const prioridadesList = ['BLOG', 'API/TOKEN', 'URGENTE', 'ALTA', 'MÉDIA', 'BAIXA', 'BACKUP', 'T. DE BANCO', 'CHATBOT'];
  const tabelaPrioridades = ACTIVE_ANALYSTS.map(analista => {
    const analistaTasks = monthTasks.filter(t => t.analista === analista.name);
    const counts = {};
    prioridadesList.forEach(p => counts[p] = 0);

    analistaTasks.forEach(t => {
      const p = t.priorityCategory || 'ALTA';
      if (counts[p] !== undefined) counts[p]++;
      else counts['ALTA']++;
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      analista: analista.name,
      ...counts,
      total
    };
  });

  const totalPrioridadesRow = {
    analista: 'TOTAL GERAL',
    total: monthTasks.length
  };
  prioridadesList.forEach(p => {
    totalPrioridadesRow[p] = tabelaPrioridades.reduce((acc, row) => acc + (row[p] || 0), 0);
  });

  // 3. Tabela 3: Horas Semanais por Analista
  const semanasList = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4', 'Semana 5'];
  const tabelaHorasSemanais = ACTIVE_ANALYSTS.map(analista => {
    const analistaTasks = monthTasks.filter(t => t.analista === analista.name);
    const semanas = {};
    semanasList.forEach(s => semanas[s] = 0.0);

    analistaTasks.forEach(t => {
      const s = t.semana || 'Semana 1';
      if (semanas[s] !== undefined) semanas[s] += (t.horas || 0);
    });

    semanasList.forEach(s => {
      semanas[s] = Number(semanas[s].toFixed(1));
    });

    const totalMensal = Number(Object.values(semanas).reduce((a, b) => a + b, 0).toFixed(1));
    return {
      analista: analista.name,
      ...semanas,
      totalMensal
    };
  });

  const totalHorasSemanaisRow = {
    analista: 'TOTAL REALIZADO',
    totalMensal: totalHorasTrabalhadas
  };
  semanasList.forEach(s => {
    totalHorasSemanaisRow[s] = Number(tabelaHorasSemanais.reduce((acc, row) => acc + (row[s] || 0), 0).toFixed(1));
  });

  // 4. Tabela 4: Volume Semanal de Tarefas Concluídas
  const tabelaTarefasSemanais = ACTIVE_ANALYSTS.map(analista => {
    const analistaTasks = monthTasks.filter(t => t.analista === analista.name);
    const semanas = {};
    semanasList.forEach(s => semanas[s] = 0);

    analistaTasks.forEach(t => {
      const s = t.semana || 'Semana 1';
      if (semanas[s] !== undefined) semanas[s]++;
    });

    const totalMensal = Object.values(semanas).reduce((a, b) => a + b, 0);
    return {
      analista: analista.name,
      ...semanas,
      totalMensal
    };
  });

  const totalTarefasSemanaisRow = {
    analista: 'TOTAL GERAL DE TAREFAS',
    totalMensal: monthTasks.length
  };
  semanasList.forEach(s => {
    totalTarefasSemanaisRow[s] = tabelaTarefasSemanais.reduce((acc, row) => acc + (row[s] || 0), 0);
  });

  return {
    activeMonth,
    availableMonths,
    workdays: {
      totalWorkdays,
      currentWorkday
    },
    kpis: {
      saldoGeral: totalSaldoGeral,
      horasTrabalhadas: totalHorasTrabalhadas,
      previsaoParcial: totalPrevisaoParcial,
      metaMensal: totalMetaMensal,
      filaCount: totalFilaTarefas,
      concluidasCount: monthTasks.length,
      percentualAtingido: totalPercentual
    },
    tabelaMetas: {
      rows: tabelaMetas,
      total: totalMetasRow
    },
    tabelaMetasSemanal: {
      currentWeek: currentWeekStr,
      rows: tabelaMetasSemanal
    },
    tabelaPrioridades: {
      prioridadesList,
      rows: tabelaPrioridades,
      total: totalPrioridadesRow
    },
    tabelaHorasSemanais: {
      semanasList,
      rows: tabelaHorasSemanais,
      totalRealizado: totalHorasSemanaisRow,
      totalEsperado: totalMetaMensal,
      previsaoParcial: totalPrevisaoParcial,
      statusRitmo: totalHorasTrabalhadas >= totalPrevisaoParcial ? 'Dentro da Meta / Ritmo' : 'Abaixo do Ritmo'
    },
    tabelaTarefasSemanais: {
      semanasList,
      rows: tabelaTarefasSemanais,
      total: totalTarefasSemanaisRow,
      totalEsperadoTarefas: Math.round(totalMetaMensal / 2)
    },
    recentTasks: monthTasks.slice(0, 50),
    filaTasksList: filaTasks.slice(0, 50)
  };
}

module.exports = {
  ACTIVE_ANALYSTS,
  MONTH_NAMES_PT,
  parseReportData,
  buildDashboardMetrics,
  calculateHorasEPontos,
  getMonthWorkdays,
  parseMonthYear
};
