/* A voz: ouvir so com a tela desbloqueada, e entender o que foi dito.
 *
 * ------------------------------------------------------------------
 * A TRAVA DE TELA — a parte que o app existe para respeitar
 * ------------------------------------------------------------------
 * O pedido era claro: o microfone so trabalha com a tela desbloqueada.
 * Isso nao e um detalhe de configuracao, e a regra da casa, e por isso
 * mora aqui em cima, sozinha, e nao espalhada pela interface.
 *
 * Como se garante isso de verdade:
 *
 * 1. Ninguem liga o microfone sem um toque seu. Nao ha escuta automatica
 *    ao abrir o app, nem palavra magica de despertar. Sem toque, nada.
 * 2. `visibilitychange` desliga na hora. Quando a tela apaga, quando o
 *    celular bloqueia, quando voce troca de aplicativo ou muda de aba, o
 *    navegador marca a pagina como escondida — e o microfone cai junto.
 * 3. `pagehide`, `freeze` e `blur` desligam tambem. Sao os outros caminhos
 *    pelos quais a pagina sai da frente (o iOS congela a aba, o Android
 *    suspende), e cada um deles e uma porta que precisa estar fechada.
 * 4. Ao voltar, ele NAO volta a ouvir sozinho. A tela mostra "parei porque
 *    a tela apagou" e espera outro toque. Religar sozinho seria abrir uma
 *    janela em que o microfone volta enquanto o celular ainda esta no
 *    bolso, e e exatamente isso que nao pode acontecer.
 * 5. Silencio prolongado tambem desliga. Microfone aberto esquecido gasta
 *    bateria e ninguem se lembra dele.
 *
 * O motor de reconhecimento e o do proprio celular (Web Speech API). O
 * audio nao passa por este app em momento algum, e nada dele fica gravado
 * aqui: o que chega e texto, e o texto vira lancamento no aparelho.
 *
 * ------------------------------------------------------------------
 * O QUE ELE ENTENDE
 * ------------------------------------------------------------------
 * `interpretar()` e uma funcao pura — texto entra, intencao sai. Roda nos
 * testes sem navegador, sem microfone e sem rede.
 */

/* eslint-disable no-undef */
var Fv = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./formato.js') : window.Formato;

/* --------------------------------------------------------------- *
 * Vocabulario                                                      *
 * --------------------------------------------------------------- */
const VERBOS_SAIDA = [
  'gastei', 'gasto', 'paguei', 'pagar', 'comprei', 'comprar', 'saiu', 'sai',
  'torrei', 'despesa', 'debitou', 'passei', 'gastando', 'custou', 'me custou',
];
const VERBOS_ENTRADA = [
  'recebi', 'receber', 'ganhei', 'entrou', 'caiu', 'entrada', 'creditou',
  'me pagaram', 'vendi', 'faturei', 'rendeu',
];

/* Palavra -> categoria. A lista e generosa de proposito: a pessoa fala como
   fala, e o app nao pode exigir que ela decore nomes de categoria. */
const PALAVRAS = {
  mercado: ['mercado', 'supermercado', 'feira', 'sacolao', 'padaria', 'acougue', 'compras do mes', 'hortifruti', 'atacadao', 'assai', 'carrefour'],
  comida: ['almoco', 'almocei', 'janta', 'jantar', 'lanche', 'cafe', 'restaurante', 'ifood', 'delivery', 'pizza', 'hamburguer', 'comida', 'marmita', 'sorvete', 'padoca'],
  transporte: ['uber', 'noventa e nove', '99', 'taxi', 'gasolina', 'combustivel', 'alcool', 'etanol', 'diesel', 'onibus', 'metro', 'passagem', 'pedagio', 'estacionamento', 'ipva', 'mecanico', 'oficina', 'pneu', 'lavagem', 'transporte', 'uno', 'carro'],
  moradia: ['aluguel', 'condominio', 'iptu', 'financiamento', 'prestacao da casa', 'moradia', 'reforma', 'faxina', 'diarista'],
  contas: ['luz', 'energia', 'agua', 'internet', 'telefone', 'celular', 'gas', 'conta de luz', 'conta de agua', 'wifi', 'boleto', 'fatura'],
  saude: ['farmacia', 'remedio', 'medico', 'dentista', 'consulta', 'exame', 'plano de saude', 'academia', 'psicologa', 'psicologo', 'terapia', 'hospital', 'saude'],
  educacao: ['escola', 'faculdade', 'curso', 'livro', 'mensalidade', 'material escolar', 'aula', 'ingles', 'educacao'],
  lazer: ['cinema', 'bar', 'cerveja', 'balada', 'show', 'viagem', 'passeio', 'jogo', 'lazer', 'festa', 'churrasco', 'praia', 'hotel'],
  assinatura: ['netflix', 'spotify', 'assinatura', 'disney', 'amazon prime', 'youtube premium', 'globoplay', 'hbo', 'max', 'streaming', 'icloud', 'chatgpt'],
  roupa: ['roupa', 'camisa', 'calca', 'tenis', 'sapato', 'shopping', 'loja', 'vestido'],
  pet: ['pet', 'racao', 'veterinario', 'petshop', 'cachorro', 'gato', 'banho e tosa'],
  divida: ['cartao', 'fatura do cartao', 'emprestimo', 'divida', 'parcela', 'juros', 'cheque especial', 'financiamento pessoal', 'agiota', 'consignado'],
  imposto: ['imposto', 'darf', 'inss', 'irpf', 'taxa', 'multa'],
  presente: ['presente', 'aniversario', 'natal', 'lembranca'],
  salario: ['salario', 'pagamento do mes', 'holerite', 'contracheque', 'decimo terceiro', 'ferias'],
  extra: ['freela', 'freelance', 'bico', 'renda extra', 'venda', 'comissao', 'bonus', 'pix que recebi', 'vaquinha'],
  rendimento: ['rendimento', 'rendeu', 'dividendo', 'juros da poupanca', 'cdb', 'tesouro', 'poupanca'],
};

const CAT_ENTRADA = ['salario', 'extra', 'rendimento', 'entrada'];

/* --------------------------------------------------------------- *
 * Interpretacao                                                    *
 * --------------------------------------------------------------- */

function limpar(texto) {
  return Fv.semAcento(texto).replace(/[?!.]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* Tira do texto o pedaco que fala de data e devolve a data em ISO. Precisa
   sair ANTES do valor: senao "dia 10" e "12/08" viram dinheiro. */
function extrairData(t, hojeIso) {
  const hoje = hojeIso || Fv.hoje();
  let resto = t, data = null;

  const rel = t.match(/\b(anteontem|ontem|hoje|agora|hoje de manha|de manha|agora pouco)\b/);
  if (rel) {
    data = rel[1] === 'ontem' ? Fv.somarDias(hoje, -1)
      : rel[1] === 'anteontem' ? Fv.somarDias(hoje, -2) : hoje;
    resto = resto.replace(rel[0], ' ');
  }

  const barra = resto.match(/\b(\d{1,2})[\/](\d{1,2})(?:[\/](\d{2,4}))?\b/);
  if (!data && barra) {
    const d = Number(barra[1]), m = Number(barra[2]);
    let ano = barra[3] ? Number(barra[3]) : Number(hoje.slice(0, 4));
    if (ano < 100) ano += 2000;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      data = ano + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      resto = resto.replace(barra[0], ' ');
    }
  }

  // "dia 12" sozinho (sem "todo") e a data do mes corrente. Se cair no
  // futuro, e do mes passado: ninguem lanca gasto que ainda nao aconteceu.
  const dia = resto.match(/\bdia (\d{1,2})\b/);
  if (!data && dia && !/\btod[oa]s? ?(os)? dia/.test(t)) {
    const n = Number(dia[1]);
    if (n >= 1 && n <= 31) {
      const mesAtual = hoje.slice(0, 7);
      let cand = mesAtual + '-' + String(n).padStart(2, '0');
      if (cand > hoje) cand = Fv.somarMeses(cand, -1);
      data = cand;
      resto = resto.replace(dia[0], ' ');
    }
  }

  return { data: data || hoje, resto: resto.replace(/\s+/g, ' ').trim(), explicita: !!data };
}

/* "todo dia 10", "todo mes", "toda semana", "todo dia", "por mes". */
function extrairRecorrencia(t, hojeIso) {
  const hoje = hojeIso || Fv.hoje();
  let resto = t, rec = null;

  const mensalDia = t.match(/\b(?:tod[oa]s? ?(?:os )?|no |todo )?dia (\d{1,2})\b\s*(?:de\s+)?(?:tod[oa]s? ?(?:os )?(?:mes|meses))?\b/);
  const temTodo = /\btod[oa]s?\b/.test(t) || /\bmensal\b/.test(t) || /\bpor mes\b/.test(t) || /\bcada mes\b/.test(t);

  if (temTodo && mensalDia && /\btod[oa]s? ?(?:os )?dia (\d{1,2})\b/.test(t)) {
    rec = { ciclo: 'mensal', dia: Number(mensalDia[1]) };
    resto = resto.replace(/\btod[oa]s? ?(?:os )?dia \d{1,2}\b/, ' ');
  } else if (/\btod[oa]s? ?(?:os )?(?:mes|meses)\b|\bmensal\b|\bpor mes\b|\bcada mes\b/.test(t)) {
    const d = mensalDia ? Number(mensalDia[1]) : Number(hoje.slice(8, 10));
    rec = { ciclo: 'mensal', dia: d };
    resto = resto.replace(/\btod[oa]s? ?(?:os )?(?:mes|meses)\b|\bmensal\b|\bpor mes\b|\bcada mes\b/g, ' ');
    if (mensalDia) resto = resto.replace(/\bdia \d{1,2}\b/, ' ');
  } else if (/\btod[oa]s? ?(?:as )?semanas?\b|\bsemanal\b|\bpor semana\b/.test(t)) {
    rec = { ciclo: 'semanal', diaSemana: Fv.diaSemana(hoje) };
    resto = resto.replace(/\btod[oa]s? ?(?:as )?semanas?\b|\bsemanal\b|\bpor semana\b/g, ' ');
  } else if (/\btod[oa]s? ?(?:os )?dias?\b(?! \d)|\bdiari[ao]\b|\bpor dia\b/.test(t)) {
    rec = { ciclo: 'diario' };
    resto = resto.replace(/\btod[oa]s? ?(?:os )?dias?\b(?! \d)|\bdiari[ao]\b|\bpor dia\b/g, ' ');
  }

  return { recorrencia: rec, resto: resto.replace(/\s+/g, ' ').trim() };
}

/* O valor. Primeiro em digito, depois por extenso. "45,90", "1.200",
   "R$ 32", "quarenta e cinco reais". */
function extrairValor(t) {
  const semRuido = t.replace(/\bpor cento\b/g, ' ');
  const emDigito = semRuido.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
  if (emDigito) {
    const v = Fv.lerNumero(emDigito[1]);
    if (v != null && v > 0) {
      return { valor: v, resto: semRuido.replace(emDigito[0], ' ').replace(/\s+/g, ' ').trim() };
    }
  }
  const falado = Fv.lerValorFalado(semRuido);
  if (falado != null && falado > 0) {
    // Tira as palavras do numero do texto para nao sujar a descricao.
    const resto = semRuido.replace(
      /\b(zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil|milhao|milhoes|reais|real|centavos?|conto|pila|e)\b/g, ' ',
    ).replace(/\s+/g, ' ').trim();
    return { valor: falado, resto };
  }
  return { valor: null, resto: t };
}

function acharCategoria(t) {
  let melhor = null;
  for (const [cat, palavras] of Object.entries(PALAVRAS)) {
    for (const p of palavras) {
      const re = new RegExp('(^|\\s)' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)');
      if (re.test(t) && (!melhor || p.length > melhor.palavra.length)) {
        melhor = { cat, palavra: p };
      }
    }
  }
  return melhor;
}

function acharTipo(t, cat) {
  for (const v of VERBOS_ENTRADA) if (new RegExp('(^|\\s)' + v + '(\\s|$)').test(t)) return 'entrada';
  for (const v of VERBOS_SAIDA) if (new RegExp('(^|\\s)' + v + '(\\s|$)').test(t)) return 'saida';
  if (cat && CAT_ENTRADA.includes(cat)) return 'entrada';
  return 'saida';
}

/* Uma frase curta para a lista: o texto falado sem os pedacos que ja
   viraram campo (valor, data, verbo, recorrencia). Filtra PALAVRA a
   PALAVRA, e nao por recorte de posicao: recortar por indice devolvia
   coisas como "Uber 18 re", que e pior do que nao mostrar nada. */
const NUMEROS_FALADOS = new Set(['zero', 'um', 'uma', 'dois', 'duas', 'tres', 'quatro',
  'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze',
  'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove', 'vinte',
  'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa',
  'cem', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos',
  'setecentos', 'oitocentos', 'novecentos', 'mil', 'milhao', 'milhoes']);

const SUPERFLUAS = new Set(VERBOS_SAIDA.concat(VERBOS_ENTRADA).concat([
  // O reconhecimento do Android escreve "cinquenta reais" como "R$ 50".
  // Sem estas duas entradas, o "R$" sobra e a lista mostra lancamento
  // chamado "R$" e "R$ Uber" — foi o que apareceu no celular.
  'reais', 'real', 'conto', 'contos', 'pila', 'centavos', 'centavo', 'r', 'rs',
  'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'em', 'com', 'pra',
  'para', 'por', 'o', 'a', 'os', 'as', 'ao', 'aos', 'e', 'que', 'me', 'meu',
  'minha', 'foi', 'era', 'hoje', 'ontem', 'anteontem', 'agora', 'todo', 'toda',
  'todos', 'todas', 'cada', 'dia', 'dias', 'mes', 'meses', 'semana', 'semanas',
  'mensal', 'semanal', 'diario', 'diaria', 'la', 'ali', 'aqui', 'um', 'uma',
]));

function descricao(cru) {
  const palavras = String(cru || '').split(/\s+/).filter(Boolean);
  const mantidas = [];
  for (const p of palavras) {
    const s = Fv.semAcento(p).replace(/[^a-z0-9]/g, '');
    if (!s) continue;
    if (/\d/.test(s)) continue;
    if (SUPERFLUAS.has(s) || NUMEROS_FALADOS.has(s)) continue;
    mantidas.push(p.replace(/[.,;:!?]+$/, ''));
  }
  const d = mantidas.join(' ').trim();
  if (d.length < 2) return '';
  return d.charAt(0).toUpperCase() + d.slice(1);
}

function interpretar(texto, ctx) {
  const opcoes = ctx || {};
  const hoje = opcoes.hoje || Fv.hoje();
  const cru = String(texto == null ? '' : texto).trim();
  const t = limpar(cru);
  if (!t) return { tipo: 'nada', motivo: 'vazio', texto: cru };

  /* 1. Comandos. Vem primeiro porque sao curtos e nao podem ser confundidos
        com lancamento ("apaga o ultimo" nao tem valor, mas "cancela 50" tem). */
  if (/\b(desfaz|desfazer|apaga|apagar|cancela|cancelar|remove|remover)\b.*\b(ultimo|ultima|isso|esse|essa)\b/.test(t)
      || /^(desfazer|desfaz|apaga isso|cancela isso)$/.test(t)) {
    return { tipo: 'comando', comando: 'desfazer', texto: cru };
  }
  if (/\b(para de ouvir|pode parar|parar de ouvir|desliga o microfone|chega)\b/.test(t)) {
    return { tipo: 'comando', comando: 'parar', texto: cru };
  }

  /* 2. Informar saldo: "meu saldo e 2400", "tenho 2400 na conta". */
  const ehSaldo = /\b(meu )?saldo (e|eh|esta|de|hoje e)\b/.test(t)
    || /\b(tenho|tem|ficou|sobrou)\b.*\b(na conta|no banco|de saldo)\b/.test(t)
    || /\b(na conta|no banco) (tem|tenho|ha)\b/.test(t)
    || /\batualiza(r)? (o )?saldo\b/.test(t);
  if (ehSaldo) {
    const v = extrairValor(t).valor;
    if (v != null) return { tipo: 'saldo', valor: v, texto: cru };
    return { tipo: 'nada', motivo: 'saldo sem valor', texto: cru };
  }

  /* 3. Perguntas. Antes do lancamento: "quanto gastei com mercado" tem
        cara de lancamento e nao e. */
  const pergunta = classificarPergunta(t);
  if (pergunta) return Object.assign({ tipo: 'pergunta', texto: cru }, pergunta);

  /* 4. Lancamento (ou conta fixa, quando tem recorrencia). */
  const comData = extrairData(t, hoje);
  const comRec = extrairRecorrencia(comData.resto, hoje);
  const comValor = extrairValor(comRec.resto);
  if (comValor.valor == null) {
    return { tipo: 'nada', motivo: 'sem valor', texto: cru };
  }
  const achada = acharCategoria(comRec.resto);
  const cat = achada ? achada.cat : null;
  const tipo = acharTipo(t, cat);

  const base = {
    valor: comValor.valor,
    tipo,
    categoria: cat || (tipo === 'entrada' ? 'entrada' : 'outros'),
    descricao: descricao(cru),
    data: comData.data,
    origem: 'voz',
    certeza: achada ? 'alta' : 'media',
  };

  if (comRec.recorrencia) {
    return {
      tipo: 'fixo',
      fixo: Object.assign({
        nome: base.descricao || nomePadrao(base.categoria, tipo),
        valor: base.valor, tipo: base.tipo, categoria: base.categoria,
      }, comRec.recorrencia),
      texto: cru,
    };
  }

  return { tipo: 'lancamento', lancamento: base, texto: cru };
}

function nomePadrao(cat, tipo) {
  if (tipo === 'entrada') return 'Entrada';
  const nomes = {
    moradia: 'Moradia', contas: 'Conta de casa', assinatura: 'Assinatura',
    transporte: 'Transporte', saude: 'Saúde', educacao: 'Educação', divida: 'Dívida',
  };
  return nomes[cat] || 'Conta fixa';
}

function classificarPergunta(t) {
  // A ordem das palavras muda muito na fala — "quanto posso gastar",
  // "da pra gastar quanto", "sobra quanto pra hoje". Exigir a ordem exata
  // fazia o app responder "nao entendi" para a pergunta que ele mais existe
  // para responder. Basta o verbo no infinitivo mais uma marca de pergunta.
  if ((/\bgastar\b/.test(t) && /\b(quanto|posso|da pra|da para|sobra|resta|teto|limite)\b/.test(t))
      || /\bquanto (eu )?tenho (para|pra) hoje\b/.test(t)) {
    return { pergunta: 'limite' };
  }
  if (/\b(conselho|dica|sugest|o que (eu )?faco|como (eu )?economizo|como economizar|me ajuda|sair do (negativo|vermelho|buraco)|melhorar)\b/.test(t)) {
    return { pergunta: 'conselho' };
  }
  const gastei = t.match(/\bquanto\b.*\b(gastei|gasto|torrei|paguei)\b(?:.*\b(com|em|no|na|de)\b\s+([a-z0-9 ]+))?/);
  if (gastei) {
    const alvo = gastei[3] ? acharCategoria(gastei[3].trim()) : null;
    return {
      pergunta: 'gasto',
      categoria: alvo ? alvo.cat : null,
      periodo: /\bhoje\b/.test(t) ? 'dia' : /\bsemana\b/.test(t) ? 'semana'
        : /\bano\b/.test(t) ? 'ano' : 'mes',
    };
  }
  if (/\b(fim|final) do ano\b|\bno ano\b|\bem 12 meses\b|\bum ano\b/.test(t)) {
    return { pergunta: 'projecao', horizonte: 'ano' };
  }
  if (/\b(fim|final) do mes\b|\bfecho o mes\b|\bmes que vem\b|\bneste mes\b|\besse mes\b/.test(t)) {
    return { pergunta: 'projecao', horizonte: 'mes' };
  }
  if (/\bsemana\b/.test(t) && /\b(quanto|como|vou ter|termino|fecho)\b/.test(t)) {
    return { pergunta: 'projecao', horizonte: 'semana' };
  }
  if (/\b(qual|quanto).*(saldo)\b|\bquanto (eu )?tenho\b|\bquanto tem na conta\b/.test(t)) {
    return { pergunta: 'saldo' };
  }
  if (/\bcomo (eu )?(estou|to|ando)\b|\bresumo\b|\bsituacao\b|\bcomo (estao|estao as) (contas|financas)\b|\bme da (um )?resumo\b/.test(t)) {
    return { pergunta: 'resumo' };
  }
  if (/\b(estou|to)\b.*\b(negativo|vermelho|apertado|no buraco)\b/.test(t)) {
    return { pergunta: 'conselho' };
  }
  return null;
}

/* --------------------------------------------------------------- *
 * A escuta                                                         *
 * --------------------------------------------------------------- */

/* Cria o ouvinte. Tudo que vem de fora e injetavel (`motor`, `doc`, `win`)
   porque os testes precisam simular o celular bloqueando a tela — coisa que
   nenhum navegador de teste faz de verdade. */
function criarEscuta(op) {
  const o = op || {};
  const win = o.win || (typeof window !== 'undefined' ? window : null);
  const doc = o.doc || (typeof document !== 'undefined' ? document : null);
  const Motor = o.motor
    || (win && (win.SpeechRecognition || win.webkitSpeechRecognition)) || null;

  const SILENCIO_MS = o.silencioMs || 9000;   // sem falar nada, desliga
  const TETO_MS = o.tetoMs || 120000;         // teto duro de sessao

  let rec = null;
  let ligado = false;      // o microfone esta aberto agora?
  let desejado = false;    // voce pediu para ouvir?
  let motivoFim = '';
  let tSilencio = null, tTeto = null;

  const avisar = (estado, extra) => { if (o.onEstado) o.onEstado(estado, extra || {}); };

  function telaVisivel() {
    if (o.telaVisivel) return !!o.telaVisivel();
    if (!doc) return false;
    // `hidden` cobre tela bloqueada, app em segundo plano e aba trocada.
    return doc.visibilityState === 'visible' && !doc.hidden;
  }

  function disponivel() { return !!Motor; }

  function limparRelogios() {
    if (tSilencio) { clearTimeout(tSilencio); tSilencio = null; }
    if (tTeto) { clearTimeout(tTeto); tTeto = null; }
  }

  function armarSilencio() {
    if (tSilencio) clearTimeout(tSilencio);
    tSilencio = setTimeout(() => desligar('silencio'), SILENCIO_MS);
  }

  function ligar() {
    if (!disponivel()) { avisar('indisponivel'); return false; }
    if (ligado) return true;
    // A trava, no unico lugar que importa: a porta de entrada.
    if (!telaVisivel()) { avisar('bloqueado', { motivo: 'tela' }); return false; }

    rec = new Motor();
    rec.lang = o.idioma || 'pt-BR';
    /* Modo continuo DESLIGADO, de proposito.
     *
     * Com `continuous = true` o Chrome do Android acumula os resultados da
     * sessao inteira e reentrega os antigos a cada evento — e e dai que
     * saem os lancamentos repetidos. Desligado, cada sessao devolve UM
     * resultado final e acaba; a escuta continua porque o `onend` abaixo
     * reinicia sozinho enquanto voce quiser ouvir e a tela estiver acesa.
     * Para quem usa, nao muda nada: o microfone segue aberto. Muda que cada
     * frase chega uma vez. */
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    /* Uma fala, um lancamento.
     *
     * O motor do Android manda, a CADA evento, a lista INTEIRA de
     * resultados da sessao — e com `resultIndex` em zero, sem apontar para
     * o pedaco novo. Quem percorre a lista a partir desse indice processa
     * tudo de novo a cada palavra reconhecida: um "gastei 50 no uber" virou
     * quatro lancamentos de R$ 50 num celular de verdade.
     *
     * A saida e nao percorrer lista nenhuma. So o ULTIMO resultado
     * interessa: os anteriores, se ja eram finais, ja viraram lancamento no
     * evento em que apareceram. Isso vale para os dois tipos de motor — o
     * que empilha os resultados e o que manda so o novo.
     *
     * A frase repetida em menos de tres segundos e eco do reconhecimento,
     * nao um gasto novo: ninguem fala a mesma conta duas vezes nesse
     * intervalo. */
    let ultimaFrase = '', ultimaHora = 0;

    rec.onresult = (ev) => {
      armarSilencio();
      const r = ev.results[ev.results.length - 1];
      if (!r) return;
      const texto = ((r[0] && r[0].transcript) || '').trim();
      if (!texto) return;

      if (!r.isFinal) {
        if (o.onParcial) o.onParcial(texto);
        return;
      }

      const agora = Date.now();
      // Vale entre sessoes tambem: ao reiniciar, ha motor que reentrega o
      // final da sessao anterior.
      if (texto === ultimaFrase && agora - ultimaHora < 4000) return;
      ultimaFrase = texto;
      ultimaHora = agora;
      if (o.onTexto) o.onTexto(texto, { confianca: r[0] && r[0].confidence });
    };

    rec.onerror = (ev) => {
      const erro = (ev && ev.error) || 'desconhecido';
      // "no-speech" e "aborted" sao rotina, nao falha: nao vale assustar
      // ninguem com mensagem vermelha porque ficou dois segundos calado.
      if (erro === 'no-speech' || erro === 'aborted') return;
      motivoFim = erro;
      if (o.onErro) o.onErro(erro);
    };

    rec.onend = () => {
      ligado = false;
      limparRelogios();
      // O motor do celular encerra sozinho a cada frase. Se voce ainda quer
      // ouvir E a tela continua acesa, ele volta. Se a tela apagou, nao:
      // essa e a diferenca entre uma escuta continua e um microfone que
      // acorda no bolso.
      if (desejado && telaVisivel() && !motivoFim) {
        try { rec.start(); ligado = true; armarSilencio(); avisar('ouvindo'); return; } catch (e) { /* cai fora */ }
      }
      desejado = false;
      avisar('parado', { motivo: motivoFim || 'fim' });
      motivoFim = '';
    };

    try {
      rec.start();
    } catch (e) {
      avisar('parado', { motivo: 'falha ao iniciar' });
      return false;
    }
    ligado = true; desejado = true;
    armarSilencio();
    tTeto = setTimeout(() => desligar('teto'), TETO_MS);
    avisar('ouvindo');
    return true;
  }

  function desligar(motivo) {
    desejado = false;
    motivoFim = motivo || '';
    limparRelogios();
    if (rec && ligado) {
      try { rec.stop(); } catch (e) { try { rec.abort(); } catch (e2) { /* ja morreu */ } }
    }
    ligado = false;
    avisar('parado', { motivo: motivo || 'voce' });
  }

  function alternar() { return ligado ? (desligar('voce'), false) : ligar(); }

  /* As portas por onde a pagina sai da frente. Todas fecham o microfone. */
  function aoEsconder() { if (ligado) desligar('tela'); }

  if (doc && doc.addEventListener) {
    doc.addEventListener('visibilitychange', () => { if (!telaVisivel()) aoEsconder(); });
    doc.addEventListener('freeze', aoEsconder);
  }
  if (win && win.addEventListener) {
    win.addEventListener('pagehide', aoEsconder);
    win.addEventListener('blur', aoEsconder);
  }

  return {
    ligar, desligar, alternar, disponivel, telaVisivel,
    ligado: () => ligado,
    aoEsconder,   // exposto para os testes simularem a tela apagando
  };
}

/* Falar de volta. Util de verdade quando a pessoa esta dirigindo ou
   cozinhando — que e quando ela lembra do gasto e nao pode digitar. */
function falar(texto, ligado, win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  if (!ligado || !w || !w.speechSynthesis) return false;
  try {
    w.speechSynthesis.cancel();
    const f = new w.SpeechSynthesisUtterance(String(texto || ''));
    f.lang = 'pt-BR';
    f.rate = 1.05;
    const voz = (w.speechSynthesis.getVoices() || []).find((v) => /pt[-_]BR/i.test(v.lang));
    if (voz) f.voice = voz;
    w.speechSynthesis.speak(f);
    return true;
  } catch (e) { return false; }
}

const Voz = {
  interpretar, criarEscuta, falar, acharCategoria, extrairValor, extrairData,
  extrairRecorrencia, classificarPergunta, PALAVRAS,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Voz;
else window.Voz = Voz;
