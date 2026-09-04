/**
 * MONTA A PASTA PUBLICÁVEL DO APLICATIVO
 * ======================================
 *
 * O GitHub Pages publica UMA pasta por repositório, e neste repositório essa
 * pasta já é a da Bússola. A Liga Comercial entra como subpasta dela — o mesmo
 * caminho que o Circuito já usa:
 *
 *   /Dubosa/         Bússola
 *   /Dubosa/treino/  Circuito
 *   /Dubosa/liga/    este aplicativo
 *
 * O que este script monta é o conteúdo de `docs/liga/`.
 *
 * A PRODUÇÃO DO DIA NÃO VEM JUNTO, de propósito. Ela é gravada pelo coletor a
 * cada dez minutos, e todo commit na branch publicada dispara uma reconstrução
 * do site — seriam dezenas por dia, acima do que o Pages aceita, e três
 * aplicativos seriam republicados a cada número novo. Então os arquivos do dia
 * ficam na branch de desenvolvimento e o aplicativo os lê direto de
 * raw.githubusercontent.com, que responde com CORS liberado. Publicar o site e
 * gravar o placar passam a ser duas coisas independentes.
 *
 * Executar:  node build/gerar-site.mjs [pasta-de-saida]
 */
import {
  cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, statSync,
} from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumentos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const saida = resolve(argumentos[0] ?? join(raiz, 'dist', 'site'));

/** Onde o coletor grava os arquivos do dia. */
const BRANCH_DE_DADOS = process.env.BRANCH_DE_DADOS ?? 'claude/sales-competition-app-t0sv4b';
const PASTA_DE_DADOS = `https://raw.githubusercontent.com/dubosa2026/Dubosa/${BRANCH_DE_DADOS}/config/producao`;

/** Tudo que o aplicativo pede ao servidor em tempo de execução. */
const ARQUIVOS = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'assets',
  'src',
];

const CONFIGURACOES = [
  'config/app.config.json',
  'config/vendedores.json',
  'config/equipe.json',
];

rmSync(saida, { recursive: true, force: true });
mkdirSync(saida, { recursive: true });

for (const item of ARQUIVOS) {
  const origem = join(raiz, item);
  if (!existsSync(origem)) throw new Error(`falta ${item}`);
  cpSync(origem, join(saida, item), { recursive: true });
}

mkdirSync(join(saida, 'config'), { recursive: true });
for (const item of CONFIGURACOES) {
  const origem = join(raiz, item);
  if (!existsSync(origem)) throw new Error(`falta ${item} — sem ele ninguém entra`);
  cpSync(origem, join(saida, item));
}

// A origem dos dados do site publicado não é a mesma do repositório de trabalho.
const config = JSON.parse(readFileSync(join(saida, 'config/app.config.json'), 'utf8'));
config.dataSource = { adapter: 'arquivo', options: { pasta: PASTA_DE_DADOS } };
writeFileSync(join(saida, 'config/app.config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');

// O service worker não tem mais lista de arquivos para pré-carregar — ele
// guarda o que for pedido, conforme for pedido. O que resta conferir é que os
// poucos caminhos citados nele existem de fato.
let sw = readFileSync(join(saida, 'sw.js'), 'utf8');
const casca = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]).filter(Boolean);
const faltando = casca.filter((c) => !existsSync(join(saida, c)));
if (faltando.length) throw new Error(`o service worker pede arquivos que não foram copiados: ${faltando.join(', ')}`);

/**
 * Resumo do conteúdo publicado.
 *
 * É o que faz uma correção chegar ao aparelho de quem já usa o aplicativo. A
 * casca é servida do cache primeiro — rápida, e funciona sem rede —, e o nome
 * do cache era fixo: enquanto ele não mudasse, o navegador continuava servindo
 * os arquivos antigos, e publicar não adiantava nada para quem já tinha
 * aberto uma vez. Agora qualquer byte diferente muda o nome, o service worker
 * reinstala e o cache velho é apagado.
 */
function impressaoDigital(dir) {
  const arquivos = [];
  (function varrer(atual) {
    for (const nome of readdirSync(atual).sort()) {
      const completo = join(atual, nome);
      if (statSync(completo).isDirectory()) varrer(completo);
      else arquivos.push(completo);
    }
  }(dir));
  const soma = createHash('sha256');
  for (const arquivo of arquivos) {
    soma.update(relative(dir, arquivo).replace(/\\/g, '/'));
    soma.update(readFileSync(arquivo));
  }
  return soma.digest('hex').slice(0, 12);
}

const versao = impressaoDigital(saida);
if (!sw.includes('@@VERSAO@@')) throw new Error('o service worker perdeu o marcador de versão');
sw = sw.replaceAll('@@VERSAO@@', versao);
writeFileSync(join(saida, 'sw.js'), sw, 'utf8');

// A versão também aparece dentro do aplicativo: sem isso, "atualizou?" só se
// responde por adivinhação.
const indice = readFileSync(join(saida, 'index.html'), 'utf8')
  .replace('</head>', `  <meta name="liga-versao" content="${versao}">\n</head>`);
writeFileSync(join(saida, 'index.html'), indice, 'utf8');

console.log(`${saida}`);
console.log(`  versão ${versao}`);
console.log(`  ${casca.length} caminho(s) citado(s) pelo service worker, todos presentes`);
console.log(`  produção lida de: ${PASTA_DE_DADOS}/AAAA-MM-DD.json`);
