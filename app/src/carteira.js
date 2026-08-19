/* ==================================================================
   Pagina do vendedor. Le o token depois do "#" da URL e pede ao
   servidor a carteira daquele token -- so ela.

   O token fica no fragmento (#) e nao na query (?) de proposito: o
   navegador nunca envia o fragmento ao servidor, entao o segredo nao
   entra em log de acesso nem em cabecalho Referer.
   ================================================================== */

var $ = function (id) { return document.getElementById(id); };

function escapeHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
}

var toastTimer = null;
function toast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
}

function primeiroNome(nome) {
  var p = String(nome || '').trim().split(/\s+/)[0] || '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
}

function aviso(titulo, texto) {
  $('conteudo').innerHTML =
    '<p class="kicker">Carteira</p>' +
    '<h2>' + escapeHtml(titulo) + '</h2>' +
    '<p class="sub">' + escapeHtml(texto) + '</p>';
}

/* Colunas que o vendedor precisa ver na tela. O restante continua no
   arquivo baixado -- aqui a tela fica legivel no celular. */
var COLUNAS_PRIORITARIAS = [
  'Integrador (CLI - Nome)', 'Integrador', 'Cidade', 'UF',
  'Telefone', 'E-mail', 'Categoria', 'Última Nota', 'Valor Faturado'
];

function colunasVisiveis(colunas) {
  var achadas = COLUNAS_PRIORITARIAS.filter(function (c) {
    return colunas.indexOf(c) > -1;
  });
  return achadas.length ? achadas : colunas.slice(0, 6);
}

function paraTSV(linhas, colunas) {
  var saida = [colunas.join('\t')];
  linhas.forEach(function (r) {
    saida.push(colunas.map(function (c) {
      return String(r[c] === undefined || r[c] === null ? '' : r[c]).replace(/[\t\r\n]+/g, ' ');
    }).join('\t'));
  });
  return saida.join('\n');
}

function baixarCSV(linhas, colunas, nome) {
  var csv = [colunas.map(aspas).join(';')];
  linhas.forEach(function (r) {
    csv.push(colunas.map(function (c) { return aspas(r[c]); }).join(';'));
  });
  // BOM para o Excel abrir os acentos corretamente
  var blob = new Blob(['﻿' + csv.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}

function aspas(v) {
  var s = String(v === undefined || v === null ? '' : v);
  return '"' + s.replace(/"/g, '""') + '"';
}

function paraNumero(v) {
  if (typeof v === 'number') return v;
  var s = String(v == null ? '' : v).replace(/[R$\s]/g, '');
  if (!s) return NaN;
  if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.indexOf(',') > -1) s = s.replace(',', '.');
  var n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

/* Telefone e e-mail viram link (um toque liga ou escreve) e valor vira
   moeda -- "2382309.77" nao diz nada a quem esta olhando a lista. */
function celula(coluna, valor) {
  var texto = String(valor === undefined || valor === null ? '' : valor).trim();
  if (!texto) return '';

  if (/valor|faturad/i.test(coluna)) {
    var n = paraNumero(texto);
    if (!isNaN(n)) {
      return escapeHtml(n.toLocaleString('pt-BR', {
        style: 'currency', currency: 'BRL', maximumFractionDigits: 0
      }));
    }
  }

  if (/telefone|celular|fone/i.test(coluna)) {
    var digitos = texto.replace(/\D/g, '');
    if (digitos.length >= 8) {
      var numero = digitos.length <= 11 ? '+55' + digitos : '+' + digitos;
      return '<a href="tel:' + escapeHtml(numero) + '">' + escapeHtml(texto) + '</a>';
    }
  }
  if (/mail/i.test(coluna) && texto.indexOf('@') > 0) {
    return '<a href="mailto:' + escapeHtml(texto) + '">' + escapeHtml(texto) + '</a>';
  }
  return escapeHtml(texto);
}

/* Identidade do cliente, para reconhecer quem aparece em mais de uma
   rodada. Mesmo criterio do app do gestor: o codigo CLI-xxxx quando existe. */
function chaveCliente(linha, colunas) {
  var nome = '';
  for (var i = 0; i < colunas.length; i++) {
    if (/integrador/i.test(colunas[i])) { nome = String(linha[colunas[i]] || ''); break; }
  }
  var m = nome.match(/CLI[-\s]?0*(\d+)/i);
  return m ? 'CLI' + m[1] : nome.trim().toUpperCase();
}

/* Em quantas rodadas cada cliente aparece. O vendedor precisa saber que o
   cliente da lista de hoje ja estava na de ontem -- senao liga duas vezes
   achando que sao casos diferentes. */
function mapearRepetidos(rodadas) {
  var onde = {};
  rodadas.forEach(function (r) {
    r.linhas.forEach(function (l) {
      var k = chaveCliente(l, r.colunas);
      if (!k) return;
      if (!onde[k]) onde[k] = [];
      if (onde[k].indexOf(r.rotulo) === -1) onde[k].push(r.rotulo);
    });
  });
  return onde;
}

function secaoDaRodada(r, indice, repetidos) {
  var visiveis = colunasVisiveis(r.colunas);
  var quando = new Date(r.publicadoEm);
  var idBase = 'r' + indice;

  var linhasHtml = r.linhas.map(function (l, li) {
    var k = chaveCliente(l, r.colunas);
    var outras = (repetidos[k] || []).filter(function (x) { return x !== r.rotulo; });
    return '<tr data-rodada="' + indice + '" data-linha="' + li + '">' +
      visiveis.map(function (c, ci) {
      var conteudo = celula(c, l[c]);
      if (ci === 0 && outras.length) {
        conteudo += ' <span class="tag-rep" title="Este cliente também está em: ' +
          escapeHtml(outras.join(', ')) + '">também em ' + escapeHtml(outras[0]) + '</span>';
      }
      var titulo = (c === visiveis[0] || /mail/i.test(c))
        ? ' title="' + escapeHtml(l[c]) + '"' : '';
      return '<td data-rotulo="' + escapeHtml(c) + '"' + titulo + '>' + conteudo + '</td>';
    }).join('') + '</tr>';
  }).join('');

  return '<div class="panel">' +
      '<div class="panel-head">' +
        '<h3>' + escapeHtml(r.rotulo) +
          ' <span class="count-pill">' + r.linhas.length + '</span></h3>' +
        '<div class="btn-row">' +
          '<button class="btn btn-sm" data-copiar="' + idBase + '">Copiar</button>' +
          '<button class="btn btn-sm btn-primary" data-baixar="' + idBase + '">Baixar CSV</button>' +
        '</div>' +
      '</div>' +
      '<p class="hint" style="margin-top:-8px;">Enviada em ' +
        escapeHtml(quando.toLocaleDateString('pt-BR')) + ' às ' +
        escapeHtml(quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) +
      '.</p>' +
      '<div class="tablewrap cartoes"><table><thead><tr>' +
        visiveis.map(function (c) { return '<th>' + escapeHtml(c) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + linhasHtml + '</tbody></table></div>' +
    '</div>';
}

function render(dados) {
  // Mais recente primeiro: e a rodada que o vendedor precisa ver ao abrir.
  var rodadas = Object.keys(dados.rodadas || {})
    .map(function (k) { return dados.rodadas[k]; })
    .filter(function (r) { return r && r.linhas && r.linhas.length; })
    .sort(function (a, b) { return b.publicadoEm - a.publicadoEm; });

  var total = rodadas.reduce(function (a, r) { return a + r.linhas.length; }, 0);

  var cabecalho =
    '<p class="kicker">Carteira de prospecção</p>' +
    '<h2>Olá, ' + escapeHtml(primeiroNome(dados.vendedor)) + '</h2>';

  if (!rodadas.length) {
    $('conteudo').innerHTML = cabecalho +
      '<p class="sub">Nenhuma lista ativa para você no momento.</p>' +
      '<div class="panel"><p class="empty">Assim que seu gestor publicar uma lista nova, ' +
      'ela aparece aqui neste mesmo link — não precisa de link novo.</p></div>';
    return;
  }

  var repetidos = mapearRepetidos(rodadas);
  var quantosRepetem = Object.keys(repetidos).filter(function (k) {
    return repetidos[k].length > 1;
  }).length;

  $('conteudo').innerHTML = cabecalho +
    '<p class="sub">Você tem <strong>' + total +
      (total === 1 ? ' cliente</strong>' : ' clientes</strong>') +
      ' esperando contato, em ' +
      (rodadas.length === 1 ? 'uma lista' : rodadas.length + ' listas') + '. ' +
      (quantosRepetem
        ? fmtRepetidos(quantosRepetem) + ' Cada lista tem seu motivo — confira o título de cada uma.'
        : 'Cada lista tem seu motivo — confira o título de cada uma.') +
    '</p>' +
    '<div class="rt-work">' +
      '<div class="rt-listas">' +
        rodadas.map(function (r, i) { return secaoDaRodada(r, i, repetidos); }).join('') +
        '<p class="hint">A tela mostra as colunas principais. O arquivo baixado traz todas.</p>' +
      '</div>' +
      '<aside class="rt-lado">' + Roteiro.html() + '</aside>' +
    '</div>';

  Roteiro.iniciar(primeiroNome(dados.vendedor));
  ligarSelecao(rodadas);

  rodadas.forEach(function (r, i) {
    var idBase = 'r' + i;
    var bc = document.querySelector('[data-copiar="' + idBase + '"]');
    var bb = document.querySelector('[data-baixar="' + idBase + '"]');
    if (bc) bc.addEventListener('click', function () {
      var texto = paraTSV(r.linhas, r.colunas);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(
          function () { toast('Lista copiada'); },
          function () { toast('Não consegui copiar — use o botão Baixar CSV'); }
        );
      } else {
        toast('Não consegui copiar — use o botão Baixar CSV');
      }
    });
    if (bb) bb.addEventListener('click', function () {
      baixarCSV(r.linhas, r.colunas,
        'carteira-' + String(dados.vendedor).toLowerCase().replace(/[^a-z0-9]+/g, '-') +
        '-' + r.modo + '.csv');
    });
  });
}

/* Clicar numa linha faz o roteiro falar daquele cliente. A linha continua
   sendo uma linha de tabela: quem só quer ler a lista não perde nada, e quem
   vai ligar ganha a fala com a data e o histórico certos. */
function ligarSelecao(rodadas) {
  var linhas = document.querySelectorAll('.rt-listas tbody tr[data-rodada]');
  for (var i = 0; i < linhas.length; i++) {
    (function (tr) {
      tr.addEventListener('click', function () {
        // Vale tambem quando o clique cai no telefone: quem toca no numero e
        // exatamente quem vai ligar, e e nessa hora que o roteiro precisa
        // estar pronto. O link continua funcionando -- nada e cancelado aqui.
        var r = rodadas[Number(tr.getAttribute('data-rodada'))];
        var linha = r && r.linhas[Number(tr.getAttribute('data-linha'))];
        if (!linha) return;

        var antes = document.querySelectorAll('.rt-listas tr[data-rtsel="1"]');
        for (var k = 0; k < antes.length; k++) antes[k].removeAttribute('data-rtsel');
        tr.setAttribute('data-rtsel', '1');

        Roteiro.selecionar(Roteiro.daLinha(linha, r.colunas, r.modo));
      });
    })(linhas[i]);
  }
}

function fmtRepetidos(n) {
  return n === 1
    ? '<strong>1 cliente aparece em mais de uma lista</strong> — está marcado, para você não ligar duas vezes.'
    : '<strong>' + n + ' clientes aparecem em mais de uma lista</strong> — estão marcados, para você não ligar duas vezes.';
}

async function carregar() {
  var token = (location.hash || '').replace(/^#/, '').trim();

  if (!token) {
    aviso('Link incompleto',
      'Falta a parte final do endereço. Abra o link exatamente como você recebeu, ' +
      'sem cortar nada depois do "#". Se não tiver mais a mensagem, peça um link novo ao seu gestor.');
    return;
  }

  try {
    var resposta = await fetch('/api/carteira', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: token })
    });
    var dados = await resposta.json();

    if (!resposta.ok) {
      aviso('Não consegui abrir sua carteira',
        dados && dados.erro ? dados.erro : 'Peça um link novo ao seu gestor.');
      return;
    }
    render(dados);
  } catch (e) {
    aviso('Sem conexão',
      'Não consegui falar com o servidor. Confira sua internet e atualize a página.');
  }
}

carregar();
window.addEventListener('hashchange', carregar);
