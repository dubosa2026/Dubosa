/* A tela. Quatro abas, um microfone e nenhuma senha de banco.
 *
 * O app guarda tudo em `localStorage`, no proprio aparelho. Nao existe
 * cadastro, nao existe servidor com seus lancamentos, e nada e enviado a
 * lugar nenhum — a unica excecao e o botao "pedir analise a IA", que manda
 * um retrato so de numeros e diz isso na propria tela antes de mandar.
 */

/* eslint-disable no-undef */
const F = window.Formato, N = window.Nucleo, V = window.Voz, C = window.Conselhos;

const CHAVE = 'bussola.v1';
let estado = N.estadoNovo();
let aba = 'hoje';
let horizonte = 'mes';
let escuta = null;
let ultimoDesfazer = null;
let respostaIA = null;

/* ------------------------------------------------------------------ *
 * Guardar e ler                                                       *
 * ------------------------------------------------------------------ */
function carregar() {
  try {
    const cru = localStorage.getItem(CHAVE);
    estado = N.normalizar(cru ? JSON.parse(cru) : null);
  } catch (e) {
    estado = N.estadoNovo();
  }
}

function salvar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch (e) {
    aviso('Não consegui salvar', 'O armazenamento do navegador recusou. Exporte seus dados em Ajustes.', 'ruim');
  }
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* ------------------------------------------------------------------ *
 * Aviso de rodape (com desfazer)                                      *
 * ------------------------------------------------------------------ */
let tToast = null;
function aviso(titulo, texto, tom, desfazer) {
  const velho = $('#toast');
  if (velho) velho.remove();
  if (tToast) clearTimeout(tToast);

  const el = document.createElement('div');
  el.className = 'toast' + (tom ? ' ' + tom : '');
  el.id = 'toast';
  el.innerHTML = '<div class="txt"><b>' + esc(titulo) + '</b>'
    + (texto ? '<small>' + esc(texto) + '</small>' : '') + '</div>'
    + (desfazer ? '<button id="btnDesfazer">desfazer</button>' : '');
  document.body.appendChild(el);
  if (desfazer) $('#btnDesfazer').addEventListener('click', () => { desfazer(); el.remove(); });
  tToast = setTimeout(() => el.remove(), desfazer ? 7000 : 4200);
}

/* ------------------------------------------------------------------ *
 * Aba HOJE                                                            *
 * ------------------------------------------------------------------ */
function paneHoje() {
  const lim = N.limiteDoDia(estado);
  const saldo = N.saldoEm(estado);
  const mes = N.projetar(estado, F.fimDoMes(F.hoje()));
  const usado = lim.limite > 0 ? Math.min(1, lim.gasto / lim.limite) : 1;
  const estourou = lim.resta < 0;
  const recentes = estado.lancamentos.slice(0, 8);
  const primeiroUso = !estado.lancamentos.length && !estado.fixos.length && !estado.saldo.definidoEm;

  let html = '';

  if (primeiroUso) {
    html += `<div class="cartao destaque">
      <p class="kicker">Comece por aqui</p>
      <h2>Três passos e o app já funciona</h2>
      <p class="sub" style="margin-bottom:14px">Tudo fica só neste aparelho. Não tem cadastro, não tem
        senha de banco, não sai nada daqui.</p>
      <div class="campo">
        <label for="saldoInicial">1. Quanto você tem na conta agora</label>
        <input id="saldoInicial" type="text" inputmode="decimal" placeholder="Ex.: 2.450,00">
      </div>
      <button class="btn pri bloco" data-acao="salvarSaldoInicial">Salvar saldo</button>
      <p class="ajuda">2. Em <b>Ajustes</b>, cadastre salário e contas fixas — é o que dá firmeza à projeção.<br>
        3. Toque no microfone e fale: <i>"gastei 45 no mercado"</i>.</p>
    </div>`;
  }

  // A frase que explica o teto: ate quando esse dinheiro precisa durar. Sem
  // isto o numero grande fica sem chao — "posso gastar 288" ate quando?
  const janela = lim.proxima
    ? lim.diasRestantes + (lim.diasRestantes === 1 ? ' dia' : ' dias')
      + ' até a próxima entrada (' + F.dataCurta(lim.proxima.data) + ')'
    : lim.diasRestantes + (lim.diasRestantes === 1 ? ' dia' : ' dias') + ' até o fim do mês';

  // Com o mes ja comprometido o teto sai negativo. Mostrar "-R$ 304,90" ali
  // nao diz nada a ninguem: esse numero nao corresponde a nada que a pessoa
  // reconheca. O que ela precisa ler e que hoje nao sobra nada, e por que.
  const valorHero = lim.apertado ? 0 : (estourou ? lim.resta : Math.max(0, lim.resta));
  const rotuloHero = lim.apertado ? 'não sobra para hoje'
    : estourou ? 'passou do teto de hoje' : 'pode gastar hoje';

  html += `<div class="cartao destaque hero">
    <div class="rotulo">${rotuloHero}</div>
    <div class="valor ${estourou || lim.apertado ? 'ruim' : 'bom'}">${esc(F.dinheiro(valorHero))}</div>
    <div class="apoio">${lim.apertado
      ? 'O que existe na conta já está comprometido com as contas fixas'
      : 'de ' + F.dinheiro(lim.limite) + ' por dia · já saíram ' + F.dinheiro(lim.gasto)}</div>
    <div class="barra"><i class="${estourou ? 'estourou' : ''}" style="width:${(usado * 100).toFixed(0)}%"></i></div>
    <div class="apoio" style="font-size:.8rem">${esc(janela)}${lim.reserva > 0 ? ' · reserva de ' + F.dinheiro(lim.reserva) + ' preservada' : ''}</div>
  </div>

  <div class="linhas">
    <div class="mini ${saldo < 0 ? 'ruim' : ''}"><b>${esc(F.dinheiroCurto(saldo))}</b><small>na conta</small></div>
    <div class="mini bom"><b>${esc(F.dinheiroCurto(lim.entram))}</b><small>entra até ${esc(F.dataCurta(lim.ate))}</small></div>
    <div class="mini"><b>${esc(F.dinheiroCurto(lim.saem))}</b><small>fixo até ${esc(F.dataCurta(lim.ate))}</small></div>
  </div>`;

  if (mes.zeraEm) {
    html += `<div class="cartao conselho alerta" style="margin-top:12px">
      <span class="selo">Atenção</span>
      <h3>O saldo zera dia ${esc(F.dataCurta(mes.zeraEm))}</h3>
      <p>No ritmo de hoje o dinheiro acaba antes do fim do mês.
        <button class="mais" data-acao="irConselhos" style="padding:0">Ver o que fazer →</button></p>
    </div>`;
  }

  html += `<div class="secao"><h3>Lançar agora</h3></div>
  <div class="cartao">
    <div class="dupla">
      <div class="campo" style="margin-bottom:0">
        <label for="novoValor">Valor</label>
        <input id="novoValor" type="text" inputmode="decimal" placeholder="0,00">
      </div>
      <div class="campo" style="margin-bottom:0">
        <label for="novaCat">Categoria</label>
        <select id="novaCat">${N.CATEGORIAS.map((c) =>
          `<option value="${c.id}">${c.emoji} ${esc(c.nome)}</option>`).join('')}</select>
      </div>
    </div>
    <div class="btn-linha" style="margin-top:11px">
      <button class="btn pri" style="flex:1" data-acao="lancar">Lançar saída</button>
      <button class="btn" data-acao="lancarEntrada">Foi entrada</button>
    </div>
    <p class="ajuda">Ou toque no microfone e fale: <i>"gastei 32 no almoço"</i>,
      <i>"recebi 1500 de freela"</i>, <i>"quanto posso gastar hoje?"</i></p>
  </div>

  <div class="secao"><h3>Últimos lançamentos</h3>
    ${estado.lancamentos.length > 8 ? '<button class="mais" data-acao="verTudo">ver todos</button>' : ''}</div>
  <div class="cartao">${recentes.length ? recentes.map(linhaLancamento).join('') :
    '<div class="vazio">Nada lançado ainda. Fale o primeiro gasto no microfone.</div>'}</div>`;

  return html;
}

function linhaLancamento(l) {
  const c = N.categoria(l.categoria);
  return `<div class="item">
    <div class="ico">${c.emoji}</div>
    <div class="txt">
      <b>${esc(l.descricao || c.nome)}</b>
      <small>${esc(F.dataAmigavel(l.data))} · ${esc(c.nome)}${l.origem === 'voz' ? ' · voz' : ''}${l.fixoId ? ' · conta fixa' : ''}</small>
    </div>
    <div class="val ${l.tipo === 'entrada' ? 'entrada' : ''}">${l.tipo === 'entrada' ? '+' : '−'} ${esc(F.dinheiro(l.valor))}</div>
    <button class="apagar" data-acao="apagarLancamento" data-id="${esc(l.id)}" aria-label="Apagar">✕</button>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Aba FUTURO                                                          *
 * ------------------------------------------------------------------ */
const HORIZONTES = { dia: 'Hoje', semana: 'Semana', mes: 'Mês', ano: 'Ano' };

function paneFuturo() {
  const hoje = F.hoje();
  const ate = horizonte === 'dia' ? hoje
    : horizonte === 'semana' ? F.somarDias(hoje, 6)
      : horizonte === 'mes' ? F.fimDoMes(hoje) : F.somarDias(hoje, 364);
  const p = N.projetar(estado, ate);
  const variacao = p.saldoFinal - p.saldoInicial;
  const proximas = p.eventos.slice(0, 8);
  const confianca = {
    alta: 'Média firme: ' + p.diasDeHistorico + ' dias de lançamentos.',
    media: 'Média razoável: ' + p.diasDeHistorico + ' dias de lançamentos. Melhora com o uso.',
    baixa: 'Só ' + p.diasDeHistorico + ' dia(s) de histórico — esta parte ainda é chute.',
  }[p.confianca];

  return `<h2>Para onde isso vai</h2>
  <p class="sub">O que é fixo entra na data certa. O resto entra pela sua média de gasto.</p>

  <div class="seg" role="tablist">${Object.entries(HORIZONTES).map(([k, v]) =>
    `<button data-acao="horizonte" data-h="${k}" aria-selected="${k === horizonte}">${v}</button>`).join('')}</div>

  <div class="cartao destaque hero" style="padding-top:18px">
    <div class="rotulo">saldo em ${esc(F.dataPorExtenso(ate))}</div>
    <div class="valor ${p.saldoFinal < 0 ? 'ruim' : 'bom'}">${esc(F.dinheiro(p.saldoFinal))}</div>
    <div class="apoio">${variacao >= 0 ? '▲ sobe ' : '▼ cai '}${esc(F.dinheiro(Math.abs(variacao)))} a partir de hoje</div>
    ${grafico(p)}
    ${p.serie.length < 2 ? '' : `<div class="eixo"><span>hoje · ${esc(F.dinheiroCurto(p.saldoInicial))}</span>${p.zeraEm ? `<span style="color:var(--no)">zera ${esc(F.dataCurta(p.zeraEm))}</span>` : ''}<span>${esc(F.dataCurta(ate))}</span></div>`}
  </div>

  <div class="linhas">
    <div class="mini bom"><b>${esc(F.dinheiroCurto(p.entradas))}</b><small>entra</small></div>
    <div class="mini"><b>${esc(F.dinheiroCurto(p.saidasFixas))}</b><small>contas fixas</small></div>
    <div class="mini"><b>${esc(F.dinheiroCurto(p.saidasVariaveis))}</b><small>gasto do dia a dia</small></div>
  </div>

  <div class="cartao" style="margin-top:12px">
    <p class="kicker">Como esta conta foi feita</p>
    <p style="font-size:.88rem;color:var(--text-2);margin:0">
      Saldo de hoje (${esc(F.dinheiro(p.saldoInicial))}) mais as entradas previstas,
      menos as contas fixas nas datas delas, menos ${esc(F.dinheiro(p.mediaDia))} por dia
      de gasto variável — que é a sua média dos últimos ${p.diasDeHistorico} dias.<br>
      <span style="color:var(--text-3)">${esc(confianca)}</span>
    </p>
  </div>

  <div class="secao"><h3>Próximas contas</h3></div>
  <div class="cartao">${proximas.length ? proximas.map((e) => `
    <div class="conta-fila">
      <span class="dia">${esc(F.dataCurta(e.data))}</span>
      <span class="n">${esc(e.nome)}</span>
      <span class="v ${e.tipo === 'entrada' ? 'entrada' : ''}">${e.tipo === 'entrada' ? '+' : '−'} ${esc(F.dinheiro(e.valor))}</span>
    </div>`).join('') : '<div class="vazio">Nenhuma conta fixa cadastrada.<br>Cadastre em Ajustes — é o que faz a projeção valer.</div>'}
  </div>`;
}

/* Grafico de linha em SVG puro. Sem biblioteca: o app precisa abrir offline
   e pesar pouco, e uma linha com area sao trinta linhas de codigo.

   A escala e a parte delicada. Comecar sempre do zero achata a linha: numa
   conta de R$ 3.000 que cai R$ 576, a queda vira um risco reto e a pessoa
   conclui que esta tudo igual. Ampliar sempre e o erro oposto — faz uma
   oscilacao de R$ 20 parecer um desastre. A regra aqui: o zero entra na
   escala quando ele importa (a projecao chega perto dele ou fura), e fora
   disso a escala segue os dados, com a linha pontilhada do saldo de hoje
   servindo de referencia para o olho. Os dois valores das pontas estao
   escritos por extenso logo acima, entao a escala nunca fica sem numero. */
function grafico(p) {
  const serie = p.serie;
  if (serie.length < 2) return '';
  const passo = Math.max(1, Math.ceil(serie.length / 90));
  const pts = serie.filter((_, i) => i % passo === 0 || i === serie.length - 1);
  const vals = pts.map((x) => x.saldo);

  const vmin = Math.min(...vals), vmax = Math.max(...vals);
  const zeroImporta = vmin <= 0 || vmin < vmax * 0.3;
  let min = zeroImporta ? Math.min(0, vmin) : vmin;
  let max = vmax;
  const folga = (Math.abs(max - min) || Math.abs(max) || 1) * 0.12;
  min -= folga; max += folga;
  const faixa = (max - min) || 1;

  const L = 100, TOPO = 6, BASE = 94;
  const x = (i) => (i / (pts.length - 1)) * L;
  const y = (v) => BASE - ((v - min) / faixa) * (BASE - TOPO);

  const linha = pts.map((pt, i) => (i ? 'L' : 'M') + x(i).toFixed(2) + ' ' + y(pt.saldo).toFixed(2)).join(' ');
  const area = linha + ` L${L} ${BASE} L0 ${BASE} Z`;
  const negativo = vals.some((v) => v < 0);
  const cor = negativo ? '#FF6B6B' : '#FFC72C';
  const zeroDentro = min <= 0 && max >= 0;

  return `<svg class="grafico" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="gY" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${cor}" stop-opacity=".32"/>
      <stop offset="100%" stop-color="${cor}" stop-opacity="0"/>
    </linearGradient></defs>
    <path class="area" d="${area}"/>
    <line class="hoje" x1="0" y1="${y(p.saldoInicial).toFixed(2)}" x2="100" y2="${y(p.saldoInicial).toFixed(2)}"/>
    ${zeroDentro ? `<line class="zero" x1="0" y1="${y(0).toFixed(2)}" x2="100" y2="${y(0).toFixed(2)}"/>` : ''}
    <path class="linha ${negativo ? 'neg' : ''}" d="${linha}" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

/* ------------------------------------------------------------------ *
 * Aba CONSELHOS                                                       *
 * ------------------------------------------------------------------ */
function paneConselhos() {
  const cartas = C.gerar(estado);
  const podeIA = !!(estado.ajustes.iaEndereco || location.protocol.startsWith('http'));

  let html = `<h2>O que eu faria no seu lugar</h2>
  <p class="sub">Cada conselho abaixo vem da sua própria conta, e mostra o cálculo.</p>`;

  html += `<div class="cartao" style="border-color:var(--ia);padding:14px">
    <button class="btn ia bloco" data-acao="pedirIA" ${podeIA ? '' : 'disabled'}>
      ${podeIA ? '✦ Pedir análise à IA' : '✦ Análise por IA: só na versão publicada'}</button>
    <p class="ajuda" style="margin-top:9px">Vai um retrato <b>só de números</b> — saldo, totais por
      categoria, contas fixas, dívidas. Não vai a descrição do que você falou, nem nome de pessoa,
      nem data de nada.</p>
  </div>`;

  if (respostaIA) {
    html += `<div class="cartao conselho ia">
      <span class="selo">Resposta da IA</span>
      <h3>${esc(respostaIA.diagnostico || 'Leitura da IA')}</h3>
      ${(respostaIA.acoes || []).map((a) => `<p style="margin-top:10px"><b style="color:var(--text)">${esc(a.titulo)}</b><br>${esc(a.porque)}
        ${a.impacto_mes ? `<br><span style="color:var(--ia)">Impacto: ${esc(a.impacto_mes)}</span>` : ''}</p>`).join('')}
      ${respostaIA.risco ? `<p style="margin-top:12px;color:var(--at)"><b>Cuidado:</b> ${esc(respostaIA.risco)}</p>` : ''}
    </div>`;
  }

  html += cartas.map((c) => `<div class="cartao conselho ${esc(c.tom)}">
    <span class="selo">${{ alerta: 'Urgente', atencao: 'Atenção', acao: 'Dá para fazer', bom: 'Boa notícia', neutro: 'Para saber' }[c.tom] || ''}</span>
    <h3>${esc(c.titulo)}</h3>
    <p>${esc(c.texto)}</p>
    ${c.plano ? planoHtml(c.plano) : ''}
  </div>`).join('');

  if (!cartas.length) {
    html += '<div class="cartao"><div class="vazio">Ainda não tenho conta suficiente para aconselhar.<br>Lance alguns gastos e volte aqui.</div></div>';
  }
  return html;
}

function planoHtml(p) {
  if (!p || !p.linhas || !p.linhas.length) return '';
  return `<div class="corte">
    <p class="kicker">De onde tirar ${esc(F.dinheiro(p.falta))}</p>
    ${p.linhas.map((l) => `<div class="corte-linha">
      <span class="n">${l.emoji} ${esc(l.nome)} <small style="color:var(--text-3)">−${esc(F.porcento(l.porcento))}</small></span>
      <span class="de">${esc(F.dinheiro(l.gasta))}</span>
      <span>→</span>
      <span class="pra">${esc(F.dinheiro(l.fica))}</span>
    </div>`).join('')}
    <p class="ajuda">${p.cobre
      ? 'Cortando isso nos próximos 30 dias o mês fecha de pé. O corte respeita um teto por '
        + 'categoria: até 40% no que é escolha, até 20% em mercado e transporte.'
      : 'Mesmo cortando 40% de cada uma, ainda faltam ' + F.dinheiro(p.restante)
        + '. Aqui o caminho é renegociar uma conta fixa ou buscar entrada extra — apertar o dia a dia não resolve sozinho.'}</p>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Aba AJUSTES                                                         *
 * ------------------------------------------------------------------ */
function paneAjustes() {
  const fixo = N.mensalFixo(estado);
  const temMic = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  return `<h2>Ajustes</h2>
  <p class="sub">Quanto mais certo aqui, mais certa a projeção.</p>

  <div class="secao"><h3>Saldo em conta</h3></div>
  <div class="cartao">
    <div class="campo">
      <label for="saldoAtual">Quanto tem na conta agora</label>
      <input id="saldoAtual" type="text" inputmode="decimal" value="${esc(F.dinheiro(N.saldoEm(estado)).replace('R$', '').trim())}">
    </div>
    <button class="btn pri bloco" data-acao="salvarSaldo">Atualizar saldo</button>
    <p class="ajuda">Informado ${esc(F.dataAmigavel(estado.saldo.data) === 'hoje' ? 'hoje' : 'em ' + F.dataAmigavel(estado.saldo.data))}. Olhe o extrato e corrija sempre
      que estiver diferente — todo o resto do app pende deste número.</p>
  </div>

  <div class="secao"><h3>Contas fixas</h3></div>
  <div class="cartao">
    ${estado.fixos.length ? estado.fixos.map((f) => `
      <div class="item">
        <div class="ico">${N.categoria(f.categoria).emoji}</div>
        <div class="txt"><b>${esc(f.nome)}</b>
          <small>${f.ciclo === 'mensal' ? 'todo dia ' + f.dia : f.ciclo === 'semanal' ? 'toda ' + F.SEMANA_ACENTO[f.diaSemana] : 'todo dia'}${f.ativo ? '' : ' · pausada'}</small></div>
        <div class="val ${f.tipo === 'entrada' ? 'entrada' : ''}">${f.tipo === 'entrada' ? '+' : '−'} ${esc(F.dinheiro(f.valor))}</div>
        <button class="apagar" data-acao="pausarFixo" data-id="${esc(f.id)}" aria-label="Pausar">${f.ativo ? '⏸' : '▶'}</button>
        <button class="apagar" data-acao="apagarFixo" data-id="${esc(f.id)}" aria-label="Apagar">✕</button>
      </div>`).join('') : '<div class="vazio">Nenhuma conta fixa ainda.</div>'}

    <div style="border-top:1px solid var(--line);margin-top:12px;padding-top:14px">
      <div class="campo"><label for="fixoNome">Nome</label>
        <input id="fixoNome" placeholder="Aluguel, salário, Netflix..."></div>
      <div class="dupla">
        <div class="campo"><label for="fixoValor">Valor</label>
          <input id="fixoValor" type="text" inputmode="decimal" placeholder="0,00"></div>
        <div class="campo"><label for="fixoDia">Dia do mês</label>
          <input id="fixoDia" type="number" min="1" max="31" value="5"></div>
      </div>
      <div class="dupla">
        <div class="campo"><label for="fixoTipo">Tipo</label>
          <select id="fixoTipo"><option value="saida">Sai da conta</option><option value="entrada">Entra na conta</option></select></div>
        <div class="campo"><label for="fixoCat">Categoria</label>
          <select id="fixoCat">${N.CATEGORIAS.map((c) => `<option value="${c.id}">${c.emoji} ${esc(c.nome)}</option>`).join('')}</select></div>
      </div>
      <button class="btn bloco" data-acao="addFixo">Adicionar conta fixa</button>
      <p class="ajuda">Hoje: entra ${esc(F.dinheiro(fixo.entra))} e sai ${esc(F.dinheiro(fixo.sai))} por mês
        — sobra ${esc(F.dinheiro(fixo.sobra))} antes do gasto do dia a dia.</p>
    </div>
  </div>

  <div class="secao"><h3>Dívidas</h3></div>
  <div class="cartao">
    ${estado.dividas.length ? estado.dividas.map((d) => `
      <div class="item">
        <div class="ico">🧾</div>
        <div class="txt"><b>${esc(d.nome)}</b><small>${F.porcento(d.jurosMes, 1)} ao mês · parcela ${esc(F.dinheiro(d.parcela))}</small></div>
        <div class="val">${esc(F.dinheiro(d.saldo))}</div>
        <button class="apagar" data-acao="apagarDivida" data-id="${esc(d.id)}" aria-label="Apagar">✕</button>
      </div>`).join('') : '<div class="vazio">Nenhuma dívida cadastrada. Ótimo.</div>'}
    <div style="border-top:1px solid var(--line);margin-top:12px;padding-top:14px">
      <div class="campo"><label for="divNome">Nome</label><input id="divNome" placeholder="Cartão, empréstimo..."></div>
      <div class="tripla">
        <div class="campo"><label for="divSaldo">Devo</label><input id="divSaldo" type="text" inputmode="decimal" placeholder="0,00"></div>
        <div class="campo"><label for="divJuros">% ao mês</label><input id="divJuros" type="text" inputmode="decimal" placeholder="12"></div>
        <div class="campo"><label for="divParcela">Parcela</label><input id="divParcela" type="text" inputmode="decimal" placeholder="0,00"></div>
      </div>
      <button class="btn bloco" data-acao="addDivida">Adicionar dívida</button>
      <p class="ajuda">A parcela que sai da conta todo mês deve estar também em <b>contas fixas</b> —
        aqui é só para calcular o juro e a ordem de quitação.</p>
    </div>
  </div>

  <div class="secao"><h3>Metas</h3></div>
  <div class="cartao">
    <div class="dupla">
      <div class="campo"><label for="reserva">Piso da conta</label>
        <input id="reserva" type="text" inputmode="decimal" value="${estado.ajustes.reserva || ''}" placeholder="0,00"></div>
      <div class="campo"><label for="reservaMeses">Reserva (meses)</label>
        <input id="reservaMeses" type="number" min="0" max="24" value="${estado.ajustes.reservaMeses}"></div>
    </div>
    <div class="campo"><label for="taxaAno">Quanto sua aplicação rende ao ano (%)</label>
      <input id="taxaAno" type="text" inputmode="decimal" value="${estado.ajustes.taxaAno ? (estado.ajustes.taxaAno * 100).toFixed(2).replace('.', ',') : ''}" placeholder="deixe vazio se não souber"></div>
    <button class="btn bloco" data-acao="salvarMetas">Salvar metas</button>
    <p class="ajuda"><b>Piso da conta</b> é o que o app nunca inclui no "pode gastar hoje".
      A <b>taxa</b> é a da sua aplicação, informada por você: o app não inventa taxa de mercado,
      porque um número chutado aqui vira decisão errada aí fora.</p>
  </div>

  <div class="secao"><h3>Voz e privacidade</h3></div>
  <div class="cartao">
    <div class="troca">
      <div class="txt"><b>Responder em voz alta</b><small>útil dirigindo ou cozinhando</small></div>
      <label class="switch"><input type="checkbox" id="tFalar" ${estado.ajustes.falar ? 'checked' : ''}><i></i></label>
    </div>
    <div class="troca">
      <div class="txt"><b>Microfone neste aparelho</b>
        <small>${temMic ? 'disponível' : 'este navegador não reconhece voz — use o Chrome (Android) ou o Safari (iPhone)'}</small></div>
      <span class="chip ${temMic ? 'ok' : 'no'}">${temMic ? 'ok' : 'não'}</span>
    </div>
    <p class="ajuda" style="margin-top:12px">
      <b>O microfone só abre com a tela desbloqueada e o app na frente.</b> Ele nunca liga sozinho:
      precisa do seu toque. Se a tela apagar, se o celular bloquear, se você trocar de aplicativo ou
      de aba, ele desliga na hora — e não volta sozinho quando você retorna, só com outro toque.
      O reconhecimento é o do próprio celular; o áudio não passa por este app e nada fica gravado aqui.
    </p>
    <p class="ajuda"><b>O que ele não faz:</b> o navegador não sabe de quem é a voz que está falando.
      Ele transcreve quem estiver perto do aparelho desbloqueado. Se quiser que só você entre no app,
      use o PIN abaixo — e o bloqueio de tela do próprio celular.</p>
  </div>

  <div class="secao"><h3>Análise por IA</h3></div>
  <div class="cartao">
    <div class="campo"><label for="iaSenha">Senha da análise (se o site pedir)</label>
      <input id="iaSenha" type="password" value="${esc(estado.ajustes.iaSenha || '')}" placeholder="deixe vazio se não configurou"></div>
    <div class="campo"><label for="iaEndereco">Endereço do assessor</label>
      <input id="iaEndereco" value="${esc(estado.ajustes.iaEndereco || '')}" placeholder="/api/conselho"></div>
    <button class="btn bloco" data-acao="salvarIA">Salvar</button>
    <p class="ajuda">A chave da Anthropic fica no servidor, nunca neste aparelho. A senha aqui é
      só para o endereço publicado não ficar aberto ao mundo gastando da sua conta.
      Sem nada disso o app funciona igual: os conselhos da aba <b>Conselhos</b> são calculados
      aqui dentro, sem internet.</p>
  </div>

  <div class="secao"><h3>Trava do app</h3></div>
  <div class="cartao">
    <div class="campo"><label for="pin">PIN de 4 dígitos (vazio = sem trava)</label>
      <input id="pin" type="text" inputmode="numeric" maxlength="4" value="${esc(estado.ajustes.pin || '')}" placeholder="••••"></div>
    <button class="btn bloco" data-acao="salvarPin">Salvar PIN</button>
    <p class="ajuda">Pede o PIN ao abrir. Segura olhar curioso em celular desbloqueado na mesa;
      não é criptografia, e quem souber mexer no navegador vê os dados assim mesmo.</p>
  </div>

  <div class="secao"><h3>Seus dados</h3></div>
  <div class="cartao">
    <div class="btn-linha">
      <button class="btn" style="flex:1" data-acao="exportar">Baixar cópia</button>
      <button class="btn" style="flex:1" data-acao="importar">Restaurar cópia</button>
    </div>
    <input type="file" id="arquivoImport" accept="application/json" hidden>
    <button class="btn perigo bloco" style="margin-top:10px" data-acao="apagarTudo">Apagar tudo deste aparelho</button>
    <p class="ajuda">${estado.lancamentos.length} lançamentos, ${estado.fixos.length} contas fixas.
      Tudo guardado só aqui, no armazenamento deste navegador. Trocou de celular ou limpou os dados
      do navegador? Sem a cópia, acabou — baixe de vez em quando.</p>
  </div>

  <p class="rodape">Bússola — assessor financeiro de bolso.<br>
    Feito para um aparelho só: o seu. Sem cadastro, sem nuvem, sem banco.</p>`;
}

/* ------------------------------------------------------------------ *
 * Render                                                              *
 * ------------------------------------------------------------------ */
function render() {
  const alvo = { hoje: paneHoje, futuro: paneFuturo, conselhos: paneConselhos, ajustes: paneAjustes }[aba];
  const el = $('#pane-' + aba);
  el.innerHTML = alvo();
  $$('.pane').forEach((p) => { p.hidden = p.id !== 'pane-' + aba; });
  $$('.aba').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pane === aba)));

  const saldo = N.saldoEm(estado);
  const chip = $('#chipSaldo');
  chip.textContent = F.dinheiroCurto(saldo);
  chip.className = 'chip' + (saldo < 0 ? ' no' : '');
  $('#btnTrancar').hidden = !estado.ajustes.pin;
  window.scrollTo({ top: 0 });
}

function irPara(nome) { aba = nome; render(); }

/* ------------------------------------------------------------------ *
 * Acoes                                                               *
 * ------------------------------------------------------------------ */
function lancar(dados, silencioso) {
  const l = {
    id: N.novoId(),
    data: dados.data || F.hoje(),
    valor: Math.abs(Number(dados.valor) || 0),
    tipo: dados.tipo === 'entrada' ? 'entrada' : 'saida',
    categoria: N.categoria(dados.categoria).id,
    descricao: dados.descricao || '',
    fixoId: dados.fixoId || '',
    origem: dados.origem || 'manual',
    criadoEm: Date.now(),
  };
  if (!l.valor) { aviso('Faltou o valor', 'Diga ou digite quanto foi.', 'ruim'); return null; }
  estado.lancamentos.unshift(l);
  estado.lancamentos.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : b.criadoEm - a.criadoEm));
  salvar();
  ultimoDesfazer = () => {
    estado.lancamentos = estado.lancamentos.filter((x) => x.id !== l.id);
    salvar(); render();
    aviso('Desfeito', '', 'bom');
  };
  if (!silencioso) {
    const c = N.categoria(l.categoria);
    aviso((l.tipo === 'entrada' ? '+ ' : '− ') + F.dinheiro(l.valor) + ' · ' + c.nome,
      (l.descricao ? l.descricao + ' · ' : '') + F.dataAmigavel(l.data), l.tipo === 'entrada' ? 'bom' : '',
      ultimoDesfazer);
  }
  render();
  return l;
}

function responder(intencao) {
  const lim = N.limiteDoDia(estado);
  const hoje = F.hoje();

  if (intencao.pergunta === 'limite') {
    return lim.apertado
      ? 'Hoje não sobra teto: as contas fixas do mês já comprometem o que está na conta.'
      : (lim.resta >= 0
        ? 'Você pode gastar ' + F.dinheiro(lim.resta) + ' hoje. O teto do dia é '
          + F.dinheiro(lim.limite) + ' e já saíram ' + F.dinheiro(lim.gasto) + '.'
        : 'Hoje você já passou ' + F.dinheiro(Math.abs(lim.resta)) + ' do teto de '
          + F.dinheiro(lim.limite) + '.');
  }
  if (intencao.pergunta === 'saldo') {
    return 'Você tem ' + F.dinheiro(N.saldoEm(estado)) + ' na conta.';
  }
  if (intencao.pergunta === 'projecao') {
    const ate = intencao.horizonte === 'ano' ? F.somarDias(hoje, 364)
      : intencao.horizonte === 'semana' ? F.somarDias(hoje, 6) : F.fimDoMes(hoje);
    const p = N.projetar(estado, ate);
    horizonte = intencao.horizonte;
    return 'No ritmo de hoje você chega em ' + F.dataPorExtenso(ate) + ' com '
      + F.dinheiro(p.saldoFinal) + '.' + (p.zeraEm ? ' Mas atenção: o saldo zera dia '
      + F.dataCurta(p.zeraEm) + '.' : '');
  }
  if (intencao.pergunta === 'gasto') {
    const de = intencao.periodo === 'dia' ? hoje
      : intencao.periodo === 'semana' ? F.somarDias(hoje, -6)
        : intencao.periodo === 'ano' ? hoje.slice(0, 4) + '-01-01' : hoje.slice(0, 8) + '01';
    const cats = N.porCategoria(estado, de, hoje, 'saida');
    const quando = { dia: 'hoje', semana: 'nos últimos 7 dias', ano: 'neste ano' }[intencao.periodo] || 'neste mês';
    if (intencao.categoria) {
      const c = cats.find((x) => x.id === intencao.categoria);
      return c ? 'Com ' + c.nome + ' você gastou ' + F.dinheiro(c.total) + ' ' + quando
        + ', em ' + c.n + ' ' + (c.n === 1 ? 'lançamento' : 'lançamentos') + '.'
        : 'Não achei nenhum gasto dessa categoria ' + quando + '.';
    }
    const total = cats.reduce((s, c) => s + c.total, 0);
    return 'Você gastou ' + F.dinheiro(total) + ' ' + quando
      + (cats[0] ? '. O maior foi ' + cats[0].nome + ', com ' + F.dinheiro(cats[0].total) + '.' : '.');
  }
  if (intencao.pergunta === 'resumo') {
    const mes = N.projetar(estado, F.fimDoMes(hoje));
    return 'Você tem ' + F.dinheiro(N.saldoEm(estado)) + ' na conta e pode gastar '
      + F.dinheiro(Math.max(0, lim.resta)) + ' hoje. No fim do mês a projeção é '
      + F.dinheiro(mes.saldoFinal) + '.';
  }
  if (intencao.pergunta === 'conselho') {
    const cartas = C.gerar(estado);
    irPara('conselhos');
    return cartas.length ? cartas[0].titulo + '. ' + cartas[0].texto
      : 'Ainda não tenho lançamento suficiente para aconselhar. Me conte alguns gastos.';
  }
  return 'Não entendi a pergunta.';
}

/* O que fazer com o que foi dito. Uma frase, um efeito, uma resposta. */
function processarFala(texto) {
  const it = V.interpretar(texto, { hoje: F.hoje() });

  if (it.tipo === 'nada') {
    aviso('Não entendi', '"' + texto + '" — diga o valor junto, ex.: "gastei 40 no mercado".', 'ruim');
    return;
  }
  if (it.tipo === 'comando') {
    if (it.comando === 'desfazer') {
      if (ultimoDesfazer) { ultimoDesfazer(); ultimoDesfazer = null; }
      else aviso('Nada para desfazer', '', '');
    } else if (it.comando === 'parar' && escuta) {
      escuta.desligar('voce');
    }
    return;
  }
  if (it.tipo === 'saldo') {
    estado.saldo = { valor: it.valor, data: F.hoje(), definidoEm: Date.now() };
    salvar(); render();
    const msg = 'Saldo anotado: ' + F.dinheiro(it.valor) + '.';
    aviso('Saldo atualizado', F.dinheiro(it.valor), 'bom');
    V.falar(msg, estado.ajustes.falar);
    return;
  }
  if (it.tipo === 'fixo') {
    const f = Object.assign({ id: N.novoId(), ativo: true, inicio: F.hoje() }, it.fixo);
    estado.fixos.push(N.normalizar({ fixos: [f] }).fixos[0]);
    salvar(); render();
    const quando = f.ciclo === 'mensal' ? 'todo dia ' + f.dia
      : f.ciclo === 'semanal' ? 'toda semana' : 'todo dia';
    aviso('Conta fixa criada', f.nome + ' · ' + F.dinheiro(f.valor) + ' ' + quando, 'bom');
    V.falar('Anotei ' + f.nome + ', ' + F.dinheiro(f.valor) + ' ' + quando + '.', estado.ajustes.falar);
    return;
  }
  if (it.tipo === 'pergunta') {
    const resposta = responder(it);
    aviso('Resposta', resposta, '');
    V.falar(resposta, estado.ajustes.falar);
    render();
    return;
  }
  const l = lancar(it.lancamento);
  if (l && estado.ajustes.falar) {
    const lim = N.limiteDoDia(estado);
    V.falar(F.dinheiro(l.valor) + ' em ' + N.categoria(l.categoria).nome + '. '
      + (lim.resta >= 0 ? 'Ainda pode gastar ' + F.dinheiro(lim.resta) + ' hoje.'
        : 'Você passou ' + F.dinheiro(Math.abs(lim.resta)) + ' do teto de hoje.'), true);
  }
}

/* ------------------------------------------------------------------ *
 * Microfone                                                           *
 * ------------------------------------------------------------------ */
function pintarMic(estadoMic, extra) {
  const b = $('#mic'), fala = $('#micFala');
  b.dataset.estado = estadoMic;
  if (estadoMic === 'ouvindo') {
    fala.hidden = false;
    fala.innerHTML = '<b>Ouvindo…</b> diga o gasto ou a pergunta';
  } else if (estadoMic === 'indisponivel') {
    fala.hidden = false;
    fala.innerHTML = 'Este navegador não reconhece voz. Use o Chrome no Android ou o Safari no iPhone — ou digite ali em cima.';
    setTimeout(() => { fala.hidden = true; }, 6000);
  } else if (estadoMic === 'bloqueado') {
    fala.hidden = false;
    fala.innerHTML = '<b>Microfone travado.</b> Ele só abre com a tela desbloqueada e o app na frente.';
    setTimeout(() => { fala.hidden = true; }, 4500);
  } else {
    const motivo = (extra && extra.motivo) || '';
    if (motivo === 'tela') {
      fala.hidden = false;
      fala.innerHTML = '<b>Parei:</b> a tela apagou ou você saiu do app. Toque de novo para ouvir.';
      setTimeout(() => { fala.hidden = true; }, 5000);
    } else if (motivo === 'silencio' || motivo === 'teto') {
      fala.hidden = false;
      fala.innerHTML = 'Desliguei o microfone sozinho — ninguém falava nada.';
      setTimeout(() => { fala.hidden = true; }, 3500);
    } else if (motivo === 'not-allowed' || motivo === 'service-not-allowed') {
      fala.hidden = false;
      fala.innerHTML = '<b>Permissão negada.</b> Libere o microfone para este site nas configurações do navegador.';
      setTimeout(() => { fala.hidden = true; }, 7000);
    } else {
      fala.hidden = true;
    }
  }
}

function iniciarVoz() {
  escuta = V.criarEscuta({
    onEstado: pintarMic,
    onErro: (e) => pintarMic('parado', { motivo: e }),
    onParcial: (t) => {
      const fala = $('#micFala');
      fala.hidden = false;
      fala.innerHTML = '<b>…</b> ' + esc(t);
    },
    onTexto: (t) => { if (t) processarFala(t); },
  });
  if (!escuta.disponivel()) $('#mic').dataset.estado = 'indisponivel';
}

/* ------------------------------------------------------------------ *
 * Trava (PIN)                                                         *
 * ------------------------------------------------------------------ */
let pinDigitado = '';
function montarTrava() {
  const tec = $('#travaTeclado');
  tec.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'vazio', 0, '←']
    .map((n) => n === 'vazio' ? '<button class="vazio" disabled></button>'
      : `<button data-tecla="${n}">${n}</button>`).join('');
  tec.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-tecla]');
    if (!b) return;
    const t = b.dataset.tecla;
    if (t === '←') pinDigitado = pinDigitado.slice(0, -1);
    else if (pinDigitado.length < 4) pinDigitado += t;
    pintarPontos();
    if (pinDigitado.length === 4) {
      if (pinDigitado === estado.ajustes.pin) { $('#trava').hidden = true; pinDigitado = ''; pintarPontos(); }
      else {
        $('#travaAviso').textContent = 'PIN errado. Tente de novo.';
        pinDigitado = ''; pintarPontos();
      }
    }
  });
}
function pintarPontos() {
  $('#travaPontos').innerHTML = [0, 1, 2, 3]
    .map((i) => `<i class="${i < pinDigitado.length ? 'cheio' : ''}"></i>`).join('');
}
function trancar() {
  if (!estado.ajustes.pin) return;
  pinDigitado = ''; pintarPontos();
  $('#travaAviso').textContent = 'Digite seu PIN';
  $('#trava').hidden = false;
  if (escuta) escuta.desligar('trava');
}

/* ------------------------------------------------------------------ *
 * IA                                                                  *
 * ------------------------------------------------------------------ */
async function pedirIA(botao) {
  const endereco = estado.ajustes.iaEndereco || '/api/conselho';
  botao.disabled = true;
  botao.textContent = 'Pensando…';
  try {
    const r = await fetch(endereco, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ retrato: C.retrato(estado), senha: estado.ajustes.iaSenha || '' }),
    });
    // Hospedagem estatica (GitHub Pages e afins) nao tem funcao nenhuma: o
    // endereco simplesmente nao existe. Dizer "não deu certo" aqui manda a
    // pessoa procurar defeito onde nao ha — o que falta e um servidor.
    if (r.status === 404 || r.status === 405) {
      throw new Error('Esta publicação é estática e não tem o assessor de IA. '
        + 'Os conselhos desta tela continuam funcionando normalmente.');
    }
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro || 'não deu certo');
    respostaIA = dados.resposta;
    render();
  } catch (e) {
    respostaIA = null;
    aviso('Sem análise por IA', String(e.message || e).slice(0, 160), 'ruim');
    botao.disabled = false;
    botao.textContent = '✦ Pedir análise à IA';
  }
}

/* ------------------------------------------------------------------ *
 * Eventos                                                             *
 * ------------------------------------------------------------------ */
const num = (id) => F.lerNumero(($('#' + id) || {}).value);

const ACOES = {
  salvarSaldoInicial() {
    const v = num('saldoInicial');
    if (v == null) return aviso('Faltou o valor', 'Digite quanto tem na conta.', 'ruim');
    estado.saldo = { valor: v, data: F.hoje(), definidoEm: Date.now() };
    salvar(); render();
    aviso('Pronto', 'Saldo de ' + F.dinheiro(v) + ' anotado.', 'bom');
  },
  salvarSaldo() {
    const v = num('saldoAtual');
    if (v == null) return aviso('Faltou o valor', '', 'ruim');
    estado.saldo = { valor: v, data: F.hoje(), definidoEm: Date.now() };
    salvar(); render();
    aviso('Saldo atualizado', F.dinheiro(v), 'bom');
  },
  lancar() {
    const v = num('novoValor');
    if (v == null) return aviso('Faltou o valor', '', 'ruim');
    lancar({ valor: v, tipo: 'saida', categoria: $('#novaCat').value });
  },
  lancarEntrada() {
    const v = num('novoValor');
    if (v == null) return aviso('Faltou o valor', '', 'ruim');
    lancar({ valor: v, tipo: 'entrada', categoria: $('#novaCat').value });
  },
  apagarLancamento(el) {
    const id = el.dataset.id;
    const l = estado.lancamentos.find((x) => x.id === id);
    estado.lancamentos = estado.lancamentos.filter((x) => x.id !== id);
    salvar(); render();
    aviso('Apagado', l ? F.dinheiro(l.valor) : '', '', l ? () => {
      estado.lancamentos.unshift(l);
      estado.lancamentos.sort((a, b) => (a.data < b.data ? 1 : -1));
      salvar(); render();
    } : null);
  },
  addFixo() {
    const nome = ($('#fixoNome').value || '').trim();
    const valor = num('fixoValor');
    if (!nome || valor == null) return aviso('Faltou nome ou valor', '', 'ruim');
    estado.fixos.push(N.normalizar({
      fixos: [{
        id: N.novoId(), nome, valor, tipo: $('#fixoTipo').value, ciclo: 'mensal',
        dia: Number($('#fixoDia').value) || 1, categoria: $('#fixoCat').value,
        inicio: F.hoje(), ativo: true,
      }],
    }).fixos[0]);
    salvar(); render();
    aviso('Conta fixa criada', nome + ' · ' + F.dinheiro(valor), 'bom');
  },
  pausarFixo(el) {
    const f = estado.fixos.find((x) => x.id === el.dataset.id);
    if (f) { f.ativo = !f.ativo; salvar(); render(); }
  },
  apagarFixo(el) {
    estado.fixos = estado.fixos.filter((x) => x.id !== el.dataset.id);
    salvar(); render();
  },
  addDivida() {
    const nome = ($('#divNome').value || '').trim();
    const saldo = num('divSaldo');
    if (!nome || saldo == null) return aviso('Faltou nome ou valor', '', 'ruim');
    estado.dividas.push({
      id: N.novoId(), nome, saldo,
      jurosMes: (num('divJuros') || 0) / 100,
      parcela: num('divParcela') || 0,
    });
    salvar(); render();
    aviso('Dívida cadastrada', nome, '');
  },
  apagarDivida(el) {
    estado.dividas = estado.dividas.filter((x) => x.id !== el.dataset.id);
    salvar(); render();
  },
  salvarMetas() {
    estado.ajustes.reserva = num('reserva') || 0;
    estado.ajustes.reservaMeses = Math.max(0, Number($('#reservaMeses').value) || 0);
    const t = num('taxaAno');
    estado.ajustes.taxaAno = t != null && t > 0 ? t / 100 : null;
    salvar(); render();
    aviso('Metas salvas', '', 'bom');
  },
  salvarIA() {
    estado.ajustes.iaSenha = ($('#iaSenha').value || '').trim();
    estado.ajustes.iaEndereco = ($('#iaEndereco').value || '').trim();
    salvar(); render();
    aviso('Salvo', '', 'bom');
  },
  salvarPin() {
    const p = ($('#pin').value || '').replace(/\D/g, '').slice(0, 4);
    estado.ajustes.pin = p;
    salvar(); render();
    aviso(p ? 'PIN salvo' : 'PIN removido', p ? 'Vai ser pedido ao abrir o app.' : '', 'bom');
  },
  exportar() {
    const blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bussola-' + F.hoje() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  importar() { $('#arquivoImport').click(); },
  apagarTudo() {
    if (!confirm('Apagar todos os lançamentos, contas fixas e ajustes deste aparelho? Não dá para voltar atrás.')) return;
    localStorage.removeItem(CHAVE);
    estado = N.estadoNovo();
    salvar(); render();
    aviso('Tudo apagado', '', '');
  },
  horizonte(el) { horizonte = el.dataset.h; render(); },
  irConselhos() { irPara('conselhos'); },
  verTudo() { irPara('hoje'); },
  pedirIA(el) { pedirIA(el); },
};

function ligarEventos() {
  document.addEventListener('click', (ev) => {
    const alvo = ev.target.closest('[data-acao]');
    if (alvo && ACOES[alvo.dataset.acao]) { ACOES[alvo.dataset.acao](alvo); return; }
    const aba2 = ev.target.closest('.aba');
    if (aba2) irPara(aba2.dataset.pane);
    if (ev.target.closest('#btnTrancar')) trancar();
    if (ev.target.closest('#mic')) {
      if (!escuta) return;
      if (!escuta.disponivel()) { pintarMic('indisponivel'); return; }
      escuta.alternar();
    }
  });

  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'tFalar') {
      estado.ajustes.falar = ev.target.checked; salvar();
    }
    if (ev.target.id === 'arquivoImport' && ev.target.files[0]) {
      const leitor = new FileReader();
      leitor.onload = () => {
        try {
          estado = N.normalizar(JSON.parse(leitor.result));
          salvar(); render();
          aviso('Cópia restaurada', estado.lancamentos.length + ' lançamentos', 'bom');
        } catch (e) {
          aviso('Arquivo inválido', 'Esperava o .json baixado por este app.', 'ruim');
        }
      };
      leitor.readAsText(ev.target.files[0]);
    }
  });

  // Enter no campo de valor lanca direto: quem esta digitando quer velocidade.
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.id === 'novoValor') ACOES.lancar();
    if (ev.key === 'Enter' && ev.target.id === 'saldoInicial') ACOES.salvarSaldoInicial();
  });

  // Voltou ao app depois de um tempo: a data pode ter virado, e "hoje" com ela.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });
}

/* ------------------------------------------------------------------ *
 * Partida                                                             *
 * ------------------------------------------------------------------ */
function comecar() {
  carregar();
  montarTrava();
  ligarEventos();
  iniciarVoz();
  render();
  if (estado.ajustes.pin) trancar();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', comecar);
else comecar();
