// ======================================================================
// INICIO DO CODIGO -- copie a partir desta linha
// ======================================================================
/**
 * Assistente Comercial - Google Apps Script
 *
 * Roda inteiramente dentro do Google Sheets/Drive, sem instalar nada no
 * computador. Cole este arquivo em Extensoes > Apps Script da planilha
 * "painel" (a que voce administra) e siga o README da pasta apps_script/.
 *
 * As colunas da aba "Base BI" NAO sao fixas no codigo: o script le o
 * cabecalho (linha 1) da aba tal como ele estiver e usa exatamente esses
 * nomes/ordem para gerar as abas de saida e os arquivos por vendedor --
 * assim funciona com qualquer conjunto de colunas que o seu BI exportar,
 * sem descartar nem embaralhar nenhuma coluna.
 *
 * Regras (mesmas da versao Python em sales_assistant/distribute.py):
 *   1. Categoria contendo "Ativo 30 dias" -> ignorado, nao entra na
 *      distribuicao.
 *   2. UF mapeada com 2+ vendedores -> rodizio, mesma quantidade pra cada um
 *      (diferenca maxima de 1).
 *   3. UF mapeada com 1 vendedor -> tudo pra ele (mesmo mecanismo do item 2
 *      com uma lista de um).
 *   4. Linha sem UF -> nao distribuida.
 *   5. UF "todas de uma vez" (TODAS/TODOS/NACIONAL/BR/BRASIL, ou todas as
 *      UFs do mapeamento juntas, ex. AC/AM/AP/PA/RO/RR/TO) -> dividida uma
 *      unica vez entre TODOS os vendedores.
 *   6. UF presente na base mas fora do mapeamento (outras equipes/regioes)
 *      -> nao tocada.
 */

var ABA_VENDEDORES = 'Vendedores';
var ABA_BASE = 'Base BI';
var ABA_RESUMO = 'Resumo';
var ABA_DISTRIBUIDO = 'Distribuído';
var ABA_SEM_UF = 'Sem UF';
var ABA_FORA_ESCOPO = 'Fora de Escopo';
var ABA_EXCLUIDOS = 'Excluídos (Ativo 30 dias)';
var ABA_HISTORICO = 'Histórico';
var NOME_PASTA_RAIZ = 'Distribuição Comercial - Vendedores';
var ROTULO_ATIVO_30 = 'Ativo 30 dias';
var REGIAO_NORTE = ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'];
var MARCADORES_TODAS_UF = ['TODAS', 'TODOS', 'NACIONAL', 'BR', 'BRASIL'];

// Cabecalho usado so para criar a aba "Base BI" vazia da primeira vez.
// Assim que voce colar a base exportada de verdade por cima, o cabecalho
// real dela e que passa a valer -- o script sempre le a linha 1 da aba
// "Base BI" dinamicamente, nunca essa lista fixa.
var COLUNAS_BASE_MODELO = [
  'UF', 'Cidade', 'Integrador', 'CNPJ/CPF', 'Telefone', 'E-mail',
  'Categoria', 'Última Nota', 'Vendedor', 'Gerente', 'Qtde. Pedidos', 'Valor Faturado'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Assistente Comercial')
    .addItem('1) Configurar planilha (rodar uma vez)', 'criarEstruturaInicial')
    .addItem('2) Limpar Base BI (antes de colar nova base)', 'limparBaseBI')
    .addItem('3) Distribuir agora', 'distribuirAgora')
    .addToUi();
}

/** Passo 1 (rodar uma unica vez): cria as abas "Vendedores" e "Base BI". */
function criarEstruturaInicial() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var abaV = ss.getSheetByName(ABA_VENDEDORES) || ss.insertSheet(ABA_VENDEDORES);
  abaV.clearContents();
  var vendedoresIniciais = [
    ['Vendedor', 'UF', 'Email'],
    ['ALISSON DOS SANTOS RIBEIRO', 'AC', ''],
    ['ELANDIA CAMARGO RODRIGUES', 'AC', ''],
    ['ITALO CERQUEIA DOS SANTOS', 'AM', ''],
    ['MATHEUS SOUZA DE BARROS', 'AM', ''],
    ['DIEGO ADAN OHNUMA ANGELI', 'AP', ''],
    ['GIOVANNA DO CARMO FUJIMOTO', 'PA', ''],
    ['MUNARI ANGELA MARIANO', 'PA', ''],
    ['PAULO ROBERTO DA SILVA FILHO', 'PA', ''],
    ['RAYANE ALMEIDA DOS SANTOS', 'PA', ''],
    ['CRISTIANE LUIS DOS SANTOS', 'RO', ''],
    ['GLEICY KELLY TOPPAN DE OLIVEIRA', 'RO', ''],
    ['MARIA ELISABETE TONON', 'RO', ''],
    ['RAFAEL VANDERLEI LOPES', 'RO', ''],
    ['ROSYRENE DE MEDEIROS CELESTINO', 'RO', ''],
    ['VICTOR VINICIUS RENNO', 'RO', ''],
    ['LEONARDO COSTA OLIVEIRA', 'RR', ''],
    ['ERICA OLIVEIRA', 'TO', ''],
    ['LUCAS DOS REIS BERNARDES DA SILVEIRA', 'TO', ''],
    ['MARIA PAULA BERTAGLIA NESTOR', 'TO', ''],
    ['MURILO BEDANI ROGERIO', 'TO', ''],
    ['NILTON RENATO VICENTE JUNIOR', 'TO', ''],
    ['RICARDO CARNIATO RODRIGUES', 'TO', '']
  ];
  abaV.getRange(1, 1, vendedoresIniciais.length, 3).setValues(vendedoresIniciais);
  abaV.setFrozenRows(1);

  var abaB = ss.getSheetByName(ABA_BASE) || ss.insertSheet(ABA_BASE);
  abaB.clearContents();
  abaB.getRange(1, 1, 1, COLUNAS_BASE_MODELO.length).setValues([COLUNAS_BASE_MODELO]);
  abaB.setFrozenRows(1);

  SpreadsheetApp.getUi().alert(
    'Estrutura criada!\n\n' +
    '1. Preencha o e-mail de cada vendedor na aba "' + ABA_VENDEDORES + '".\n' +
    '2. Cole os dados exportados do BI na aba "' + ABA_BASE + '" a partir da célula A1 ' +
    '(o cabeçalho de exemplo será substituído pelo cabeçalho real da sua exportação).\n' +
    '3. Use o menu "Assistente Comercial > 3) Distribuir agora".'
  );
}

/**
 * Passo intermediário (toda vez, antes de colar uma base nova): apaga TODO o
 * conteúdo da aba "Base BI", inclusive o cabeçalho. Evita dois problemas:
 * (1) sobrarem linhas antigas quando a base nova tem menos linhas que a
 * anterior -- essas sobras seriam contadas como clientes da rodada atual;
 * (2) o cabeçalho antigo ficar "desencontrado" das colunas da base nova
 * (ex.: base nova com uma coluna a mais/menos que a anterior), causando
 * dados fora de ordem. Por isso a base sempre precisa ser colada de novo a
 * partir da célula A1, cabeçalho incluso, depois de rodar este passo.
 */
function limparBaseBI() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_BASE);
  if (!aba) {
    SpreadsheetApp.getUi().alert('A aba "' + ABA_BASE + '" não existe. Rode "1) Configurar planilha" primeiro.');
    return;
  }
  aba.clearContents();
  SpreadsheetApp.getUi().alert(
    'Aba "' + ABA_BASE + '" totalmente limpa (cabeçalho incluso).\n\n' +
    'Agora cole os dados novos a partir da célula A1, incluindo a linha de cabeçalho.'
  );
}

/** Passo 2 (toda vez que atualizar a base): roda a distribuição. */
function distribuirAgora() {
  var ui = SpreadsheetApp.getUi();
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var vendedores = lerVendedores(ss);
    if (!vendedores.length) {
      ui.alert('A aba "' + ABA_VENDEDORES + '" está vazia. Rode primeiro "1) Configurar planilha".');
      return;
    }
    var headers = lerCabecalhoBase(ss);
    var base = lerBase(ss, headers);
    if (!base.length) {
      ui.alert('A aba "' + ABA_BASE + '" está vazia. Cole os dados exportados do BI (com cabeçalho) antes de distribuir.');
      return;
    }

    var resultado = distribuir(base, vendedores, headers);
    escreverAbasAuditoria(ss, resultado, headers);
    registrarHistorico(ss, resultado);
    var avisos = publicarArquivosPorVendedor(resultado, vendedores, headers);

    var msg = 'Distribuição concluída!\n\n' +
      'Colunas identificadas na Base BI: ' + headers.join(', ') + '\n\n' +
      'Distribuídos: ' + resultado.atribuidos.length + '\n' +
      'Sem UF: ' + resultado.semUf.length + '\n' +
      'Fora de escopo: ' + resultado.foraEscopo.length + '\n' +
      'Excluídos (Ativo 30 dias): ' + resultado.excluidos.length + '\n\n' +
      'Veja a aba "' + ABA_RESUMO + '" (situação atual), a aba "' + ABA_HISTORICO + '" (evolução ao longo do tempo) ' +
      'e a pasta "' + NOME_PASTA_RAIZ + '" no seu Google Drive.';
    if (avisos.length) {
      msg += '\n\nAtenção - sem e-mail cadastrado (arquivo criado mas não compartilhado): ' + avisos.join(', ');
    }
    ui.alert(msg);
  } catch (erro) {
    ui.alert('Deu erro: ' + erro.message);
    throw erro;
  }
}

// ---------- Leitura ----------

function normalizar(v) {
  if (v === null || v === undefined) return '';
  // troca espaco invisivel (nao separavel, comum em exportacoes) por espaco
  // normal e colapsa espacos duplicados -- evita falha de comparacao por
  // causa de formatacao invisivel vinda do Excel/BI.
  return String(v).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function lerVendedores(ss) {
  var aba = ss.getSheetByName(ABA_VENDEDORES);
  if (!aba) return [];
  var dados = aba.getDataRange().getValues();
  var headers = dados[0].map(normalizar);
  var idxVendedor = headers.indexOf('Vendedor');
  var idxUf = headers.indexOf('UF');
  var idxEmail = headers.indexOf('Email');
  var lista = [];
  for (var i = 1; i < dados.length; i++) {
    var vendedor = normalizar(dados[i][idxVendedor]);
    if (!vendedor) continue;
    lista.push({
      vendedor: vendedor,
      uf: normalizar(dados[i][idxUf]).toUpperCase(),
      email: normalizar(dados[i][idxEmail])
    });
  }
  return lista;
}

/** Le a linha 1 da aba "Base BI" tal como ela estiver, na ordem em que as colunas aparecem. */
function lerCabecalhoBase(ss) {
  var aba = ss.getSheetByName(ABA_BASE);
  if (!aba) return [];
  var ultimaColuna = aba.getLastColumn();
  if (ultimaColuna === 0) return [];
  var linha1 = aba.getRange(1, 1, 1, ultimaColuna).getValues()[0];
  return linha1.map(normalizar).filter(function (h) { return h !== ''; });
}

function lerBase(ss, headers) {
  var aba = ss.getSheetByName(ABA_BASE);
  if (!aba || !headers.length) return [];
  var dados = aba.getDataRange().getValues();
  var linhas = [];
  for (var i = 1; i < dados.length; i++) {
    var linha = {};
    var vazio = true;
    for (var j = 0; j < headers.length; j++) {
      linha[headers[j]] = dados[i][j];
      if (dados[i][j] !== '' && dados[i][j] !== null && dados[i][j] !== undefined) vazio = false;
    }
    if (!vazio) linhas.push(linha);
  }
  return linhas;
}

// ---------- Regras de negócio ----------

function ehMarcadorTodasUf(ufRaw, todasUfsSet) {
  if (MARCADORES_TODAS_UF.indexOf(ufRaw) !== -1) return true;
  var partes = ufRaw.split(/[\/,;+]/).map(function (p) { return p.trim(); }).filter(function (p) { return p; });
  if (partes.length <= 1) return false;
  var setPartes = {};
  partes.forEach(function (p) { setPartes[p] = true; });
  for (var uf in todasUfsSet) {
    if (!setPartes[uf]) return false;
  }
  return true;
}

/**
 * Encontra o nome real da coluna em `headers` que corresponde a `nomeAlvo`,
 * ignorando maiusculas/minusculas (ex.: acha "CATEGORIA" ou "categoria"
 * quando procurando por "Categoria"). Retorna null se nao encontrar.
 */
function encontrarColuna(headers, nomeAlvo) {
  var alvo = nomeAlvo.toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].toLowerCase() === alvo) return headers[i];
  }
  return null;
}

/**
 * Chave de ordenacao estavel para o rodizio, construida a partir de todos
 * os valores da propria linha (na ordem em que vieram da Base BI) -- nao
 * depende do nome de nenhuma coluna especifica (tipo "Integrador"), entao
 * continua funcionando mesmo que o layout da exportacao do BI mude.
 */
function chaveOrdenacao(row) {
  return Object.keys(row).map(function (k) {
    var v = row[k];
    if (v instanceof Date) return v.getTime();
    return normalizar(v).toLowerCase();
  }).join('|');
}

function dividirRodizio(linhas, vendedoresList) {
  if (!linhas.length || !vendedoresList.length) return [];
  var ordenados = linhas.slice().sort(function (a, b) {
    var ca = chaveOrdenacao(a);
    var cb = chaveOrdenacao(b);
    return ca < cb ? -1 : (ca > cb ? 1 : 0);
  });
  var vends = vendedoresList.slice().sort();
  return ordenados.map(function (row, i) {
    var copia = Object.assign({}, row);
    copia._vendedorAtribuido = vends[i % vends.length];
    return copia;
  });
}

function distribuir(baseRows, vendedores, headers) {
  var chaveCategoria = encontrarColuna(headers, 'Categoria');
  var chaveUf = encontrarColuna(headers, 'UF');
  if (!chaveCategoria) {
    throw new Error('Não encontrei nenhuma coluna chamada "Categoria" na Base BI. Colunas encontradas: ' + headers.join(', '));
  }
  if (!chaveUf) {
    throw new Error('Não encontrei nenhuma coluna chamada "UF" na Base BI. Colunas encontradas: ' + headers.join(', '));
  }

  var mantidos = [];
  var excluidos = [];
  baseRows.forEach(function (row) {
    var cat = normalizar(row[chaveCategoria]).toLowerCase();
    if (cat.indexOf(ROTULO_ATIVO_30.toLowerCase()) !== -1) {
      excluidos.push(row);
    } else {
      mantidos.push(row);
    }
  });

  // Regra fixa: a equipe so prospecta a Regiao Norte. Vendedor cadastrado
  // para outra UF e ignorado, e cliente de fora do Norte nunca e redistribuido.
  var ufParaVendedores = {};
  vendedores.forEach(function (v) {
    if (REGIAO_NORTE.indexOf(v.uf) === -1) return;
    if (!ufParaVendedores[v.uf]) ufParaVendedores[v.uf] = [];
    ufParaVendedores[v.uf].push(v.vendedor);
  });
  var todosVendedores = vendedores
    .filter(function (v) { return REGIAO_NORTE.indexOf(v.uf) !== -1; })
    .map(function (v) { return v.vendedor; });
  var todasUfsSet = {};
  Object.keys(ufParaVendedores).forEach(function (uf) { todasUfsSet[uf] = true; });

  var semUf = [];
  var foraEscopo = [];
  var paraDividirPorUf = {};
  var paraDividirTodas = [];

  mantidos.forEach(function (row) {
    var ufRaw = normalizar(row[chaveUf]).toUpperCase();
    if (!ufRaw) {
      semUf.push(row);
      return;
    }
    if (ehMarcadorTodasUf(ufRaw, todasUfsSet)) {
      paraDividirTodas.push(row);
      return;
    }
    if (ufParaVendedores[ufRaw]) {
      if (!paraDividirPorUf[ufRaw]) paraDividirPorUf[ufRaw] = [];
      paraDividirPorUf[ufRaw].push(row);
    } else {
      foraEscopo.push(row);
    }
  });

  var atribuidos = [];
  if (paraDividirTodas.length) {
    atribuidos = atribuidos.concat(dividirRodizio(paraDividirTodas, todosVendedores));
  }
  Object.keys(paraDividirPorUf).forEach(function (uf) {
    atribuidos = atribuidos.concat(dividirRodizio(paraDividirPorUf[uf], ufParaVendedores[uf]));
  });

  var resumo = calcularResumo(atribuidos, vendedores);

  return {
    atribuidos: atribuidos,
    semUf: semUf,
    foraEscopo: foraEscopo,
    excluidos: excluidos,
    resumo: resumo
  };
}

function calcularResumo(atribuidos, vendedores) {
  var totais = {};
  var contagens = {};
  vendedores.forEach(function (v) {
    totais[v.vendedor] = 0;
    contagens[v.vendedor] = 0;
  });
  atribuidos.forEach(function (row) {
    var v = row._vendedorAtribuido;
    var valor = Number(row['Valor Faturado']) || 0;
    totais[v] = (totais[v] || 0) + valor;
    contagens[v] = (contagens[v] || 0) + 1;
  });
  return vendedores.map(function (v) {
    return {
      Vendedor: v.vendedor,
      UF: v.uf,
      'Qtde. Clientes': contagens[v.vendedor] || 0,
      'Valor Faturado Total': totais[v.vendedor] || 0
    };
  });
}

// ---------- Saída: abas de auditoria na planilha painel ----------

function escreverTabela(ss, nomeAba, colunas, linhasObjetos) {
  var aba = ss.getSheetByName(nomeAba) || ss.insertSheet(nomeAba);
  aba.clearContents();
  var dados = [colunas];
  linhasObjetos.forEach(function (obj) {
    dados.push(colunas.map(function (c) { return obj[c] !== undefined ? obj[c] : ''; }));
  });
  aba.getRange(1, 1, dados.length, colunas.length).setValues(dados);
  aba.setFrozenRows(1);
}

function escreverAbasAuditoria(ss, resultado, headers) {
  escreverTabela(ss, ABA_RESUMO, ['Vendedor', 'UF', 'Qtde. Clientes', 'Valor Faturado Total'], resultado.resumo);
  escreverTabela(
    ss,
    ABA_DISTRIBUIDO,
    headers.concat(['Vendedor Atribuído']),
    resultado.atribuidos.map(function (r) {
      var copia = Object.assign({}, r);
      copia['Vendedor Atribuído'] = r._vendedorAtribuido;
      return copia;
    })
  );
  escreverTabela(ss, ABA_SEM_UF, headers, resultado.semUf);
  escreverTabela(ss, ABA_FORA_ESCOPO, headers, resultado.foraEscopo);
  escreverTabela(ss, ABA_EXCLUIDOS, headers, resultado.excluidos);
}

/**
 * Acrescenta uma linha por vendedor a cada rodada na aba "Histórico"
 * (nunca apaga o que já tinha) -- dá pra ver como cada vendedor evoluiu ao
 * longo das exportações, diferente das outras abas que sempre mostram só a
 * última rodada.
 */
function registrarHistorico(ss, resultado) {
  var aba = ss.getSheetByName(ABA_HISTORICO);
  if (!aba) {
    aba = ss.insertSheet(ABA_HISTORICO);
    aba.appendRow(['Data/Hora', 'Vendedor', 'UF', 'Qtde. Clientes', 'Valor Faturado Total']);
    aba.setFrozenRows(1);
  }
  var agora = new Date();
  var linhas = resultado.resumo.map(function (r) {
    return [agora, r.Vendedor, r.UF, r['Qtde. Clientes'], r['Valor Faturado Total']];
  });
  if (linhas.length) {
    aba.getRange(aba.getLastRow() + 1, 1, linhas.length, 5).setValues(linhas);
  }
}

// ---------- Saída: um Google Sheets por vendedor, no Drive ----------

function obterOuCriarPasta(nome, pastaPai) {
  var it = pastaPai.getFoldersByName(nome);
  if (it.hasNext()) return it.next();
  return pastaPai.createFolder(nome);
}

function obterOuCriarPlanilha(nome, pasta) {
  var it = pasta.getFilesByName(nome);
  if (it.hasNext()) {
    return SpreadsheetApp.open(it.next());
  }
  var novaSs = SpreadsheetApp.create(nome);
  var arquivo = DriveApp.getFileById(novaSs.getId());
  pasta.addFile(arquivo);
  DriveApp.getRootFolder().removeFile(arquivo);
  return novaSs;
}

function escreverClientesDoVendedor(ss, linhas, headers) {
  var aba = ss.getSheets()[0];
  aba.setName('Clientes');
  aba.clearContents();
  var dados = [headers];
  linhas.forEach(function (r) {
    dados.push(headers.map(function (c) { return r[c] !== undefined ? r[c] : ''; }));
  });
  aba.getRange(1, 1, dados.length, headers.length).setValues(dados);
  aba.setFrozenRows(1);
}

/**
 * Compartilha o arquivo e manda o e-mail de convite de verdade.
 * addEditor() do DriveApp da acesso mas NAO garante o envio do e-mail;
 * o Drive Advanced Service (Drive.Permissions.create com
 * sendNotificationEmail: true) e o que efetivamente dispara o convite,
 * igual ao que acontece quando voce compartilha manualmente pela tela do
 * Drive. Requer habilitar o servico "Drive API" uma vez (ver README).
 */
function compartilharComEmail(arquivo, email) {
  if (typeof Drive === 'undefined') {
    throw new Error(
      'Servico "Drive API" nao habilitado. No editor do Apps Script, va em ' +
      'Servicos (icone +) e adicione "Drive API".'
    );
  }
  Drive.Permissions.create(
    { role: 'writer', type: 'user', emailAddress: email },
    arquivo.getId(),
    { sendNotificationEmail: true }
  );
}

function publicarArquivosPorVendedor(resultado, vendedores, headers) {
  var raiz = obterOuCriarPasta(NOME_PASTA_RAIZ, DriveApp.getRootFolder());
  var avisos = [];

  vendedores.forEach(function (v) {
    var pastaUf = obterOuCriarPasta(v.uf, raiz);
    var arquivo = obterOuCriarPlanilha(v.vendedor, pastaUf);
    var linhas = resultado.atribuidos.filter(function (r) { return r._vendedorAtribuido === v.vendedor; });
    escreverClientesDoVendedor(arquivo, linhas, headers);

    if (v.email) {
      try {
        compartilharComEmail(arquivo, v.email);
      } catch (e) {
        avisos.push(v.vendedor + ' (falha ao compartilhar: ' + e.message + ')');
      }
    } else {
      avisos.push(v.vendedor);
    }
  });

  return avisos;
}

// ======================================================================
// FIM DO CODIGO -- nao copie nada depois desta linha
// ======================================================================
