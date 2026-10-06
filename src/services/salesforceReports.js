const { loadTokens, refreshAccessToken, DEFAULT_INSTANCE } = require('./salesforceAuth');

const REPORT_FILA_ID = '00ObL000007gu6bUAA';       // Tarefas em Aberto / Fila
const REPORT_CONCLUIDAS_ID = '00ObL000007gx7hUAA'; // Tarefas Concluídas / Metas
const API_VERSION = 'v61.0';

async function fetchSalesforceEndpoint(endpoint, { method = 'GET', body = null } = {}, retryOn401 = true) {
  let tokens = loadTokens();
  if (!tokens || !tokens.access_token) {
    throw new Error('Não autenticado no Salesforce. Faça o login primeiro.');
  }

  const instanceUrl = (tokens.instance_url || DEFAULT_INSTANCE).replace(/\/$/, '');
  const url = endpoint.startsWith('http') ? endpoint : `${instanceUrl}${endpoint}`;

  const headers = {
    Authorization: `Bearer ${tokens.access_token}`,
    Accept: 'application/json'
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  let res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (res.status === 401 && retryOn401) {
    console.log('[Reports] Token expirado (401). Tentando auto-refresh...');
    try {
      tokens = await refreshAccessToken();
      headers.Authorization = `Bearer ${tokens.access_token}`;
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (refreshErr) {
      throw new Error(`Sessão expirada. Falha na renovação: ${refreshErr.message}`);
    }
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Erro na API Salesforce (${res.status}): ${errorText.slice(0, 300)}`);
  }

  return await res.json();
}

const MONTHS = {
  'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
  'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
  'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
};

/**
 * Consulta um relatório pela Analytics Reports API com includeDetails=true e filtro de data dinâmico
 */
async function getReportData(reportId, targetMonthYear = null) {
  try {
    const describeEndpoint = `/services/data/${API_VERSION}/analytics/reports/${reportId}/describe`;
    const describeData = await fetchSalesforceEndpoint(describeEndpoint);
    
    if (describeData && describeData.reportMetadata && describeData.reportMetadata.standardDateFilter) {
      if (targetMonthYear && targetMonthYear !== 'Outros' && targetMonthYear !== 'Atual') {
        const parts = targetMonthYear.split(' ');
        const m = parts[0].toLowerCase();
        const y = parts[1];
        const monthNum = MONTHS[m];
        
        if (monthNum && y) {
          const startDate = `${y}-${monthNum}-01`;
          const lastDay = new Date(parseInt(y), parseInt(monthNum), 0).getDate();
          const endDate = `${y}-${monthNum}-${String(lastDay).padStart(2, '0')}`;
          
          describeData.reportMetadata.standardDateFilter.durationValue = 'CUSTOM';
          describeData.reportMetadata.standardDateFilter.startDate = startDate;
          describeData.reportMetadata.standardDateFilter.endDate = endDate;
        } else {
          describeData.reportMetadata.standardDateFilter.durationValue = 'THIS_MONTH';
          describeData.reportMetadata.standardDateFilter.startDate = null;
          describeData.reportMetadata.standardDateFilter.endDate = null;
        }
      } else {
        describeData.reportMetadata.standardDateFilter.durationValue = 'THIS_MONTH';
        describeData.reportMetadata.standardDateFilter.startDate = null;
        describeData.reportMetadata.standardDateFilter.endDate = null;
      }
      
      const execEndpoint = `/services/data/${API_VERSION}/analytics/reports/${reportId}?includeDetails=true`;
      return await fetchSalesforceEndpoint(execEndpoint, {
        method: 'POST',
        body: { reportMetadata: describeData.reportMetadata }
      });
    }
  } catch (err) {
    console.warn(`[Reports] Falha ao tentar override dinâmico para o report ${reportId}. Fazendo fallback para GET normal.`, err.message);
  }

  // Fallback padrão se não conseguir descrever/modificar
  const endpoint = `/services/data/${API_VERSION}/analytics/reports/${reportId}?includeDetails=true`;
  return await fetchSalesforceEndpoint(endpoint);
}

/**
 * Busca simultaneamente os relatórios de Fila e de Concluídas
 */
async function fetchAllReports(targetMonthYear = null) {
  console.log(`[Reports] Buscando relatórios de Fila e Concluídas para: ${targetMonthYear || 'Mês Atual'}...`);
  const [filaRaw, concluidasRaw] = await Promise.all([
    getReportData(REPORT_FILA_ID, targetMonthYear),
    getReportData(REPORT_CONCLUIDAS_ID, targetMonthYear)
  ]);

  return {
    filaRaw,
    concluidasRaw,
    timestamp: Date.now()
  };
}

module.exports = {
  REPORT_FILA_ID,
  REPORT_CONCLUIDAS_ID,
  getReportData,
  fetchAllReports,
  fetchSalesforceEndpoint
};
