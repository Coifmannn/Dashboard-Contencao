# 📊 Painel de Contenção & Metas (Salesforce)

Aplicação Desktop nativa em **Electron** e **JavaScript/Node.js puro** (sem uso de Python) para o time de contenção do Grupo Ideal Trends.

Substitui completamente o fluxo legado (`Extensão Chrome -> Google Apps Script -> Planilha Excel`) por uma aplicação nativa de alta performance que se conecta diretamente à API do Salesforce.

---

## 🚀 Como Instalar e Iniciar a Aplicação

### 1. Clonando o Repositório e Configurando
Se você acabou de clonar o projeto do GitHub em um computador novo, siga estes passos para configurar:

1. **Baixe as dependências**: Abra o terminal na pasta do projeto e rode o comando que vai ler o arquivo `package.json` e baixar todo o motor do app (incluindo o Electron):
   ```bash
   npm install
   ```
   *(Caso o instalador do Electron falhe por conta de bloqueios de rede corporativa, use o comando de troubleshooting abaixo)*

2. **Copie o arquivo `.env`**: O arquivo de configuração secreta não sobe para o GitHub por segurança. Peça o arquivo `.env` para a sua equipe e cole-o na raiz do projeto. Sem ele, as fotos de perfil e o histórico na nuvem não vão funcionar!

### 2. Rodando o App (Modo Desenvolvimento)
Após instalar e colocar o `.env`, basta dar um duplo clique no arquivo `Iniciar Painel.cmd` ou rodar no terminal:
```bash
npm start
```

### 3. Executável Compilado (.exe nativo)
Se você já compilou o aplicativo para a produção, basta rodar diretamente o `.exe`:
- [Abrir Executavel.cmd](file:///c:/Users/gustavo.wustemberg/Documents/painel_contencao/Abrir%20Executavel.cmd) ou
- `dist/win-unpacked/Painel de Contencao.exe`

---

## 🛠 Troubleshooting de Instalação (Firewall / Antivírus)
Se ao rodar `npm start` você receber um erro como: *`Electron failed to install correctly`*, significa que o firewall da sua rede bloqueou o download do motor do Electron no meio do `npm install`.
Para burlar isso e forçar o download via um servidor espelho (Mirror), cole todo este bloco no seu **Git Bash** e aperte Enter:

```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_SKIP_BINARY_DOWNLOAD=0
rm -rf ~/.cache/electron
rm -rf node_modules/electron
npm install electron
npm start
```

---

## 🏛 Arquitetura da Solução

- **Framework**: Electron (Main + Preload + Renderer)
- **Linguagem**: 100% JavaScript (Node.js no backend, ES6+ no frontend)
- **Autenticação**: OAuth 2.0 PKCE via Connected App oficial `PlatformCLI` (com servidor HTTP nativo do Node.js na porta 1717 e auto-refresh de token transparente).
- **Extração Salesforce**: Analytics Reports API consumindo os relatórios oficiais:
  - **Fila em Aberto**: `00ObL000007gu6bUAA`
  - **Concluídas / Metas**: `00ObL000007gx7hUAA`
- **Sincronização Periódica**: Auto-refresh a cada 30 minutos em background + botão sob demanda.
- **Cache Local Instantâneo**: Os dados são persistidos em `data/cached_dashboard.json`, garantindo abertura imediata do app (< 100ms) mesmo sem internet.

---

## 👥 Analistas Mapeados
1. Anderson Almeida (Carga: 7.5h/dia útil | Regra Setembro 2026: 48h)
2. Gustavo Chagas (Carga: 7.5h/dia útil)
3. Mariane Oliveira (Carga: 7.5h/dia útil)
4. Thiago Santos (Carga: 7.5h/dia útil)
5. Felipe Wustemberg (Carga: 7.5h/dia útil)
6. Heloisa Yamanaka (Carga: 7.5h/dia útil)

---

## 📐 Estrutura das Telas
1. **Dashboard Executivo**:
   - Seletor do Mês (Setembro 2026, Agosto 2026, etc.)
   - 4 Cards de KPI: Saldo Geral, Horas Trabalhadas, Previsão Parcial e Em Aberto (Fila).
   - Tabela 1: Metas por Analista (Carga, Meta, Previsão, Horas Trab, Saldo, Pontos, % Atingido, Status, Capacidade Fila).
   - Tabela 2: Volume por Nível de Prioridade (Blog, API/Token, Urgente, Alta, Média, Baixa, Backup, Banco).
   - Tabela 3: Horas Semanais por Analista (Semana 1 a 5 vs. Meta vs. Ritmo).
   - Tabela 4: Contagem de Tarefas Concluídas por Semana e Mês.
2. **Central de Tarefas**:
   - Busca em tempo real por Assunto, ID ou Analista.
   - Filtros por Concluídas vs Fila e Prioridade.
   - Botão direto para abrir a tarefa no Salesforce (`https://grupo-ideal-trends.lightning.force.com/lightning/r/Task/{id}/view`).
