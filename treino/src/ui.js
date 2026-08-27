/* A tela. Quatro abas, um botao de comecar e uma tela cheia para treinar.
 *
 * Tudo mora no `localStorage`, no proprio aparelho: nao existe cadastro,
 * nao existe servidor e nada e enviado a lugar nenhum. O preco disso esta
 * escrito na tela de Ajustes — trocar de celular so leva o historico junto
 * se a pessoa exportar o arquivo.
 *
 * Este e o unico arquivo que conhece o DOM. Toda conta que apareceu aqui
 * um dia acabou descendo para `montador.js`, `relogio.js` ou
 * `progresso.js`, que rodam no node e tem teste.
 */

/* eslint-disable no-undef */
const F = window.Formato, X = window.Exercicios, M = window.Montador,
  R = window.Relogio, P = window.Progresso, D = window.Bonecos;

const CHAVE = 'circuito.v1';
const MARCA = CHAVE + '.gravou';
let estado = P.estadoNovo();
let armazenamento = 'ok';   // ok | recusado | esqueceu | previa
let alertaFechado = false;
let aba = 'hoje';
let sessao = null;          // o treino em andamento, ou null
let audio = null;
let travaTela = null;
let filtro = { texto: '', equipamento: '', grupo: '' };

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------------ *
 * Guardar e ler                                                       *
 * ------------------------------------------------------------------ */
function carregar() {
  try {
    const cru = localStorage.getItem(CHAVE);
    estado = P.normalizar(cru ? JSON.parse(cru) : null);
  } catch (e) {
    estado = P.estadoNovo();
  }
}

function salvar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
    // Marca que esta aba ja gravou. E so com esta marca que da para
    // descobrir, na proxima abertura, que o navegador aceitou salvar e
    // esqueceu — o caso em que tudo some sem nenhum erro aparecer.
    try { sessionStorage.setItem(MARCA, '1'); } catch (e2) { /* nem sempre existe */ }
  } catch (e) {
    // Um aviso por vez, na faixa fixa. Antes isto era um toast a cada
    // gravacao: a pessoa via o mesmo recado piscar dez vezes e nao via o
    // que fazer com ele.
    if (armazenamento !== 'recusado') {
      armazenamento = 'recusado';
      alertaFechado = false;
      pintarAlerta();
    }
  }
}

/* Este navegador guarda mesmo o que a gente pede?
 *
 * Tres respostas diferentes, e o app trata as tres, porque para quem usa
 * elas parecem a mesma coisa: "sumiu".
 *
 * - `recusado`: gravar levanta erro, ou o que volta nao e o que foi
 *   gravado. Aba anonima do Safari e arquivo aberto direto no iPhone.
 * - `esqueceu`: gravar funcionou nesta aba e, ao recarregar, nao voltou
 *   nada. E o pior dos tres, porque nenhum erro aparece.
 * - `previa`: rodando dentro de uma moldura — visualizador de anexo,
 *   previa de mensagem. Costuma nao guardar entre uma abertura e outra.
 *
 * A conferencia roda ANTES de qualquer gravacao: depois da primeira, o
 * armazenamento nunca mais estaria vazio e o caso `esqueceu` nao apareceria.
 */
function conferirArmazenamento() {
  try {
    const teste = CHAVE + '.teste';
    localStorage.setItem(teste, '1');
    const voltou = localStorage.getItem(teste) === '1';
    localStorage.removeItem(teste);
    if (!voltou) return 'recusado';
  } catch (e) {
    return 'recusado';
  }

  try {
    if (sessionStorage.getItem(MARCA) === '1' && !localStorage.getItem(CHAVE)) return 'esqueceu';
  } catch (e) { /* sem sessionStorage nao da para saber; segue */ }

  try {
    if (window.self !== window.top) return 'previa';
  } catch (e) {
    return 'previa';   // moldura de outro endereco: nem da para perguntar
  }
  return 'ok';
}

const ALERTAS = {
  recusado: {
    titulo: 'Este navegador não está guardando nada',
    texto: 'Ele recusou o armazenamento, então o treino de hoje funciona mas some ao fechar. '
      + 'Costuma ser aba anônima, ou o arquivo aberto direto do anexo no iPhone. '
      + 'Abrindo pelo navegador do celular, ele guarda.',
    acao: 'Exportar o que tenho',
  },
  esqueceu: {
    titulo: 'O navegador apagou o que você tinha feito',
    texto: 'Ele aceitou salvar e esqueceu ao recarregar — é o que a aba anônima faz. '
      + 'Abra numa aba normal, ou instale o app na tela de início, para o histórico ficar.',
    acao: 'Exportar o que tenho',
  },
  previa: {
    titulo: 'Isto é uma prévia',
    texto: 'Prévia de arquivo costuma não guardar nada entre uma abertura e outra: o treino '
      + 'funciona, o histórico some. Baixe o arquivo e abra no navegador do celular.',
    acao: '',
  },
};

function pintarAlerta() {
  const barra = $('alerta');
  const info = ALERTAS[armazenamento];
  if (!info || alertaFechado) { barra.hidden = true; return; }

  barra.innerHTML = '<div class="txt"><b>' + esc(info.titulo) + '</b>' + esc(info.texto) + '</div>'
    + '<div class="btns">'
    + (info.acao ? '<button type="button" data-acao="exportar">' + esc(info.acao) + '</button>' : '')
    + '<button type="button" class="fraco" data-acao="fechar">Entendi</button>'
    + '</div>';
  barra.hidden = false;
  const botaoExportar = barra.querySelector('[data-acao="exportar"]');
  if (botaoExportar) botaoExportar.onclick = exportar;
  barra.querySelector('[data-acao="fechar"]').onclick = () => {
    alertaFechado = true;
    barra.hidden = true;
  };
}

/* ------------------------------------------------------------------ *
 * Avisos                                                              *
 * ------------------------------------------------------------------ */
let toastAtual = null;

function aviso(titulo, texto, tom, acao) {
  if (toastAtual) toastAtual.remove();
  const d = document.createElement('div');
  d.className = 'toast' + (tom ? ' ' + tom : '');
  d.innerHTML = '<div class="txt"><b>' + esc(titulo) + '</b><small>' + esc(texto || '') + '</small></div>'
    + (acao ? '<button type="button">' + esc(acao.texto) + '</button>' : '');
  if (acao) {
    d.querySelector('button').onclick = () => { d.remove(); toastAtual = null; acao.fazer(); };
  }
  document.body.appendChild(d);
  toastAtual = d;
  const meu = d;
  setTimeout(() => { if (meu === toastAtual) { meu.remove(); toastAtual = null; } }, acao ? 8000 : 3600);
}

/* ------------------------------------------------------------------ *
 * O treino de hoje                                                    *
 * ------------------------------------------------------------------ */

/* A impressao digital dos ajustes. Se ela muda, o treino guardado nao
   serve mais: pedir 40 minutos e continuar vendo o circuito de 20 seria o
   app ignorando o que a pessoa acabou de escolher. */
const LOCAIS = [
  ['apartamento', 'Apartamento', 'Sem barulho para o andar de baixo'],
  ['casa', 'Casa', 'Pode pular e fazer barulho'],
  ['academia', 'Academia', 'Com os pesos e aparelhos de lá'],
  ['ar-livre', 'Ar livre', 'Parque, praia, quadra — o que dá para levar'],
];

function nomeLocal(id) {
  const achado = LOCAIS.filter((l) => l[0] === id)[0];
  return achado ? achado[1] : id;
}

function assinatura(a) {
  const l = P.localAtual(a);
  return [a.minutos, a.foco, a.nivel, l.nome, l.semImpacto ? 1 : 0,
    l.equipamentos.slice().sort().join('+')].join('|');
}

function sortearTreino(variacao) {
  const hoje = F.hoje();
  const a = estado.ajustes;
  const ass = assinatura(a);
  const local = P.localAtual(a);
  const treino = M.montar({
    minutos: a.minutos, foco: a.foco, nivel: a.nivel, semImpacto: local.semImpacto,
    equipamentos: local.equipamentos,
    // A semente amarra o treino ao dia: fechar e abrir o app a tarde
    // devolve o mesmo circuito da manha. Trocar de ideia so acontece se a
    // pessoa pedir outro, e ai a variacao muda.
    semente: hoje + '|' + ass + '|' + (variacao || 0),
    evitar: P.recentes(estado.historico, 3),
  });
  treino.local = local.nome;
  estado.doDia = { data: hoje, assinatura: ass, variacao: variacao || 0, treino: treino };
  salvar();
  return treino;
}

function treinoDeHoje() {
  const d = estado.doDia;
  if (d && d.data === F.hoje() && d.assinatura === assinatura(estado.ajustes) && d.treino) {
    return d.treino;
  }
  return sortearTreino(0);
}

/* ------------------------------------------------------------------ *
 * Pedacos de tela reaproveitados                                      *
 * ------------------------------------------------------------------ */
function selo(texto) {
  return '<span class="chip">' + esc(texto) + '</span>';
}

function nomeEquip(q) {
  return X.EQUIPAMENTOS[q] || q;
}

/* O desenho do exercicio. Guardado num cache porque a mesma figura e pedida
   varias vezes por tela (lista, ficha, execucao) e montar o SVG e string
   pura: melhor montar uma vez. */
const cacheBoneco = {};

function boneco(id, animar) {
  const chave = id + (animar ? '|anima' : '');
  if (!cacheBoneco[chave]) {
    const ex = X.porId(id);
    cacheBoneco[chave] = D.svg(id, { padrao: ex ? ex.padrao : 'agachar', animar: !!animar });
  }
  return cacheBoneco[chave];
}

function linhaEstacao(id, n) {
  const e = X.porId(id);
  if (!e) return '';
  return '<div class="estacao" data-ficha="' + esc(id) + '">'
    + '<div class="n">' + n + '</div>'
    + '<div class="mini-boneco">' + boneco(id, false) + '</div>'
    + '<div class="n2">' + esc(e.nome)
    + '<small>' + esc(X.PADROES[e.padrao] || e.padrao)
    + (e.equipamento.length ? ' · ' + esc(F.listar(e.equipamento.map(nomeEquip))) : '')
    + '</small></div>'
    + (e.unilateral ? '<div class="lado">troca de lado</div>' : '')
    + '</div>';
}

/* ------------------------------------------------------------------ *
 * Aba: Hoje                                                           *
 * ------------------------------------------------------------------ */
const TEMPOS = [10, 15, 20, 30, 45, 60];
const FOCOS = [
  ['corpo-todo', 'Corpo todo'], ['inferior', 'Pernas'],
  ['superior', 'Braços e costas'], ['core', 'Core'],
];

function telaHoje() {
  const t = treinoDeHoje();
  const a = estado.ajustes;
  const r = P.resumo(estado.historico);
  const precisa = M.equipamentoNecessario(t);
  const estacoes = t.blocos.reduce((s, b) => s + b.exercicios.length * b.rodadas, 0);

  let h = '<div class="cartao destaque hero">'
    + '<div class="rotulo">Treino de hoje</div>'
    + '<div class="valor">' + Math.round(M.duracao(t) / 60) + ' min</div>'
    + '<div class="apoio">' + esc(P.recado(estado.historico, a)) + '</div>'
    + '</div>';

  h += '<div class="linhas" style="margin-bottom:14px">'
    + '<div class="mini"><b>' + t.blocos.length + '</b><small>'
    + (t.blocos.length === 1 ? 'bloco' : 'blocos') + '</small></div>'
    + '<div class="mini"><b>' + estacoes + '</b><small>estações</small></div>'
    + '<div class="mini"><b>' + Math.round(M.tempoDeEsforco(t) / 60) + '</b><small>min de esforço</small></div>'
    + '</div>';

  const local = P.localAtual(a);
  h += '<div class="cartao">'
    + '<label>Onde você vai treinar</label><div class="opcoes" style="margin-bottom:6px">'
    + LOCAIS.map(([id, nome]) => '<button type="button" data-local="' + id + '" aria-pressed="'
      + (a.local === id) + '">' + esc(nome) + '</button>').join('')
    + '</div><p class="ajuda" style="margin-bottom:14px">'
    + esc(LOCAIS.filter((l) => l[0] === a.local).map((l) => l[2])[0] || '')
    + (local.semImpacto ? ' · nada que saia do chão entra no treino.' : '')
    + '</p>'
    + '<label>Tempo</label><div class="opcoes" style="margin-bottom:14px">'
    + TEMPOS.map((m) => '<button type="button" data-tempo="' + m + '" aria-pressed="'
      + (a.minutos === m) + '">' + m + '</button>').join('')
    + '</div>'
    + '<label>Foco</label><div class="opcoes">'
    + FOCOS.map(([id, nome]) => '<button type="button" data-foco="' + id + '" aria-pressed="'
      + (a.foco === id) + '">' + esc(nome) + '</button>').join('')
    + '</div></div>';

  h += '<div class="cartao">'
    + '<div class="bloco-cab"><b>O que você vai precisar</b>'
    + '<small>' + esc(nomeLocal(a.local)) + '</small></div>'
    + '<p class="ajuda" style="margin-top:4px">'
    + (precisa.length ? esc(F.maiuscula(F.listar(precisa.map(nomeEquip))))
      + '. O resto é peso do corpo.' : 'Nada além do seu corpo e um espaço de dois passos.')
    + '</p></div>';

  t.blocos.forEach((b) => {
    h += '<div class="cartao"><div class="bloco-cab"><b>' + esc(b.nome) + '</b>'
      + '<small>' + b.rodadas + 'x · ' + b.trabalho + 's / ' + b.descanso + 's</small></div>'
      + b.exercicios.map((id, i) => linhaEstacao(id, i + 1)).join('')
      + '</div>';
  });

  h += '<div class="cartao"><div class="bloco-cab"><b>Aquecimento e volta à calma</b>'
    + '<small>' + F.duracao((t.aquecimento.length * t.tempoAquecimento)
      + (t.solta.length * t.tempoSolta)) + '</small></div>'
    + t.aquecimento.concat(t.solta).map((id, i) => linhaEstacao(id, i + 1)).join('')
    + '</div>';

  h += '<div class="btn-linha" style="margin-top:6px">'
    + '<button class="btn pri bloco" data-acao="comecar">Começar o treino</button>'
    + '<button class="btn bloco" data-acao="sortear">Sortear outro circuito</button>'
    + '</div>';

  h += '<div class="rodape">Sequência de ' + esc(F.plural(r.sequencia, 'dia', 'dias'))
    + ' · recorde de ' + esc(F.plural(r.recorde, 'dia', 'dias')) + '</div>';

  const pane = $('pane-hoje');
  pane.innerHTML = h;
  pane.querySelectorAll('[data-tempo]').forEach((b) => {
    b.onclick = () => { estado.ajustes.minutos = Number(b.dataset.tempo); salvar(); desenhar(); };
  });
  pane.querySelectorAll('[data-foco]').forEach((b) => {
    b.onclick = () => { estado.ajustes.foco = b.dataset.foco; salvar(); desenhar(); };
  });
  pane.querySelectorAll('[data-local]').forEach((b) => {
    b.onclick = () => { estado.ajustes.local = b.dataset.local; salvar(); desenhar(); };
  });
  ligarFichas(pane);
  pane.querySelector('[data-acao="comecar"]').onclick = comecar;
  pane.querySelector('[data-acao="sortear"]').onclick = () => {
    sortearTreino((estado.doDia && estado.doDia.variacao || 0) + 1);
    desenhar();
    aviso('Outro circuito', 'Mesmo tempo, exercícios diferentes.');
  };
}

/* ------------------------------------------------------------------ *
 * Aba: Exercícios                                                     *
 * ------------------------------------------------------------------ */
function telaExercicios() {
  const equips = X.equipamentosUsados();
  // Quem abre esta aba quer ver exercicio de treino. O aquecimento e o
  // alongamento continuam na lista — sao parte do app —, mas depois, e com
  // o nome do que sao.
  const ORDEM = { principal: 0, aquecimento: 1, solta: 2 };
  const lista = X.LISTA.slice().sort((a, b) => ORDEM[a.tipo] - ORDEM[b.tipo]).filter((e) => {
    if (filtro.grupo && e.grupo !== filtro.grupo) return false;
    if (filtro.equipamento === 'corpo' && e.equipamento.length) return false;
    if (filtro.equipamento && filtro.equipamento !== 'corpo'
      && e.equipamento.indexOf(filtro.equipamento) < 0) return false;
    if (filtro.texto) {
      const alvo = F.semAcento(e.nome + ' ' + (X.PADROES[e.padrao] || '') + ' ' + (X.GRUPOS[e.grupo] || ''));
      if (alvo.indexOf(F.semAcento(filtro.texto)) < 0) return false;
    }
    return true;
  });

  let h = '<h2>Exercícios</h2><p class="sub">'
    + F.plural(X.LISTA.length, 'movimento', 'movimentos') + ' no catálogo. Toque para ver como fazer.</p>';

  h += '<div class="busca"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" '
    + 'stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'
    + '<input id="buscaEx" type="search" placeholder="Buscar exercício" value="' + esc(filtro.texto) + '"></div>';

  h += '<div class="opcoes" style="margin-bottom:8px">'
    + '<button type="button" data-grupo="" aria-pressed="' + (!filtro.grupo) + '">Todos</button>'
    + Object.keys(X.GRUPOS).map((g) => '<button type="button" data-grupo="' + g + '" aria-pressed="'
      + (filtro.grupo === g) + '">' + esc(g === 'corpo-todo' ? 'Corpo todo'
        : (g === 'inferior' ? 'Pernas' : (g === 'superior' ? 'Superior' : 'Core'))) + '</button>').join('')
    + '</div>';

  h += '<div class="opcoes" style="margin-bottom:14px">'
    + '<button type="button" data-equip="" aria-pressed="' + (!filtro.equipamento) + '">Tudo</button>'
    + '<button type="button" data-equip="corpo" aria-pressed="' + (filtro.equipamento === 'corpo')
    + '">Só o corpo</button>'
    + equips.map((q) => '<button type="button" data-equip="' + q + '" aria-pressed="'
      + (filtro.equipamento === q) + '">' + esc(nomeEquip(q)) + '</button>').join('')
    + '</div>';

  h += '<div class="cartao">' + (lista.length ? lista.map((e) =>
    '<div class="item clicavel" data-ficha="' + esc(e.id) + '">'
    + '<div class="ico">' + boneco(e.id, false) + '</div>'
    + '<div class="txt"><b>' + esc(e.nome) + '</b><small>'
    + (e.tipo === 'aquecimento' ? 'Aquecimento · ' : (e.tipo === 'solta' ? 'Volta à calma · ' : ''))
    + esc(X.GRUPOS[e.grupo])
    + (e.equipamento.length ? ' · ' + esc(F.listar(e.equipamento.map(nomeEquip))) : ' · peso do corpo')
    + '</small></div>'
    + '<div class="val">nv ' + e.nivel + '</div></div>').join('')
    : '<div class="vazio">Nada com esse filtro.</div>') + '</div>';

  const pane = $('pane-exercicios');
  pane.innerHTML = h;
  const busca = $('buscaEx');
  busca.oninput = () => {
    filtro.texto = busca.value;
    telaExercicios();
    const b = $('buscaEx');
    b.focus();
    b.setSelectionRange(b.value.length, b.value.length);
  };
  pane.querySelectorAll('[data-grupo]').forEach((b) => {
    b.onclick = () => { filtro.grupo = b.dataset.grupo; telaExercicios(); };
  });
  pane.querySelectorAll('[data-equip]').forEach((b) => {
    b.onclick = () => { filtro.equipamento = b.dataset.equip; telaExercicios(); };
  });
  ligarFichas(pane);
}

/* A ficha do exercicio, que sobe de baixo. Ela existe para uma pergunta so
   — "como e que faz isso?" — e por isso comeca pelas dicas, nao pelos
   selos. */
function ligarFichas(pane) {
  pane.querySelectorAll('[data-ficha]').forEach((el) => {
    el.onclick = () => abrirFicha(el.dataset.ficha);
  });
}

function abrirFicha(id) {
  const e = X.porId(id);
  if (!e) return;
  const facil = X.vizinho(id, 'facilita');
  const dificil = X.vizinho(id, 'dificulta');

  let h = '<div class="puxador"></div><h2>' + esc(e.nome) + '</h2>'
    + '<div class="boneco-caixa">' + boneco(id, true) + '</div>'
    + '<div class="selos">' + selo(X.GRUPOS[e.grupo]) + selo(X.PADROES[e.padrao])
    + selo('nível ' + e.nivel)
    + selo(e.equipamento.length ? F.listar(e.equipamento.map(nomeEquip)) : 'peso do corpo')
    + (e.impacto === 'alto' ? selo('faz barulho') : '')
    + (e.unilateral ? selo('um lado de cada vez') : '')
    + '</div>'
    + '<ul>' + e.dicas.map((d) => '<li>' + esc(d) + '</li>').join('') + '</ul>';

  if (facil || dificil) {
    h += '<div class="secao"><h3>Se precisar mudar</h3></div><div>';
    if (facil) h += '<div class="item clicavel" data-troca="' + esc(facil.id) + '"><div class="ico">−</div>'
      + '<div class="txt"><b>' + esc(facil.nome) + '</b><small>versão mais fácil</small></div></div>';
    if (dificil) h += '<div class="item clicavel" data-troca="' + esc(dificil.id) + '"><div class="ico">+</div>'
      + '<div class="txt"><b>' + esc(dificil.nome) + '</b><small>versão mais difícil</small></div></div>';
    h += '</div>';
  }
  h += '<button class="btn bloco" style="margin-top:16px" data-acao="fechar">Fechar</button>';

  const folha = $('folha');
  $('folhaDentro').innerHTML = h;
  folha.hidden = false;
  folha.onclick = (ev) => { if (ev.target === folha) fecharFicha(); };
  $('folhaDentro').querySelector('[data-acao="fechar"]').onclick = fecharFicha;
  $('folhaDentro').querySelectorAll('[data-troca]').forEach((el) => {
    el.onclick = () => abrirFicha(el.dataset.troca);
  });
}

function fecharFicha() {
  $('folha').hidden = true;
}

/* ------------------------------------------------------------------ *
 * Aba: Histórico                                                      *
 * ------------------------------------------------------------------ */
function telaHistorico() {
  const r = P.resumo(estado.historico);
  const dias = P.ultimosDias(estado.historico, 14);
  const teto = Math.max(30, ...dias.map((d) => d.minutos));
  const meta = estado.ajustes.metaSemanal;

  let h = '<h2>Histórico</h2><p class="sub">O que ficou registrado neste aparelho.</p>';

  h += '<div class="linhas" style="margin-bottom:14px">'
    + '<div class="mini' + (r.sequencia ? ' viva' : '') + '"><b>' + r.sequencia + '</b><small>dias seguidos</small></div>'
    + '<div class="mini' + (r.semana.treinos >= meta ? ' bom' : '') + '"><b>' + r.semana.treinos + '/' + meta
    + '</b><small>na semana</small></div>'
    + '<div class="mini"><b>' + r.total.treinos + '</b><small>no total</small></div>'
    + '</div>';

  h += '<div class="cartao"><div class="bloco-cab"><b>Últimos 14 dias</b>'
    + '<small>' + F.plural(r.semana.minutos, 'min', 'min') + ' nesta semana</small></div>'
    + '<div class="barras">'
    + dias.map((d, i) => '<i class="' + (d.treinou ? 'tem' : '') + (i === dias.length - 1 ? ' hoje' : '')
      + '" style="height:' + Math.max(3, Math.round((d.minutos / teto) * 74)) + 'px"'
      + ' title="' + esc(F.dataCurta(d.data)) + '"></i>').join('')
    + '</div><div class="eixo"><span>' + esc(F.dataCurta(dias[0].data)) + '</span><span>hoje</span></div>'
    + '</div>';

  const top = P.maisTreinados(estado.historico, 5);
  if (top.length) {
    h += '<div class="cartao"><div class="bloco-cab"><b>Mais treinados</b></div>'
      + top.map((x) => {
        const e = X.porId(x.id);
        return '<div class="estacao"><div class="n2">' + esc(e ? e.nome : x.id)
          + '</div><div class="val mono">' + F.plural(x.vezes, 'vez', 'vezes') + '</div></div>';
      }).join('') + '</div>';
  }

  h += '<div class="secao"><h3>Sessões</h3></div><div class="cartao">';
  if (!estado.historico.length) {
    h += '<div class="vazio">Nenhum treino ainda. O primeiro cabe em 10 minutos.</div>';
  } else {
    h += estado.historico.slice(0, 40).map((s) => '<div class="item">'
      + '<div class="ico">' + esc(F.SEMANA_CURTA[F.diaSemana(s.data)]) + '</div>'
      + '<div class="txt"><b>' + esc(F.maiuscula(F.dataAmigavel(s.data))) + '</b>'
      + '<small>' + F.plural(s.minutos, 'minuto', 'minutos') + ' · '
      + esc(s.foco === 'corpo-todo' ? 'corpo todo' : (X.GRUPOS[s.foco] || s.foco).toLowerCase())
      + (s.completo ? '' : ' · parou no meio') + '</small></div>'
      + '<div class="val"><button class="btn peq" data-apagar="' + esc(s.id) + '">apagar</button></div>'
      + '</div>').join('');
  }
  h += '</div>';

  const pane = $('pane-historico');
  pane.innerHTML = h;
  pane.querySelectorAll('[data-apagar]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.apagar;
      const copia = estado.historico.slice();
      estado = P.apagarSessao(estado, id);
      salvar();
      desenhar();
      aviso('Sessão apagada', '', '', {
        texto: 'Desfazer',
        fazer: () => { estado.historico = copia; salvar(); desenhar(); },
      });
    };
  });
}

/* ------------------------------------------------------------------ *
 * Aba: Ajustes                                                        *
 * ------------------------------------------------------------------ */
const NIVEIS = [
  [1, 'Começando', '30 s de esforço, 30 s de descanso'],
  [2, 'Já treino', '40 s de esforço, 20 s de descanso'],
  [3, 'Pesado', '45 s de esforço, 15 s de descanso'],
];

function telaAjustes() {
  const a = estado.ajustes;
  let h = '<h2>Ajustes</h2><p class="sub">Tudo fica neste aparelho.</p>';

  h += '<div class="cartao"><label>Nível</label><div class="opcoes coluna">'
    + NIVEIS.map(([n, nome, desc]) => '<button type="button" data-nivel="' + n + '" aria-pressed="'
      + (a.nivel === n) + '">' + esc(nome) + '<small>' + esc(desc) + '</small></button>').join('')
    + '</div><p class="ajuda">O nível também esconde os exercícios acima dele — '
    + 'barra fixa não aparece para quem está começando.</p></div>';

  const local = P.localAtual(a);
  h += '<div class="cartao"><div class="bloco-cab"><b>Cada lugar, o seu equipamento</b></div>'
    + '<p class="ajuda" style="margin:2px 0 10px">Escolha o lugar e diga o que tem lá. '
    + 'O app guarda separado: o halter de casa não vira halter do parque.</p>'
    + '<div class="opcoes chips" style="margin-bottom:12px">'
    + LOCAIS.map(([id, nome]) => '<button type="button" data-local="' + id + '" aria-pressed="'
      + (a.local === id) + '">' + esc(nome) + '</button>').join('')
    + '</div>'
    + X.equipamentosUsados().map((q) => '<div class="troca"><div class="txt"><b>' + esc(nomeEquip(q))
      + '</b></div><label class="switch"><input type="checkbox" data-equip="' + q + '"'
      + (local.equipamentos.indexOf(q) >= 0 ? ' checked' : '') + '><i></i></label></div>').join('')
    + '<div class="troca"><div class="txt"><b>Sem pulo, sem barulho</b>'
    + '<small>Em ' + esc(nomeLocal(a.local).toLowerCase())
    + ': tira polichinelo, burpee e tudo que sai do chão</small></div>'
    + '<label class="switch"><input type="checkbox" data-local-impacto="1"'
    + (local.semImpacto ? ' checked' : '') + '><i></i></label></div>'
    + '</div>';

  h += '<div class="cartao">'
    + '<div class="troca"><div class="txt"><b>Apito</b><small>Avisa a troca e os 3 segundos finais</small></div>'
    + '<label class="switch"><input type="checkbox" data-ligar="som"' + (a.som ? ' checked' : '') + '><i></i></label></div>'
    + '<div class="troca"><div class="txt"><b>Vibrar</b><small>Para treinar com fone ou no silencioso</small></div>'
    + '<label class="switch"><input type="checkbox" data-ligar="vibrar"' + (a.vibrar ? ' checked' : '') + '><i></i></label></div>'
    + '<div class="troca"><div class="txt"><b>Manter a tela acesa</b>'
    + '<small>Durante o treino, para não apagar no meio da prancha</small></div>'
    + '<label class="switch"><input type="checkbox" data-ligar="telaAcesa"' + (a.telaAcesa ? ' checked' : '') + '><i></i></label></div>'
    + '</div>';

  h += '<div class="cartao"><label>Meta da semana</label><div class="opcoes chips">'
    + [2, 3, 4, 5, 6].map((n) => '<button type="button" data-meta="' + n + '" aria-pressed="'
      + (a.metaSemanal === n) + '">' + n + '</button>').join('')
    + '</div><p class="ajuda">Treinos por semana. A semana começa na segunda.</p></div>';

  h += '<div class="cartao"><div class="bloco-cab"><b>Seus dados</b></div>'
    + '<p class="ajuda" style="margin:2px 0 12px">Nada sai deste aparelho. Se trocar de celular ou '
    + 'limpar o navegador, o histórico vai junto — exporte antes.</p>'
    + '<div class="btn-linha">'
    + '<button class="btn peq" data-acao="exportar">Exportar</button>'
    + '<button class="btn peq" data-acao="importar">Importar</button>'
    + '<button class="btn peq perigo" data-acao="apagar">Apagar tudo</button>'
    + '</div><input type="file" id="arquivo" accept="application/json" hidden></div>';

  h += '<div class="rodape">Circuito · versão <span class="mono">'
    + esc((document.querySelector('meta[name="circuito-versao"]') || {}).content || '—')
    + '</span><br>Não substitui orientação profissional. Dor não é esforço: pare.</div>';

  const pane = $('pane-ajustes');
  pane.innerHTML = h;

  pane.querySelectorAll('[data-nivel]').forEach((b) => {
    b.onclick = () => { estado.ajustes.nivel = Number(b.dataset.nivel); salvar(); desenhar(); };
  });
  pane.querySelectorAll('[data-meta]').forEach((b) => {
    b.onclick = () => { estado.ajustes.metaSemanal = Number(b.dataset.meta); salvar(); desenhar(); };
  });
  pane.querySelectorAll('[data-local]').forEach((b) => {
    b.onclick = () => { estado.ajustes.local = b.dataset.local; salvar(); desenhar(); };
  });
  pane.querySelectorAll('input[data-equip]').forEach((c) => {
    c.onchange = () => {
      const q = c.dataset.equip;
      const atual = P.localAtual(estado.ajustes);
      const l = atual.equipamentos.filter((x) => x !== q);
      if (c.checked) l.push(q);
      estado.ajustes.locais[atual.nome].equipamentos = l;
      salvar();
      desenhar();
    };
  });
  pane.querySelectorAll('input[data-local-impacto]').forEach((c) => {
    c.onchange = () => {
      estado.ajustes.locais[P.localAtual(estado.ajustes).nome].semImpacto = c.checked;
      salvar();
      desenhar();
    };
  });
  pane.querySelectorAll('input[data-ligar]').forEach((c) => {
    c.onchange = () => { estado.ajustes[c.dataset.ligar] = c.checked; salvar(); desenhar(); };
  });
  pane.querySelector('[data-acao="exportar"]').onclick = exportar;
  pane.querySelector('[data-acao="importar"]').onclick = () => $('arquivo').click();
  pane.querySelector('[data-acao="apagar"]').onclick = () => {
    if (!window.confirm('Apagar todos os treinos e ajustes deste aparelho?')) return;
    estado = P.estadoNovo();
    salvar();
    desenhar();
    aviso('Tudo apagado', 'O app voltou ao estado de fábrica.');
    // Apagar de proposito nao e o navegador esquecendo: sem isto, a
    // proxima abertura acusaria perda de dados que a pessoa mandou apagar.
    if (armazenamento === 'esqueceu') { armazenamento = 'ok'; pintarAlerta(); }
  };
  $('arquivo').onchange = importar;
}

function exportar() {
  const nome = 'circuito-' + F.hoje() + '.json';
  const texto = JSON.stringify(estado, null, 2);
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function importar(ev) {
  const arq = ev.target.files && ev.target.files[0];
  if (!arq) return;
  const leitor = new FileReader();
  leitor.onload = () => {
    try {
      estado = P.normalizar(JSON.parse(String(leitor.result)));
      salvar();
      desenhar();
      aviso('Dados importados', F.plural(estado.historico.length, 'treino', 'treinos') + ' no histórico.', 'bom');
    } catch (e) {
      aviso('Arquivo inválido', 'Esperava o JSON exportado pelo próprio app.', 'ruim');
    }
  };
  leitor.readAsText(arq);
  ev.target.value = '';
}

/* ------------------------------------------------------------------ *
 * Som e vibracao                                                      *
 * ------------------------------------------------------------------ */

/* O navegador do celular so deixa tocar som depois de um toque na tela.
   Por isso o audio nasce no botao "comecar" e nao no carregamento: criado
   antes, ele nasce mudo e o apito nunca sai. */
function ligarAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!audio && AC) audio = new AC();
    if (audio && audio.state === 'suspended') audio.resume();
  } catch (e) { audio = null; }
}

function apito(freq, dur, volume) {
  if (!estado.ajustes.som || !audio) return;
  try {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    o.connect(g);
    g.connect(audio.destination);
    const t = audio.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume || 0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.03);
  } catch (e) { /* som e enfeite: nunca pode derrubar o treino */ }
}

function vibrar(padrao) {
  if (!estado.ajustes.vibrar) return;
  try { if (navigator.vibrate) navigator.vibrate(padrao); } catch (e) { /* idem */ }
}

/* A tela nao pode apagar no meio de uma prancha de 45 segundos: a pessoa
   esta com as duas maos no chao e nao tem como tocar no celular. Onde o
   navegador nao tem Wake Lock, o treino continua — so a tela apaga. */
function segurarTela() {
  if (!estado.ajustes.telaAcesa || travaTela) return;
  try {
    if (navigator.wakeLock && navigator.wakeLock.request) {
      navigator.wakeLock.request('screen').then((t) => {
        travaTela = t;
        t.addEventListener('release', () => { travaTela = null; });
      }).catch(() => {});
    }
  } catch (e) { /* sem trava, treino igual */ }
}

function soltarTela() {
  try { if (travaTela) travaTela.release(); } catch (e) { /* nada */ }
  travaTela = null;
}

/* ------------------------------------------------------------------ *
 * A execucao do treino                                                *
 * ------------------------------------------------------------------ */

/* O tempo vem sempre do relogio do sistema, nunca de um contador que se
   decrementa. Celular com a tela apagada congela o `requestAnimationFrame`
   — com contador proprio o treino ficaria para tras; com o relogio do
   sistema ele volta no passo certo. */
function agoraSeg() {
  return Date.now() / 1000;
}

function decorrido() {
  if (!sessao) return 0;
  const fim = sessao.pausadoEm || agoraSeg();
  return Math.max(0, fim - sessao.inicio - sessao.pausado);
}

function comecar() {
  const treino = treinoDeHoje();
  const passos = M.passos(treino);
  if (!passos.length) { aviso('Treino vazio', 'Ligue algum equipamento ou aumente o tempo.', 'ruim'); return; }

  ligarAudio();
  segurarTela();
  sessao = {
    treino: treino,
    passos: passos,
    inicio: agoraSeg(),
    pausado: 0,
    pausadoEm: 0,
    ultimo: 0,
    registrada: false,
  };
  $('exec').hidden = false;
  document.body.style.overflow = 'hidden';
  pintarExec();
  sessao.timer = setInterval(pintarExec, 120);
}

function pausar() {
  if (!sessao || sessao.pausadoEm) return;
  sessao.pausadoEm = agoraSeg();
  soltarTela();
  pintarExec();
}

function voltarAoTreino() {
  if (!sessao || !sessao.pausadoEm) return;
  sessao.pausado += agoraSeg() - sessao.pausadoEm;
  sessao.pausadoEm = 0;
  ligarAudio();
  segurarTela();
  pintarExec();
}

/* Mover o relogio e o unico jeito de pular ou voltar: o resto do app so
   sabe ler o tempo decorrido. */
function mover(novoT) {
  if (!sessao) return;
  const base = sessao.pausadoEm || agoraSeg();
  sessao.inicio = base - novoT - sessao.pausado;
  sessao.ultimo = novoT;
  pintarExec();
}

function pintarExec() {
  if (!sessao) return;
  const t = decorrido();
  const e = R.em(sessao.passos, t);

  // Apitos: sempre pelo intervalo entre a ultima pintura e esta, para nao
  // perder nem repetir aviso quando o navegador engasga.
  if (!sessao.pausadoEm) {
    R.avisos(sessao.passos, sessao.ultimo, t).forEach((av) => {
      if (av.tipo === 'conta') { apito(880, 0.09, 0.22); vibrar(35); }
      else if (av.tipo === 'comeca') { apito(1320, 0.22, 0.32); vibrar([0, 90, 60, 90]); }
      else if (av.tipo === 'para') { apito(660, 0.2, 0.26); vibrar(120); }
      else if (av.tipo === 'troca') { apito(1046, 0.12, 0.3); setTimeout(() => apito(1046, 0.12, 0.3), 160); vibrar([0, 60, 60, 60]); }
      else if (av.tipo === 'fim') { apito(1320, 0.5, 0.35); vibrar([0, 200, 100, 200, 100, 300]); }
    });
  }
  sessao.ultimo = t;

  if (e.terminou) { encerrar(true); return; }

  const p = e.passo;
  const ex = p.exercicio ? X.porId(p.exercicio) : null;
  const exec = $('exec');
  exec.dataset.fase = p.tipo;

  // So o "Bloco 2" cabe aqui: o apelido do bloco ("· pernas e core") ja
  // foi lido na tela de Hoje e, no cabecalho estreito, empurrava a rodada
  // para fora da tela — que e justamente o numero que a pessoa procura no
  // meio do circuito.
  $('execOnde').textContent = p.bloco.split(' · ')[0]
    + (p.rodada ? ' · rodada ' + p.rodada + '/' + p.rodadas : '');
  $('execFita').style.width = Math.round(e.progresso * 100) + '%';

  const esforco = R.progressoDeEsforco(sessao.passos, t);
  const rotulo = { trabalho: 'Vai', descanso: 'Descanso', intervalo: 'Descanso maior',
    preparar: 'Prepara', aquecimento: 'Aquecimento', solta: 'Volta à calma' }[p.tipo] || p.tipo;
  const descansando = p.tipo === 'descanso' || p.tipo === 'intervalo';
  $('execFase').innerHTML = esc(rotulo)
    + (p.estacao ? ' <b>' + p.estacao + '/' + p.estacoes + '</b>' : '')
    // No descanso, o nome grande la embaixo e o do proximo exercicio. Sem
    // este aviso a pessoa le "Descanso" em cima de "Burpee" e nao sabe qual
    // dos dois vale agora.
    + (descansando && p.proximoExercicioNome ? ' <b>· a seguir</b>' : '');
  $('execNome').textContent = descansando
    ? (p.proximoExercicioNome || 'Descanso') : (ex ? ex.nome : p.titulo);
  $('execCron').textContent = F.relogio(e.restante);
  $('execCron').classList.toggle('fim', e.restante <= 3 && p.tipo === 'trabalho');

  // O desenho so e trocado quando o exercicio muda: reescrever o SVG a cada
  // pintura (oito vezes por segundo) reiniciaria a animacao sem parar, e o
  // boneco ficaria tremendo em vez de se mexer.
  const desenhar_ex = descansando ? p.proximoExercicio : p.exercicio;
  const caixa = $('execBoneco');
  if (caixa.dataset.ex !== String(desenhar_ex)) {
    caixa.dataset.ex = String(desenhar_ex);
    caixa.innerHTML = desenhar_ex ? boneco(desenhar_ex, true) : '';
  }

  const lado = $('execLado');
  if (e.lado) {
    lado.hidden = false;
    lado.textContent = e.lado === 1 ? 'Primeiro lado' : 'Troque de lado';
  } else lado.hidden = true;

  const proximo = p.proximoExercicio ? X.porId(p.proximoExercicio) : null;
  $('execDicas').innerHTML = descansando
    ? (proximo ? proximo.dicas.map((d) => '<span>' + esc(d) + '</span>').join('')
      : '<span>Respire fundo.</span>')
    : (ex ? ex.dicas.map((d) => '<span>' + esc(d) + '</span>').join('') : '');

  $('execProx').innerHTML = descansando || !p.proximoExercicioNome ? ''
    : 'A seguir: <b>' + esc(p.proximoExercicioNome) + '</b>';

  $('execPausaIcone').innerHTML = sessao.pausadoEm
    ? '<path d="M8 5.5v13l11-6.5z"/>'
    : '<rect x="7" y="5" width="3.6" height="14" rx="1.2"/><rect x="13.4" y="5" width="3.6" height="14" rx="1.2"/>';
  $('execPausa').setAttribute('aria-label', sessao.pausadoEm ? 'Voltar ao treino' : 'Pausar');

  $('execNota').textContent = sessao.pausadoEm ? 'Pausado'
    : (esforco.totais ? esforco.feitas + '/' + esforco.totais + ' estações · faltam '
      + F.duracao(e.restanteTotal) : 'faltam ' + F.duracao(e.restanteTotal));
}

/* Sair da tela de treino. `completo` diz se chegou ao fim sozinho.
 *
 * Parar no meio tambem vira registro: quem aqueceu e fez um bloco treinou,
 * e um app que apaga esse dia esta punindo justamente o dia dificil. So
 * nao registra quem desistiu antes de suar — ai nao houve treino. */
function encerrar(completo) {
  if (!sessao) return;
  clearInterval(sessao.timer);
  const t = decorrido();
  const esforco = R.progressoDeEsforco(sessao.passos, t);
  const minutos = Math.round(Math.min(t, R.total(sessao.passos)) / 60);
  const valeu = completo || esforco.feitas >= 1;

  if (valeu && !sessao.registrada) {
    sessao.registrada = true;
    estado = P.registrar(estado, {
      data: F.hoje(),
      quando: Date.now(),
      minutos: minutos,
      esforco: F.emMinutos(completo ? M.tempoDeEsforco(sessao.treino)
        : esforco.feitas * (sessao.treino.blocos[0] || { trabalho: 40 }).trabalho),
      foco: sessao.treino.foco,
      nivel: sessao.treino.nivel,
      local: sessao.treino.local || estado.ajustes.local,
      completo: !!completo,
      exercicios: M.exerciciosDoTreino(sessao.treino),
    });
    salvar();
  }

  soltarTela();
  $('exec').hidden = true;
  document.body.style.overflow = '';
  const feitas = esforco.feitas, totais = esforco.totais;
  sessao = null;
  desenhar();

  if (completo) {
    mostrarMedalha(minutos, totais);
  } else if (valeu) {
    aviso('Treino guardado', F.plural(minutos, 'minuto', 'minutos') + ' · ' + feitas + ' de ' + totais + ' estações.', 'bom');
  } else {
    aviso('Treino descartado', 'Você parou antes da primeira estação.');
  }
}

function mostrarMedalha(minutos, estacoes) {
  const r = P.resumo(estado.historico);
  const meta = estado.ajustes.metaSemanal;
  let h = '<div class="puxador"></div><div class="medalha">'
    + '<div class="n">' + minutos + ' min</div>'
    + '<p class="sub" style="margin:2px 0 0">' + F.plural(estacoes, 'estação concluída', 'estações concluídas') + '</p>'
    + '</div>'
    + '<div class="linhas" style="margin:16px 0">'
    + '<div class="mini viva"><b>' + r.sequencia + '</b><small>dias seguidos</small></div>'
    + '<div class="mini' + (r.semana.treinos >= meta ? ' bom' : '') + '"><b>' + r.semana.treinos + '/' + meta
    + '</b><small>na semana</small></div>'
    + '<div class="mini"><b>' + r.semana.minutos + '</b><small>min na semana</small></div>'
    + '</div>'
    + '<p class="ajuda">' + esc(r.semana.treinos >= meta
      ? 'Meta da semana batida. Amanhã pode ser um dia leve.'
      : 'Beba água e alongue o que ficou pesado.') + '</p>'
    + '<button class="btn pri bloco" style="margin-top:14px" data-acao="fechar">Fechar</button>';
  $('folhaDentro').innerHTML = h;
  $('folha').hidden = false;
  $('folhaDentro').querySelector('[data-acao="fechar"]').onclick = fecharFicha;
}

/* ------------------------------------------------------------------ *
 * Desenho geral e partida                                             *
 * ------------------------------------------------------------------ */
function desenhar() {
  pintarAlerta();
  const r = P.resumo(estado.historico);
  const chip = $('chipSequencia');
  chip.textContent = r.sequencia ? F.plural(r.sequencia, 'dia seguido', 'dias seguidos') : 'sem sequência';
  chip.classList.toggle('viva', r.sequencia > 0);

  ['hoje', 'exercicios', 'historico', 'ajustes'].forEach((nome) => {
    $('pane-' + nome).hidden = nome !== aba;
  });
  document.querySelectorAll('.aba').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.pane === aba));
  });

  if (aba === 'hoje') telaHoje();
  else if (aba === 'exercicios') telaExercicios();
  else if (aba === 'historico') telaHistorico();
  else telaAjustes();
}

function ligar() {
  carregar();
  armazenamento = conferirArmazenamento();

  document.querySelectorAll('.aba').forEach((b) => {
    b.onclick = () => { aba = b.dataset.pane; desenhar(); };
  });
  $('btnComecar').onclick = () => {
    if (sessao) { $('exec').hidden = false; return; }
    aba = 'hoje';
    comecar();
  };

  $('execPausa').onclick = () => { if (sessao && sessao.pausadoEm) voltarAoTreino(); else pausar(); };
  $('execPular').onclick = () => { if (sessao) mover(R.pular(sessao.passos, decorrido())); };
  $('execVoltar').onclick = () => { if (sessao) mover(R.voltar(sessao.passos, decorrido())); };
  $('execFechar').onclick = () => {
    if (!sessao) return;
    pausar();
    if (window.confirm('Encerrar o treino agora? O que você já fez fica registrado.')) encerrar(false);
    else voltarAoTreino();
  };

  // Voltar de outro app: o relogio do sistema ja andou, entao basta
  // repintar para a tela pular direto para o passo certo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && sessao) { segurarTela(); pintarExec(); }
  });

  desenhar();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar);
else ligar();
