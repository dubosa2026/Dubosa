/* ==================================================================
   INTERFACE — liga o nucleo aos controles da tela.
   ================================================================== */

var EQUIPE_PADRAO = [
  ['ALISSON DOS SANTOS RIBEIRO', 'AC'], ['ELANDIA CAMARGO RODRIGUES', 'AC'],
  ['ITALO CERQUEIA DOS SANTOS', 'AM'], ['MATHEUS SOUZA DE BARROS', 'AM'],
  ['DIEGO ADAN OHNUMA ANGELI', 'AP'],
  ['GIOVANNA DO CARMO FUJIMOTO', 'PA'], ['MUNARI ANGELA MARIANO', 'PA'],
  ['PAULO ROBERTO DA SILVA FILHO', 'PA'], ['RAYANE ALMEIDA DOS SANTOS', 'PA'],
  ['CRISTIANE LUIS DOS SANTOS', 'RO'], ['GLEICY KELLY TOPPAN DE OLIVEIRA', 'RO'],
  ['MARIA ELISABETE TONON', 'RO'], ['RAFAEL VANDERLEI LOPES', 'RO'],
  ['ROSYRENE DE MEDEIROS CELESTINO', 'RO'], ['VICTOR VINICIUS RENNO', 'RO'],
  ['LEONARDO COSTA OLIVEIRA', 'RR'],
  ['ERICA OLIVEIRA', 'TO'], ['LUCAS DOS REIS BERNARDES DA SILVEIRA', 'TO'],
  ['MARIA PAULA BERTAGLIA NESTOR', 'TO'], ['MURILO BEDANI ROGERIO', 'TO'],
  ['NILTON RENATO VICENTE JUNIOR', 'TO'], ['RICARDO CARNIATO RODRIGUES', 'TO']
].map(function (v) { return { vendedor: v[0], uf: v[1], email: '' }; });

var STORE_KEY = 'belenergy-equipe-v2';
var SNAP_KEY = 'belenergy-rodada-anterior-v1';
var GERENTE_PADRAO = 'EDUARDO LUIZ DOS SANTOS';

var state = {
  headers: [], records: [], equipe: [], result: null, origem: '',
  funil: null, insights: []
};

var $ = function (id) { return document.getElementById(id); };

/* ---------- toast ---------- */
var toastTimer = null;
function toast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
}

/* ---------- navegacao entre etapas ---------- */
var STEPS = [['s1', 'p1'], ['s2', 'p2'], ['s3', 'p3'], ['s4', 'p4']];
function goStep(i) {
  STEPS.forEach(function (s, k) {
    $(s[0]).setAttribute('aria-selected', k === i ? 'true' : 'false');
    $(s[1]).hidden = k !== i;
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
STEPS.forEach(function (s, i) {
  $(s[0]).addEventListener('click', function () { if (!$(s[0]).disabled) goStep(i); });
});

/* ---------- equipe ---------- */
function loadEquipe() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch (e) { /* armazenamento indisponivel */ }
  return EQUIPE_PADRAO.map(function (v) { return Object.assign({}, v); });
}
function saveEquipe() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.equipe)); } catch (e) { /* idem */ }
}

function renderEquipe() {
  var body = $('equipeBody');
  body.innerHTML = '';
  state.equipe.forEach(function (v, i) {
    var tr = document.createElement('tr');

    var td1 = document.createElement('td');
    var i1 = document.createElement('input');
    i1.value = v.vendedor; i1.placeholder = 'Nome do vendedor';
    i1.setAttribute('aria-label', 'Nome do vendedor');
    i1.addEventListener('input', function () { state.equipe[i].vendedor = i1.value; saveEquipe(); });
    td1.appendChild(i1);

    var td2 = document.createElement('td');
    var i2 = document.createElement('input');
    i2.value = v.uf; i2.className = 'uf'; i2.maxLength = 12; i2.placeholder = 'UF';
    i2.setAttribute('aria-label', 'UF de atuação');
    i2.addEventListener('input', function () {
      state.equipe[i].uf = i2.value.toUpperCase(); saveEquipe();
    });
    td2.appendChild(i2);

    var td3 = document.createElement('td');
    var i3 = document.createElement('input');
    i3.value = v.email; i3.type = 'email'; i3.placeholder = 'opcional';
    i3.setAttribute('aria-label', 'E-mail do vendedor');
    i3.addEventListener('input', function () { state.equipe[i].email = i3.value; saveEquipe(); });
    td3.appendChild(i3);

    var td4 = document.createElement('td');
    var rm = document.createElement('button');
    rm.className = 'rm'; rm.innerHTML = '&times;';
    rm.title = 'Remover ' + (v.vendedor || 'linha');
    rm.setAttribute('aria-label', 'Remover ' + (v.vendedor || 'linha'));
    rm.addEventListener('click', function () {
      state.equipe.splice(i, 1); saveEquipe(); renderEquipe();
    });
    td4.appendChild(rm);

    tr.append(td1, td2, td3, td4);
    body.appendChild(tr);
  });
  $('equipeCount').textContent = state.equipe.filter(function (v) { return v.vendedor.trim(); }).length;
}

$('addVend').addEventListener('click', function () {
  state.equipe.push({ vendedor: '', uf: '', email: '' });
  saveEquipe(); renderEquipe();
  var inputs = $('equipeBody').querySelectorAll('input');
  if (inputs.length) inputs[inputs.length - 3].focus();
});
/* Copia a equipe no formato da aba "Vendedores" do Google Sheets, para quem
   usa a versao Apps Script nao precisar redigitar nome, UF e e-mail. */
$('copyEquipe').addEventListener('click', function () {
  var linhas = state.equipe
    .filter(function (v) { return norm(v.vendedor); })
    .map(function (v) {
      return { Vendedor: norm(v.vendedor), UF: norm(v.uf).toUpperCase(), Email: norm(v.email) };
    });
  if (!linhas.length) { toast('Nenhum vendedor para copiar'); return; }
  copyText(toTSV(linhas, ['Vendedor', 'UF', 'Email']), $('copyEquipe'), null);
});

$('resetVend').addEventListener('click', function () {
  state.equipe = EQUIPE_PADRAO.map(function (v) { return Object.assign({}, v); });
  saveEquipe(); renderEquipe();
  toast('Equipe restaurada (' + EQUIPE_PADRAO.length + ' vendedores)');
});

/* ---------- carregar base ---------- */
function afterLoad(matrix, origem) {
  var t = toTable(matrix);
  if (!t.headers.length || !t.records.length) {
    showBaseError('Não consegui ler nenhuma linha. Confira se a primeira linha é o cabeçalho.');
    return;
  }
  state.headers = t.headers;
  state.records = t.records;
  state.origem = origem;

  var colUf = findCol(t.headers, 'UF');
  var colCat = findCol(t.headers, 'Categoria');

  $('status').textContent = fmtInt(t.records.length) + ' linhas carregadas';
  $('status').setAttribute('data-on', '1');
  $('s1').setAttribute('data-done', '1');

  var chips = t.headers.map(function (h) {
    var key = (h === colUf || h === colCat) ? ' data-key="1"' : '';
    return '<span class="chip"' + key + '>' + escapeHtml(h) + '</span>';
  }).join('');

  var missing = [];
  if (!colUf) missing.push('UF');
  if (!colCat) missing.push('Categoria');

  var warn = '';
  if (missing.length) {
    warn = '<div class="alert">Não encontrei ' +
      missing.map(function (m) { return '<strong>' + m + '</strong>'; }).join(' e ') +
      ' entre as colunas. Renomeie o cabeçalho na origem e carregue de novo — ' +
      'sem essas duas colunas não dá para decidir o estado nem o filtro de atividade.</div>';
  }

  $('baseInfo').innerHTML =
    '<div class="panel" style="margin-top:22px;">' +
      '<div class="panel-head"><h3>' + escapeHtml(origem) + '</h3>' +
      '<span class="count-pill">' + fmtInt(t.records.length) + ' linhas &middot; ' + t.headers.length + ' colunas</span></div>' +
      warn +
      '<p class="kicker">Colunas identificadas</p>' +
      '<div class="chips">' + chips + '</div>' +
      '<div class="btn-row" style="margin-top:20px;">' +
        '<button class="btn btn-primary" id="toEquipe"' + (missing.length ? ' disabled' : '') + '>Continuar para a equipe</button>' +
      '</div>' +
    '</div>';

  renderFiltrosCarteira();   // a base nova muda os estados e as categorias
  var next = $('toEquipe');
  if (next) next.addEventListener('click', function () { goStep(1); });
  if (!missing.length) toast(fmtInt(t.records.length) + ' linhas carregadas');
}

function showBaseError(msg) {
  $('baseInfo').innerHTML = '<div class="alert" style="margin-top:22px;">' + escapeHtml(msg) + '</div>';
  $('status').textContent = 'nenhuma base carregada';
  $('status').removeAttribute('data-on');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

async function handleFile(file) {
  try {
    if (/\.xlsx$/i.test(file.name)) {
      var buf = await file.arrayBuffer();
      afterLoad(await parseXlsx(buf), file.name);
    } else {
      var text = await file.text();
      afterLoad(parseDelimited(text, detectDelimiter(text)), file.name);
    }
  } catch (err) {
    showBaseError('Não consegui abrir "' + file.name + '": ' + err.message +
      ' — se for um .xls antigo, salve como .xlsx ou copie e cole os dados.');
  }
}

$('pick').addEventListener('click', function () { $('file').click(); });
$('file').addEventListener('change', function (e) {
  if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
});

var drop = $('drop');
['dragenter', 'dragover'].forEach(function (ev) {
  drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
});
['dragleave', 'drop'].forEach(function (ev) {
  drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
});
drop.addEventListener('drop', function (e) {
  if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

$('usePaste').addEventListener('click', function () {
  var text = $('paste').value;
  if (!norm(text)) { toast('Cole os dados no campo primeiro'); return; }
  try {
    afterLoad(parseDelimited(text, detectDelimiter(text)), 'dados colados');
  } catch (err) {
    showBaseError('Não consegui interpretar os dados colados: ' + err.message);
  }
});

/* ---------- exemplo para conhecer o app ---------- */
$('demo').addEventListener('click', function () {
  var ufs = ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO', 'SP', 'BA', ''];
  var cats = ['Inativo', 'Sem Compras', 'Ativo 30 dias', 'Ativo 60 dias'];
  var cidades = ['RIO BRANCO', 'MANAUS', 'MACAPA', 'BELEM', 'PORTO VELHO', 'BOA VISTA', 'PALMAS', 'SAO PAULO', 'SALVADOR'];
  var linhas = [['UF', 'Cidade', 'Integrador', 'CNPJ', 'Telefone', 'E-mail', 'Categoria', 'Última Nota', 'Vendedor', 'Gerente', 'Qtde. Pedidos', 'Valor Faturado']];
  for (var i = 1; i <= 420; i++) {
    var uf = ufs[i % ufs.length];
    linhas.push([
      uf, cidades[i % cidades.length], 'INTEGRADOR SOLAR ' + String(i).padStart(3, '0') + ' LTDA',
      String(10000000000000 + i * 7717), '(00)9' + String(1000000 + i * 13).slice(0, 7),
      'contato' + i + '@exemplo.com.br', cats[i % cats.length],
      '0' + ((i % 9) + 1) + '/07/2026', 'EQUIPE BI', 'GERENTE COMERCIAL',
      (i % 40) + 1, ((i * 977) % 90000) + 1200
    ]);
  }
  afterLoad(linhas, 'exemplo (420 linhas ficticias)');
});

/* ---------- configuracao da rodada ---------- */
function modoAtual() {
  return document.querySelector('input[name="modo"]:checked').value;
}

document.querySelectorAll('input[name="modo"]').forEach(function (r) {
  r.addEventListener('change', function () {
    var m = modoAtual();
    $('ataqueBox').hidden = m !== 'ataque';
    $('carteiraBox').hidden = m !== 'carteira';
    $('run').textContent = m === 'carteira' ? 'Gerar lista por vendedor' : 'Distribuir carteira';
    if (m === 'carteira') renderFiltrosCarteira();
  });
});

/* Monta as caixinhas de estado e de categoria a partir da base carregada:
   os rotulos mudam de uma exportacao para outra, entao nada aqui e fixo. */
function renderFiltrosCarteira() {
  var alvoUf = $('ufFiltro'), alvoCat = $('catFiltro');

  if (!state.records.length) {
    alvoUf.innerHTML = alvoCat.innerHTML =
      '<span class="pick-empty">Carregue a base na etapa 1 para escolher.</span>';
    return;
  }

  var colUf = findCol(state.headers, 'UF');
  var colCat = findCol(state.headers, 'Categoria');

  var ufs = ufsDaBase(state.records, colUf);   // Brasil inteiro: nada e redistribuido
  alvoUf.innerHTML = ufs.length
    ? ufs.map(function (u) {
        return '<label><input type="checkbox" data-uf="' + escapeHtml(u.uf) + '" checked>' +
          '<span>' + escapeHtml(u.uf) + '</span><span class="n">' + fmtInt(u.qtde) + '</span></label>';
      }).join('')
    : '<span class="pick-empty">Nenhum estado encontrado nesta base.</span>';

  var cats = categoriasDaBase(state.records, colCat);
  alvoCat.innerHTML = cats.length
    ? cats.map(function (c) {
        var marcada = categoriaProspectavel(c.nome) ? ' checked' : '';
        return '<label><input type="checkbox" data-cat="' + escapeHtml(c.nome) + '"' + marcada + '>' +
          '<span>' + escapeHtml(c.nome) + '</span><span class="n">' + fmtInt(c.qtde) + '</span></label>';
      }).join('')
    : '<span class="pick-empty">Nenhuma categoria encontrada nesta base.</span>';
}

function marcados(container, attr) {
  return Array.prototype.slice
    .call($(container).querySelectorAll('input[' + attr + ']:checked'))
    .map(function (i) { return i.getAttribute(attr); });
}

function opcoesRodada() {
  var modo = modoAtual();
  return {
    modo: modo,
    gerente: $('gerente').value,
    ataque: modo === 'ataque' ? $('ataqueUf').value : '',
    equipeToda: $('equipeToda').checked,
    ufs: modo === 'carteira' ? marcados('ufFiltro', 'data-uf') : [],
    categorias: modo === 'carteira' ? marcados('catFiltro', 'data-cat') : []
  };
}

/* ---------- referencia da rodada anterior ---------- */
function lerSnapshot() {
  try {
    var raw = localStorage.getItem(SNAP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function salvarSnapshot(snap) {
  try { localStorage.setItem(SNAP_KEY, JSON.stringify(snap)); } catch (e) { /* sem espaco */ }
}

/* ---------- distribuir ---------- */
$('run').addEventListener('click', function () {
  var equipe = state.equipe
    .map(function (v) {
      return { vendedor: norm(v.vendedor), uf: norm(v.uf).toUpperCase(), email: norm(v.email) };
    })
    .filter(function (v) { return v.vendedor && v.uf; });

  if (!equipe.length) { toast('Cadastre ao menos um vendedor com UF'); return; }
  if (!state.records.length) { toast('Carregue a base na etapa 1'); goStep(0); return; }

  try {
    var opts = opcoesRodada();
    if (opts.modo === 'carteira') {
      if (!opts.ufs.length) { toast('Escolha ao menos um estado'); return; }
      if (!opts.categorias.length) { toast('Escolha ao menos uma categoria para distribuir'); return; }
    }
    var anterior = lerSnapshot();

    state.result = distribuir(state.records, state.headers, equipe, opts);

    // A assinatura precisa existir antes da comparacao: e ela que denuncia
    // que o arquivo carregado e o mesmo da rodada anterior.
    var snapAtual = montarSnapshot(state.result, state.records, state.headers);
    state.result.assinaturaAtual = snapAtual.assinatura;

    // compara a base nova com a fotografia da rodada anterior ANTES de sobrescrever
    state.funil = analisarFunil(state.records, state.headers, state.result, anterior);
    state.insights = gerarInsights(state.result, state.funil);

    if (rodadaHistoriavel(state.funil)) {
      gravarHistorico(novaEntradaHistorico(state.funil, state.result, state.origem));
    }

    salvarSnapshot(snapAtual);

    $('s2').setAttribute('data-done', '1');
    $('s3').disabled = false;
    $('s4').disabled = false;
    renderResultado();
    renderDesempenho();
    $('publicarSaida').innerHTML = '';
    ajustarPainelPublicar();
    goStep(2);
  } catch (err) {
    toast(err.message);
  }
});

/* ---------- resultado ---------- */
function renderResultado() {
  var r = state.result;

  var ehCarteira = r.modo === 'carteira';

  $('resTitulo').textContent = ehCarteira
    ? 'Clientes sem compras no mês'
    : 'Carteira distribuída';

  $('resSub').innerHTML = ehCarteira
    ? 'Base de <strong>' + fmtInt(r.totalLido) + '</strong> linhas &mdash; ' +
      escapeHtml(state.origem) + '. Estados: <strong>' + escapeHtml(r.ufsFiltro.join(', ')) +
      '</strong>. Nada foi redistribuído: cada cliente está na lista de quem já o atende, ' +
      'para você avisar o vendedor de que há um cliente esperando contato.'
    : 'Base de <strong>' + fmtInt(r.totalLido) + '</strong> linhas &mdash; ' +
      escapeHtml(state.origem) + '. Cada rodada recalcula a divisão do zero.' +
      (r.modo === 'ataque' && r.ataque
        ? ' <strong style="color:var(--y)">Rodada de ataque em ' + escapeHtml(r.ataque) + '.</strong>'
        : '');

  var retidos = r.semUf.length + r.semVendedor.length + r.retidoAtaque.length +
                r.outraGerencia.length + r.foraDoFiltro.length + r.semDono.length;
  $('stats').innerHTML = ehCarteira
    ? stat('go', r.atribuidos.length, 'clientes a cobrar') +
      stat('out', r.excluidos.length, 'já compraram') +
      stat('hold', r.resumo.length, 'vendedores a avisar') +
      stat('hold', retidos, 'fora do filtro')
    : stat('go', r.atribuidos.length, 'distribuídos') +
      stat('out', r.excluidos.length, 'ativos 30 dias') +
      stat('hold', r.foraNorte.length, 'fora do Norte') +
      stat('hold', retidos, 'retidos');

  document.body.classList.toggle('sem-valor', !r.colValor);

  var maxQt = Math.max.apply(null, r.resumo.map(function (v) { return v.qtde; }).concat([1]));
  var list = $('vendList');
  list.innerHTML = '';

  var foraDoCadastro = r.resumo.filter(function (v) { return v.naEquipe === false; });
  var avisoEquipe = $('avisoEquipe');
  if (foraDoCadastro.length) {
    avisoEquipe.hidden = false;
    avisoEquipe.innerHTML =
      '<strong>' + fmtInt(foraDoCadastro.length) +
      (foraDoCadastro.length === 1 ? ' vendedor aparece' : ' vendedores aparecem') +
      ' na base mas não estão na equipe da etapa 2:</strong> ' +
      foraDoCadastro.map(function (v) {
        return escapeHtml(v.vendedor) +
          (v.sugestaoNome ? ' (grafia parecida com <em>' + escapeHtml(v.sugestaoNome) + '</em>)' : '');
      }).join(' · ') +
      '. A lista deles foi gerada assim mesmo, mas sem e-mail cadastrado. ' +
      'Se for a mesma pessoa com o nome escrito de outro jeito, acerte a grafia na etapa 2.';
  } else {
    avisoEquipe.hidden = true;
    avisoEquipe.innerHTML = '';
  }

  r.resumo.slice().sort(function (a, b) {
    return a.uf === b.uf ? b.qtde - a.qtde : (a.uf < b.uf ? -1 : 1);
  }).forEach(function (v) {
    var row = document.createElement('div');
    row.className = 'vrow';
    row.innerHTML =
      '<span class="vuf"' +
        (v.ufsAtendidas && v.ufsAtendidas.length > 1
          ? ' title="' + escapeHtml(v.ufsAtendidas.join(', ')) + '"' : '') +
        '>' + escapeHtml(v.uf) +
        (v.ufsAtendidas && v.ufsAtendidas.length > 1 ? '+' + (v.ufsAtendidas.length - 1) : '') +
      '</span>' +
      '<span><span class="vname">' + escapeHtml(v.vendedor) + '</span>' +
        (v.naEquipe === false
          ? '<br><span class="vmail" data-alerta="1">fora do cadastro da etapa 2' +
            (v.sugestaoNome ? ' &mdash; lá consta ' + escapeHtml(v.sugestaoNome) : '') + '</span>'
          : (v.email ? '<br><span class="vmail">' + escapeHtml(v.email) + '</span>' : '')) + '</span>' +
      '<span class="vbar h-bar"><i style="width:' + Math.round(v.qtde / maxQt * 100) + '%"></i></span>' +
      '<span class="vqt">' + fmtInt(v.qtde) + '</span>' +
      '<span class="vval h-val">' + fmtMoney(v.valor) + '</span>';

    var actions = document.createElement('span');
    actions.className = 'btn-row';

    var bCopy = document.createElement('button');
    bCopy.className = 'btn btn-sm';
    bCopy.textContent = 'Copiar';
    bCopy.disabled = !v.qtde;
    bCopy.addEventListener('click', function () {
      copyText(toTSV(v.linhas, r.headers), bCopy, v.vendedor);
    });

    var bCsv = document.createElement('button');
    bCsv.className = 'btn btn-sm btn-ghost';
    bCsv.textContent = 'CSV';
    bCsv.disabled = !v.qtde;
    bCsv.addEventListener('click', function () {
      download(new Blob([toCSV(v.linhas, r.headers)], { type: 'text/csv;charset=utf-8' }),
        safeName(v.uf + ' - ' + v.vendedor) + '.csv');
    });

    actions.append(bCopy, bCsv);
    row.appendChild(actions);
    list.appendChild(row);
  });

  renderBuckets();
}

function stat(t, n, label) {
  return '<div class="stat" data-t="' + t + '"><b>' + fmtInt(n) + '</b><span>' + label + '</span></div>';
}

function renderBuckets() {
  var r = state.result;
  var defs = [
    [r.modo === 'carteira' ? 'Fora do filtro de categoria' : 'Excluídos &mdash; ativos nos últimos 30 dias',
     r.excluidos,
     r.modo === 'carteira'
       ? 'Categorias que você deixou desmarcadas na etapa 2 — nesta base, quem já comprou.'
       : 'Compraram há pouco: não entram na distribuição.'],
    ['Estados fora do filtro', r.foraDoFiltro,
     'Clientes em estados que você não marcou nesta rodada.'],
    ['Sem vendedor na base', r.semDono,
     'A coluna Vendedor está vazia nessas linhas, então não há a quem avisar. Corrija na origem.'],
    ['Rodapé da exportação &mdash; descartado', r.rodape,
     'Linha com o texto dos filtros aplicados, que o BI escreve no fim do arquivo. Não é cliente.'],
    ['Fora do Norte &mdash; mantidos com o vendedor atual', r.foraNorte,
     'Regra fixa: a equipe só prospecta AC, AM, AP, PA, RO, RR e TO. ' +
     'Estes clientes continuam na carteira de quem já os atende — a coluna Vendedor mostra com quem.'],
    ['Sem UF &mdash; não foi possível rotear', r.semUf,
     'A coluna UF está vazia nessas linhas. Complete na origem e rode de novo.'],
    ['UF do Norte sem vendedor cadastrado', r.semVendedor,
     'Clientes do Norte que não têm ninguém responsável na etapa 2.'],
    ['Retidos pela rodada de ataque', r.retidoAtaque,
     'Outras UFs do Norte, guardadas para a próxima rodada normal.'],
    ['Carteira de outra gerência', r.outraGerencia,
     'Gerente diferente do configurado na etapa 2: não são tocados.']
  ].filter(function (d) { return d[1].length; });

  var wrap = $('buckets');
  wrap.innerHTML = '';

  defs.forEach(function (d, i) {
    var det = document.createElement('details');
    var rows = d[1];
    det.innerHTML =
      '<summary>' + d[0] + '<span class="count-pill">' + fmtInt(rows.length) + '</span></summary>' +
      '<div class="details-body">' +
        '<p class="hint" style="margin:0 0 12px;">' + d[2] + '</p>' +
        (rows.length
          ? '<div class="btn-row" style="margin-bottom:12px;">' +
              '<button class="btn btn-sm" data-copy="' + i + '">Copiar</button>' +
              '<button class="btn btn-sm btn-ghost" data-csv="' + i + '">CSV</button>' +
            '</div>' + previewTable(rows, r.headers)
          : '<p class="empty" style="padding:22px;">Nenhuma linha nesta situação.</p>') +
      '</div>';
    wrap.appendChild(det);

    var cp = det.querySelector('[data-copy]');
    if (cp) cp.addEventListener('click', function () { copyText(toTSV(rows, r.headers), cp, d[0]); });
    var cs = det.querySelector('[data-csv]');
    if (cs) cs.addEventListener('click', function () {
      download(new Blob([toCSV(rows, r.headers)], { type: 'text/csv;charset=utf-8' }),
        safeName(d[0].replace(/&mdash;.*/, '').trim()) + '.csv');
    });
  });
}

function previewTable(rows, headers) {
  var LIMIT = 60;
  var head = '<tr>' + headers.map(function (h) { return '<th>' + escapeHtml(h) + '</th>'; }).join('') + '</tr>';
  var body = rows.slice(0, LIMIT).map(function (r) {
    return '<tr>' + headers.map(function (h) {
      return '<td>' + escapeHtml(r[h] === undefined ? '' : r[h]) + '</td>';
    }).join('') + '</tr>';
  }).join('');
  var more = rows.length > LIMIT
    ? '<p class="hint">Mostrando as primeiras ' + LIMIT + ' de ' + fmtInt(rows.length) + ' linhas. Copiar / CSV levam todas.</p>'
    : '';
  return '<div class="tablewrap"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' + more;
}

/* ---------- ETAPA 4: funil de aproveitamento + analises ---------- */

function nivelTaxa(t) { return t >= 0.12 ? 'bom' : (t >= 0.06 ? 'neutro' : 'ruim'); }

function renderDesempenho() {
  var f = state.funil;
  var hoje = new Date();
  $('dataHoje').textContent = hoje.toLocaleDateString('pt-BR');

  if (f && f.mesmaBase) {
    $('perfSub').innerHTML =
      'Esta é a <strong>mesma base</strong> da rodada anterior — mesmos clientes, mesmas ' +
      'categorias. Entre duas leituras do mesmo arquivo não houve período nenhum, então não ' +
      'há conversão a medir. Carregue a exportação seguinte do BI para ver o aproveitamento.';
    $('funil').innerHTML = '';
    renderHistorico();
    renderInsights();
    return;
  }

  if (f && !f.incompativel && !f.confiavel) {
    $('perfSub').innerHTML =
      '<strong>As duas bases não falam dos mesmos clientes.</strong> Dos ' +
      fmtInt(f.totalCarteira) + ' clientes da rodada anterior, ' +
      fmtInt(f.perdidosDeVista) + ' (' + pct(f.fracaoSumida) + ') não aparecem na base de agora. ' +
      'Calcular aproveitamento em cima disso daria um número sem significado, então o funil ' +
      'fica de fora desta vez. Normalmente é sinal de que as duas exportações usaram filtros ' +
      'diferentes — de estado, de gerente ou de período.';
    $('funil').innerHTML = '';
    renderHistorico();
    renderInsights();
    return;
  }

  if (f && f.incompativel) {
    var nomes = { carteira: 'sem compras no mês', normal: 'distribuição', ataque: 'distribuição' };
    $('perfSub').innerHTML =
      'A rodada guardada como referência era do tipo <strong>' + escapeHtml(nomes[f.modoAnterior]) +
      '</strong> e esta é do tipo <strong>' + escapeHtml(nomes[f.modoAtual]) + '</strong>. ' +
      'As duas saem de bases diferentes, com categorias diferentes, então comparar uma com a outra ' +
      'daria um número sem significado — o funil fica de fora desta vez. ' +
      'Esta rodada virou a nova referência: repita o mesmo tipo na próxima base para ver o aproveitamento.';
    $('funil').innerHTML = '';
    renderHistorico();
    renderInsights();
    return;
  }

  if (!f) {
    $('perfSub').innerHTML =
      'Esta é a primeira rodada registrada, então ainda não há com o que comparar. ' +
      'A carteira de agora ficou guardada como referência: <strong>na próxima base que você carregar</strong>, ' +
      'o app mostra quem conseguiu transformar cliente parado em <strong>Ativo 30 dias</strong>.';
    $('funil').innerHTML = '';
  } else {
    var desde = new Date(f.desde);
    $('perfSub').innerHTML =
      'Comparando a base de agora com a rodada de <strong>' +
      desde.toLocaleDateString('pt-BR') + ' às ' +
      desde.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) +
      '</strong>. Cliente que estava parado e agora aparece como Ativo 30 dias conta como conversão ' +
      'de quem o tinha na carteira.';

    var cards =
      '<div class="funil-grid">' +
        '<div class="stat" data-t="go"><b>' + pct(f.taxaGeral) + '</b><span>aproveitamento</span></div>' +
        '<div class="stat" data-t="go"><b>' + fmtInt(f.totalConversoes) + '</b><span>clientes reativados</span></div>' +
        '<div class="stat" data-t="hold"><b>' + fmtInt(f.aindaAbertos) + '</b><span>ainda em aberto</span></div>' +
        '<div class="stat" data-t="hold"><b>' + fmtMoney(f.totalValor) + '</b><span>faturamento reativado</span></div>' +
      '</div>';

    var maxTaxa = Math.max.apply(null, f.vendedores.map(function (v) { return v.taxa; }).concat([0.01]));
    var linhas = f.vendedores.map(function (v) {
      return '<div class="frow">' +
        '<span class="vuf">' + escapeHtml(v.uf) + '</span>' +
        '<span class="vname">' + escapeHtml(v.vendedor) + '</span>' +
        '<span class="fbar"><i style="width:' + Math.round(v.taxa / maxTaxa * 100) + '%"></i></span>' +
        '<span class="vqt">' + fmtInt(v.conversoes) + ' / ' + fmtInt(v.carteira) + '</span>' +
        '<span class="taxa" data-lvl="' + nivelTaxa(v.taxa) + '">' + pct(v.taxa) + '</span>' +
        '<span class="vval">' + fmtMoney(v.valor) + '</span>' +
      '</div>';
    }).join('');

    var ufLinhas = f.ufs.map(function (u) {
      return '<div class="frow">' +
        '<span class="vuf">' + escapeHtml(u.uf) + '</span>' +
        '<span class="vname">Região ' + escapeHtml(u.uf) + '</span>' +
        '<span class="fbar"><i style="width:' + Math.round(u.taxa / maxTaxa * 100) + '%"></i></span>' +
        '<span class="vqt">' + fmtInt(u.conversoes) + ' / ' + fmtInt(u.carteira) + '</span>' +
        '<span class="taxa" data-lvl="' + nivelTaxa(u.taxa) + '">' + pct(u.taxa) + '</span>' +
        '<span class="vval">' + fmtMoney(u.valor) + '</span>' +
      '</div>';
    }).join('');

    var cabecalho =
      '<div class="fhead"><span>UF</span><span>Vendedor</span><span class="h-bar">Aproveitamento</span>' +
      '<span class="r">Reativados</span><span class="r">Taxa</span><span class="r h-val">Faturado</span></div>';

    $('funil').innerHTML = cards +
      '<div class="panel"><div class="panel-head"><h3>Quem conseguiu reativar</h3>' +
        '<button class="btn btn-sm" id="copyFunil">Copiar ranking</button></div>' +
        cabecalho + '<div class="vend">' + linhas + '</div>' +
        '<p class="hint">Reativados = clientes que estavam parados na rodada anterior com esse vendedor ' +
        'e que agora aparecem como Ativo 30 dias.</p>' +
      '</div>' +
      '<div class="panel"><div class="panel-head"><h3>Por região</h3></div>' +
        cabecalho.replace('Vendedor', 'Estado') + '<div class="vend">' + ufLinhas + '</div>' +
      '</div>';

    var cf = $('copyFunil');
    if (cf) cf.addEventListener('click', function () {
      var rows = f.vendedores.map(function (v) {
        return {
          Vendedor: v.vendedor, UF: v.uf, 'Carteira anterior': v.carteira,
          Reativados: v.conversoes, 'Taxa': pct(v.taxa), 'Faturamento reativado': v.valor
        };
      });
      copyText(toTSV(rows, ['Vendedor', 'UF', 'Carteira anterior', 'Reativados', 'Taxa', 'Faturamento reativado']), cf, null);
    });
  }

  renderHistorico();
  renderInsights();
}

function renderInsights() {
  var wrap = $('insights');
  if (!state.insights.length) {
    wrap.innerHTML = '<p class="empty">Nenhum alerta nesta rodada.</p>';
    return;
  }
  wrap.innerHTML = state.insights.map(function (i) {
    var extra = '';
    if (i.lista && i.lista.length) {
      var colI = findCol(state.result.headers, 'Integrador (CLI - Nome)') || findCol(state.result.headers, 'Integrador');
      var colV = state.result.colValor;
      extra = '<ol class="hint" style="margin:10px 0 0;padding-left:20px;line-height:1.8;">' +
        i.lista.slice(0, 5).map(function (r) {
          return '<li>' + escapeHtml(norm(r[colI]).slice(0, 52)) +
            ' &mdash; <strong>' + fmtMoney(colV ? toNumber(r[colV]) : 0) + '</strong>' +
            ' <span style="color:var(--y)">' + escapeHtml(r.__vendedor || '') + '</span></li>';
        }).join('') + '</ol>';
    }
    var acaoUf = i.ufSugerida
      ? ' <button class="btn btn-sm" data-uf="' + escapeHtml(i.ufSugerida) + '" style="margin-top:9px;">Preparar ataque em ' + escapeHtml(i.ufSugerida) + '</button>'
      : '';
    return '<div class="insight" data-n="' + i.nivel + '">' +
      '<h4>' + escapeHtml(i.titulo) + '</h4>' +
      '<p>' + escapeHtml(i.texto) + '</p>' + extra +
      '<p class="acao"><b>O que fazer</b>' + escapeHtml(i.acao) + '</p>' + acaoUf +
    '</div>';
  }).join('');

  wrap.querySelectorAll('[data-uf]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelector('input[name="modo"][value="ataque"]').checked = true;
      $('ataqueBox').hidden = false;
      $('ataqueUf').value = btn.getAttribute('data-uf');
      goStep(1);
      toast('Ataque em ' + btn.getAttribute('data-uf') + ' preparado — confira a equipe e distribua');
    });
  });
}

$('copyInsights').addEventListener('click', function () {
  var hoje = new Date().toLocaleDateString('pt-BR');
  var txt = 'ANALISE COMERCIAL - ' + hoje + '\n\n' + state.insights.map(function (i, n) {
    return (n + 1) + '. ' + i.titulo + '\n   ' + i.texto + '\n   > ' + i.acao;
  }).join('\n\n');
  copyText(txt, $('copyInsights'), null);
});

/* ---------- copiar / exportar ---------- */
function copyText(text, btn, label) {
  var okMsg = label ? 'Carteira de ' + label + ' copiada' : 'Copiado';
  function done() {
    if (btn) {
      var old = btn.textContent;
      btn.textContent = 'Copiado';
      btn.setAttribute('data-ok', '1');
      setTimeout(function () { btn.textContent = old; btn.removeAttribute('data-ok'); }, 1700);
    }
    toast(okMsg + ' — cole no Sheets ou Excel');
  }
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ok) done(); else toast('O navegador bloqueou a cópia — use o botão CSV');
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, fallback);
  } else fallback();
}

$('copyResumo').addEventListener('click', function () {
  var r = state.result;
  var rows = r.resumo.map(function (v) {
    return { Vendedor: v.vendedor, UF: v.uf, 'E-mail': v.email, Clientes: v.qtde, 'Valor Faturado': v.valor };
  });
  copyText(toTSV(rows, ['Vendedor', 'UF', 'E-mail', 'Clientes', 'Valor Faturado']), $('copyResumo'), null);
});

$('zipAll').addEventListener('click', function () {
  var r = state.result;
  var entries = r.resumo.filter(function (v) { return v.qtde; }).map(function (v) {
    return { name: safeName(v.uf) + '/' + safeName(v.vendedor) + '.csv', content: toCSV(v.linhas, r.headers) };
  });
  entries.push({
    name: 'RESUMO.csv',
    content: toCSV(r.resumo.map(function (v) {
      return { Vendedor: v.vendedor, UF: v.uf, 'E-mail': v.email, Clientes: v.qtde, 'Valor Faturado': v.valor };
    }), ['Vendedor', 'UF', 'E-mail', 'Clientes', 'Valor Faturado'])
  });
  if (r.semUf.length) entries.push({ name: 'NAO DISTRIBUIDO - sem UF.csv', content: toCSV(r.semUf, r.headers) });
  if (r.foraEscopo.length) entries.push({ name: 'NAO DISTRIBUIDO - fora de escopo.csv', content: toCSV(r.foraEscopo, r.headers) });
  if (r.excluidos.length) entries.push({ name: 'EXCLUIDOS - ativo 30 dias.csv', content: toCSV(r.excluidos, r.headers) });

  var d = new Date();
  var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  download(buildZip(entries), 'carteira-' + stamp + '.zip');
  toast('Arquivo .zip gerado com ' + entries.length + ' planilhas');
});

/* ---------- inicializacao ---------- */
state.equipe = loadEquipe();
renderEquipe();
$('gerente').value = GERENTE_PADRAO;
ajustarPainelPublicar();

/* ---------- Publicar os links secretos da equipe ---------- */

var SENHA_KEY = 'belenergy-senha-publicacao';

try {
  var senhaSalva = localStorage.getItem(SENHA_KEY);
  if (senhaSalva) $('senhaPub').value = senhaSalva;
} catch (e) { /* armazenamento indisponivel */ }

$('senhaPub').addEventListener('input', function () {
  try { localStorage.setItem(SENHA_KEY, $('senhaPub').value); } catch (e) { /* idem */ }
});

/* A publicacao so existe quando o app esta servido pelo site: aberto como
   arquivo local nao ha /api para chamar. Nesse caso o painel some, em vez
   de oferecer um botao que falharia. */
function ajustarPainelPublicar() {
  var naWeb = location.protocol === 'http:' || location.protocol === 'https:';
  $('publicarPanel').hidden = !naWeb;
}

function linkDoVendedor(token) {
  return location.origin + '/c/#' + token;
}

$('publicar').addEventListener('click', async function () {
  var r = state.result;
  if (!r) { toast('Rode a distribuição primeiro'); return; }

  var senha = norm($('senhaPub').value);
  if (!senha) { toast('Informe a senha de publicação'); $('senhaPub').focus(); return; }

  var botao = $('publicar');
  var saida = $('publicarSaida');
  botao.disabled = true;

  // Publica todos os vendedores do resumo, inclusive os que ficaram sem
  // cliente: assim quem nao tem nada nesta rodada ve uma lista vazia e
  // atual, em vez da lista antiga que continuaria no ar.
  var fila = r.resumo;
  var prontos = [], falhas = [];

  for (var i = 0; i < fila.length; i++) {
    var v = fila[i];
    saida.innerHTML = '<p class="hint">Publicando ' + (i + 1) + ' de ' + fila.length +
      ' — ' + escapeHtml(v.vendedor) + '…</p>';
    try {
      var resposta = await fetch('/api/publicar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': senha },
        body: JSON.stringify({
          vendedor: v.vendedor,
          uf: v.uf,
          modo: r.modo,
          origem: state.origem,
          colunas: r.headers,
          linhas: v.linhas
        })
      });
      var dados = await resposta.json();
      if (!resposta.ok) { falhas.push(v.vendedor + ': ' + (dados.erro || resposta.status)); continue; }
      prontos.push({ vendedor: v.vendedor, qtde: dados.qtde, url: linkDoVendedor(dados.token) });
    } catch (e) {
      falhas.push(v.vendedor + ': ' + e.message);
    }
  }

  botao.disabled = false;
  renderLinks(prontos, falhas);
});

function renderLinks(prontos, falhas) {
  var saida = $('publicarSaida');
  if (!prontos.length) {
    saida.innerHTML = '<div class="alert">Nada foi publicado.' +
      (falhas.length ? '<br>' + escapeHtml(falhas.join(' · ')) : '') + '</div>';
    return;
  }

  saida.innerHTML =
    (falhas.length
      ? '<div class="alert">Falharam: ' + escapeHtml(falhas.join(' · ')) + '</div>'
      : '') +
    '<div class="btn-row" style="margin:14px 0;">' +
      '<button class="btn btn-sm" id="copiarLinks">Copiar todos os links</button>' +
      '<span class="hint">' + fmtInt(prontos.length) + ' publicados</span>' +
    '</div>' +
    '<div class="vend">' + prontos.map(function (p) {
      return '<div class="vrow">' +
        '<span class="vuf">' + escapeHtml(String(p.qtde)) + '</span>' +
        '<span><span class="vname">' + escapeHtml(p.vendedor) + '</span>' +
          '<br><span class="vmail">' + escapeHtml(p.url) + '</span></span>' +
        '<span></span><span></span><span></span>' +
        '<span class="btn-row">' +
          '<button class="btn btn-sm" data-link="' + escapeHtml(p.url) + '">Copiar</button>' +
        '</span>' +
      '</div>';
    }).join('') + '</div>';

  saida.querySelectorAll('[data-link]').forEach(function (b) {
    b.addEventListener('click', function () {
      copyText(b.getAttribute('data-link'), b, null);
    });
  });

  var todos = $('copiarLinks');
  if (todos) todos.addEventListener('click', function () {
    copyText(toTSV(prontos.map(function (p) {
      return { Vendedor: p.vendedor, Clientes: p.qtde, Link: p.url };
    }), ['Vendedor', 'Clientes', 'Link']), todos, null);
  });
}

/* ---------- HISTORICO DE CONVERSAO POR ESTADO ---------- */

var HIST_KEY = 'belenergy-historico-v1';
var histUfEscolhida = '';   // '' = a equipe toda

function lerHistorico() {
  try {
    var raw = localStorage.getItem(HIST_KEY);
    var lista = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista : [];
  } catch (e) { return []; }
}

function gravarHistorico(entrada) {
  try {
    var lista = lerHistorico();
    lista.push(entrada);
    // Mantem a serie limitada: o navegador tem espaco finito e as rodadas
    // antigas deixam de importar depois de alguns meses.
    if (lista.length > MAX_RODADAS_HISTORICO) {
      lista = lista.slice(lista.length - MAX_RODADAS_HISTORICO);
    }
    localStorage.setItem(HIST_KEY, JSON.stringify(lista));
  } catch (e) { /* armazenamento cheio ou indisponivel */ }
}

function dataCurta(ts) {
  var d = new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function renderHistorico() {
  var historico = lerHistorico();
  var alvoUfs = $('histUfs');
  var alvo = $('histConteudo');

  if (!historico.length) {
    alvoUfs.innerHTML = '<span class="pick-empty">Nenhuma rodada registrada ainda.</span>';
    alvo.innerHTML =
      '<p class="hint">O histórico começa na primeira comparação válida entre duas bases ' +
      'diferentes. Rodadas repetidas com o mesmo arquivo, ou bases que não têm cliente em ' +
      'comum, ficam de fora para não sujar a série com zeros falsos.</p>';
    return;
  }

  // seletor de estado
  var estados = estadosDoHistorico(historico);
  if (histUfEscolhida && !estados.some(function (e) { return e.uf === histUfEscolhida; })) {
    histUfEscolhida = '';
  }
  alvoUfs.innerHTML =
    '<label class="rd"><input type="radio" name="histUf" value=""' +
      (histUfEscolhida === '' ? ' checked' : '') + '>' +
      '<span>Equipe toda</span><span class="n">' + historico.length + '</span></label>' +
    estados.map(function (e) {
      return '<label class="rd"><input type="radio" name="histUf" value="' + escapeHtml(e.uf) + '"' +
        (histUfEscolhida === e.uf ? ' checked' : '') + '>' +
        '<span>' + escapeHtml(e.uf) + '</span><span class="n">' + e.rodadas + '</span></label>';
    }).join('');

  alvoUfs.querySelectorAll('input[name="histUf"]').forEach(function (i) {
    i.addEventListener('change', function () {
      histUfEscolhida = i.value;
      renderHistorico();
    });
  });

  var serie = serieDoEstado(historico, histUfEscolhida);
  var r = resumoDaSerie(serie);
  var rotulo = histUfEscolhida || 'a equipe toda';

  if (!serie.length) {
    alvo.innerHTML = '<p class="empty">Sem rodadas registradas para ' + escapeHtml(rotulo) + '.</p>';
    return;
  }

  // cartoes de resumo
  var seta = r.variacao === null ? '' :
    (r.variacao > 0.005 ? 'sobe' : (r.variacao < -0.005 ? 'desce' : 'igual'));
  var tendencia = r.variacao === null
    ? '<span class="trend" data-d="igual">primeira rodada</span>'
    : '<span class="trend" data-d="' + seta + '">' +
        (seta === 'sobe' ? '▲ ' : seta === 'desce' ? '▼ ' : '= ') +
        pct(Math.abs(r.variacao)) + '</span>';

  var cards =
    '<div class="funil-grid">' +
      '<div class="stat" data-t="go"><b>' + pct(r.ultima) + '</b><span>última rodada</span></div>' +
      '<div class="stat" data-t="hold"><b>' + pct(r.taxaAcumulada) + '</b><span>acumulado do período</span></div>' +
      '<div class="stat" data-t="go"><b>' + fmtInt(r.conversoes) + '</b><span>clientes reativados</span></div>' +
      '<div class="stat" data-t="hold"><b>' + pct(r.melhor) + '</b><span>melhor rodada</span></div>' +
    '</div>';

  // grafico: uma barra por rodada, altura proporcional a taxa
  var maxTaxa = Math.max(r.melhor, 0.01);
  var barras = '<div class="hbars">' + serie.map(function (p) {
    var altura = Math.max(3, Math.round(p.taxa / maxTaxa * 88));
    return '<div class="hbar" data-lvl="' + nivelTaxa(p.taxa) + '" ' +
      'title="' + escapeHtml(dataCurta(p.ts) + ' — ' + p.conversoes + ' de ' + p.carteira) + '">' +
      '<b>' + pct(p.taxa).replace(',0%', '%') + '</b>' +
      '<i style="height:' + altura + '%"></i>' +
      '<span>' + dataCurta(p.ts) + '</span>' +
    '</div>';
  }).join('') + '</div>';

  // tabela, da rodada mais recente para a mais antiga
  var linhas = serie.slice().reverse().map(function (p) {
    return '<tr>' +
      '<td>' + escapeHtml(new Date(p.ts).toLocaleDateString('pt-BR')) + '</td>' +
      '<td>' + escapeHtml(p.modo === 'carteira' ? 'sem compras no mês' : 'distribuição') + '</td>' +
      '<td class="num">' + fmtInt(p.carteira) + '</td>' +
      '<td class="num">' + fmtInt(p.conversoes) + '</td>' +
      '<td class="num">' + pct(p.taxa) + '</td>' +
      (r.temValor ? '<td class="num">' + fmtMoney(p.valor) + '</td>' : '') +
    '</tr>';
  }).join('');

  alvo.innerHTML =
    '<p class="sub" style="margin-bottom:16px;">' +
      '<strong>' + escapeHtml(histUfEscolhida || 'Equipe toda') + '</strong> — ' +
      fmtInt(r.rodadas) + (r.rodadas === 1 ? ' rodada registrada' : ' rodadas registradas') +
      ', ' + fmtInt(r.conversoes) + ' de ' + fmtInt(r.carteira) + ' clientes reativados. ' +
      'Última rodada contra a média das anteriores: ' + tendencia +
    '</p>' +
    cards + barras +
    '<div class="tablewrap"><table><thead><tr>' +
      '<th>Data</th><th>Tipo</th><th>Carteira</th><th>Reativados</th><th>Taxa</th>' +
      (r.temValor ? '<th>Faturamento</th>' : '') +
    '</tr></thead><tbody>' + linhas + '</tbody></table></div>';
}

$('copyHist').addEventListener('click', function () {
  var serie = serieDoEstado(lerHistorico(), histUfEscolhida);
  if (!serie.length) { toast('Nada no histórico ainda'); return; }
  var rows = serie.map(function (p) {
    return {
      Data: new Date(p.ts).toLocaleDateString('pt-BR'),
      Estado: histUfEscolhida || 'TODOS',
      Tipo: p.modo === 'carteira' ? 'sem compras no mês' : 'distribuição',
      Carteira: p.carteira,
      Reativados: p.conversoes,
      Taxa: pct(p.taxa),
      Faturamento: p.valor
    };
  });
  copyText(toTSV(rows, ['Data', 'Estado', 'Tipo', 'Carteira', 'Reativados', 'Taxa', 'Faturamento']),
    $('copyHist'), null);
});

$('limparHist').addEventListener('click', function () {
  var n = lerHistorico().length;
  if (!n) { toast('Histórico já está vazio'); return; }
  // Apagar e irreversivel: confirma antes.
  if (!confirm('Apagar as ' + n + ' rodadas do histórico?\n\nIsso não afeta a distribuição atual, ' +
               'mas a série de conversão por estado começa do zero e não tem como voltar.')) return;
  try { localStorage.removeItem(HIST_KEY); } catch (e) { /* idem */ }
  histUfEscolhida = '';
  renderHistorico();
  toast('Histórico apagado');
});
