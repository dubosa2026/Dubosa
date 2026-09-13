/* ==================================================================
   LEITOR DE PLANILHA — .xlsx (zip) e texto delimitado (CSV/TSV/colar).

   So roda no navegador (usa DOMParser, DecompressionStream, FileReader).
   O motor de pontuacao (motor.js) nao depende disto: ele so recebe a
   matriz {cabecalhos, linhas} ja pronta, de onde quer que ela venha.

   A leitura de .xlsx (unzip + XML das celulas) e adaptada da mesma
   logica ja usada e testada em app/src/app_core.js — nao inventa
   parsing novo para um problema ja resolvido no repositorio.
   Tudo roda na memoria do navegador: nenhum arquivo sai da maquina.
   ================================================================== */

(function (global) {
  'use strict';

  function norm(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\s+/g, ' ').trim();
  }

  /* ---------- ZIP: leitura (xlsx) ---------- */

  async function unzip(buffer) {
    var view = new DataView(buffer);
    var bytes = new Uint8Array(buffer);

    var eocd = -1;
    for (var i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Arquivo .xlsx inválido: não encontrei o índice do ZIP.');

    var count = view.getUint16(eocd + 10, true);
    var dirOffset = view.getUint32(eocd + 16, true);
    var files = {};
    var p = dirOffset;

    for (var n = 0; n < count; n++) {
      if (view.getUint32(p, true) !== 0x02014b50) break;
      var method = view.getUint16(p + 10, true);
      var compSize = view.getUint32(p + 20, true);
      var nameLen = view.getUint16(p + 28, true);
      var extraLen = view.getUint16(p + 30, true);
      var commentLen = view.getUint16(p + 32, true);
      var localOffset = view.getUint32(p + 42, true);
      var name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));

      var lNameLen = view.getUint16(localOffset + 26, true);
      var lExtraLen = view.getUint16(localOffset + 28, true);
      var dataStart = localOffset + 30 + lNameLen + lExtraLen;
      var raw = bytes.subarray(dataStart, dataStart + compSize);

      files[name] = { method: method, raw: raw };
      p += 46 + nameLen + extraLen + commentLen;
    }

    async function read(name) {
      var f = files[name];
      if (!f) return null;
      if (f.method === 0) return new TextDecoder().decode(f.raw);
      if (f.method !== 8) throw new Error('Compressão ZIP não suportada neste arquivo.');
      var ds = new DecompressionStream('deflate-raw');
      var stream = new Blob([f.raw]).stream().pipeThrough(ds);
      return await new Response(stream).text();
    }

    return { names: Object.keys(files), read: read };
  }

  /* ---------- XLSX -> matriz de celulas ---------- */

  function colIndex(ref) {
    var letters = ref.replace(/[0-9]/g, '');
    var n = 0;
    for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }

  var DATE_FMT_IDS = [14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47];

  function serialToDate(serial) {
    var ms = Math.round((serial - 25569) * 86400 * 1000);
    var d = new Date(ms);
    if (isNaN(d.getTime())) return serial;
    var dd = String(d.getUTCDate()).padStart(2, '0');
    var mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + d.getUTCFullYear();
  }

  function els(node, nome) {
    return node.getElementsByTagNameNS('*', nome);
  }

  async function parseXlsx(buffer) {
    var zip = await unzip(buffer);

    var shared = [];
    var ssXml = await zip.read('xl/sharedStrings.xml');
    if (ssXml) {
      var doc = new DOMParser().parseFromString(ssXml, 'application/xml');
      var sis = els(doc, 'si');
      for (var i = 0; i < sis.length; i++) {
        var ts = els(sis[i], 't');
        var s = '';
        for (var j = 0; j < ts.length; j++) s += ts[j].textContent;
        shared.push(s);
      }
    }

    var dateStyles = {};
    var stXml = await zip.read('xl/styles.xml');
    if (stXml) {
      var sdoc = new DOMParser().parseFromString(stXml, 'application/xml');
      var custom = {};
      var nfs = els(sdoc, 'numFmt');
      for (var k = 0; k < nfs.length; k++) {
        var id = parseInt(nfs[k].getAttribute('numFmtId'), 10);
        var codeStr = nfs[k].getAttribute('formatCode') || '';
        if (/[dmyhs]/i.test(codeStr.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, ''))) custom[id] = true;
      }
      var xfsParent = els(sdoc, 'cellXfs')[0];
      if (xfsParent) {
        var xfs = els(xfsParent, 'xf');
        for (var x = 0; x < xfs.length; x++) {
          var fid = parseInt(xfs[x].getAttribute('numFmtId') || '0', 10);
          if (DATE_FMT_IDS.indexOf(fid) > -1 || custom[fid]) dateStyles[x] = true;
        }
      }
    }

    var sheetNames = zip.names.filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); });
    sheetNames.sort(function (a, b) {
      return parseInt(a.match(/(\d+)/)[1], 10) - parseInt(b.match(/(\d+)/)[1], 10);
    });
    if (!sheetNames.length) throw new Error('Não encontrei nenhuma planilha dentro do arquivo.');
    var shXml = await zip.read(sheetNames[0]);
    var sdocSheet = new DOMParser().parseFromString(shXml, 'application/xml');

    var rows = [];
    var rowEls = els(sdocSheet, 'row');
    for (var r = 0; r < rowEls.length; r++) {
      var cells = els(rowEls[r], 'c');
      var out = [];
      for (var c = 0; c < cells.length; c++) {
        var cell = cells[c];
        var ref = cell.getAttribute('r') || '';
        var idx = ref ? colIndex(ref) : out.length;
        var type = cell.getAttribute('t');
        var styleIdx = parseInt(cell.getAttribute('s') || '-1', 10);
        var value = '';

        if (type === 'inlineStr') {
          var its = els(cell, 't');
          for (var y = 0; y < its.length; y++) value += its[y].textContent;
        } else {
          var vEl = els(cell, 'v')[0];
          var raw = vEl ? vEl.textContent : '';
          if (type === 's') value = shared[parseInt(raw, 10)] || '';
          else if (type === 'b') value = raw === '1' ? 'VERDADEIRO' : 'FALSO';
          else if (raw === '') value = '';
          else if (dateStyles[styleIdx] && raw !== '' && !isNaN(Number(raw))) value = serialToDate(Number(raw));
          else value = isNaN(Number(raw)) ? raw : Number(raw);
        }
        while (out.length < idx) out.push('');
        out[idx] = value;
      }
      rows.push(out);
    }
    return rows;
  }

  /* ---------- CSV / TSV colado ---------- */

  function detectDelimiter(text) {
    var line = text.split(/\r?\n/)[0] || '';
    if (line.indexOf('\t') > -1) return '\t';
    var semi = (line.match(/;/g) || []).length;
    var comma = (line.match(/,/g) || []).length;
    return semi >= comma ? ';' : ',';
  }

  function parseDelimited(text, delim) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        row.push(field); field = '';
      } else if (ch === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) {
      return r.some(function (c) { return norm(c) !== ''; });
    });
  }

  /* ---------- matriz -> {cabecalhos, linhas} ---------- */

  function matrizParaTabela(matrix) {
    if (!matrix.length) return { cabecalhos: [], linhas: [] };
    var cabecalhos = matrix[0].map(norm);
    while (cabecalhos.length && cabecalhos[cabecalhos.length - 1] === '') cabecalhos.pop();

    var linhas = [];
    for (var i = 1; i < matrix.length; i++) {
      var linha = matrix[i].slice(0, cabecalhos.length);
      while (linha.length < cabecalhos.length) linha.push('');
      var vazia = linha.every(function (v) { return norm(v) === ''; });
      if (!vazia) linhas.push(linha);
    }
    return { cabecalhos: cabecalhos, linhas: linhas };
  }

  function textoParaTabela(texto) {
    var delim = detectDelimiter(texto);
    return matrizParaTabela(parseDelimited(texto, delim));
  }

  function pareceZip(bytes) {
    return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  }

  async function lerArquivo(file) {
    var buffer = await file.arrayBuffer();
    var bytes = new Uint8Array(buffer);
    var nomeXlsx = /\.xlsx?$|\.xlsm$/i.test(file.name);

    if (nomeXlsx || pareceZip(bytes)) {
      var matriz = await parseXlsx(buffer);
      return matrizParaTabela(matriz);
    }
    var texto = new TextDecoder('utf-8').decode(buffer).replace(/^﻿/, '');
    return textoParaTabela(texto);
  }

  global.LeitorIC = {
    lerArquivo: lerArquivo,
    textoParaTabela: textoParaTabela
  };
})(typeof window !== 'undefined' ? window : globalThis);
