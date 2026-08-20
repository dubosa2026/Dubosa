/* ==================================================================
   Leitura e escrita de valor -- fonte unica das duas paginas.

   Este arquivo entra tanto no app do gestor quanto na pagina do
   vendedor. A razao de existir e um erro real: havia duas leituras de
   numero diferentes no projeto, e a do roteiro apagava TODOS os pontos
   de "958627.0100000000". O ponto decimal sumia junto com os
   separadores de milhar, o resultado passava de 2^53 e a tela mostrava
   R$ 9.586.270.100.000.000 no lugar de R$ 958.627.

   Regra da casa: nenhum outro arquivo le nem formata numero por conta
   propria. Se faltar alguma conversao, ela nasce aqui.
   ================================================================== */

/* Numero vindo da planilha, em qualquer um dos formatos que o BI produz:
   numero puro (14776416.8864), texto com ponto decimal ("958627.01"),
   texto brasileiro ("958.627,01") ou ja formatado ("R$ 1.234,56").

   O ponto so e separador de milhar quando ha uma virgula na mesma string.
   Devolve NaN quando nao ha numero -- quem chama decide o que fazer. */
function paraNumero(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  var s = String(v === null || v === undefined ? '' : v).replace(/[R$\s ]/g, '');
  if (!s) return NaN;
  if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.indexOf(',') > -1) s = s.replace(',', '.');
  var n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

/* Dinheiro para a TELA, sem centavos: numa carteira que passa do milhao,
   centavo e ruido. Devolve null quando nao ha valor, para quem chama poder
   omitir a linha em vez de mostrar R$ 0. */
function moeda(v) {
  var n = paraNumero(v);
  if (isNaN(n) || n <= 0) return null;
  return n.toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0
  });
}

/* Contagem para a TELA: "1.040", nao "1040.0". */
function inteiro(v) {
  var n = paraNumero(v);
  if (isNaN(n) || n <= 0) return null;
  return Math.round(n).toLocaleString('pt-BR');
}

/* Colunas de dinheiro sao reconhecidas pelo nome, porque o rotulo muda de
   uma exportacao para outra. */
var RE_DINHEIRO = /valor|faturad|pre[cç]o|receita|ticket/i;

/* Um valor como ele deve sair no ARQUIVO. Diferente da tela:
   - dinheiro sai com virgula decimal e duas casas ("14776416,89"), que e o
     que o Excel em portugues le como numero, e e o mesmo valor da base sem
     o ruido de ponto flutuante;
   - inteiro sai inteiro, sem ".0" pendurado;
   - texto sai exatamente como veio. Nada e reescrito. */
function valorExport(coluna, valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') {
    if (!isFinite(valor)) return '';
    if (RE_DINHEIRO.test(coluna)) return valor.toFixed(2).replace('.', ',');
    if (valor === Math.round(valor)) return String(valor);
    return String(valor).replace('.', ',');
  }
  return String(valor);
}

function aspasCsv(v) {
  return '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
}

/* CSV com ponto e virgula e BOM: e assim que o Excel em portugues abre sem
   perguntar nada e sem trocar os acentos. */
function toCSV(linhas, colunas) {
  var saida = [colunas.map(aspasCsv).join(';')];
  linhas.forEach(function (r) {
    saida.push(colunas.map(function (c) {
      return aspasCsv(valorExport(c, r[c]));
    }).join(';'));
  });
  return '﻿' + saida.join('\r\n');
}

/* TSV para colar direto numa planilha ja aberta. Tab e quebra de linha
   dentro do valor viram espaco, senao a colagem sai desalinhada. */
function toTSV(linhas, colunas) {
  var saida = [colunas.join('\t')];
  linhas.forEach(function (r) {
    saida.push(colunas.map(function (c) {
      return valorExport(c, r[c]).replace(/[\t\r\n]+/g, ' ');
    }).join('\t'));
  });
  return saida.join('\n');
}

/* Nome de arquivo que passa em Windows, Mac e Linux. */
function safeName(s) {
  var limpo = String(s === null || s === undefined ? '' : s)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return limpo || 'sem-nome';
}

function download(blob, nome) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
}

/* ---------- zip ----------
   Sem compressao (metodo "store"). Basta para juntar CSVs e evita depender
   de biblioteca externa: o app precisa continuar abrindo offline, num
   arquivo so. */
function crc32(bytes) {
  var tabela = crc32.tabela;
  if (!tabela) {
    tabela = crc32.tabela = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      tabela[n] = c;
    }
  }
  var crc = -1;
  for (var i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ tabela[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

function buildZip(entries) {
  var enc = new TextEncoder();
  var partes = [], central = [], deslocamento = 0;

  entries.forEach(function (e) {
    var nome = enc.encode(e.name);
    var dados = enc.encode(e.content);
    var crc = crc32(dados);

    var local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);       // versao necessaria
    local.setUint16(6, 0x0800, true);   // nome em UTF-8
    local.setUint16(8, 0, true);        // metodo: store
    local.setUint16(10, 0, true);       // hora
    local.setUint16(12, 0, true);       // data
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);       // sem campo extra
    partes.push(new Uint8Array(local.buffer), nome, dados);

    var cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);          // versao de quem criou
    cd.setUint16(6, 20, true);          // versao necessaria
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, dados.length, true);
    cd.setUint32(24, dados.length, true);
    cd.setUint16(28, nome.length, true);
    cd.setUint16(30, 0, true);
    cd.setUint16(32, 0, true);
    cd.setUint16(34, 0, true);
    cd.setUint16(36, 0, true);
    cd.setUint32(38, 0, true);
    cd.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(cd.buffer), nome);

    deslocamento += 30 + nome.length + dados.length;
  });

  var tamCentral = central.reduce(function (a, p) { return a + p.length; }, 0);
  var fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(4, 0, true);
  fim.setUint16(6, 0, true);
  fim.setUint16(8, entries.length, true);
  fim.setUint16(10, entries.length, true);
  fim.setUint32(12, tamCentral, true);
  fim.setUint32(16, deslocamento, true);
  fim.setUint16(20, 0, true);

  return new Blob(partes.concat(central, [new Uint8Array(fim.buffer)]),
                  { type: 'application/zip' });
}
