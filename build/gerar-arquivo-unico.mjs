/**
 * GERA O APLICATIVO EM ARQUIVO ÚNICO
 * ==================================
 *
 * Junta HTML, CSS, todos os módulos e os arquivos de configuração num único
 * .html que funciona sem servidor — abrindo direto do disco, anexado num
 * e-mail, ou publicado em qualquer lugar.
 *
 * Serve para duas coisas:
 *   - dar um link de teste sem depender de hospedagem;
 *   - distribuir para um vendedor que não tem acesso à rede interna.
 *
 * Executar:  node build/gerar-arquivo-unico.mjs [saida.html]
 *
 * A versão de arquivo único NÃO lê `config/producao/*.json` (não há pasta para
 * ler), então o placar dela vem do que for lançado no próprio navegador ou do
 * modo demonstração. A versão publicada continua sendo a completa.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomInt } from 'node:crypto';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumentos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const demonstracao = process.argv.includes('--demonstracao');
// Formato de artefato: só o conteúdo. As tags de página são adicionadas na
// publicação, e repeti-las aqui geraria um documento aninhado.
const artefato = process.argv.includes('--artefato');
const saida = argumentos[0]
  ?? join(raiz, 'dist', artefato
    ? 'liga-comercial-artefato.html'
    : demonstracao ? 'liga-comercial-demonstracao.html' : 'liga-comercial.html');

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Mesmo formato de código do aplicativo: XXXX-XXXX-XXXX. */
function gerarToken(grupos = 3) {
  return Array.from({ length: grupos }, () => Array.from({ length: 4 },
    () => ALFABETO[randomInt(ALFABETO.length)]).join('')).join('-');
}

const sha256 = (texto) => createHash('sha256').update(String(texto)).digest('hex');

function ler(caminho) {
  return readFileSync(join(raiz, caminho), 'utf8');
}

function lerJson(caminho, alternativa = null) {
  const completo = join(raiz, caminho);
  return existsSync(completo) ? JSON.parse(readFileSync(completo, 'utf8')) : alternativa;
}

const resultado = await build({
  entryPoints: [join(raiz, 'src', 'app.js')],
  bundle: true,
  format: 'iife',
  globalName: 'LigaComercial',
  target: 'es2022',
  charset: 'utf8',
  write: false,
  legalComments: 'none',
});

const js = resultado.outputFiles[0].text;
const css = ler('assets/css/app.css');
const favicon = ler('assets/icons/favicon.svg');

const dados = {
  config: lerJson('config/app.config.json'),
  equipe: lerJson('config/vendedores.json'),
  acessos: lerJson('config/equipe.json'),
};

// A versão de arquivo único não tem pasta de produção para ler.
if (dados.config?.dataSource?.adapter === 'arquivo') {
  dados.config.dataSource = { adapter: 'pending', options: {} };
}

/**
 * Build de demonstração: gera os acessos, liga os dados fictícios e abre já no
 * painel do gestor.
 *
 * Um link de teste que abre numa tela de entrada vazia não mostra nada do que o
 * aplicativo faz. Aqui ele abre funcionando — com a tarja permanente avisando,
 * em toda tela, que os números são fictícios.
 */
if (demonstracao) {
  // Códigos FIXOS, de propósito: cada build gerava códigos novos, e quem já
  // tinha aberto a versão anterior ficava com um código guardado que deixara
  // de existir. Numa demonstração o código não é segredo — ser estável vale
  // mais.
  const tokenGestor = 'DEMO-GESTOR';
  const tokensDeTeste = {};
  const sellers = (dados.equipe?.vendedores ?? []).map((v, i) => {
    const token = `DEMO-V${String(i + 1).padStart(2, '0')}`;
    tokensDeTeste[v.sellerId] = token;
    return { sellerId: v.sellerId, name: v.name, tokenHash: sha256(token) };
  });

  dados.acessos = { version: 1, manager: { name: 'Gestor', tokenHash: sha256(tokenGestor) }, sellers };
  dados.tokensDeTeste = tokensDeTeste;
  dados.tokenGestor = tokenGestor;
  dados.rotaInicial = `#/gestor/${tokenGestor}`;
  dados.config.dataSource = { adapter: 'demo', options: {} };
  // A origem do build manda sobre o que estiver guardado no navegador. Sem
  // isto, quem clicou uma vez em "Desligar" numa versão anterior reabria o
  // aplicativo em Modo de Espera para sempre, sem pista do porquê.
  dados.forcarOrigem = true;

  console.log(`link do gestor:  #/gestor/${tokenGestor}`);
  const primeiro = Object.entries(tokensDeTeste)[0];
  if (primeiro) console.log(`link de exemplo: #/v/${primeiro[1]}  (${primeiro[0]})`);
}

// No formato de artefato quem manda no <html> é a página hospedeira, e é lá
// que mora o `data-theme` do aplicativo. Sem carimbá-lo, o painel — que é um
// placar escuro por decisão de projeto, não por falta de tema claro — abriria
// no tema de quem estivesse olhando. O CSS já trata os três estados; aqui só
// se declara qual deles este produto usa.
const cabecaDoArtefato = `<title>Liga Comercial</title>
<script>document.documentElement.setAttribute('data-theme', 'dark');<\/script>
<style>
${css}
</style>
<div id="app" role="main">
  <div class="view view-login">
    <div class="login-card">
      <div class="login-logo" aria-hidden="true">\u{1F3C6}</div>
      <h1 class="login-title">Liga Comercial</h1>
      <p class="login-sub">Carregando\u2026</p>
    </div>
  </div>
</div>
<script>window.__LIGA_DADOS__ = ${JSON.stringify(dados)};</script>
<script>
${js}
window.ligaComercial = LigaComercial.startApp(document.getElementById('app'));
</script>
`;

const html = artefato ? cabecaDoArtefato : `<!doctype html>
<html lang="pt-BR" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Liga Comercial</title>
<meta name="description" content="Competição comercial diária por pedidos e faturamento, com resultado individual privado.">
<meta name="theme-color" content="#0b0e14">
<meta name="color-scheme" content="dark light">
<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}">
<style>
${css}
</style>
</head>
<body>
<div id="app" role="main">
  <div class="view view-login">
    <div class="login-card">
      <div class="login-logo" aria-hidden="true">🏆</div>
      <h1 class="login-title">Liga Comercial</h1>
      <p class="login-sub">Carregando…</p>
    </div>
  </div>
</div>
<noscript>
  <div class="view"><div class="card">
    <h1>JavaScript desativado</h1>
    <p>Este aplicativo calcula ranking, ritmo e projeções no próprio navegador. Ative o JavaScript para usá-lo.</p>
  </div></div>
</noscript>
<script>window.__LIGA_DADOS__ = ${JSON.stringify(dados)};</script>
<script>
${js}
window.ligaComercial = LigaComercial.startApp(document.getElementById('app'));
</script>
</body>
</html>
`;

writeFileSync(saida, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`${saida} — ${kb} KB`);
