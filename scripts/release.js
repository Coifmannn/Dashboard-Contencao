// Gera o instalador e publica no repositório de releases (clonado ao lado deste projeto).
// Uso: npm run release
// Variável opcional: RELEASES_DIR=caminho do clone do repositório de releases
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const releasesDir = path.resolve(process.env.RELEASES_DIR || path.join(root, '..', 'DashContencao-releases'));
const distDir = path.join(root, 'dist');
const installer = `Painel-Contencao-Setup-${pkg.version}.exe`;

const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });
const out = (cmd, cwd = root) => execSync(cmd, { cwd, encoding: 'utf-8' }).trim();

if (!fs.existsSync(path.join(releasesDir, '.git'))) {
  console.error(`Repositório de releases não encontrado em: ${releasesDir}\n` +
    'Clone-o ao lado deste projeto (ou defina RELEASES_DIR) e rode novamente.');
  process.exit(1);
}

console.log(`> Gerando versão ${pkg.version}...`);
run('npm run dist');

const exe = path.join(distDir, installer);
const yml = path.join(distDir, 'latest.yml');
if (!fs.existsSync(exe) || !fs.existsSync(yml)) {
  console.error(`Arquivos não encontrados em dist/ (${installer} e latest.yml).`);
  process.exit(1);
}

// Mantém só a versão atual na pasta
for (const f of fs.readdirSync(releasesDir)) {
  if (/^Painel-Contencao-Setup-.*\.exe$/.test(f) || f === 'latest.yml') fs.unlinkSync(path.join(releasesDir, f));
}
fs.copyFileSync(exe, path.join(releasesDir, installer));
fs.copyFileSync(yml, path.join(releasesDir, 'latest.yml'));

run('git add -A', releasesDir);
const hasCommits = (() => { try { out('git rev-parse HEAD', releasesDir); return true; } catch (_) { return false; } })();
const msg = `release ${pkg.version}`;
if (hasCommits) {
  // Reescreve o último commit para o histórico não acumular um .exe por versão
  run(`git commit --amend -m "${msg}"`, releasesDir);
  run('git push --force-with-lease', releasesDir);
} else {
  run(`git commit -m "${msg}"`, releasesDir);
  run('git push -u origin HEAD', releasesDir);
}

console.log(`\nPublicado ${pkg.version}. Agora rode "git pull" na pasta do repositório de releases no servidor.`);
