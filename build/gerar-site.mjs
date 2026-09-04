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
  cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// O service worker guarda a casca por caminho relativo; conferir aqui evita
// descobrir um arquivo faltando só quando o aplicativo abrir offline.
const sw = readFileSync(join(saida, 'sw.js'), 'utf8');
const casca = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]).filter(Boolean);
const faltando = casca.filter((c) => !existsSync(join(saida, c)));
if (faltando.length) throw new Error(`o service worker pede arquivos que não foram copiados: ${faltando.join(', ')}`);

console.log(`${saida}`);
console.log(`  ${casca.length} arquivos na casca offline, todos presentes`);
console.log(`  produção lida de: ${PASTA_DE_DADOS}/AAAA-MM-DD.json`);
