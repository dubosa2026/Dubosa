/* Conselhos que nascem da conta, nao de frase pronta.
 *
 * Este arquivo e o "assessor" do app quando nao ha internet, chave de IA,
 * nem vontade de esperar. Cada conselho aqui e uma regra fechada sobre os
 * SEUS numeros, e todo conselho carrega a conta que o gerou — dizer
 * "corte no delivery" sem mostrar quanto e a mais e horoscopo.
 *
 * Tres coisas que ele nunca faz:
 *
 * - Nao inventa taxa de mercado. Se voce nao disser quanto rende a sua
 *   aplicacao, ele nao simula rendimento nenhum. Um numero chutado numa
 *   tela de dinheiro vira decisao errada.
 * - Nao recomenda produto, corretora, banco nem investimento especifico.
 *   Ele mostra quanto sobra e o que a sua propria taxa faria com isso.
 * - Nao da bronca. Gasto acima da media vira numero e caminho de volta,
 *   nao sermao.
 */

/* eslint-disable no-undef */
var Fc = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./formato.js') : window.Formato;
var Nc = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./nucleo.js') : window.Nucleo;

/* De onde da para cortar, e quanto de cada uma — porque nem todo gasto
   cede igual. Delivery e assinatura cedem quase tudo; mercado e transporte
   cedem alguma coisa (marca mais barata, menos desperdicio, uma carona),
   mas mandar cortar 40% da comida da casa nao e conselho, e desaforo.
   Aluguel, escola, saude e divida nao entram: nenhum deles se resolve
   apertando o mes, e sim renegociando — que e o que os outros conselhos
   dizem, cada um na sua vez. */
const CORTAVEIS = {
  comida: 0.4, lazer: 0.4, assinatura: 0.4, roupa: 0.4, presente: 0.4, outros: 0.4,
  mercado: 0.2, transporte: 0.2,
};

function pct(a, b) { return b > 0 ? a / b : 0; }

/* "1 mês" / "3 meses". Sem isto sai "3 mêses", que estraga a frase toda. */
function plural(n, um, muitos) { return Math.abs(n) === 1 ? um : muitos; }
function numero(n, casas) { return Number(n).toFixed(casas == null ? 1 : casas).replace('.', ','); }

/* ------------------------------------------------------------------ *
 * O plano para fechar um buraco                                       *
 * ------------------------------------------------------------------ */

/* Quanto falta e de onde tirar. Distribui o corte entre as categorias
   cortaveis na proporcao do que cada uma pesa, com teto de 40% em cada:
   plano que exige zerar uma categoria inteira nao e cumprido por ninguem. */
function planoDeCorte(estado, falta, ref) {
  const hoje = ref || Fc.hoje();
  const de = Fc.somarDias(hoje, -29);
  const gastos = Nc.porCategoria(estado, de, hoje, 'saida')
    .filter((c) => CORTAVEIS[c.id] && c.total > 0);
  if (!gastos.length || falta <= 0) return null;

  const disponivel = gastos.reduce((s, c) => s + c.total * CORTAVEIS[c.id], 0);
  const cobre = disponivel >= falta;
  // Quando o corte possivel passa do buraco, aperta so o quanto precisa —
  // um plano que tira mais do que falta some com a confianca de quem segue.
  const fator = Math.min(1, falta / Math.max(0.01, disponivel));
  const linhas = gastos.map((c) => {
    const corte = Nc.arredondar(c.total * CORTAVEIS[c.id] * fator);
    return {
      id: c.id, nome: c.nome, emoji: c.emoji,
      gasta: c.total, corte, fica: Nc.arredondar(c.total - corte),
      porcento: pct(corte, c.total), teto: CORTAVEIS[c.id],
    };
  }).filter((l) => l.corte >= 1);

  return {
    falta: Nc.arredondar(falta),
    cobre,
    total: Nc.arredondar(linhas.reduce((s, l) => s + l.corte, 0)),
    linhas,
    // O que sobra do buraco depois do corte possivel: e o numero que diz
    // se da para resolver so apertando, ou se precisa de renda extra ou de
    // renegociar uma conta fixa.
    restante: cobre ? 0 : Nc.arredondar(falta - disponivel),
  };
}

/* ------------------------------------------------------------------ *
 * Comparacao de categoria com o proprio historico                     *
 * ------------------------------------------------------------------ */
function fugiuDoNormal(estado, ref) {
  const hoje = ref || Fc.hoje();
  const inicioMes = hoje.slice(0, 8) + '01';
  const diaDoMes = Number(hoje.slice(8, 10));
  // Comparar no dia 2 do mes e ruido puro: um almoco caro vira "300% acima".
  if (diaDoMes < 5) return [];

  const primeiro = estado.lancamentos.length
    ? estado.lancamentos[estado.lancamentos.length - 1].data : hoje;
  const janelaIni = Fc.somarMeses(inicioMes, -3);
  const de = primeiro > janelaIni ? primeiro : janelaIni;
  const ate = Fc.somarDias(inicioMes, -1);
  const diasJanela = Fc.diasEntre(de, ate) + 1;
  // O "normal" precisa vir de historico de verdade. Dividir tres meses de
  // gaveta por tres quando so existe um mes de dados faz o app acusar
  // "acima do normal" em quem nao mudou nada — e ele perde a confianca da
  // pessoa logo na primeira semana de uso.
  if (diasJanela < 21) return [];

  const atual = Nc.porCategoria(estado, inicioMes, hoje, 'saida');
  const antes = Nc.porCategoria(estado, de, ate, 'saida');
  const mapaAntes = new Map(antes.map((c) => [c.id, c.total / diasJanela]));

  const fora = [];
  for (const c of atual) {
    const normalDia = mapaAntes.get(c.id);
    if (!normalDia || normalDia * 30.4 < 20) continue;
    const normalAteAgora = normalDia * diaDoMes;
    if (normalAteAgora <= 0) continue;
    const razao = c.total / normalAteAgora;
    if (razao >= 1.35 && c.total - normalAteAgora >= 30) {
      fora.push({
        id: c.id, nome: c.nome, emoji: c.emoji,
        gasto: c.total,
        normal: Nc.arredondar(normalAteAgora),
        aMais: Nc.arredondar(c.total - normalAteAgora),
        razao,
      });
    }
  }
  return fora.sort((a, b) => b.aMais - a.aMais);
}

/* ------------------------------------------------------------------ *
 * Os conselhos                                                        *
 * ------------------------------------------------------------------ */
function gerar(estado, ref) {
  const hoje = ref || Fc.hoje();
  const cartas = [];
  const limite = Nc.limiteDoDia(estado, hoje);
  const mes = Nc.projetar(estado, Fc.fimDoMes(hoje), { de: hoje });
  const ano = Nc.projetar(estado, Fc.somarDias(hoje, 364), { de: hoje });
  const fixo = Nc.mensalFixo(estado);
  const sobra = Nc.sobraMensal(estado, hoje);
  const mv = Nc.mediaVariavel(estado, hoje);
  const reservaAlvo = Nc.arredondar(fixo.sai * (Number(estado.ajustes.reservaMeses) || 3));

  const por = (id, tom, titulo, texto, extra) => cartas.push(
    Object.assign({ id, tom, titulo, texto }, extra || {}),
  );

  /* 1. Pouco historico: qualquer conselho aqui seria chute. */
  if (mv.confianca === 'baixa' && estado.lancamentos.length < 5) {
    por('comeco', 'neutro', 'Me conte os gastos de alguns dias',
      'Com uns 7 dias de lançamentos eu já consigo projetar o mês com alguma '
      + 'firmeza. Por enquanto o que eu mostrar é chute — e chute em conta de '
      + 'dinheiro não ajuda ninguém.');
  }

  /* 2. O buraco: a conta mais importante da tela. */
  if (mes.zeraEm) {
    const falta = Math.abs(Math.min(0, mes.saldoFinal)) + (Number(estado.ajustes.reserva) || 0);
    const plano = planoDeCorte(estado, Math.max(falta, 1), hoje);
    por('negativo', 'alerta', 'Do jeito que está, o saldo zera dia ' + Fc.dataCurta(mes.zeraEm),
      'No ritmo atual — contas fixas nas datas delas e ' + Fc.dinheiro(mes.mediaDia)
      + ' por dia de gasto variável — o dinheiro acaba antes do fim do mês. '
      + 'Faltam ' + Fc.dinheiro(Math.max(falta, 0)) + ' para chegar no dia '
      + Fc.dataCurta(Fc.fimDoMes(hoje)) + '.',
      { plano, valor: Math.max(falta, 0), quando: mes.zeraEm });
  } else if (mes.saldoFinal < reservaAlvo * 0.2 && fixo.sai > 0) {
    por('raspando', 'atencao', 'O mês fecha raspando',
      'A projeção termina em ' + Fc.dinheiro(mes.saldoFinal) + '. Dá, mas não sobra '
      + 'margem para imprevisto — e imprevisto é a única coisa garantida.');
  }

  /* 3. O teto do dia. Duas conversas diferentes: passou do teto (acontece,
        o mes se recompoe) ou nao ha teto nenhum (o mes ja esta comprometido). */
  if (limite.apertado && !mes.zeraEm) {
    por('sem-teto', 'alerta', 'Não sobra teto para hoje',
      'O que está na conta mais o que ainda entra não cobre as contas fixas que '
      + 'faltam até dia ' + Fc.dataCurta(Fc.fimDoMes(hoje)) + '. Enquanto isso não '
      + 'mudar, qualquer gasto novo entra no vermelho — o caminho é adiar ou '
      + 'renegociar o que é fixo, não cortar o dia a dia.',
      { valor: limite.disponivel });
  } else if (limite.resta < 0) {
    const amanha = Nc.arredondar((limite.disponivel - limite.gasto)
      / Math.max(1, limite.diasRestantes - 1));
    por('limite', 'atencao', 'Hoje já passou do limite',
      'O teto de hoje era ' + Fc.dinheiro(limite.limite) + ' e já saíram '
      + Fc.dinheiro(limite.gasto) + '. Não é o fim do mundo: '
      + (amanha > 0
        ? 'de amanhã até o fim do mês o teto passa a ser ' + Fc.dinheiro(amanha)
          + ' por dia e a conta se recompõe.'
        : 'mas a partir de amanhã não sobra mais teto nenhum no mês.'),
      { valor: Math.abs(limite.resta) });
  }

  /* 4. Peso do fixo. Acima de 60% da renda, o problema nao e o cafezinho. */
  if (fixo.entra > 0) {
    const peso = pct(fixo.sai, fixo.entra);
    if (peso >= 0.6) {
      const maiores = estado.fixos.filter((f) => f.ativo && f.tipo === 'saida')
        .sort((a, b) => b.valor - a.valor).slice(0, 3);
      por('fixo-alto', peso >= 0.8 ? 'alerta' : 'atencao',
        'Suas contas fixas comem ' + Fc.porcento(peso) + ' do que entra',
        'Sobram ' + Fc.dinheiro(fixo.entra - fixo.sai) + ' por mês para tudo o mais. '
        + 'Quando o fixo passa de 60%, cortar gasto do dia a dia não resolve: o que '
        + 'muda o jogo é renegociar as três maiores — '
        + maiores.map((f) => f.nome + ' (' + Fc.dinheiro(f.valor) + ')').join(', ') + '.',
        { valor: fixo.sai, peso });
    }
  }

  /* 5. Assinatura: o gasto que ninguem lembra de ter. */
  const assinaturas = estado.fixos.filter((f) => f.ativo && f.tipo === 'saida' && f.categoria === 'assinatura');
  if (assinaturas.length >= 2) {
    const mesTotal = assinaturas.reduce((s, f) => s + (f.ciclo === 'mensal' ? f.valor : f.valor * 4.3), 0);
    por('assinaturas', 'neutro', assinaturas.length + ' assinaturas: '
      + Fc.dinheiro(mesTotal) + ' por mês',
      'Dá ' + Fc.dinheiro(mesTotal * 12) + ' no ano. É o corte mais fácil que existe, '
      + 'porque não muda nada na sua rotina: só some o que você não abre há semanas.',
      { valor: Nc.arredondar(mesTotal), itens: assinaturas.map((f) => f.nome) });
  }

  /* 6. Categoria que fugiu do proprio normal. */
  for (const f of fugiuDoNormal(estado, hoje).slice(0, 2)) {
    por('fuga-' + f.id, 'atencao', f.emoji + ' ' + f.nome + ' está '
      + Fc.porcento(f.razao - 1) + ' acima do seu normal',
      'Você já gastou ' + Fc.dinheiro(f.gasto) + ' este mês; no mesmo ponto dos '
      + 'últimos três meses estaria em ' + Fc.dinheiro(f.normal) + '. São '
      + Fc.dinheiro(f.aMais) + ' a mais — e o mês ainda não acabou.',
      { valor: f.aMais, categoria: f.id });
  }

  /* 7. Dividas: o juro que corre enquanto voce dorme. */
  const plano = Nc.planoDividas(estado.dividas, Math.max(0, sobra.sobra));
  if (plano) {
    const taxa = Number(estado.ajustes.taxaAno);
    let comparacao = '';
    if (Number.isFinite(taxa) && taxa > 0) {
      const rendeMes = Math.pow(1 + taxa, 1 / 12) - 1;
      if (plano.alvo.jurosMes > rendeMes) {
        comparacao = ' Sua dívida mais cara cobre ' + Fc.porcento(plano.alvo.jurosMes, 1)
          + ' ao mês e sua aplicação rende ' + Fc.porcento(rendeMes, 2)
          + ': cada real que você usar para quitar rende mais que investir.';
      }
    }
    por('dividas', plano.jurosMes > 0 ? 'alerta' : 'neutro',
      'Você paga ' + Fc.dinheiro(plano.jurosMes) + ' de juros por mês',
      'São ' + Fc.dinheiro(plano.total) + ' de dívida. Comece pela de juro maior — '
      + plano.alvo.nome + ', ' + Fc.porcento(plano.alvo.jurosMes, 1) + ' ao mês — e só '
      + 'depois passe para a seguinte: essa ordem é a que economiza mais dinheiro.'
      + (plano.meses ? ' No ritmo atual ela zera em ' + plano.meses + ' meses.'
        : ' Atenção: no pagamento atual essa dívida não fecha — a parcela não cobre o juro.')
      + comparacao,
      { valor: plano.jurosMes, plano });
  }

  /* 8. Reserva antes de render. Nesta ordem, sempre — e so quando o mes
        fecha de pe: mandar guardar dinheiro para quem vai furar o saldo dia
        20 e conselho que ninguem consegue seguir. */
  const saldoAgora = Nc.saldoEm(estado, hoje);
  if (sobra.sobra > 0 && !mes.zeraEm) {
    if (saldoAgora <= 0) {
      por('conta-negativa', 'alerta', 'A conta está negativa hoje',
        'Sobram ' + Fc.dinheiro(sobra.sobra) + ' por mês no seu ritmo atual, então '
        + 'a saída existe: ' + Math.ceil(Math.abs(saldoAgora) / sobra.sobra) + ' '
        + plural(Math.ceil(Math.abs(saldoAgora) / sobra.sobra), 'mês', 'meses')
        + ' nesse ritmo devolvem a conta ao zero. Antes disso, juro de cheque '
        + 'especial é a despesa mais cara que existe: vale priorizar.',
        { valor: Math.abs(saldoAgora) });
    } else if (reservaAlvo > 0 && saldoAgora < reservaAlvo) {
      const cobre = fixo.sai > 0 ? saldoAgora / fixo.sai : 0;
      const faltam = Nc.arredondar(reservaAlvo - saldoAgora);
      const meses = Math.ceil(faltam / Math.max(1, sobra.sobra));
      por('reserva', 'acao', 'Sua reserva cobre ' + numero(cobre) + ' '
        + plural(Math.round(cobre * 10) / 10, 'mês', 'meses') + ' de contas',
        'A meta são ' + estado.ajustes.reservaMeses + ' meses ('
        + Fc.dinheiro(reservaAlvo) + '). Faltam ' + Fc.dinheiro(faltam) + '. '
        + 'Guardando a sobra de ' + Fc.dinheiro(sobra.sobra) + ' por mês, você chega lá em '
        + meses + ' ' + plural(meses, 'mês', 'meses') + '. Reserva vem antes de '
        + 'investimento: é ela que impede que o próximo imprevisto vire dívida de cartão.',
        { valor: faltam, meses });
    } else {
      /* 9. Render. So com taxa informada por voce. */
      const taxa = Number(estado.ajustes.taxaAno);
      if (Number.isFinite(taxa) && taxa > 0) {
        const s12 = Nc.simularRendimento(sobra.sobra, taxa, 12, 0);
        const s60 = Nc.simularRendimento(sobra.sobra, taxa, 60, 0);
        por('render', 'acao', 'Sobram ' + Fc.dinheiro(sobra.sobra) + ' por mês para render',
          'Aplicando essa sobra a ' + Fc.porcento(taxa, 1) + ' ao ano — a taxa que você '
          + 'informou —, em 12 meses viram ' + Fc.dinheiro(s12.saldo) + ' ('
          + Fc.dinheiro(s12.juros) + ' de juros) e em 5 anos, ' + Fc.dinheiro(s60.saldo)
          + '. O mesmo dinheiro parado na conta corrente não faz nada disso.',
          { valor: sobra.sobra, simulacao: s12 });
      } else {
        por('taxa', 'acao', 'Sobram ' + Fc.dinheiro(sobra.sobra) + ' por mês parados',
          'Me diga em Ajustes quanto a sua aplicação rende por ano e eu simulo o que '
          + 'essa sobra vira em 1, 5 e 10 anos. Eu não chuto essa taxa: ela muda toda '
          + 'semana e um número errado aqui vira decisão errada aí.',
          { valor: sobra.sobra, pedeTaxa: true });
      }
    }
  }

  /* 10. O ano, para quem so olha o mes. */
  if (estado.lancamentos.length >= 5 && mv.confianca !== 'baixa') {
    por('ano', ano.saldoFinal >= 0 ? 'bom' : 'atencao',
      'Em 12 meses, no ritmo de hoje: ' + Fc.dinheiro(ano.saldoFinal),
      'Isso mantendo tudo como está — as mesmas contas fixas e '
      + Fc.dinheiro(ano.mediaDia) + ' por dia de gasto variável. '
      + (ano.saldoFinal >= 0
        ? 'Cada real cortado por dia hoje vale ' + Fc.dinheiro(365)
          + ' no fim dessa conta.'
        : 'A conta não fecha no ano. Vale mexer no que é fixo, não no cafezinho.'),
      { valor: ano.saldoFinal });
  }

  const ordem = { alerta: 0, atencao: 1, acao: 2, neutro: 3, bom: 4 };
  return cartas.sort((a, b) => ordem[a.tom] - ordem[b.tom]);
}

/* ------------------------------------------------------------------ *
 * O retrato que vai para a IA                                         *
 * ------------------------------------------------------------------ */

/* So numero e nome de categoria. Nao vai descricao de lancamento (que e
   texto livre e pode ter nome de gente), nem data de nada. O suficiente
   para um conselho bom, e nada alem disso. */
function retrato(estado, ref) {
  const hoje = ref || Fc.hoje();
  const fixo = Nc.mensalFixo(estado);
  const mv = Nc.mediaVariavel(estado, hoje);
  const mes = Nc.projetar(estado, Fc.fimDoMes(hoje), { de: hoje });
  const ano = Nc.projetar(estado, Fc.somarDias(hoje, 364), { de: hoje });
  const limite = Nc.limiteDoDia(estado, hoje);
  const cats = Nc.porCategoria(estado, Fc.somarDias(hoje, -29), hoje, 'saida')
    .slice(0, 8).map((c) => ({ categoria: c.nome, total: c.total }));

  return {
    saldo: Nc.saldoEm(estado, hoje),
    entra_mes: fixo.entra,
    fixo_mes: fixo.sai,
    media_dia_variavel: mv.media,
    dias_de_historico: mv.dias,
    confianca: mv.confianca,
    limite_do_dia: limite.limite,
    projecao_fim_do_mes: mes.saldoFinal,
    projecao_12_meses: ano.saldoFinal,
    zera_em: mes.zeraEm ? Fc.diasEntre(hoje, mes.zeraEm) : null,
    gastos_30_dias: cats,
    contas_fixas: estado.fixos.filter((f) => f.ativo)
      .map((f) => ({ nome: f.nome, valor: f.valor, tipo: f.tipo, ciclo: f.ciclo })),
    dividas: estado.dividas.map((d) => ({
      nome: d.nome, saldo: d.saldo, juros_mes: d.jurosMes, parcela: d.parcela,
    })),
    reserva_meta_meses: estado.ajustes.reservaMeses,
    taxa_ano_informada: estado.ajustes.taxaAno,
  };
}

const Conselhos = { gerar, planoDeCorte, fugiuDoNormal, retrato, CORTAVEIS };

if (typeof module !== 'undefined' && module.exports) module.exports = Conselhos;
else window.Conselhos = Conselhos;
