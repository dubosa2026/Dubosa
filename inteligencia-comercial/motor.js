/* ==================================================================
   MOTOR DE INTELIGENCIA COMERCIAL — BELENERGY

   Motor de regras (sem IA, sem rede, sem DOM): le uma tabela de clientes
   e devolve, para cada um, os scores, classificacoes, riscos,
   oportunidades e a proxima acao recomendada — e, para a carteira
   inteira, os rankings de priorizacao.

   Este arquivo nao depende do navegador (sem document/window), entao
   roda tanto na pagina (index.html) quanto sob Node, no teste em
   testes_motor.js. Quem le arquivo (.xlsx/.csv/colar) e monta a matriz
   de entrada e o leitor.js, que so existe no navegador.

   Principio da casa (secao 1 do prompt que originou este motor): nunca
   inventar informacao. Cada score/metrica que dependa de um campo
   ausente vira null e sobe assim ate a tela, onde aparece como
   "Dados insuficientes" em vez de um numero forjado.
   ================================================================== */

(function (global) {
  'use strict';

  /* ---------- limiares e pesos (ajustaveis) ----------
     Nao ha "formula oficial" no prompt de origem — ele descreve OS
     FATORES que cada score deve considerar, nao a matematica exata.
     Os pesos abaixo sao a interpretacao deste motor; estao todos aqui
     para o time da Belenergy poder revisar/ajustar num lugar so. */
  var LIMIARES = {
    crescimentoAlta: 1.15,    // run-rate recente >= anterior * 1.15 => Crescimento
    retracaoBaixa: 0.7,       // run-rate recente <= anterior * 0.7  => Retracao
    inativoDias: 180,         // sem comprar ha mais que isso => tende a Inativo
    reativacaoMinDias: 120,   // abaixo disso e recorrencia normal, nao "reativacao"
    reativacaoMaxDias: 730,   // acima disso o historico esfria e a reativacao vira pouco provavel
    riscoAlto: 65,
    oportunidadeAlta: 65,
    scoreComercialAlto: 65
  };

  var MOMENTO_ROTULO = {
    crescimento: 'Crescimento',
    estavel: 'Estável',
    retracao: 'Retração',
    inativo: 'Inativo',
    reativacao: 'Em reativação'
  };

  var PRIORIDADE_ROTULO = {
    P1: 'P1 — Ataque imediato',
    P2: 'P2 — Alta prioridade',
    P3: 'P3 — Desenvolvimento',
    P4: 'P4 — Manutenção',
    P5: 'P5 — Baixa prioridade'
  };

  /* ---------- texto e numero ---------- */

  function normalizarTexto(s) {
    // NFD separa a letra do acento (marca de combinacao, U+0300..U+036F);
    // filtrar por faixa numerica evita depender de digitar esses
    // caracteres literalmente num regex.
    var semAcento = String(s === null || s === undefined ? '' : s).normalize('NFD');
    var saida = '';
    for (var i = 0; i < semAcento.length; i++) {
      var codigo = semAcento.charCodeAt(i);
      if (codigo < 0x0300 || codigo > 0x036f) saida += semAcento[i];
    }
    return saida.toLowerCase().trim();
  }

  function strOrNull(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).trim();
    return s ? s : null;
  }

  /* "R$ 1.234,56" / "1234,56" / "1234.56" / 1234.56 / "12%" -> Number.
     Devolve null (nao 0) quando nao ha numero, para nao fingir dado. */
  function paraNumero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v === null || v === undefined ? '' : v).trim();
    if (!s) return null;
    s = s.replace(/[R$\s%]/g, '');
    if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.indexOf(',') > -1) s = s.replace(',', '.');
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  /* Datas "dd/mm/aaaa", "aaaa-mm-dd", serial do Excel ou texto generico. */
  function paraData(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v === 'number') {
      if (v > 20000 && v < 80000) { // serial plausivel do Excel (dias desde 1899-12-30)
        var d0 = new Date(Math.round((v - 25569) * 86400 * 1000));
        return isNaN(d0.getTime()) ? null : d0;
      }
      return null;
    }
    var s = String(v).trim();
    if (!s) return null;
    var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      var dd = parseInt(m[1], 10), mm = parseInt(m[2], 10), yy = parseInt(m[3], 10);
      if (yy < 100) yy += 2000;
      var d1 = new Date(yy, mm - 1, dd);
      return isNaN(d1.getTime()) ? null : d1;
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      var d2 = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
      return isNaN(d2.getTime()) ? null : d2;
    }
    var d3 = new Date(s);
    return isNaN(d3.getTime()) ? null : d3;
  }

  /* "Inversor; Modulo, Estrutura" -> ['Inversor','Modulo','Estrutura'], sem
     repetir (comparando sem acento/caixa, mas preservando a 1a grafia). */
  function dividirLista(v) {
    var s = String(v === null || v === undefined ? '' : v).trim();
    if (!s) return [];
    var partes = s.split(/[;,\/\|]+/).map(function (p) { return p.trim(); }).filter(Boolean);
    var vistos = {}, out = [];
    partes.forEach(function (p) {
      var chave = normalizarTexto(p);
      if (!vistos[chave]) { vistos[chave] = true; out.push(p); }
    });
    return out;
  }

  function unico(arr) {
    var vistos = {}, out = [];
    arr.forEach(function (x) { if (!vistos[x]) { vistos[x] = true; out.push(x); } });
    return out;
  }

  /* ---------- formatacao para tela (pt-BR), devolve null sem dado ---------- */

  function formatarMoeda(v) {
    if (v === null || v === undefined || !isFinite(v)) return null;
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }

  function formatarInteiro(v) {
    if (v === null || v === undefined || !isFinite(v)) return null;
    return Math.round(v).toLocaleString('pt-BR');
  }

  /* ---------- reconhecimento de colunas ----------
     A planilha de cada empresa nomeia as colunas do jeito dela. Cada
     campo tem um padrao (testado contra o cabecalho normalizado); o
     primeiro cabecalho ainda livre que bater fica com aquele campo. */
  var CAMPOS = [
    { chave: 'codigo', tipo: 'texto', rotulo: 'Código do cliente', padrao: /cod.*client|client.*cod|^id$|^cod$|^codigo$|^cod\. ?cliente$/ },
    { chave: 'nome', tipo: 'texto', rotulo: 'Nome / Razão social', padrao: /razao social|nome.*(client|integrador|fantasia)|^cliente$|^integrador$|^nome$|^empresa$/ },
    { chave: 'estado', tipo: 'texto', rotulo: 'Estado (UF)', padrao: /^uf$|^estado$/ },
    { chave: 'cidade', tipo: 'texto', rotulo: 'Cidade', padrao: /^cidade$|^municipio$/ },
    { chave: 'vendedor', tipo: 'texto', rotulo: 'Vendedor responsável', padrao: /vendedor|representante|consultor/ },
    { chave: 'dataCadastro', tipo: 'data', rotulo: 'Data de cadastro', padrao: /cadastro/ },
    { chave: 'dataPrimeira', tipo: 'data', rotulo: 'Data da primeira compra', padrao: /primeira.*compra|1[ºªao].*compra/ },
    { chave: 'dataUltima', tipo: 'data', rotulo: 'Data da última compra', padrao: /ultima.*compra|ultima.*nota|ultimo.*pedido/ },
    { chave: 'diasUltima', tipo: 'numero', rotulo: 'Dias desde a última compra', padrao: /dias.*ultima|dias.*sem.*compra|recencia/ },
    { chave: 'qtdPedidos', tipo: 'numero', rotulo: 'Quantidade de pedidos', padrao: /qtd.*pedido|quantidade.*pedido|numero.*pedido|nr.*pedidos|qtd.*compras|total.*pedidos/ },
    { chave: 'fatTotal', tipo: 'numero', rotulo: 'Faturamento total', padrao: /faturamento total|valor faturado|faturamento acumulado|^faturamento$/ },
    { chave: 'fat30', tipo: 'numero', rotulo: 'Faturamento últimos 30 dias', padrao: /30\s*dias/ },
    { chave: 'fat90', tipo: 'numero', rotulo: 'Faturamento últimos 90 dias', padrao: /90\s*dias/ },
    { chave: 'fat180', tipo: 'numero', rotulo: 'Faturamento últimos 180 dias', padrao: /180\s*dias/ },
    { chave: 'ticket', tipo: 'numero', rotulo: 'Ticket médio', padrao: /ticket/ },
    { chave: 'frequencia', tipo: 'numero', rotulo: 'Frequência média de compra (dias)', padrao: /frequencia/ },
    { chave: 'mesesComprando', tipo: 'numero', rotulo: 'Quantidade de meses comprando', padrao: /meses.*compr/ },
    { chave: 'produtos', tipo: 'lista', rotulo: 'Produtos comprados', padrao: /produtos? comprad|itens? comprad/ },
    { chave: 'categorias', tipo: 'lista', rotulo: 'Categorias compradas', padrao: /categorias? comprad|^categoria(s)?$/ },
    { chave: 'qtdSkus', tipo: 'numero', rotulo: 'Quantidade de SKUs', padrao: /sku/ },
    { chave: 'status', tipo: 'texto', rotulo: 'Status do cliente', padrao: /^status/ },
    { chave: 'historicoReativacao', tipo: 'texto', rotulo: 'Histórico de reativação', padrao: /reativa/ },
    { chave: 'descontos', tipo: 'numero', rotulo: 'Descontos concedidos (%)', padrao: /desconto/ },
    { chave: 'concorrencia', tipo: 'texto', rotulo: 'Informações de concorrência', padrao: /concorren/ }
  ];

  function detectarColunas(cabecalhos) {
    var normalizados = cabecalhos.map(normalizarTexto);
    var mapa = {}, usados = {};
    CAMPOS.forEach(function (campo) {
      for (var i = 0; i < normalizados.length; i++) {
        if (usados[i]) continue;
        if (campo.padrao.test(normalizados[i])) { mapa[campo.chave] = i; usados[i] = true; break; }
      }
    });
    return mapa;
  }

  /* ---------- extracao por cliente ---------- */

  function valorBruto(linha, mapa, chave) {
    var i = mapa[chave];
    return (i === undefined || i === null) ? undefined : linha[i];
  }

  function extrairCliente(linha, mapa, indice) {
    var c = { linha: indice };
    c.codigo = strOrNull(valorBruto(linha, mapa, 'codigo'));
    c.nome = strOrNull(valorBruto(linha, mapa, 'nome')) ||
      (c.codigo ? ('Cliente ' + c.codigo) : ('Cliente #' + (indice + 1)));
    c.estado = strOrNull(valorBruto(linha, mapa, 'estado'));
    c.cidade = strOrNull(valorBruto(linha, mapa, 'cidade'));
    c.vendedor = strOrNull(valorBruto(linha, mapa, 'vendedor'));
    c.dataCadastro = paraData(valorBruto(linha, mapa, 'dataCadastro'));
    c.dataPrimeira = paraData(valorBruto(linha, mapa, 'dataPrimeira'));
    c.dataUltima = paraData(valorBruto(linha, mapa, 'dataUltima'));
    c.diasUltimaInformado = paraNumero(valorBruto(linha, mapa, 'diasUltima'));
    c.qtdPedidos = paraNumero(valorBruto(linha, mapa, 'qtdPedidos'));
    c.fatTotal = paraNumero(valorBruto(linha, mapa, 'fatTotal'));
    c.fat30 = paraNumero(valorBruto(linha, mapa, 'fat30'));
    c.fat90 = paraNumero(valorBruto(linha, mapa, 'fat90'));
    c.fat180 = paraNumero(valorBruto(linha, mapa, 'fat180'));
    c.ticketInformado = paraNumero(valorBruto(linha, mapa, 'ticket'));
    c.frequenciaInformada = paraNumero(valorBruto(linha, mapa, 'frequencia'));
    c.mesesComprando = paraNumero(valorBruto(linha, mapa, 'mesesComprando'));
    c.produtos = dividirLista(valorBruto(linha, mapa, 'produtos'));
    c.categorias = dividirLista(valorBruto(linha, mapa, 'categorias'));
    c.qtdSkusInformado = paraNumero(valorBruto(linha, mapa, 'qtdSkus'));
    c.status = strOrNull(valorBruto(linha, mapa, 'status'));
    c.historicoReativacaoTexto = strOrNull(valorBruto(linha, mapa, 'historicoReativacao'));
    c.descontos = paraNumero(valorBruto(linha, mapa, 'descontos'));
    c.concorrencia = strOrNull(valorBruto(linha, mapa, 'concorrencia'));
    return c;
  }

  /* ---------- metricas derivadas ---------- */

  function calcularEvolucao(c) {
    if (!c.temHistorico) return null;

    var inativoPorDias = c.diasUltimaCompra !== null && c.diasUltimaCompra >= LIMIARES.inativoDias;
    var inativoPorRazao = c.razaoRecencia !== null && c.razaoRecencia >= 3;
    var pareceReativado = c.historicoReativacaoTexto && /sim|reativ|retom/i.test(c.historicoReativacaoTexto) &&
      c.diasUltimaCompra !== null && c.diasUltimaCompra < LIMIARES.reativacaoMinDias;

    if (inativoPorDias || inativoPorRazao) return 'inativo';
    if (pareceReativado) return 'reativacao';

    if (c.runRateRecente !== null && c.runRateAnterior !== null) {
      if (c.runRateAnterior <= 0) return c.runRateRecente > 0 ? 'crescimento' : 'estavel';
      var razao = c.runRateRecente / c.runRateAnterior;
      if (razao >= LIMIARES.crescimentoAlta) return 'crescimento';
      if (razao <= LIMIARES.retracaoBaixa) return 'retracao';
      return 'estavel';
    }
    return 'estavel'; // tem historico, nao esta atrasado, mas sem dado de tendencia: estabilidade neutra
  }

  function calcularDerivados(c, dataRef) {
    if (c.diasUltimaInformado !== null) c.diasUltimaCompra = Math.round(c.diasUltimaInformado);
    else if (c.dataUltima) c.diasUltimaCompra = Math.max(0, Math.round((dataRef - c.dataUltima) / 86400000));
    else c.diasUltimaCompra = null;

    if (c.ticketInformado !== null) c.ticketMedio = c.ticketInformado;
    else if (c.fatTotal !== null && c.qtdPedidos) c.ticketMedio = c.fatTotal / c.qtdPedidos;
    else c.ticketMedio = null;

    if (c.frequenciaInformada !== null) c.frequenciaDias = c.frequenciaInformada;
    else if (c.mesesComprando !== null && c.qtdPedidos > 1) c.frequenciaDias = (c.mesesComprando * 30) / (c.qtdPedidos - 1);
    else c.frequenciaDias = null;

    c.mixCategorias = c.categorias.length || null;
    c.mixSkus = c.qtdSkusInformado !== null ? c.qtdSkusInformado : (c.produtos.length || null);

    if (c.fat30 !== null && c.fat90 !== null) {
      c.runRateRecente = c.fat30;
      c.runRateAnterior = Math.max(0, (c.fat90 - c.fat30) / 2);
    } else if (c.fat90 !== null && c.fat180 !== null) {
      c.runRateRecente = c.fat90 / 3;
      c.runRateAnterior = Math.max(0, (c.fat180 - c.fat90) / 3);
    } else {
      c.runRateRecente = null;
      c.runRateAnterior = null;
    }

    c.razaoRecencia = (c.diasUltimaCompra !== null && c.frequenciaDias > 0)
      ? c.diasUltimaCompra / c.frequenciaDias : null;

    c.temHistorico = (c.qtdPedidos !== null && c.qtdPedidos > 0) ||
      (c.fatTotal !== null && c.fatTotal > 0) || !!c.dataPrimeira;

    c.evolucao = calcularEvolucao(c);
  }

  /* ---------- estatisticas da carteira (para pontuar por percentil) ---------- */

  function construirEstatisticas(clientes) {
    function coletar(campo) {
      return clientes.map(function (c) { return c[campo]; })
        .filter(function (v) { return v !== null && v !== undefined && isFinite(v); })
        .sort(function (a, b) { return a - b; });
    }
    var universoCategorias = {};
    clientes.forEach(function (c) {
      c.categorias.forEach(function (cat) {
        var chave = normalizarTexto(cat);
        if (!universoCategorias[chave]) universoCategorias[chave] = cat;
      });
    });
    return {
      fatTotal: coletar('fatTotal'),
      ticketMedio: coletar('ticketMedio'),
      qtdPedidos: coletar('qtdPedidos'),
      mixCategorias: coletar('mixCategorias'),
      frequenciaDias: coletar('frequenciaDias'),
      diasUltimaCompra: coletar('diasUltimaCompra'),
      descontos: coletar('descontos'),
      universoCategorias: universoCategorias,
      totalClientes: clientes.length
    };
  }

  /* Posicao relativa (0-100) de um valor dentro da carteira. Empate conta
     "meio ponto", entao um valor unico cai no centro (50), nao no topo. */
  function percentil(valor, arrayOrdenado) {
    if (valor === null || valor === undefined || !arrayOrdenado || !arrayOrdenado.length) return null;
    var n = arrayOrdenado.length, abaixo = 0, iguais = 0;
    for (var i = 0; i < n; i++) {
      if (arrayOrdenado[i] < valor) abaixo++;
      else if (arrayOrdenado[i] === valor) iguais++;
    }
    return Math.round(((abaixo + iguais / 2) / n) * 100);
  }

  /* Media ponderada que ignora componentes sem dado, redistribuindo o
     peso entre os que sobraram. Sem nenhum componente valido -> null
     ("Dados insuficientes"), nunca um numero inventado. */
  function mediaPonderada(partes) {
    var somaPeso = 0, soma = 0;
    partes.forEach(function (p) {
      if (p.valor !== null && p.valor !== undefined && isFinite(p.valor)) {
        soma += p.valor * p.peso;
        somaPeso += p.peso;
      }
    });
    return somaPeso > 0 ? soma / somaPeso : null;
  }

  function potencialReativacao(c, stats) {
    var pHistorico = mediaPonderada([
      { valor: percentil(c.fatTotal, stats.fatTotal), peso: 60 },
      { valor: percentil(c.qtdPedidos, stats.qtdPedidos), peso: 40 }
    ]);
    if (pHistorico === null || c.diasUltimaCompra === null) return pHistorico;
    var d = c.diasUltimaCompra, janela;
    if (d < LIMIARES.reativacaoMinDias) janela = 40;      // ainda cedo pra chamar de reativacao
    else if (d <= 365) janela = 100;
    else if (d <= LIMIARES.reativacaoMaxDias) janela = 70;
    else janela = 35;                                      // muito tempo, historico esfria
    return pHistorico * (janela / 100);
  }

  /* ---------- os tres scores ---------- */

  function pontuarCliente(c, stats) {
    var pRecenciaInv = c.diasUltimaCompra !== null ? 100 - percentil(c.diasUltimaCompra, stats.diasUltimaCompra) : null;
    var pRecenciaDir = c.diasUltimaCompra !== null ? percentil(c.diasUltimaCompra, stats.diasUltimaCompra) : null;
    var pFrequenciaInv = c.frequenciaDias !== null ? 100 - percentil(c.frequenciaDias, stats.frequenciaDias) : null;
    var pFaturamento = percentil(c.fatTotal, stats.fatTotal);
    var pTicket = percentil(c.ticketMedio, stats.ticketMedio);
    var pRecorrencia = percentil(c.qtdPedidos, stats.qtdPedidos);
    var pMix = percentil(c.mixCategorias, stats.mixCategorias);

    var tendencia = null; // -100..+100 a partir da razao run-rate recente/anterior
    if (c.runRateRecente !== null && c.runRateAnterior !== null) {
      if (c.runRateAnterior <= 0) tendencia = c.runRateRecente > 0 ? 100 : 0;
      else tendencia = Math.max(-100, Math.min(100, (c.runRateRecente / c.runRateAnterior - 1) * 100));
    }
    var razaoRecenciaExcesso = c.razaoRecencia !== null ? Math.max(0, c.razaoRecencia - 1) : null;

    // ---- risco ----
    var riscoRecencia = pRecenciaDir;
    var riscoQuedaFat = tendencia !== null ? (tendencia < 0 ? Math.min(100, -tendencia) : 0) : null;
    var riscoIntervalo = razaoRecenciaExcesso !== null ? Math.min(100, razaoRecenciaExcesso * 60) : null;
    var riscoMix = pMix !== null ? 100 - pMix : null;
    var riscoStatusRuim = (c.status && /perdid|cancelad|churn|encerrad/i.test(c.status)) ? 100 : null;

    var risco = mediaPonderada([
      { valor: riscoRecencia, peso: 30 },
      { valor: riscoQuedaFat, peso: 25 },
      { valor: riscoIntervalo, peso: 20 },
      { valor: riscoMix, peso: 10 },
      { valor: riscoStatusRuim, peso: 15 }
    ]);
    if (c.evolucao === 'inativo') risco = risco === null ? 90 : Math.max(risco, 80);

    // ---- oportunidade ----
    // "Pouco mix"/"ticket baixo" so viram oportunidade de verdade se o
    // cliente ja tem alguma substancia na relacao (pedidos ou faturamento
    // relevantes); sem isso, um cliente minusculo e ocasional pontuaria
    // "alto potencial" so por ainda nao ter comprado quase nada — o
    // prompt de origem pede o oposto (secao 17: pouco volume so justifica
    // prioridade alta quando ha sinal de crescimento, nao so ausencia).
    var engajamento = (pRecorrencia !== null || pFaturamento !== null)
      ? Math.max(pRecorrencia || 0, pFaturamento || 0) / 100
      : (c.temHistorico ? 0.3 : 0);
    var pisoEngajamento = Math.max(engajamento, 0.25);

    var opCrescimento = tendencia !== null ? (tendencia > 0 ? Math.min(100, tendencia) : 0) : null;
    var opMixBaixo = pMix !== null ? (100 - pMix) * pisoEngajamento : null;
    var opReativacao = (c.evolucao === 'inativo' || c.evolucao === 'reativacao') && c.temHistorico
      ? potencialReativacao(c, stats) : null;
    var opParticipacao = (pTicket !== null && pFaturamento !== null && pRecorrencia !== null)
      ? Math.max(0, 100 - Math.min(pTicket, pFaturamento)) * Math.max(pRecorrencia / 100, 0.25) : null;
    var universoTotal = Object.keys(stats.universoCategorias).length;
    var opCategoriasNovas = (universoTotal > 0 && c.mixCategorias !== null)
      ? Math.min(100, ((universoTotal - c.mixCategorias) / universoTotal) * 100) * pisoEngajamento : null;

    var oportunidade = mediaPonderada([
      { valor: opCrescimento, peso: 25 },
      { valor: opMixBaixo, peso: 20 },
      { valor: opReativacao, peso: 20 },
      { valor: opParticipacao, peso: 15 },
      { valor: opCategoriasNovas, peso: 20 }
    ]);

    // ---- comercial (prioridade geral) ----
    var momentoPontos = c.evolucao !== null
      ? { crescimento: 100, reativacao: 65, estavel: 55, retracao: 25, inativo: 5 }[c.evolucao] : null;

    var comercial = mediaPonderada([
      { valor: pRecenciaInv, peso: 18 },
      { valor: pFrequenciaInv, peso: 12 },
      { valor: pFaturamento, peso: 20 },
      { valor: pTicket, peso: 10 },
      { valor: pRecorrencia, peso: 10 },
      { valor: pMix, peso: 10 },
      { valor: momentoPontos, peso: 12 },
      { valor: risco !== null ? 100 - risco : null, peso: 8 }
    ]);

    return {
      comercial: comercial !== null ? Math.round(comercial) : null,
      oportunidade: oportunidade !== null ? Math.round(oportunidade) : null,
      risco: risco !== null ? Math.round(Math.min(100, risco)) : null,
      componentes: {
        pRecenciaInv: pRecenciaInv, pFrequenciaInv: pFrequenciaInv, pFaturamento: pFaturamento, pTicket: pTicket,
        pRecorrencia: pRecorrencia, pMix: pMix, tendencia: tendencia,
        riscoQuedaFat: riscoQuedaFat, riscoIntervalo: riscoIntervalo, riscoMix: riscoMix,
        opCrescimento: opCrescimento, opMixBaixo: opMixBaixo, opReativacao: opReativacao,
        opParticipacao: opParticipacao, opCategoriasNovas: opCategoriasNovas
      }
    };
  }

  /* ---------- classificacao, sensibilidade, oportunidade/risco principal ---------- */

  function classificar(c, scores, stats) {
    if (c.evolucao === null) return ['Dados insuficientes'];
    var tags = [];
    var pFat = percentil(c.fatTotal, stats.fatTotal);

    if (c.evolucao === 'inativo') tags.push('Inativo');
    if (c.evolucao === 'reativacao') tags.push('Reativação');
    if (c.evolucao === 'retracao') tags.push('Em retração');
    if (c.evolucao === 'crescimento') tags.push('Em crescimento');

    if (scores.risco !== null && scores.risco >= LIMIARES.riscoAlto && c.evolucao !== 'inativo') tags.push('Em risco');
    if (pFat !== null && pFat >= 90 && (c.qtdPedidos || 0) >= 3 && c.evolucao !== 'inativo' && c.evolucao !== 'retracao') tags.push('VIP');

    if (scores.oportunidade !== null) {
      if (scores.oportunidade >= LIMIARES.oportunidadeAlta) tags.push('Alto potencial');
      else if (scores.oportunidade >= 40) tags.push('Potencial');
    }

    if ((c.qtdPedidos || 0) >= 4 && c.evolucao !== 'inativo' && c.evolucao !== 'retracao') tags.push('Recorrente');
    else if ((c.qtdPedidos || 0) > 0 && (c.qtdPedidos || 0) <= 2) tags.push('Ocasional');

    if (scores.comercial !== null && scores.comercial < 30 && (scores.oportunidade === null || scores.oportunidade < 30)) {
      tags.push('Baixo potencial');
    }

    return unico(tags.length ? tags : ['Potencial']);
  }

  /* Nunca marca sensibilidade so por ter recebido desconto — exige
     evidencia de PADRAO (desconto alto e recorrente), como pede o
     prompt de origem. Sem coluna de desconto, "Não identificado". */
  function sensibilidadePreco(c) {
    if (c.descontos === null) return 'Não identificado';
    var pct = c.descontos; // coluna documentada em % (paraNumero ja retira o "%" do texto)
    var ocasional = (c.qtdPedidos || 0) > 0 && (c.qtdPedidos || 0) <= 2;
    if (pct >= 15) return ocasional ? 'Muito sensível' : 'Sensível';
    if (pct >= 7) return 'Sensível';
    if (pct >= 2) return 'Moderado';
    return 'Pouco sensível';
  }

  function oportunidadePrincipal(c, scores) {
    var comp = scores.componentes;
    if (c.evolucao === null) return { tipo: 'Nenhuma oportunidade clara', motivo: 'Dados insuficientes para identificar oportunidade.' };

    if (c.evolucao === 'inativo') {
      if (comp.opReativacao !== null && comp.opReativacao >= 35) {
        return { tipo: 'Reativar cliente', motivo: 'Inativo, mas com histórico relevante de compras.' };
      }
      return { tipo: 'Nenhuma oportunidade clara', motivo: 'Inativo e sem histórico relevante que justifique prioridade de reativação.' };
    }
    if (c.evolucao === 'retracao') {
      return { tipo: 'Recuperar cliente', motivo: 'Faturamento recente abaixo do período anterior.' };
    }
    if (scores.risco !== null && scores.risco >= LIMIARES.riscoAlto && scores.comercial !== null && scores.comercial >= 55) {
      return { tipo: 'Proteger cliente estratégico', motivo: 'Cliente relevante para a carteira com sinais de risco — prioridade é manter, não só vender mais.' };
    }
    if ((comp.opCategoriasNovas !== null && comp.opCategoriasNovas >= 50) ||
      (comp.opMixBaixo !== null && comp.opMixBaixo >= 50)) {
      return { tipo: 'Expandir mix', motivo: 'Compra só uma fração das categorias já vendidas pela Belenergy na carteira.' };
    }
    if (c.evolucao === 'crescimento' && comp.opCrescimento !== null && comp.opCrescimento >= 40) {
      return { tipo: 'Upsell', motivo: 'Faturamento em crescimento frente ao período anterior — bom momento para aumentar ticket.' };
    }
    if (c.temHistorico && (c.qtdPedidos || 0) > 0 && (c.qtdPedidos || 0) <= 2) {
      return { tipo: 'Criar recorrência', motivo: 'Ainda comprou poucas vezes — falta consolidar hábito de compra.' };
    }
    if (comp.opParticipacao !== null && comp.opParticipacao >= 55) {
      return { tipo: 'Aumentar participação', motivo: 'Ticket e faturamento abaixo do que o histórico do cliente sugere ser possível.' };
    }
    if (comp.pFrequenciaInv !== null && comp.pFrequenciaInv < 40) {
      return { tipo: 'Aumentar frequência', motivo: 'Frequência de compra abaixo da média da carteira.' };
    }
    if (scores.comercial !== null && scores.comercial >= LIMIARES.scoreComercialAlto) {
      return { tipo: 'Desenvolver relacionamento', motivo: 'Cliente relevante e estável — manter proximidade para sustentar o resultado.' };
    }
    return { tipo: 'Nenhuma oportunidade clara', motivo: 'Sem sinal de oportunidade específica nos dados disponíveis.' };
  }

  function riscoPrincipal(c, scores) {
    var comp = scores.componentes;
    if (c.evolucao === null) return { tipo: 'Nenhum risco relevante identificado', motivo: 'Dados insuficientes.' };
    // Sinal explicito (status/concorrencia) e mais especifico que a
    // inatividade generica por dias parados — checa primeiro, senao um
    // cliente cancelado por concorrencia sempre cairia so em "inativo".
    if (c.status && /perdid|cancelad|churn|encerrad/i.test(c.status)) {
      return { tipo: 'Possível migração para concorrente', motivo: 'Status cadastrado indica perda/cancelamento.' };
    }
    if (c.concorrencia) {
      return { tipo: 'Possível migração para concorrente', motivo: 'Há registro de concorrência associado a este cliente.' };
    }
    if (c.evolucao === 'inativo') {
      return {
        tipo: 'Cliente inativo',
        motivo: 'Sem compras há ' + (c.diasUltimaCompra !== null ? c.diasUltimaCompra + ' dias' : 'muito tempo') + '.'
      };
    }
    if (comp.riscoQuedaFat !== null && comp.riscoQuedaFat >= 40) {
      return { tipo: 'Perda de faturamento', motivo: 'Faturamento recente abaixo do período anterior.' };
    }
    if (comp.riscoIntervalo !== null && comp.riscoIntervalo >= 40) {
      return { tipo: 'Perda de frequência', motivo: 'Intervalo desde a última compra já ultrapassa o padrão histórico deste cliente.' };
    }
    if (comp.riscoMix !== null && comp.riscoMix >= 70 && (c.qtdPedidos || 0) >= 3) {
      return { tipo: 'Redução de mix', motivo: 'Poucas categorias compradas frente ao restante da carteira.' };
    }
    var sens = sensibilidadePreco(c);
    if (sens === 'Muito sensível' || sens === 'Sensível') {
      return { tipo: 'Dependência excessiva de preço', motivo: 'Histórico de descontos elevados associado a este cliente.' };
    }
    return { tipo: 'Nenhum risco relevante identificado', motivo: 'Sem sinais de queda ou afastamento nos dados disponíveis.' };
  }

  function prioridade(c, scores) {
    if (scores.comercial === null && scores.oportunidade === null && scores.risco === null) return 'P5';
    var risco = scores.risco || 0, comercial = scores.comercial || 0, oportunidade = scores.oportunidade || 0;

    if (risco >= LIMIARES.riscoAlto && comercial >= 50) return 'P1';
    if (oportunidade >= 80 && (c.evolucao === 'crescimento' || c.evolucao === 'reativacao')) return 'P1';
    if (comercial >= LIMIARES.scoreComercialAlto) return 'P2';
    if (oportunidade >= 55) return 'P3';
    if (comercial >= 30) return 'P4';
    return 'P5'; // risco alto sozinho, sem comercial minimo, e conta pequena/ja perdida — nao "manutencao"
  }

  function proximaAcao(oportunidadeP, riscoP, prioridadeP) {
    if (oportunidadeP.tipo === 'Nenhuma oportunidade clara' && riscoP.tipo === 'Nenhum risco relevante identificado' && prioridadeP === 'P5') {
      return 'Nenhuma ação imediata';
    }
    if (oportunidadeP.tipo === 'Reativar cliente') return 'Trabalhar reativação';
    if (riscoP.tipo === 'Possível migração para concorrente') return 'Investigar concorrência';
    if (oportunidadeP.tipo === 'Proteger cliente estratégico') return 'Ligar para o cliente';
    if (oportunidadeP.tipo === 'Recuperar cliente') return 'Recuperar relacionamento';
    if (oportunidadeP.tipo === 'Expandir mix') return 'Apresentar novos produtos';
    if (oportunidadeP.tipo === 'Upsell' || oportunidadeP.tipo === 'Aumentar participação') return 'Oferecer aumento de mix';
    if (oportunidadeP.tipo === 'Criar recorrência') return 'Negociar recorrência';
    if (oportunidadeP.tipo === 'Aumentar frequência') return 'Fazer follow-up';
    if (oportunidadeP.tipo === 'Desenvolver relacionamento') return 'Fazer prospecção consultiva';
    if (prioridadeP === 'P1' || prioridadeP === 'P2') return 'Ligar para o cliente';
    return 'Enviar cotação';
  }

  var ESTRATEGIA_BASE = {
    'Reativar cliente': {
      objetivo: 'Entender por que parou de comprar e trazer o cliente de volta.',
      argumento: 'Novidades desde a última compra e disponibilidade atual.',
      oferta: 'Condição comercial de retomada, sem entrar em desconto por padrão.'
    },
    'Recuperar cliente': {
      objetivo: 'Identificar o que mudou no ritmo de compras e remover o obstáculo.',
      argumento: 'Relacionamento e histórico construído até aqui.',
      oferta: 'Solução ajustada ao motivo da queda (prazo, disponibilidade ou mix).'
    },
    'Proteger cliente estratégico': {
      objetivo: 'Reforçar o relacionamento antes que o afastamento avance.',
      argumento: 'Importância do cliente na carteira e prioridade de atendimento.',
      oferta: 'Condição comercial e prazo, priorizando relacionamento sobre preço.'
    },
    'Expandir mix': {
      objetivo: 'Apresentar categorias que o cliente ainda não compra.',
      argumento: 'Categorias já compradas por perfis semelhantes na carteira.',
      oferta: 'Mix e disponibilidade — combinar uma categoria nova a um pedido já planejado.'
    },
    'Upsell': {
      objetivo: 'Aproveitar o crescimento recente para aumentar o ticket.',
      argumento: 'Volume crescente do próprio cliente nos últimos períodos.',
      oferta: 'Condição comercial por volume, não por preço unitário.'
    },
    'Aumentar participação': {
      objetivo: 'Entender quanto da compra do cliente ainda vai para outro fornecedor.',
      argumento: 'Ticket possível frente ao que o próprio histórico já mostrou.',
      oferta: 'Condição comercial e prazo para concentrar mais volume na Belenergy.'
    },
    'Aumentar frequência': {
      objetivo: 'Reduzir o intervalo entre pedidos.',
      argumento: 'Disponibilidade e prazo de entrega como diferencial.',
      oferta: 'Recorrência — combinar a próxima janela de compra já nesta conversa.'
    },
    'Criar recorrência': {
      objetivo: 'Transformar comprador ocasional em cliente recorrente.',
      argumento: 'Solução completa e suporte contínuo, não só o primeiro pedido.',
      oferta: 'Condição de entrada para uma segunda compra programada.'
    },
    'Desenvolver relacionamento': {
      objetivo: 'Manter proximidade e ficar por dentro de novas necessidades.',
      argumento: 'Consistência do atendimento e relacionamento já construído.',
      oferta: 'Nenhuma oferta específica — foco em relacionamento.'
    },
    'Nenhuma oportunidade clara': {
      objetivo: 'Confirmar dados e entender a situação atual do cliente.',
      argumento: 'Dados insuficientes para um argumento direcionado.',
      oferta: 'Nenhuma — reunir informação antes de ofertar.'
    }
  };

  var TIPOS_ONDE_DESCONTO_PODE_FAZER_SENTIDO = ['Aumentar participação', 'Upsell', 'Expandir mix', 'Recuperar cliente'];

  function estrategia(oportunidadeP, sensibilidade) {
    var base = ESTRATEGIA_BASE[oportunidadeP.tipo] || ESTRATEGIA_BASE['Nenhuma oportunidade clara'];
    var oferta = base.oferta;
    if ((sensibilidade === 'Muito sensível' || sensibilidade === 'Sensível') &&
      TIPOS_ONDE_DESCONTO_PODE_FAZER_SENTIDO.indexOf(oportunidadeP.tipo) > -1) {
      oferta += ' Desconto pode ser justificado aqui pelo histórico de sensibilidade a preço, mas condicionado a volume ou recorrência — nunca automático.';
    }
    return { objetivo: base.objetivo, argumento: base.argumento, oferta: oferta };
  }

  function analisarMix(c, stats) {
    var compradas = {};
    c.categorias.forEach(function (cat) { compradas[normalizarTexto(cat)] = true; });
    var naoCompradas = Object.keys(stats.universoCategorias)
      .filter(function (k) { return !compradas[k]; })
      .map(function (k) { return stats.universoCategorias[k]; });
    return {
      produtosMaisComprados: c.produtos,
      categoriasMaisCompradas: c.categorias,
      categoriasNaoCompradas: naoCompradas,
      crossSell: naoCompradas.slice(0, 5)
    };
  }

  function gerarAlertas(c, scores, stats, mix) {
    if (c.evolucao === null) return [];
    var alertas = [], comp = scores.componentes;
    var pFat = percentil(c.fatTotal, stats.fatTotal);

    if (pFat !== null && pFat >= 80 && (c.evolucao === 'retracao' || c.evolucao === 'inativo')) {
      alertas.push('🚨 Cliente estratégico reduziu compras.');
    }
    if (comp.riscoIntervalo !== null && comp.riscoIntervalo >= 60 && c.evolucao !== 'inativo') {
      alertas.push('🚨 Cliente recorrente aumentou muito o intervalo entre pedidos.');
    }
    if (comp.riscoQuedaFat !== null && comp.riscoQuedaFat >= 60) {
      alertas.push('🚨 Cliente apresenta queda significativa de faturamento.');
    }
    if (c.diasUltimaCompra !== null && c.diasUltimaCompra >= LIMIARES.inativoDias * 0.7 && c.diasUltimaCompra < LIMIARES.inativoDias) {
      alertas.push('🚨 Cliente está próximo de entrar em inatividade.');
    }
    if (c.evolucao === 'crescimento' && comp.opCrescimento !== null && comp.opCrescimento >= 50) {
      alertas.push('🔥 Cliente apresenta forte crescimento.');
    }
    if (comp.pFrequenciaInv !== null && comp.pFrequenciaInv >= 70 && c.evolucao === 'crescimento') {
      alertas.push('🔥 Cliente aumentou frequência recentemente.');
    }
    if (comp.pTicket !== null && comp.pTicket >= 75 && comp.pFrequenciaInv !== null && comp.pFrequenciaInv <= 30) {
      alertas.push('💰 Cliente possui alto ticket e baixa frequência.');
    }
    if (mix.categoriasNaoCompradas.length > 0 && comp.pMix !== null && comp.pMix <= 35) {
      alertas.push('🧩 Cliente compra poucas categorias e possui oportunidade de expansão de mix.');
    }
    if ((c.evolucao === 'inativo' || c.evolucao === 'reativacao') && comp.opReativacao !== null && comp.opReativacao >= 45) {
      alertas.push('🔄 Cliente possui histórico relevante e pode ser reativado.');
    }
    return alertas;
  }

  function classificarReativacao(c, scores) {
    if (c.evolucao !== 'inativo' && c.evolucao !== 'reativacao') return null;
    var op = scores.componentes.opReativacao;
    if (op === null) return null;
    if (op >= 60) return 'Alta';
    if (op >= 35) return 'Média';
    return 'Baixa';
  }

  function rotuloMomento(evolucao) {
    return MOMENTO_ROTULO[evolucao] || 'Dados insuficientes';
  }

  function orientacaoVendedor(c, prioridadeP, oportunidadeP, riscoP, acao) {
    if (c.evolucao === null) {
      return 'Este cliente deve ser tratado como um cadastro a confirmar.\n' +
        'O principal objetivo agora é reunir dados básicos de compra.\n' +
        'O vendedor deve validar as informações antes de qualquer abordagem comercial.\n' +
        'Evite tomar decisões de prioridade sem dados de faturamento e recência.';
    }
    var tratamento = {
      P1: 'prioridade máxima de contato hoje',
      P2: 'cliente importante, sem esperar a próxima rodada',
      P3: 'oportunidade a desenvolver, sem urgência',
      P4: 'acompanhamento de manutenção',
      P5: 'baixa prioridade neste momento'
    }[prioridadeP];

    var evitar = {
      'Dependência excessiva de preço': 'entrar em desconto sem contrapartida de volume ou recorrência',
      'Possível migração para concorrente': 'demorar para retomar o contato',
      'Cliente inativo': 'tratar como cliente ativo sem reconfirmar a situação'
    }[riscoP.tipo] || 'ofertar desconto automático sem justificativa nos dados';

    return 'Este cliente deve ser tratado como ' + tratamento + '.\n' +
      'O principal objetivo agora é ' + oportunidadeP.tipo.toLowerCase() + '.\n' +
      'O vendedor deve ' + acao.toLowerCase() + '.\n' +
      'Evite ' + evitar + '.';
  }

  function resumoExecutivo(c, scores, tags, sensibilidade, oportunidadeP, riscoP, prioridadeP, acao, estrategiaP, mix, alertasP, reativacaoP) {
    return {
      cliente: c.nome,
      codigo: c.codigo,
      vendedor: c.vendedor,
      estado: c.estado,
      cidade: c.cidade,
      perfil: tags,
      scoreComercial: scores.comercial,
      scoreOportunidade: scores.oportunidade,
      scoreRisco: scores.risco,
      prioridade: prioridadeP,
      prioridadeRotulo: PRIORIDADE_ROTULO[prioridadeP],
      momento: rotuloMomento(c.evolucao),
      principalOportunidade: oportunidadeP,
      principalRisco: riscoP,
      mix: mix,
      sensibilidadePreco: sensibilidade,
      proximaAcao: acao,
      estrategia: estrategiaP,
      alertas: alertasP,
      reativacao: reativacaoP,
      orientacao: orientacaoVendedor(c, prioridadeP, oportunidadeP, riscoP, acao)
    };
  }

  /* ---------- rankings da carteira ---------- */

  function construirRankings(resultados) {
    var comHistorico = resultados.filter(function (r) { return r.bruto.evolucao !== null; });
    var ordemPrioridade = { P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 };
    var ordemReativacao = { Alta: 1, 'Média': 2, Baixa: 3 };

    var topAtaque = comHistorico.slice().sort(function (a, b) {
      var dp = ordemPrioridade[a.resumo.prioridade] - ordemPrioridade[b.resumo.prioridade];
      return dp !== 0 ? dp : (b.scores.comercial || 0) - (a.scores.comercial || 0);
    }).slice(0, 10);

    var emRisco = comHistorico.filter(function (r) { return (r.scores.risco || 0) >= LIMIARES.riscoAlto; })
      .sort(function (a, b) {
        return (b.bruto.fatTotal || 0) * (b.scores.risco || 0) - (a.bruto.fatTotal || 0) * (a.scores.risco || 0);
      }).slice(0, 15);

    var maiorPotencial = comHistorico.filter(function (r) { return r.scores.oportunidade !== null; })
      .sort(function (a, b) { return b.scores.oportunidade - a.scores.oportunidade; })
      .slice(0, 10);

    var reativacao = comHistorico.filter(function (r) { return r.resumo.reativacao !== null; })
      .sort(function (a, b) {
        var d = ordemReativacao[a.resumo.reativacao] - ordemReativacao[b.resumo.reativacao];
        return d !== 0 ? d : (b.bruto.fatTotal || 0) - (a.bruto.fatTotal || 0);
      });

    return { topAtaque: topAtaque, emRisco: emRisco, maiorPotencial: maiorPotencial, reativacao: reativacao };
  }

  /* ---------- orquestracao ---------- */

  function processarPortfolio(cabecalhos, linhas, mapeamentoManual, dataRef) {
    dataRef = dataRef || new Date();
    var mapa = mapeamentoManual || detectarColunas(cabecalhos);

    var clientes = linhas.map(function (linha, i) {
      var c = extrairCliente(linha, mapa, i);
      calcularDerivados(c, dataRef);
      return c;
    });
    var stats = construirEstatisticas(clientes);

    var resultados = clientes.map(function (c) {
      var scores = pontuarCliente(c, stats);
      var tags = classificar(c, scores, stats);
      var sensibilidade = sensibilidadePreco(c);
      var oportunidadeP = oportunidadePrincipal(c, scores);
      var riscoP = riscoPrincipal(c, scores);
      var prioridadeP = prioridade(c, scores);
      var mix = analisarMix(c, stats);
      var acao = proximaAcao(oportunidadeP, riscoP, prioridadeP);
      var estrategiaP = estrategia(oportunidadeP, sensibilidade);
      var alertasP = gerarAlertas(c, scores, stats, mix);
      var reativacaoP = classificarReativacao(c, scores);

      return {
        bruto: c,
        scores: scores,
        resumo: resumoExecutivo(c, scores, tags, sensibilidade, oportunidadeP, riscoP, prioridadeP, acao, estrategiaP, mix, alertasP, reativacaoP)
      };
    });

    return {
      clientes: resultados,
      mapa: mapa,
      stats: stats,
      rankings: construirRankings(resultados),
      dataRef: dataRef
    };
  }

  global.MotorIC = {
    VERSAO: '1.0',
    LIMIARES: LIMIARES,
    CAMPOS: CAMPOS,
    PRIORIDADE_ROTULO: PRIORIDADE_ROTULO,
    detectarColunas: detectarColunas,
    processarPortfolio: processarPortfolio,
    formatarMoeda: formatarMoeda,
    formatarInteiro: formatarInteiro,
    paraNumero: paraNumero,
    paraData: paraData
  };
})(typeof window !== 'undefined' ? window : globalThis);
