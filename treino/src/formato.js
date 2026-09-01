/* Tempo, datas e contagem — em portugues do Brasil.
 *
 * A base de tudo: o cronometro cai aqui para virar "01:30" na tela, o
 * historico cai aqui para virar "terca-feira". Este arquivo nao conhece o
 * resto do app de proposito, entao da para testar sozinho no node.
 *
 * Uma decisao que vale explicar, e que e a mesma da Bussola: data e sempre
 * a string 'AAAA-MM-DD', e a conta e sempre feita com
 * `new Date(ano, mes-1, dia)`, que e horario LOCAL. Se usasse
 * `new Date('2026-08-26')` o navegador leria como UTC e, no fuso do Brasil,
 * "hoje" viraria "ontem" depois das 21h. Num app de treino isso quebra a
 * sequencia de dias: a pessoa treina as 22h e o app diz que ela faltou.
 */

/* ------------------------------------------------------------------ *
 * Tempo                                                               *
 * ------------------------------------------------------------------ */

/* "01:30". O relogio grande da tela de execucao. Sempre com dois digitos
   nos dois lados: numero que muda de largura a cada segundo faz a tela
   inteira tremer. */
function relogio(segundos) {
  const s = Math.max(0, Math.round(Number(segundos) || 0));
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

/* "45 s", "8 min", "1 h 05" — a duracao escrita como se fala. Serve para
   cartao e lista, nunca para o cronometro (esse e o `relogio`). */
function duracao(segundos) {
  const s = Math.max(0, Math.round(Number(segundos) || 0));
  if (s < 60) return s + ' s';
  const m = Math.round(s / 60);
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return resto ? h + ' h ' + String(resto).padStart(2, '0') : h + ' h';
}

/* Minutos inteiros, para somar volume da semana sem acumular segundo. */
function emMinutos(segundos) {
  return Math.round((Number(segundos) || 0) / 60);
}

/* ------------------------------------------------------------------ *
 * Plural e listas                                                     *
 * ------------------------------------------------------------------ */

/* plural(1,'treino','treinos') -> '1 treino'. Escrever "1 treinos" na tela
   e o tipo de detalhe que faz o app parecer de brinquedo. */
function plural(n, um, muitos) {
  const q = Number(n) || 0;
  return q + ' ' + (Math.abs(q) === 1 ? um : muitos);
}

/* ['halter','elastico'] -> 'halter e elástico'. */
function listar(itens) {
  const l = (itens || []).filter(Boolean);
  if (!l.length) return '';
  if (l.length === 1) return String(l[0]);
  return l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1];
}

function maiuscula(s) {
  const t = String(s || '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* Tira acento para comparar texto digitado na busca: quem procura
   "abdominal" tem que achar "abdominal", e quem procura "flexao" tem que
   achar "flexão". */
function semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* ------------------------------------------------------------------ *
 * Datas                                                               *
 * ------------------------------------------------------------------ */
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado'];
const SEMANA_CURTA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function diaISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function hoje() {
  return diaISO(new Date());
}

function deISO(iso) {
  const [a, m, d] = String(iso).split('-').map(Number);
  return new Date(a, (m || 1) - 1, d || 1);
}

function somarDias(iso, n) {
  const d = deISO(iso);
  d.setDate(d.getDate() + n);
  return diaISO(d);
}

/* Dias de `iso` ate `ref` (positivo = passado). Conta em dias de calendario,
   nao em 24 horas: treinar as 23h e depois as 7h e "ontem e hoje", dois
   dias, e a sequencia continua. */
function diasEntre(iso, refIso) {
  const a = deISO(iso), b = deISO(refIso || hoje());
  return Math.round((b - a) / 86400000);
}

function diaSemana(iso) {
  return deISO(iso).getDay();
}

/* Segunda-feira da semana de `iso`. A semana do app comeca na segunda
   porque e assim que quem treina conta: "esta semana eu fui tres vezes". */
function inicioDaSemana(iso) {
  const dia = diaSemana(iso);
  return somarDias(iso, dia === 0 ? -6 : 1 - dia);
}

function dataCurta(iso) {
  const d = deISO(iso);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

function dataPorExtenso(iso) {
  const d = deISO(iso);
  return d.getDate() + ' de ' + MESES[d.getMonth()];
}

/* "hoje", "ontem", "sexta-feira", "12 de agosto" — o rotulo que a pessoa
   entende sem contar nos dedos. */
function dataAmigavel(iso, refIso) {
  const d = diasEntre(iso, refIso || hoje());
  if (d === 0) return 'hoje';
  if (d === 1) return 'ontem';
  if (d === 2) return 'anteontem';
  if (d > 2 && d <= 6) return SEMANA[diaSemana(iso)];
  return dataPorExtenso(iso);
}

const Formato = {
  relogio, duracao, emMinutos, plural, listar, maiuscula, semAcento,
  hoje, diaISO, deISO, somarDias, diasEntre, diaSemana, inicioDaSemana,
  dataCurta, dataPorExtenso, dataAmigavel,
  MESES, SEMANA, SEMANA_CURTA,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Formato;
else window.Formato = Formato;
