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

/* paraNumero, moeda, inteiro, toCSV, toTSV, safeName e download vem de
   formato.js, que entra neste mesmo <script>. E a unica leitura de numero
   das duas paginas -- foi ter uma segunda que produziu o valor errado no
   cartao do roteiro. */

/* Telefone e e-mail viram link (um toque liga ou escreve) e valor vira
   moeda -- "2382309.77" nao diz nada a quem esta olhando a lista. */
function celula(coluna, valor) {
  var texto = String(valor === undefined || valor === null ? '' : valor).trim();
  if (!texto) return '';

  if (/valor|faturad/i.test(coluna)) {
    var emReais = moeda(texto);
    if (emReais) return escapeHtml(emReais);
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
    var marcado = !!(estado.marcas[r.modo] || {})[k];
    var quantasNotas = (estado.notas[k] || []).length;

    var celulas = visiveis.map(function (c, ci) {
      var conteudo = celula(c, l[c]);
      if (ci === 0) {
        if (quantasNotas) {
          conteudo += ' <span class="tag-nota" title="Abrir suas anotações deste cliente">' +
            quantasNotas + (quantasNotas === 1 ? ' anotação' : ' anotações') + '</span>';
        }
        if (outras.length) {
          conteudo += ' <span class="tag-rep" title="Este cliente também está em: ' +
            escapeHtml(outras.join(', ')) + '">também em ' + escapeHtml(outras[0]) + '</span>';
        }
      }
      var titulo = (c === visiveis[0] || /mail/i.test(c))
        ? ' title="' + escapeHtml(l[c]) + '"' : '';
      return '<td data-rotulo="' + escapeHtml(c) + '"' + titulo + '>' + conteudo + '</td>';
    }).join('');

    return '<tr data-rodada="' + indice + '" data-linha="' + li + '"' +
        (marcado ? ' data-falei="1"' : '') + '>' +
      '<td class="col-falei" data-rotulo="Já falei">' +
        '<input type="checkbox" class="falei-box"' + (marcado ? ' checked' : '') +
        ' data-cliente="' + escapeHtml(k) + '" data-modo="' + escapeHtml(r.modo) + '"' +
        ' aria-label="Já falei com este cliente"></td>' +
      celulas + '</tr>';
  }).join('');

  var marcados = Object.keys(estado.marcas[r.modo] || {}).length;

  return '<div class="panel">' +
      '<div class="panel-head">' +
        '<h3>' + escapeHtml(r.rotulo) +
          ' <span class="count-pill">' + r.linhas.length + '</span></h3>' +
        '<div class="btn-row">' +
          '<span class="hint" data-contados="' + escapeHtml(r.modo) + '">' +
            marcados + ' de ' + r.linhas.length + ' já contatados</span>' +
          '<button class="btn btn-sm" data-copiar="' + idBase + '">Copiar</button>' +
          '<button class="btn btn-sm btn-primary" data-baixar="' + idBase + '">Baixar CSV</button>' +
        '</div>' +
      '</div>' +
      '<p class="hint" style="margin-top:-8px;">Enviada em ' +
        escapeHtml(quando.toLocaleDateString('pt-BR')) + ' às ' +
        escapeHtml(quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) +
      '.</p>' +
      '<div class="tablewrap cartoes"><table><thead><tr>' +
        '<th class="col-falei" title="Marque quando já tiver falado com o cliente">✓</th>' +
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

  estado.rodadas = rodadas;
  Roteiro.iniciar(primeiroNome(dados.vendedor), {
    notasDe: function (cliente) { return estado.notas[cliente] || []; },
    salvarNota: salvarNota,
    editarNota: editarNota,
    apagarNota: apagarNota,
    perguntarIa: perguntarIa
  });
  ligarSelecao(rodadas);
  ligarMarcas();
  Roteiro.saldoIa();

  rodadas.forEach(function (r, i) {
    var idBase = 'r' + i;
    var bc = document.querySelector('[data-copiar="' + idBase + '"]');
    var bb = document.querySelector('[data-baixar="' + idBase + '"]');
    if (bc) bc.addEventListener('click', function () {
      var texto = toTSV(r.linhas, r.colunas);
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
      download(new Blob([toCSV(r.linhas, r.colunas)], { type: 'text/csv;charset=utf-8' }),
        'carteira-' + String(dados.vendedor).toLowerCase().replace(/[^a-z0-9]+/g, '-') +
        '-' + r.modo + '.csv');
    });
  });
}

/* ---------- conversa com o servidor ----------
   Tudo passa pelo token do link. Nenhuma chamada manda o nome do vendedor:
   quem diz de quem é a marca ou a anotação é o servidor, a partir do token. */

var estado = { token: '', marcas: {}, notas: {}, rodadas: [] };

async function chamar(caminho, corpo) {
  var resposta = await fetch(caminho, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ token: estado.token }, corpo || {}))
  });
  var dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados && dados.erro ? dados.erro : 'Falhou.');
  return dados;
}

/* A caixinha e a anotacao são conforto, não a razão da página existir. Se o
   servidor não responder, a lista tem de aparecer do mesmo jeito. */
async function carregarExtras() {
  try {
    var m = await chamar('/api/marcas', {});
    estado.marcas = m.marcas || {};
  } catch (e) { estado.marcas = {}; }
  try {
    var n = await chamar('/api/anotacoes', { acao: 'listar' });
    estado.notas = n.notas || {};
  } catch (e) { estado.notas = {}; }
}

function ligarMarcas() {
  document.querySelectorAll('.falei-box').forEach(function (caixa) {
    caixa.addEventListener('click', function (ev) {
      ev.stopPropagation();   // marcar não é escolher a linha
    });
    caixa.addEventListener('change', async function () {
      var cliente = caixa.getAttribute('data-cliente');
      var modo = caixa.getAttribute('data-modo');
      var querMarcar = caixa.checked;
      var linha = caixa.closest('tr');
      caixa.disabled = true;
      try {
        var r = await chamar('/api/marcas', { modo: modo, cliente: cliente, marcado: querMarcar });
        estado.marcas[modo] = r.marcas || {};
        if (querMarcar) linha.setAttribute('data-falei', '1');
        else linha.removeAttribute('data-falei');
        atualizarContagem(modo);
      } catch (e) {
        caixa.checked = !querMarcar;   // desfaz o visual: não gravou
        toast('Não consegui salvar a marcação. Tente de novo.');
      }
      caixa.disabled = false;
    });
  });
}

function atualizarContagem(modo) {
  var alvo = document.querySelector('[data-contados="' + modo + '"]');
  if (!alvo) return;
  var rodada = estado.rodadas.filter(function (r) { return r.modo === modo; })[0];
  if (!rodada) return;
  alvo.textContent = Object.keys(estado.marcas[modo] || {}).length +
    ' de ' + rodada.linhas.length + ' já contatados';
}

/* Depois de mexer numa anotação, a lista precisa refletir: a etiqueta com a
   quantidade fica na linha do cliente. */
function atualizarEtiquetaNotas(cliente) {
  var quantas = (estado.notas[cliente] || []).length;
  document.querySelectorAll('.falei-box[data-cliente="' + CSS.escape(cliente) + '"]')
    .forEach(function (caixa) {
      var primeira = caixa.closest('tr').querySelectorAll('td')[1];
      if (!primeira) return;
      var etiqueta = primeira.querySelector('.tag-nota');
      if (!quantas) { if (etiqueta) etiqueta.remove(); return; }
      if (!etiqueta) {
        etiqueta = document.createElement('span');
        etiqueta.className = 'tag-nota';
        etiqueta.title = 'Suas anotações deste cliente';
        primeira.appendChild(document.createTextNode(' '));
        primeira.appendChild(etiqueta);
      }
      etiqueta.textContent = quantas + (quantas === 1 ? ' anotação' : ' anotações');
    });
}

async function salvarNota(cliente, data, texto) {
  var r = await chamar('/api/anotacoes', { acao: 'somar', cliente: cliente, data: data, texto: texto });
  estado.notas[cliente] = r.notas || [];
  atualizarEtiquetaNotas(cliente);
  return estado.notas[cliente];
}

async function editarNota(cliente, indice, data, texto) {
  var r = await chamar('/api/anotacoes', {
    acao: 'editar', cliente: cliente, indice: indice, data: data, texto: texto
  });
  estado.notas[cliente] = r.notas || [];
  return estado.notas[cliente];
}

async function apagarNota(cliente, indice) {
  var r = await chamar('/api/anotacoes', { acao: 'apagar', cliente: cliente, indice: indice });
  estado.notas[cliente] = r.notas || [];
  atualizarEtiquetaNotas(cliente);
  return estado.notas[cliente];
}

async function perguntarIa(acao, pergunta) {
  return chamar('/api/duvida', { acao: acao, pergunta: pergunta });
}

/* Clicar numa linha faz o roteiro falar daquele cliente. A linha continua
   sendo uma linha de tabela: quem só quer ler a lista não perde nada, e quem
   vai ligar ganha a fala com a data e o histórico certos. */
function ligarSelecao(rodadas) {
  var linhas = document.querySelectorAll('.rt-listas tbody tr[data-rodada]');
  for (var i = 0; i < linhas.length; i++) {
    (function (tr) {
      function escolher() {
        // Vale tambem quando o clique cai no telefone: quem toca no numero e
        // exatamente quem vai ligar, e e nessa hora que o roteiro precisa
        // estar pronto. O link continua funcionando -- nada e cancelado aqui.
        var r = rodadas[Number(tr.getAttribute('data-rodada'))];
        var linha = r && r.linhas[Number(tr.getAttribute('data-linha'))];
        if (!linha) return null;

        var antes = document.querySelectorAll('.rt-listas tr[data-rtsel="1"]');
        for (var k = 0; k < antes.length; k++) antes[k].removeAttribute('data-rtsel');
        tr.setAttribute('data-rtsel', '1');

        Roteiro.selecionar(Roteiro.daLinha(linha, r.colunas, r.modo));
        return linha;
      }
      tr.addEventListener('click', function (ev) {
        var linha = escolher();
        // A etiqueta "2 anotações" e um atalho: um toque nela ja abre o
        // caderno. Serve o celular, onde o toque duplo e mais desajeitado.
        if (linha && ev.target && ev.target.classList.contains('tag-nota')) {
          Roteiro.abrirNotas();
        }
      });
      // Dois cliques abrem o caderno daquele cliente, ja na aba certa.
      tr.addEventListener('dblclick', function () {
        if (escolher()) Roteiro.abrirNotas();
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
    estado.token = token;
    await carregarExtras();
    render(dados);
  } catch (e) {
    aviso('Sem conexão',
      'Não consegui falar com o servidor. Confira sua internet e atualize a página.');
  }
}

carregar();
window.addEventListener('hashchange', carregar);
