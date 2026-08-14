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

function render(dados) {
  var colunas = dados.colunas || [];
  var linhas = dados.linhas || [];
  var visiveis = colunasVisiveis(colunas);
  var quando = new Date(dados.publicadoEm);

  var cabecalho =
    '<p class="kicker">Carteira de prospecção</p>' +
    '<h2>Olá, ' + escapeHtml(primeiroNome(dados.vendedor)) + '</h2>' +
    '<p class="sub">Você tem <strong>' + linhas.length +
      (linhas.length === 1 ? ' cliente</strong> esperando contato' : ' clientes</strong> esperando contato') +
    '. Lista de <strong>' + quando.toLocaleDateString('pt-BR') + '</strong>, às ' +
    quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.</p>';

  if (!linhas.length) {
    $('conteudo').innerHTML = cabecalho +
      '<div class="panel"><p class="empty">Nenhum cliente pendente para você nesta rodada. ' +
      'Assim que sair uma lista nova, ela aparece aqui neste mesmo link.</p></div>';
    return;
  }

  var linhasHtml = linhas.map(function (r) {
    return '<tr>' + visiveis.map(function (c) {
      // data-rotulo alimenta o layout de cartao no celular, onde o
      // cabecalho da tabela nao aparece.
      var conteudo = celula(c, r[c]);
      // title no nome do cliente: encolhido com reticencias na tabela, mas
      // o nome inteiro aparece ao passar o mouse.
      var titulo = (c === visiveis[0] || /mail/i.test(c))
        ? ' title="' + escapeHtml(r[c]) + '"' : '';
      return '<td data-rotulo="' + escapeHtml(c) + '"' + titulo + '>' + conteudo + '</td>';
    }).join('') + '</tr>';
  }).join('');

  $('conteudo').innerHTML = cabecalho +
    '<div class="panel">' +
      '<div class="panel-head">' +
        '<h3>Meus clientes <span class="count-pill">' + linhas.length + '</span></h3>' +
        '<div class="btn-row">' +
          '<button class="btn btn-sm" id="copiar">Copiar</button>' +
          '<button class="btn btn-sm btn-primary" id="baixar">Baixar CSV</button>' +
        '</div>' +
      '</div>' +
      '<div class="tablewrap cartoes"><table><thead><tr>' +
        visiveis.map(function (c) { return '<th>' + escapeHtml(c) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + linhasHtml + '</tbody></table></div>' +
      '<p class="hint">A tela mostra as colunas principais. O arquivo baixado traz todas.</p>' +
    '</div>';

  $('copiar').addEventListener('click', function () {
    var texto = paraTSV(linhas, colunas);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(
        function () { toast('Lista copiada'); },
        function () { toast('Não consegui copiar — use o botão Baixar CSV'); }
      );
    } else {
      toast('Não consegui copiar — use o botão Baixar CSV');
    }
  });

  $('baixar').addEventListener('click', function () {
    baixarCSV(linhas, colunas,
      'carteira-' + String(dados.vendedor).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv');
  });
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
