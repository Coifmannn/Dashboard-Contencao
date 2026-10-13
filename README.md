# 📊 Painel de Contenção & Metas (Salesforce)

Aplicação Desktop nativa em **Electron** e **JavaScript/Node.js puro** (sem uso de Python) para o time de contenção do Grupo Ideal Trends.

Substitui completamente o fluxo legado (`Extensão Chrome -> Google Apps Script -> Planilha Excel`) por uma aplicação nativa de alta performance que se conecta diretamente à API do Salesforce e sincroniza dados com o **Firebase**.

---

## 🚀 Como Iniciar a Aplicação

Caso seja a primeira vez utilizando a aplicação, rode esta sequência no terminal:

```bash
npm install
npm start
```

Para os demais usos, basta executar o atalho ou:

```bash
npm start
```

---

## 🏛 Arquitetura da Solução

- **Framework**: Electron (Main + Preload + Renderer)
- **Linguagem**: 100% JavaScript (Node.js no backend, ES6+ no frontend)
- **Autenticação Salesforce**: OAuth 2.0 PKCE via Connected App oficial `PlatformCLI` (com servidor HTTP nativo do Node.js na porta 1717 e auto-refresh de token transparente).
- **Extração Salesforce**: Analytics Reports API consumindo os relatórios oficiais:
  - **Fila em Aberto**: `00ObL000007gu6bUAA`
  - **Concluídas / Metas**: `00ObL000007gx7hUAA`
- **Armazenamento Firebase**: Integração com Firebase para salvar históricos mensais e configurações de conta (Avatares).
- **Sincronização Periódica**: Auto-refresh em background + botão manual sob demanda.
- **Exportação**: Geração nativa de relatórios em formato **PDF**.
- **Cache Local Instantâneo**: Os dados são persistidos em `data/cached_dashboard.json`, garantindo abertura imediata do app (< 100ms) mesmo sem internet.

---

## 👥 Analistas Mapeados
1. Anderson Almeida
2. Gustavo Chagas
3. Mariane Oliveira
4. Thiago Santos
5. Felipe Wustemberg
6. Heloisa Yamanaka

---

## 📐 Estrutura das Telas (Menus)

1. **Dashboard (Visão Geral do Time)**:
   - Seletor do Mês e dias úteis trabalhados.
   - 4 Cards de KPI: Saldo Geral, Horas Trabalhadas, Previsão Parcial e Em Aberto (Fila).
   - Tabela de Metas por Analista (Carga, Meta, Previsão, Horas Trab, Saldo, Pontos, % Atingido, Status, Capacidade Fila).
   - Progresso do Time visual.
   - Pódio interativo de **Destaques do Mês**.
   
2. **Fila de Tarefas**:
   - Central de Tarefas com busca em tempo real por Assunto, ID ou Analista.
   - Filtros por Concluídas vs Fila, Prioridade e Prazos.
   - Botão direto para abrir a tarefa diretamente no Salesforce.

3. **Ranking**:
   - Submenus divididos em: **Mensal**, **Semanal** e **Diário**.
   - Pódios dinâmicos exibindo as 3 (ou mais) melhores colocações.
   - Sistema de filtros por métrica: **Ranking por Horas**, **Ranking por Pontos** ou **Ranking por Tarefas** (com seletor de prioridade: alta, média, baixa).
   - Exportação do Ranking em **PDF**.

4. **Configurações**:
   - Customização de Interface (Temas).
   - Personalização de **Avatar / Foto de Perfil** do analista, que sincroniza diretamente com o pódio e menus. Pode usar os avatares padrão gerados na hora ou fazer upload customizado.
   - Troca rápida de conta (Switch Account) para permitir multilogin de diferentes analistas na mesma máquina.
