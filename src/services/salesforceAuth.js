const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
let electronShell = null;
try {
  const electron = require('electron');
  if (electron && typeof electron === 'object' && electron.shell) {
    electronShell = electron.shell;
  }
} catch (_) {}

function openExternalUrl(url) {
  if (electronShell && typeof electronShell.openExternal === 'function') {
    electronShell.openExternal(url);
  } else {
    const { exec } = require('child_process');
    exec(`start "" "${url}"`);
  }
}

const SF_CLIENT_ID = 'PlatformCLI';
const SF_PORTA = 1717;
const SF_REDIRECT_URI = `http://localhost:${SF_PORTA}/OauthRedirect`;
const SF_SCOPES = 'api refresh_token';
const DEFAULT_INSTANCE = 'https://grupo-ideal-trends.my.salesforce.com';

let electronApp = null;
try {
  const electron = require('electron');
  if (electron && typeof electron === 'object' && electron.app) {
    electronApp = electron.app;
  }
} catch (_) {}

function getDataDir() {
  try {
    if (electronApp && typeof electronApp.getPath === 'function') {
      return electronApp.getPath('userData');
    }
  } catch (_) {}
  return path.join(__dirname, '..', '..', 'data');
}

const LOCAL_DATA_DIR = path.join(__dirname, '..', '..', 'data');
const LEGACY_TOKEN_FILE = 'C:\\Users\\gustavo.wustemberg\\Documents\\publicacaoautomatica-\\arquivos\\salesforce_token.json';

function getTokenFilePath() {
  return path.join(getDataDir(), 'salesforce_token.json');
}

function ensureDataDir() {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function base64UrlEncode(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generatePkcePair() {
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function loadTokens() {
  try {
    ensureDataDir();
    const primary = getTokenFilePath();
    if (fs.existsSync(primary)) {
      const raw = fs.readFileSync(primary, 'utf-8');
      return JSON.parse(raw);
    }
    // Fallback no diretório local data
    const localFile = path.join(LOCAL_DATA_DIR, 'salesforce_token.json');
    if (fs.existsSync(localFile)) {
      const raw = fs.readFileSync(localFile, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.access_token) {
        saveTokens(parsed);
        return parsed;
      }
    }
    // Tenta reaproveitar credencial existente do projeto de referência
    if (fs.existsSync(LEGACY_TOKEN_FILE)) {
      try {
        const rawLegacy = fs.readFileSync(LEGACY_TOKEN_FILE, 'utf-8');
        const parsed = JSON.parse(rawLegacy);
        if (parsed.access_token) {
          saveTokens(parsed);
          console.log('[Auth] Token importado com sucesso do projeto de referência!');
          return parsed;
        }
      } catch (_) {}
    }
  } catch (err) {
    console.error('[Auth] Erro ao carregar tokens:', err.message);
  }
  return null;
}

function saveTokens(tokens) {
  try {
    ensureDataDir();
    fs.writeFileSync(getTokenFilePath(), JSON.stringify(tokens, null, 2), 'utf-8');
    if (fs.existsSync(LOCAL_DATA_DIR)) {
      fs.writeFileSync(path.join(LOCAL_DATA_DIR, 'salesforce_token.json'), JSON.stringify(tokens, null, 2), 'utf-8');
    }
    return true;
  } catch (err) {
    console.error('[Auth] Erro ao salvar tokens:', err.message);
    return false;
  }
}

function clearTokens() {
  try {
    const primary = getTokenFilePath();
    if (fs.existsSync(primary)) {
      fs.unlinkSync(primary);
    }
    const localFile = path.join(LOCAL_DATA_DIR, 'salesforce_token.json');
    if (fs.existsSync(localFile)) {
      fs.unlinkSync(localFile);
    }
    return true;
  } catch (err) {
    console.error('[Auth] Erro ao remover tokens:', err.message);
    return false;
  }
}

async function refreshAccessToken() {
  const current = loadTokens();
  if (!current || !current.refresh_token) {
    throw new Error('Refresh token não encontrado. É necessário efetuar novo login.');
  }

  const instanceUrl = (current.instance_url || DEFAULT_INSTANCE).replace(/\/$/, '');
  const tokenUrl = `${instanceUrl}/services/oauth2/token`;

  const bodyParams = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: SF_CLIENT_ID,
    refresh_token: current.refresh_token
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha ao renovar token (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const updatedTokens = {
    ...current,
    access_token: data.access_token,
    instance_url: data.instance_url || instanceUrl,
    issued_at: Date.now()
  };

  saveTokens(updatedTokens);
  console.log('[Auth] Access Token renovado com sucesso via refresh_token.');
  return updatedTokens;
}

async function fetchUserInfo(instanceUrl, accessToken) {
  try {
    const res = await fetch(`${instanceUrl}/services/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[Auth] Não foi possível obter info do usuário:', e.message);
  }
  return null;
}

function startLoginFlow(dominio = DEFAULT_INSTANCE) {
  return new Promise((resolve, reject) => {
    const cleanDomain = dominio.replace(/\/$/, '').startsWith('http') ? dominio.replace(/\/$/, '') : `https://${dominio}`;
    const { verifier, challenge } = generatePkcePair();
    const state = crypto.randomBytes(16).toString('hex');

    let server;

    const cleanup = () => {
      if (server) {
        server.close();
      }
    };

    server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, `http://localhost:${SF_PORTA}`);
        if (reqUrl.pathname !== '/OauthRedirect') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Rota não encontrada.');
          return;
        }

        const error = reqUrl.searchParams.get('error');
        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html><body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f172a;color:#fff;">
              <h2 style="color:#ef4444;">Login cancelado ou recusado</h2>
              <p>Você pode fechar esta aba.</p>
            </body></html>
          `);
          cleanup();
          reject(new Error(`Autorização recusada pelo Salesforce: ${error}`));
          return;
        }

        const code = reqUrl.searchParams.get('code');
        const stateReceived = reqUrl.searchParams.get('state');

        if (!code || stateReceived !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html><body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f172a;color:#fff;">
              <h2 style="color:#ef4444;">Erro de Validação de Segurança</h2>
              <p>Código inválido ou state incompatível.</p>
            </body></html>
          `);
          cleanup();
          reject(new Error('State de segurança inválido ou código ausente.'));
          return;
        }

        // Responde de imediato ao navegador
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Conectado ao Salesforce</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
              .card { background: #1e293b; border-radius: 12px; padding: 40px; text-align: center; border: 1px solid #334155; max-width: 480px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
              h1 { color: #22c55e; margin-bottom: 12px; font-size: 24px; }
              p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>✓ Conexão Concluída!</h1>
              <p>A autenticação com o Salesforce foi realizada com sucesso. Você já pode fechar esta janela e voltar ao Painel de Contenção.</p>
            </div>
          </body>
          </html>
        `);

        cleanup();

        // 3. Troca o código pelo access_token & refresh_token
        const tokenUrl = `${cleanDomain}/services/oauth2/token`;
        const payload = new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          client_id: SF_CLIENT_ID,
          redirect_uri: SF_REDIRECT_URI,
          code_verifier: verifier
        });

        const tokenRes = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: payload.toString()
        });

        if (!tokenRes.ok) {
          const errBody = await tokenRes.text();
          throw new Error(`Falha na troca do token (${tokenRes.status}): ${errBody}`);
        }

        const tokenData = await tokenRes.json();
        const instanceUrl = tokenData.instance_url || cleanDomain;

        // 4. Busca info do usuário
        const userInfo = await fetchUserInfo(instanceUrl, tokenData.access_token);
        if (userInfo) {
          tokenData.user_name = userInfo.name;
          tokenData.user_email = userInfo.email;
        }
        tokenData.connected_at = Date.now();

        saveTokens(tokenData);
        resolve(tokenData);

      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    server.on('error', (err) => {
      cleanup();
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`A porta ${SF_PORTA} está ocupada por outro aplicativo. Feche processos que usam a porta 1717 e tente novamente.`));
      } else {
        reject(err);
      }
    });

    server.listen(SF_PORTA, '127.0.0.1', () => {
      const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: SF_CLIENT_ID,
        redirect_uri: SF_REDIRECT_URI,
        scope: SF_SCOPES,
        state: state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'login'
      });

      const authUrl = `${cleanDomain}/services/oauth2/authorize?${authParams.toString()}`;
      console.log('[Auth] Abrindo navegador para autorização no Salesforce:', authUrl);
      openExternalUrl(authUrl);
    });
  });
}

module.exports = {
  loadTokens,
  saveTokens,
  clearTokens,
  refreshAccessToken,
  startLoginFlow,
  DEFAULT_INSTANCE
};
