/* Dinheiro, datas e numeros por extenso — em portugues do Brasil.
 *
 * Este arquivo e a base de tudo: a voz cai aqui para virar numero, as
 * projecoes caem aqui para virar texto na tela. Ele nao conhece o resto do
 * app de proposito, entao da para testar sozinho no node.
 *
 * Uma decisao que vale explicar: data e sempre a string 'AAAA-MM-DD', e a
 * conta e sempre feita com `new Date(ano, mes-1, dia)`, que e horario
 * LOCAL. Se usasse `new Date('2026-08-26')` o navegador leria como UTC e,
 * no fuso do Brasil, "hoje" viraria "ontem" depois das 21h — o app diria
 * que o gasto de agora a pouco foi de ontem.
 */

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 2,
});
const MOEDA_SECA = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0,
});

function dinheiro(v, seca) {
  const n = Number(v) || 0;
  return (seca ? MOEDA_SECA : MOEDA).format(n);
}

/* Numero curto para caber em cartao de celular: R$ 12,4 mil.
   Acima de mil a casa dos centavos nao ajuda ninguem a decidir nada. */
function dinheiroCurto(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  const sinal = n < 0 ? '-' : '';
  if (abs >= 1000000) return sinal + 'R$ ' + (abs / 1000000).toFixed(abs >= 10000000 ? 0 : 1).replace('.', ',') + ' mi';
  if (abs >= 10000) return sinal + 'R$ ' + (abs / 1000).toFixed(abs >= 100000 ? 0 : 1).replace('.', ',') + ' mil';
  if (abs >= 1000) return dinheiro(n, true);
  return dinheiro(n);
}

function porcento(v, casas) {
  const n = Number(v) || 0;
  return (n * 100).toFixed(casas == null ? 0 : casas).replace('.', ',') + '%';
}

/* ------------------------------------------------------------------ *
 * Ler numero escrito em digitos: "1.234,56", "1234.56", "45", "R$ 9"  *
 * ------------------------------------------------------------------ */
function lerNumero(txt) {
  if (typeof txt === 'number') return Number.isFinite(txt) ? txt : null;
  let s = String(txt == null ? '' : txt).trim();
  if (!s) return null;
  s = s.replace(/r\$/gi, '').replace(/\s/g, '');
  const negativo = /^-/.test(s);
  s = s.replace(/-/g, '');
  if (!/[0-9]/.test(s)) return null;

  const temPonto = s.includes('.');
  const temVirgula = s.includes(',');
  if (temPonto && temVirgula) {
    // "1.234,56" — o ponto e milhar, a virgula e decimal.
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (temVirgula) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (temPonto) {
    // So ponto: pode ser milhar ("1.500") ou decimal ("12.50"). Se o padrao
    // for grupos de tres depois do primeiro ponto, e milhar.
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/* ------------------------------------------------------------------ *
 * Ler numero FALADO: "quarenta e cinco reais e noventa centavos".     *
 *                                                                     *
 * O reconhecimento de voz do celular as vezes devolve digito          *
 * ("45 reais") e as vezes devolve palavra ("quarenta e cinco reais"). *
 * Sem esta parte, metade do que a pessoa fala vira lancamento sem     *
 * valor — e um app de financas que perde o valor nao serve para nada. *
 * ------------------------------------------------------------------ */
const UNIDADES = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19,
};
const DEZENAS = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60,
  setenta: 70, oitenta: 80, noventa: 90,
};
const CENTENAS = {
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300,
  trezentas: 300, quatrocentos: 400, quatrocentas: 400, quinhentos: 500,
  quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700,
  setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900,
  novecentas: 900,
};
const ESCALAS = { mil: 1000, milhao: 1000000, milhoes: 1000000, milhao_: 1000000 };

function semAcento(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* Converte uma sequencia de palavras em numero. Devolve null se nenhuma
   palavra da sequencia for numero — assim quem chama sabe que nao achou. */
function numeroPorExtenso(texto) {
  const palavras = semAcento(texto).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  let total = 0, parcial = 0, achou = false;
  for (const p of palavras) {
    if (p === 'e') continue;
    if (/^\d+$/.test(p)) { parcial += parseInt(p, 10); achou = true; continue; }
    if (p in UNIDADES) { parcial += UNIDADES[p]; achou = true; continue; }
    if (p in DEZENAS) { parcial += DEZENAS[p]; achou = true; continue; }
    if (p in CENTENAS) { parcial += CENTENAS[p]; achou = true; continue; }
    if (p === 'mil') { parcial = (parcial || 1) * 1000; total += parcial; parcial = 0; achou = true; continue; }
    if (p === 'milhao' || p === 'milhoes') {
      parcial = (parcial || 1) * 1000000; total += parcial; parcial = 0; achou = true; continue;
    }
    // Palavra que nao e numero encerra a leitura: "cinco no mercado" nao
    // pode virar cinco-mercado. Mas so encerra se ja tinha comecado.
    if (achou) break;
  }
  if (!achou) return null;
  return total + parcial;
}

/* O valor falado inteiro, ja com centavos: "trinta reais e cinquenta
   centavos", "quarenta e cinco reais e noventa", "mil e duzentos".

   O corte entre reais e centavos nao pode ser no primeiro "e" da frase:
   "quarenta e cinco reais e noventa centavos" tem dois. O corte certo e o
   ULTIMO "e" — ou a palavra "reais", quando ela aparece, que e um
   separador melhor ainda porque a pessoa costuma dize-la no meio. */
function lerValorFalado(texto) {
  const t = semAcento(texto).replace(/\s+/g, ' ').trim();

  const comCentavos = t.match(/^(.*?)\s*centavos?\b/);
  if (comCentavos) {
    const parte = comCentavos[1].trim();
    let inteiro = null, centavos = null;
    const porReais = parte.match(/^(.*)\b(?:reais|real)\b\s*(?:e\s+)?(.*)$/);
    if (porReais && numeroPorExtenso(porReais[2]) != null) {
      inteiro = numeroPorExtenso(porReais[1]);
      centavos = numeroPorExtenso(porReais[2]);
    } else {
      const ultimoE = parte.lastIndexOf(' e ');
      if (ultimoE > 0) {
        inteiro = numeroPorExtenso(parte.slice(0, ultimoE));
        centavos = numeroPorExtenso(parte.slice(ultimoE + 3));
      } else {
        // "cinquenta centavos" — so a parte dos centavos.
        const so = numeroPorExtenso(parte);
        if (so != null) return so / 100;
      }
    }
    if (inteiro != null && centavos != null) {
      return inteiro + (centavos >= 100 ? centavos / 1000 : centavos / 100);
    }
    if (inteiro != null) return inteiro;
  }

  // "quarenta reais e noventa" (sem dizer "centavos" no fim) e comum na
  // fala. Só vale quando o "e" vem depois de "reais": senao "mil e
  // duzentos" viraria 1000,20.
  const semDizerCentavos = t.match(/^(.*)\b(?:reais|real)\b\s+e\s+([a-z0-9 ]+)$/);
  if (semDizerCentavos) {
    const inteiro = numeroPorExtenso(semDizerCentavos[1]);
    const centavos = numeroPorExtenso(semDizerCentavos[2]);
    if (inteiro != null && centavos != null) return inteiro + centavos / 100;
  }

  return numeroPorExtenso(t);
}

/* ------------------------------------------------------------------ *
 * Datas                                                               *
 * ------------------------------------------------------------------ */
function hoje() { return diaISO(new Date()); }

function diaISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function deISO(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function somarDias(iso, n) {
  const d = deISO(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + n);
  return diaISO(d);
}

/* Somar mes preservando "o dia 31 de um mes de 30". O dia 31 vira o dia 30:
   e o que o boleto faz, e o que a pessoa espera ver. */
function somarMeses(iso, n) {
  const d = deISO(iso);
  if (!d) return iso;
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(dia, diasNoMes(d.getFullYear(), d.getMonth() + 1)));
  return diaISO(d);
}

function diasNoMes(ano, mes) { return new Date(ano, mes, 0).getDate(); }

function fimDoMes(iso) {
  const d = deISO(iso);
  if (!d) return iso;
  return diaISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function fimDoAno(iso) {
  const d = deISO(iso);
  if (!d) return iso;
  return diaISO(new Date(d.getFullYear(), 11, 31));
}

/* Quantos dias de `a` ate `b`, contando os dois? Nao: contando o intervalo.
   Usa meio-dia para nao tropecar no horario de verao. */
function diasEntre(a, b) {
  const da = deISO(a), db = deISO(b);
  if (!da || !db) return 0;
  da.setHours(12, 0, 0, 0); db.setHours(12, 0, 0, 0);
  return Math.round((db - da) / 86400000);
}

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_ACENTO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const SEMANA_ACENTO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado'];

function diaSemana(iso) { const d = deISO(iso); return d ? d.getDay() : 0; }

/* Data de outro ano leva o ano junto. Sem isso a projecao de 12 meses diz
   "25 de agosto" e a pessoa le como se fosse daqui a uma semana. */
function outroAno(d) { return d.getFullYear() !== new Date().getFullYear(); }

function dataCurta(iso) {
  const d = deISO(iso);
  if (!d) return '';
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')
    + (outroAno(d) ? '/' + String(d.getFullYear()).slice(2) : '');
}

function dataPorExtenso(iso) {
  const d = deISO(iso);
  if (!d) return '';
  return d.getDate() + ' de ' + MESES_ACENTO[d.getMonth()]
    + (outroAno(d) ? ' de ' + d.getFullYear() : '');
}

/* "hoje", "ontem", "sexta-feira", "12 de agosto" — o rotulo que a pessoa
   entende sem precisar contar nos dedos. */
function dataAmigavel(iso, refIso) {
  const ref = refIso || hoje();
  const d = diasEntre(iso, ref);
  if (d === 0) return 'hoje';
  if (d === 1) return 'ontem';
  if (d === -1) return 'amanhã';
  if (d === 2) return 'anteontem';
  if (d > 2 && d <= 6) return SEMANA_ACENTO[diaSemana(iso)];
  if (d < -1 && d >= -6) return SEMANA_ACENTO[diaSemana(iso)];
  return dataPorExtenso(iso);
}

const Formato = {
  dinheiro, dinheiroCurto, porcento, lerNumero, numeroPorExtenso, lerValorFalado,
  semAcento, hoje, diaISO, deISO, somarDias, somarMeses, diasNoMes, fimDoMes,
  fimDoAno, diasEntre, diaSemana, dataCurta, dataPorExtenso, dataAmigavel,
  MESES, MESES_ACENTO, SEMANA, SEMANA_ACENTO,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Formato;
else window.Formato = Formato;
