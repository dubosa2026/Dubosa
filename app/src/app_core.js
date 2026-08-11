/* ==================================================================
   NUCLEO — leitura de arquivos, regras de distribuicao e exportacao.
   Tudo roda no navegador: nenhum dado sai da maquina do usuario.
   ================================================================== */

/* ---------- utilitarios de texto ---------- */

function norm(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function findCol(headers, target) {
  var t = target.toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].toLowerCase() === t) return headers[i];
  }
  return null;
}

function fmtInt(n) {
  return (n || 0).toLocaleString('pt-BR');
}

function fmtMoney(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0
  });
}

/* Converte "1.234,56" / "1234.56" / 1234.56 em Number. */
function toNumber(v) {
  if (typeof v === 'number') return v;
  var s = norm(v);
  if (!s) return 0;
  s = s.replace(/[R$\s]/g, '');
  if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.indexOf(',') > -1) s = s.replace(',', '.');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/* ---------- ZIP: leitura (xlsx) ---------- */

async function unzip(buffer) {
  var view = new DataView(buffer);
  var bytes = new Uint8Array(buffer);

  // localiza o End of Central Directory
  var eocd = -1;
  for (var i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Arquivo .xlsx invalido: nao encontrei o indice do ZIP.');

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

    // cabecalho local: o tamanho dos campos extras pode diferir do central
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
    if (f.method !== 8) throw new Error('Compressao ZIP nao suportada neste arquivo.');
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
  // Excel conta dias desde 1899-12-30 (com o bug do ano 1900 ja embutido)
  var ms = Math.round((serial - 25569) * 86400 * 1000);
  var d = new Date(ms);
  if (isNaN(d.getTime())) return serial;
  var dd = String(d.getUTCDate()).padStart(2, '0');
  var mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return dd + '/' + mm + '/' + d.getUTCFullYear();
}

/* Alguns exportadores escrevem as tags com prefixo de namespace
   (<x:row>, <x:c>, <x:t>) em vez das tags simples (<row>, <c>, <t>).
   getElementsByTagName compara o nome com prefixo e nao acha nada nesses
   arquivos; buscar pelo nome local resolve os dois formatos de uma vez. */
function els(node, nome) {
  return node.getElementsByTagNameNS('*', nome);
}

async function parseXlsx(buffer) {
  var zip = await unzip(buffer);

  // strings compartilhadas
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

  // estilos -> quais indices sao data
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

  // primeira planilha
  var sheetNames = zip.names.filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); });
  sheetNames.sort(function (a, b) {
    return parseInt(a.match(/(\d+)/)[1], 10) - parseInt(b.match(/(\d+)/)[1], 10);
  });
  if (!sheetNames.length) throw new Error('Nao encontrei nenhuma planilha dentro do arquivo.');
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

/* ---------- matriz -> {headers, records} ---------- */

function toTable(matrix) {
  if (!matrix.length) return { headers: [], records: [] };
  var headers = matrix[0].map(norm);
  // descarta colunas sem titulo no fim
  while (headers.length && headers[headers.length - 1] === '') headers.pop();

  var records = [];
  for (var i = 1; i < matrix.length; i++) {
    var rec = {};
    var empty = true;
    for (var j = 0; j < headers.length; j++) {
      if (!headers[j]) continue;
      var v = matrix[i][j];
      rec[headers[j]] = v === undefined ? '' : v;
      if (norm(v) !== '') empty = false;
    }
    if (!empty) records.push(rec);
  }
  return { headers: headers.filter(function (h) { return h !== ''; }), records: records };
}

/* ---------- REGRAS DE DISTRIBUICAO ---------- */

var ROTULO_ATIVO_30 = 'Ativo 30 dias';
var MARCADORES_TODAS_UF = ['TODAS', 'TODOS', 'NACIONAL', 'BR', 'BRASIL'];

/* Regra fixa: a equipe so prospecta a Regiao Norte. Cliente de qualquer
   outra UF nunca e redistribuido — permanece com quem ja o atende. */
var REGIAO_NORTE = ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'];

function ehNorte(uf) { return REGIAO_NORTE.indexOf(uf) > -1; }

/* Identidade estavel do cliente entre uma base e outra:
   codigo CLI-xxxx > CNPJ/CPF (so digitos) > nome normalizado. */
function clientKey(row, headers) {
  var colInteg = findCol(headers, 'Integrador (CLI - Nome)') || findCol(headers, 'Integrador');
  if (colInteg) {
    var m = String(row[colInteg] || '').match(/CLI[-\s]?0*(\d+)/i);
    if (m) return 'CLI' + m[1];
  }
  var colDoc = findCol(headers, 'CNPJ') || findCol(headers, 'CNPJ/CPF') ||
               findCol(headers, 'CPF') || findCol(headers, 'CNPJ-CPF');
  if (colDoc) {
    var digits = String(row[colDoc] || '').replace(/\D/g, '');
    if (digits.length >= 11) return 'DOC' + digits;
  }
  if (colInteg) return 'NOME' + norm(row[colInteg]).toUpperCase();
  return null;
}

/* Cada exportacao do BI usa um vocabulario proprio de categoria:
     base por atividade  -> "Ativo 30 dias" / "Ativo 60 dias" / "Inativo"
     base do mes         -> "Comprador neste Mes" / "Comprador Habitual" /
                            "Sem Compras este Mes"
   O que interessa nas duas e a mesma pergunta: esse cliente ja comprou
   recentemente? Quem ja comprou nao e alvo de prospeccao. */
function ehJaComprou(row, colCategoria) {
  var c = norm(row[colCategoria]).toLowerCase();
  return c.indexOf('ativo 30 dias') > -1 || c.indexOf('comprador') > -1;
}

/* Mesma regra, aplicada a um rotulo solto -- usada para pre-marcar as
   caixinhas de categoria na tela. */
function categoriaProspectavel(nome) {
  var c = norm(nome).toLowerCase();
  return !!c && c.indexOf('ativo 30 dias') === -1 && c.indexOf('comprador') === -1;
}

/* Categorias presentes na base, com a contagem de cada uma. */
function categoriasDaBase(records, colCategoria) {
  if (!colCategoria) return [];
  var contagem = {};
  records.forEach(function (row) {
    var c = norm(row[colCategoria]);
    if (c) contagem[c] = (contagem[c] || 0) + 1;
  });
  return Object.keys(contagem)
    .map(function (nome) { return { nome: nome, qtde: contagem[nome] }; })
    .sort(function (a, b) { return b.qtde - a.qtde; });
}

/* UFs do Norte presentes na base, com a contagem de cada uma. */
function ufsDaBase(records, colUf) {
  if (!colUf) return [];
  var contagem = {};
  records.forEach(function (row) {
    var u = norm(row[colUf]).toUpperCase();
    if (ehNorte(u)) contagem[u] = (contagem[u] || 0) + 1;
  });
  return REGIAO_NORTE
    .filter(function (uf) { return contagem[uf]; })
    .map(function (uf) { return { uf: uf, qtde: contagem[uf] }; });
}

/* As exportacoes trazem no fim uma linha com o texto dos filtros aplicados
   ("Filtros aplicados: Gerente e ... / Estados e ..."). Nao e cliente. */
function ehLinhaDeRodape(row, headers, colUf, colCategoria) {
  if (headers.some(function (h) { return /^filtros aplicados/i.test(norm(row[h])); })) return true;

  // Linha de totais ou separador em branco: nao tem UF, nem categoria, nem
  // nome de cliente. A checagem do nome importa -- um cliente de verdade a
  // quem falta a UF precisa continuar aparecendo como "sem UF", que e um
  // problema de cadastro para corrigir, nao lixo para descartar.
  if (norm(row[colUf]) || norm(row[colCategoria])) return false;
  var colInteg = findCol(headers, 'Integrador (CLI - Nome)') || findCol(headers, 'Integrador');
  return colInteg ? !norm(row[colInteg]) : true;
}

function ehMarcadorTodasUf(ufRaw, ufsMapeadas) {
  if (MARCADORES_TODAS_UF.indexOf(ufRaw) > -1) return true;
  var partes = ufRaw.split(/[\/,;+]/).map(function (p) { return p.trim(); }).filter(Boolean);
  if (partes.length <= 1) return false;
  return ufsMapeadas.every(function (uf) { return partes.indexOf(uf) > -1; });
}

function chaveOrdenacao(row, headers) {
  return headers.map(function (h) { return norm(row[h]).toLowerCase(); }).join('|');
}

/* Rodizio: mesma quantidade por vendedor, diferenca maxima de 1.
   Com um unico vendedor na lista, tudo vai para ele. */
function dividirRodizio(linhas, vendedores, headers) {
  if (!linhas.length || !vendedores.length) return [];
  var ordenados = linhas.slice().sort(function (a, b) {
    var ca = chaveOrdenacao(a, headers), cb = chaveOrdenacao(b, headers);
    return ca < cb ? -1 : (ca > cb ? 1 : 0);
  });
  var vends = vendedores.slice().sort();
  return ordenados.map(function (row, i) {
    var copy = Object.assign({}, row);
    copy.__vendedor = vends[i % vends.length];
    return copy;
  });
}

function distribuir(records, headers, equipe, opts) {
  opts = opts || {};
  var colCategoria = findCol(headers, 'Categoria');
  var colUf = findCol(headers, 'UF');
  var colValor = findCol(headers, 'Valor Faturado');
  var colGerente = findCol(headers, 'Gerente');
  var colVendedorBase = findCol(headers, 'Vendedor');

  if (!colUf) throw new Error('Nao encontrei a coluna "UF" na base. Colunas lidas: ' + headers.join(', '));
  if (!colCategoria) throw new Error('Nao encontrei a coluna "Categoria" na base. Colunas lidas: ' + headers.join(', '));

  var gerenteAlvo = norm(opts.gerente || '').toUpperCase();
  var modo = opts.modo || 'normal';
  var ataque = norm(opts.ataque || '').toUpperCase();

  // Modo mutirao: o filtro e por categoria e por estado, escolhidos na tela.
  // Sem escolha explicita, vale o padrao (fora quem ja comprou) e todo o Norte.
  var catsAceitas = null;
  if (modo === 'mutirao' && opts.categorias && opts.categorias.length) {
    catsAceitas = {};
    opts.categorias.forEach(function (c) { catsAceitas[norm(c).toLowerCase()] = true; });
  }
  var ufsAceitas = null;
  if (modo === 'mutirao' && opts.ufs && opts.ufs.length) {
    ufsAceitas = {};
    opts.ufs.forEach(function (u) { ufsAceitas[norm(u).toUpperCase()] = true; });
  }

  var porUf = {};
  equipe.forEach(function (v) {
    if (!v.vendedor || !ehNorte(v.uf)) return;   // so a Regiao Norte entra
    if (!porUf[v.uf]) porUf[v.uf] = [];
    porUf[v.uf].push(v.vendedor);
  });
  var ufsMapeadas = Object.keys(porUf);
  var todosVendedores = equipe
    .filter(function (v) { return v.vendedor && ehNorte(v.uf); })
    .map(function (v) { return v.vendedor; });

  var excluidos = [], semUf = [], foraNorte = [], outraGerencia = [],
      semVendedor = [], retidoAtaque = [], foraDoFiltro = [], rodape = [],
      grupos = {}, todasUf = [], mutirao = [];

  records.forEach(function (row) {
    // 0) rodape com o texto dos filtros da exportacao -- nao e cliente
    if (ehLinhaDeRodape(row, headers, colUf, colCategoria)) { rodape.push(row); return; }

    // 1) quem ja comprou recentemente nao e alvo de prospeccao
    if (catsAceitas) {
      if (!catsAceitas[norm(row[colCategoria]).toLowerCase()]) { excluidos.push(row); return; }
    } else if (ehJaComprou(row, colCategoria)) {
      excluidos.push(row); return;
    }

    var uf = norm(row[colUf]).toUpperCase();

    // 2) sem UF -> nao da para rotear
    if (!uf) { semUf.push(row); return; }

    // 3) conta nacional marcada explicitamente
    if (modo !== 'mutirao' && ehMarcadorTodasUf(uf, ufsMapeadas)) { todasUf.push(row); return; }

    // 4) fora da Regiao Norte -> nunca redistribui, fica com quem ja atende
    if (!ehNorte(uf)) { foraNorte.push(row); return; }

    // 5) carteira de outra gerencia -> nao mexe
    if (gerenteAlvo && colGerente && norm(row[colGerente]).toUpperCase() !== gerenteAlvo) {
      outraGerencia.push(row); return;
    }

    // 6) mutirao: os estados escolhidos vao para um bolo unico, repartido
    //    entre a equipe inteira -- inclusive quem nao atende aquela UF
    if (modo === 'mutirao') {
      if (ufsAceitas && !ufsAceitas[uf]) { foraDoFiltro.push(row); return; }
      mutirao.push(row);
      return;
    }

    // 7) rodada de ataque: as demais UFs do Norte ficam retidas
    if (modo === 'ataque' && ataque && uf !== ataque) { retidoAtaque.push(row); return; }

    // 8) UF do Norte sem nenhum vendedor cadastrado
    if (!porUf[uf]) { semVendedor.push(row); return; }

    if (!grupos[uf]) grupos[uf] = [];
    grupos[uf].push(row);
  });

  var atribuidos = [];
  if (mutirao.length) atribuidos = atribuidos.concat(dividirRodizio(mutirao, todosVendedores, headers));
  if (todasUf.length) atribuidos = atribuidos.concat(dividirRodizio(todasUf, todosVendedores, headers));
  Object.keys(grupos).forEach(function (uf) {
    // no ataque com a equipe toda, todos os vendedores entram no rateio da UF
    var time = (modo === 'ataque' && uf === ataque && opts.equipeToda) ? todosVendedores : porUf[uf];
    atribuidos = atribuidos.concat(dividirRodizio(grupos[uf], time, headers));
  });

  var contagem = {}, valores = {};
  equipe.forEach(function (v) { contagem[v.vendedor] = 0; valores[v.vendedor] = 0; });
  atribuidos.forEach(function (row) {
    contagem[row.__vendedor] = (contagem[row.__vendedor] || 0) + 1;
    valores[row.__vendedor] = (valores[row.__vendedor] || 0) + (colValor ? toNumber(row[colValor]) : 0);
  });

  var porVendedor = {};
  atribuidos.forEach(function (row) {
    (porVendedor[row.__vendedor] = porVendedor[row.__vendedor] || []).push(row);
  });

  var resumo = equipe.filter(function (v) { return v.vendedor && ehNorte(v.uf); }).map(function (v) {
    return {
      vendedor: v.vendedor,
      uf: v.uf,
      email: v.email,
      qtde: contagem[v.vendedor] || 0,
      valor: valores[v.vendedor] || 0,
      linhas: porVendedor[v.vendedor] || []
    };
  });

  return {
    headers: headers,
    colValor: colValor, colCategoria: colCategoria, colUf: colUf,
    colVendedorBase: colVendedorBase, colGerente: colGerente,
    atribuidos: atribuidos,
    excluidos: excluidos,
    semUf: semUf,
    foraNorte: foraNorte,
    outraGerencia: outraGerencia,
    semVendedor: semVendedor,
    retidoAtaque: retidoAtaque,
    foraDoFiltro: foraDoFiltro,
    rodape: rodape,
    resumo: resumo,
    modo: modo,
    ataque: ataque,
    ufsMutirao: opts.ufs || [],
    categoriasMutirao: opts.categorias || [],
    totalLido: records.length
  };
}

/* ---------- FUNIL: aproveitamento entre uma rodada e a seguinte ---------- */

/* Fotografia da rodada: quem ficou com cada cliente e em que situacao ele
   estava. E o que permite, na base seguinte, saber quem conseguiu ativar. */
function montarSnapshot(result, records, headers) {
  var byKey = {};
  result.atribuidos.forEach(function (row) {
    var k = clientKey(row, headers);
    if (!k) return;
    byKey[k] = {
      v: row.__vendedor,
      uf: norm(row[result.colUf]).toUpperCase(),
      cat: norm(row[result.colCategoria]),
      val: result.colValor ? toNumber(row[result.colValor]) : 0
    };
  });
  return {
    ts: Date.now(),
    modo: result.modo || 'normal',
    total: Object.keys(byKey).length,
    byKey: byKey
  };
}

/* Compara a base atual com a fotografia da rodada anterior. Um cliente que
   estava com o vendedor X e nao era "Ativo 30 dias", e que agora aparece
   como "Ativo 30 dias", conta como conversao de X. */
function analisarFunil(records, headers, result, snapshot) {
  if (!snapshot || !snapshot.byKey) return null;

  // Rodada normal e mutirao saem de bases diferentes, com vocabulario de
  // categoria diferente. Comparar uma com a outra daria um numero sem
  // significado, entao aqui a comparacao para e explica o porque.
  var modoAtual = result.modo || 'normal';
  var modoAnterior = snapshot.modo || 'normal';
  var comparaveis = (modoAtual === 'mutirao') === (modoAnterior === 'mutirao');
  if (!comparaveis) {
    return { incompativel: true, modoAnterior: modoAnterior, modoAtual: modoAtual, desde: snapshot.ts };
  }

  var atual = {};
  records.forEach(function (row) {
    var k = clientKey(row, headers);
    if (k) atual[k] = row;
  });

  var porVendedor = {}, porUf = {};
  var convertidos = [], perdidosDeVista = 0, aindaAbertos = 0;

  function slotV(nome) {
    if (!porVendedor[nome]) porVendedor[nome] = { vendedor: nome, carteira: 0, conversoes: 0, valor: 0, uf: '', clientes: [] };
    return porVendedor[nome];
  }
  function slotU(uf) {
    if (!porUf[uf]) porUf[uf] = { uf: uf, carteira: 0, conversoes: 0, valor: 0 };
    return porUf[uf];
  }

  Object.keys(snapshot.byKey).forEach(function (k) {
    var antes = snapshot.byKey[k];
    var sv = slotV(antes.v), su = slotU(antes.uf);
    sv.uf = antes.uf;
    sv.carteira++; su.carteira++;

    var row = atual[k];
    if (!row) { perdidosDeVista++; return; }   // cliente sumiu da base nova

    if (ehJaComprou(row, result.colCategoria)) {
      var valor = result.colValor ? toNumber(row[result.colValor]) : 0;
      sv.conversoes++; sv.valor += valor;
      su.conversoes++; su.valor += valor;
      sv.clientes.push(row);
      convertidos.push(Object.assign({ __vendedorAnterior: antes.v, __categoriaAnterior: antes.cat }, row));
    } else {
      aindaAbertos++;
    }
  });

  function taxa(o) { return o.carteira ? o.conversoes / o.carteira : 0; }

  var vendedores = Object.keys(porVendedor).map(function (n) {
    var o = porVendedor[n]; o.taxa = taxa(o); return o;
  }).sort(function (a, b) { return b.taxa - a.taxa || b.conversoes - a.conversoes; });

  var ufs = Object.keys(porUf).map(function (u) {
    var o = porUf[u]; o.taxa = taxa(o); return o;
  }).sort(function (a, b) { return b.taxa - a.taxa; });

  var totalCarteira = vendedores.reduce(function (a, v) { return a + v.carteira; }, 0);
  var totalConv = vendedores.reduce(function (a, v) { return a + v.conversoes; }, 0);
  var totalValor = vendedores.reduce(function (a, v) { return a + v.valor; }, 0);

  return {
    desde: snapshot.ts,
    vendedores: vendedores,
    ufs: ufs,
    convertidos: convertidos,
    totalCarteira: totalCarteira,
    totalConversoes: totalConv,
    totalValor: totalValor,
    taxaGeral: totalCarteira ? totalConv / totalCarteira : 0,
    perdidosDeVista: perdidosDeVista,
    aindaAbertos: aindaAbertos
  };
}

/* ---------- EXPORTACAO ---------- */

function cellOut(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

/* TSV: cola direto no Google Sheets / Excel sem passar por download. */
function toTSV(rows, headers) {
  var out = [headers.join('\t')];
  rows.forEach(function (r) {
    out.push(headers.map(function (h) {
      return cellOut(r[h]).replace(/[\t\n\r]/g, ' ');
    }).join('\t'));
  });
  return out.join('\n');
}

/* CSV com ; e BOM — o Excel em pt-BR abre com as colunas separadas. */
function toCSV(rows, headers) {
  function esc(v) {
    var s = cellOut(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  var out = [headers.map(esc).join(';')];
  rows.forEach(function (r) {
    out.push(headers.map(function (h) { return esc(r[h]); }).join(';'));
  });
  return '﻿' + out.join('\r\n');
}

/* ---------- ZIP: escrita (metodo STORE, sem compressao) ---------- */

var CRC_TABLE = (function () {
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(entries) {
  var enc = new TextEncoder();
  var parts = [], central = [], offset = 0;

  entries.forEach(function (e) {
    var nameBytes = enc.encode(e.name);
    var data = enc.encode(e.content);
    var crc = crc32(data);

    var local = new Uint8Array(30 + nameBytes.length);
    var lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);      // nomes em UTF-8
    lv.setUint16(8, 0, true);           // sem compressao
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    parts.push(local, data);

    var cd = new Uint8Array(46 + nameBytes.length);
    var cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + data.length;
  });

  var centralSize = central.reduce(function (a, b) { return a + b.length; }, 0);
  var end = new Uint8Array(22);
  var ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
}

function download(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
}

function safeName(s) {
  return String(s).replace(/[\\/*?:"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

/* ---------- ANALISES: leitura dos numeros + acao sugerida ---------- */

function pct(x) { return (x * 100).toFixed(1).replace('.', ',') + '%'; }

function gerarInsights(result, funil) {
  var out = [];
  if (funil && funil.incompativel) funil = null;   // rodadas nao comparaveis
  var colVal = result.colValor, colCat = result.colCategoria, colUf = result.colUf;
  var colInteg = findCol(result.headers, 'Integrador (CLI - Nome)') || findCol(result.headers, 'Integrador');
  var colCidade = findCol(result.headers, 'Cidade');

  function add(nivel, titulo, texto, acao, extra) {
    out.push(Object.assign({ nivel: nivel, titulo: titulo, texto: texto, acao: acao }, extra || {}));
  }

  /* --- 1. resultado do periodo (so com rodada anterior salva) --- */
  if (funil && funil.totalCarteira) {
    add(funil.taxaGeral >= 0.12 ? 'bom' : (funil.taxaGeral >= 0.06 ? 'neutro' : 'ruim'),
      'Aproveitamento do período: ' + pct(funil.taxaGeral),
      fmtInt(funil.totalConversoes) + ' de ' + fmtInt(funil.totalCarteira) +
      ' clientes trabalhados voltaram a comprar, somando ' + fmtMoney(funil.totalValor) +
      ' em faturamento reativado. Outros ' + fmtInt(funil.aindaAbertos) + ' seguem em aberto.',
      funil.taxaGeral < 0.06
        ? 'Taxa baixa. Antes de distribuir de novo, cobre da equipe o registro do contato: carteira grande com pouca conversão costuma ser falta de tentativa, não falta de cliente.'
        : 'Use os convertidos como prova social na abordagem dos que seguem parados — mesma região, mesmo perfil.');
  }

  if (funil && funil.vendedores.length >= 3) {
    var elegiveis = funil.vendedores.filter(function (v) { return v.carteira >= 15; });

    /* --- 2. destaque --- */
    if (elegiveis.length) {
      var top = elegiveis[0];
      add('bom', 'Destaque: ' + top.vendedor,
        'Converteu ' + fmtInt(top.conversoes) + ' de ' + fmtInt(top.carteira) +
        ' clientes (' + pct(top.taxa) + ') em ' + top.uf + ', trazendo ' + fmtMoney(top.valor) + '.',
        'Peça para ' + top.vendedor.split(' ')[0] + ' descrever a abordagem numa reunião de 15 min. O que funciona em ' +
        top.uf + ' costuma funcionar nas outras UFs do Norte.');
    }

    /* --- 3. quem precisa de apoio --- */
    var travados = elegiveis.filter(function (v) { return v.conversoes === 0; });
    if (travados.length) {
      add('ruim', fmtInt(travados.length) + (travados.length === 1 ? ' vendedor sem nenhuma conversão' : ' vendedores sem nenhuma conversão'),
        travados.map(function (v) { return v.vendedor + ' (' + v.carteira + ' clientes, ' + v.uf + ')'; }).join(' · ') +
        '. Carteira cheia e nenhum cliente reativado no período.',
        'Acompanhe uma ligação de cada um ainda esta semana. Se a carteira estiver sendo trabalhada e mesmo assim não converte, o problema é abordagem ou preço — não volume.');
    } else if (elegiveis.length >= 4) {
      var ultimo = elegiveis[elegiveis.length - 1];
      var media = funil.taxaGeral;
      if (ultimo.taxa < media * 0.5) {
        add('neutro', 'Abaixo da média: ' + ultimo.vendedor,
          'Converteu ' + pct(ultimo.taxa) + ' contra ' + pct(media) + ' da equipe, com ' + fmtInt(ultimo.carteira) + ' clientes em ' + ultimo.uf + '.',
          'Vale uma dupla com ' + elegiveis[0].vendedor.split(' ')[0] + ' por alguns dias.');
      }
    }

    /* --- 4. leitura regional --- */
    var ufsOk = funil.ufs.filter(function (u) { return u.carteira >= 20; });
    if (ufsOk.length >= 2) {
      var melhor = ufsOk[0], pior = ufsOk[ufsOk.length - 1];
      if (melhor.taxa > pior.taxa * 1.5) {
        add('neutro', 'Diferença regional: ' + melhor.uf + ' converte ' + pct(melhor.taxa) + ', ' + pior.uf + ' só ' + pct(pior.taxa),
          melhor.uf + ' reativou ' + fmtInt(melhor.conversoes) + ' de ' + fmtInt(melhor.carteira) + ' e ' +
          pior.uf + ' apenas ' + fmtInt(pior.conversoes) + ' de ' + fmtInt(pior.carteira) + '.',
          'Programe uma rodada de ataque em ' + pior.uf + ': a base está lá, o resultado não. Na etapa 2, ative o modo ataque e concentre a equipe nesse estado.',
          { ufSugerida: pior.uf });
      }
    }
  }

  /* --- 5. dinheiro parado: onde estao os inativos de maior valor --- */
  if (colVal) {
    var comValor = result.atribuidos
      .filter(function (r) { return toNumber(r[colVal]) > 0; })
      .sort(function (a, b) { return toNumber(b[colVal]) - toNumber(a[colVal]); });

    if (comValor.length >= 10) {
      var top10 = comValor.slice(0, 10);
      var somaTop = top10.reduce(function (a, r) { return a + toNumber(r[colVal]); }, 0);
      var somaTudo = comValor.reduce(function (a, r) { return a + toNumber(r[colVal]); }, 0);
      add('neutro', 'Os 10 maiores clientes parados valem ' + fmtMoney(somaTop),
        'Representam ' + pct(somaTop / somaTudo) + ' de todo o faturamento histórico da carteira distribuída nesta rodada. ' +
        'O maior deles: ' + norm(top10[0][colInteg] || '').slice(0, 46) +
        (colCidade ? ' (' + norm(top10[0][colCidade]) + '/' + norm(top10[0][colUf]) + ')' : '') + '.',
        'Trate esses 10 como carteira nominal: contato do próprio gestor nas primeiras 48 horas, não fila normal do vendedor.',
        { lista: top10 });
    }
  }

  /* --- 6. onde ha mais volume parado por vendedor --- */
  var porUfAtual = {};
  result.atribuidos.forEach(function (r) {
    var u = norm(r[colUf]).toUpperCase();
    if (!porUfAtual[u]) porUfAtual[u] = { uf: u, qtde: 0, valor: 0, vends: {} };
    porUfAtual[u].qtde++;
    porUfAtual[u].valor += colVal ? toNumber(r[colVal]) : 0;
    porUfAtual[u].vends[r.__vendedor] = 1;
  });
  var carga = Object.keys(porUfAtual).map(function (u) {
    var o = porUfAtual[u];
    o.porVendedor = o.qtde / Math.max(1, Object.keys(o.vends).length);
    return o;
  }).sort(function (a, b) { return b.porVendedor - a.porVendedor; });

  if (carga.length >= 2 && result.modo !== 'mutirao') {
    var pesada = carga[0], leve = carga[carga.length - 1];
    if (pesada.porVendedor > leve.porVendedor * 1.6) {
      add('neutro', 'Carga desigual: ' + Math.round(pesada.porVendedor) + ' clientes por vendedor em ' + pesada.uf +
        ' contra ' + Math.round(leve.porVendedor) + ' em ' + leve.uf,
        pesada.uf + ' tem ' + fmtInt(pesada.qtde) + ' clientes para ' + Object.keys(pesada.vends).length +
        ' vendedores; ' + leve.uf + ' tem ' + fmtInt(leve.qtde) + ' para ' + Object.keys(leve.vends).length + '.',
        'Considere mover um vendedor de ' + leve.uf + ' para ' + pesada.uf + ' na aba Equipe — ou aceitar que ' +
        pesada.uf + ' terá ciclo de contato mais longo e cobrar meta proporcional.');
    }
  }

  /* --- 7. sugestao de qual estado atacar --- */
  if (carga.length && result.modo !== 'mutirao') {
    var alvo = carga.slice().sort(function (a, b) { return b.valor - a.valor; })[0];
    add('neutro', 'Se for atacar um estado agora, ataque ' + alvo.uf,
      alvo.uf + ' concentra ' + fmtInt(alvo.qtde) + ' clientes parados somando ' + fmtMoney(alvo.valor) +
      ' de histórico — o maior potencial de reativação da rodada.',
      'Na etapa 2, marque "Ataque a um estado" em ' + alvo.uf + ' com a equipe toda: cada vendedor recebe uma fatia menor e consegue ligar para todos em poucos dias.',
      { ufSugerida: alvo.uf });
  }

  /* --- 8. higiene da base --- */
  if (result.semUf.length) {
    add('ruim', fmtInt(result.semUf.length) + ' clientes sem UF preenchida',
      'Sem o estado não dá para rotear, então ficaram de fora da distribuição.',
      'Peça ao BI para preencher a UF na origem — cada linha aqui é um cliente que ninguém vai trabalhar.');
  }
  if (result.semVendedor.length) {
    var ufsSem = {};
    result.semVendedor.forEach(function (r) { ufsSem[norm(r[colUf]).toUpperCase()] = 1; });
    add('ruim', 'UF do Norte sem vendedor: ' + Object.keys(ufsSem).join(', '),
      fmtInt(result.semVendedor.length) + ' clientes do Norte não têm ninguém cadastrado para atendê-los.',
      'Cadastre um vendedor para ' + Object.keys(ufsSem).join(' e ') + ' na etapa 2, ou esses clientes ficam sem dono.');
  }

  return out;
}
