/*
 * Testes do envio por e-mail (Codigo.gs).
 *
 * O Apps Script so roda dentro da conta Google, entao aqui os servicos
 * usados (SpreadsheetApp, MailApp, DriveApp, Utilities, Session) sao
 * simulados e o Codigo.gs e carregado por cima deles. Isso permite testar o
 * fluxo de envio -- inclusive os caminhos que sao dificeis de provocar de
 * proposito na producao: cota estourada, planilha apagada do Drive, o Gmail
 * recusando um destinatario no meio do lote.
 *
 * Rodar:  node apps_script/test_envio.js
 */

const fs = require('fs');
const vm = require('vm');

const CODIGO = fs.readFileSync(require('path').join(__dirname, 'Codigo.gs'), 'utf8');

function montarAmbiente(cfg) {
  const enviados = [];
  const alertas = [];
  const logEnvios = [];

  const abaResumo = cfg.resumo && {
    getLastRow: () => cfg.resumo.length,
    getDataRange: () => ({ getValues: () => cfg.resumo })
  };

  const abaVendedores = {
    getDataRange: () => ({ getValues: () => cfg.vendedores })
  };

  let abaEnviosCriada = cfg.abaEnviosExiste || false;
  const abaEnvios = {
    getLastRow: () => logEnvios.length + 1,
    getRange: (l, c, nl, nc) => ({
      setValues: (vals) => vals.forEach(v => logEnvios.push(v))
    }),
    setFrozenRows: () => {},
    autoResizeColumns: () => {}
  };

  const ss = {
    getSheetByName: (nome) => {
      if (nome === 'Vendedores') return abaVendedores;
      if (nome === 'Resumo') return abaResumo || null;
      if (nome === 'Envios') return abaEnviosCriada ? abaEnvios : null;
      return null;
    },
    insertSheet: (nome) => { if (nome === 'Envios') abaEnviosCriada = true; return abaEnvios; }
  };

  const Button = { YES: 'YES', NO: 'NO' };
  const ui = {
    ButtonSet: { YES_NO: 'YES_NO' },
    Button,
    alert: (...args) => {
      alertas.push(args.length === 1 ? args[0] : args[1]);
      return args.length > 2 ? (cfg.confirmar === false ? Button.NO : Button.YES) : undefined;
    }
  };

  // Drive: pasta raiz > UF > arquivo com o nome do vendedor
  const arquivosNoDrive = new Set(cfg.arquivosNoDrive || []);
  function pastaUf(uf) {
    return {
      getFilesByName: (nome) => {
        const existe = arquivosNoDrive.has(nome);
        let usado = false;
        return {
          hasNext: () => existe && !usado,
          next: () => { usado = true; return { getUrl: () => 'https://docs.google.com/sheet/' + encodeURIComponent(nome) }; }
        };
      }
    };
  }
  const raiz = {
    getFoldersByName: (uf) => {
      let usado = false;
      return { hasNext: () => !usado, next: () => { usado = true; return pastaUf(uf); } };
    }
  };
  const DriveApp = {
    getRootFolder: () => ({
      getFoldersByName: (n) => {
        let usado = false;
        const existe = cfg.pastaRaizExiste !== false;
        return { hasNext: () => existe && !usado, next: () => { usado = true; return raiz; } };
      }
    })
  };

  const MailApp = {
    getRemainingDailyQuota: () => (cfg.cota === undefined ? 100 : cfg.cota),
    sendEmail: (opts) => {
      if (cfg.falharPara && cfg.falharPara.includes(opts.to)) {
        throw new Error('caixa de entrada cheia');
      }
      enviados.push(opts);
    }
  };

  const sandbox = {
    SpreadsheetApp: { getUi: () => ui, getActiveSpreadsheet: () => ss },
    MailApp, DriveApp,
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
    Utilities: {
      formatDate: (d, tz, fmt) =>
        fmt === 'dd/MM' ? '07/08' : '07/08/2026'
    },
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(CODIGO, sandbox);
  return { sandbox, enviados, alertas, logEnvios };
}

const CAB_V = ['Vendedor', 'UF', 'Email'];
const CAB_R = ['Vendedor', 'UF', 'Qtde. Clientes', 'Valor Faturado Total'];

let falhas = 0;
function ok(cond, nome, extra) {
  console.log((cond ? '  ok   ' : '  FALHA') + '  ' + nome + (cond ? '' : '  -> ' + extra));
  if (!cond) falhas++;
}

// ---------------------------------------------------------------- cenario 1
console.log('\n1. caminho feliz — todos com e-mail e clientes');
{
  const t = montarAmbiente({
    vendedores: [CAB_V, ['ANA SOUZA', 'PA', 'ana@ex.com'], ['BRUNO LIMA', 'TO', 'bruno@ex.com']],
    resumo: [CAB_R, ['ANA SOUZA', 'PA', 91, 1234567], ['BRUNO LIMA', 'TO', 45, 89000]],
    arquivosNoDrive: ['ANA SOUZA', 'BRUNO LIMA']
  });
  t.sandbox.enviarCarteiras();
  ok(t.enviados.length === 2, 'enviou 2 e-mails', t.enviados.length);
  ok(t.enviados[0].to === 'ana@ex.com', 'destinatario correto', t.enviados[0].to);
  ok(/91 clientes/.test(t.enviados[0].subject), 'assunto traz a quantidade', t.enviados[0].subject);
  ok(/Olá, Ana!/.test(t.enviados[0].htmlBody), 'corpo usa o primeiro nome em caixa normal');
  ok(/R\$\s?1\.234\.567/.test(t.enviados[0].htmlBody), 'corpo traz o valor formatado');
  ok(/docs\.google\.com/.test(t.enviados[0].htmlBody), 'corpo traz o link da planilha');
  const regs = t.logEnvios.filter(r => r[0] !== 'Data/Hora');
  ok(regs.length === 2 && regs.every(r => r[6] === 'Enviado'), 'log registrou os 2 envios', JSON.stringify(regs));
  ok(/2 de 2 e-mails enviados/.test(t.alertas[t.alertas.length - 1]), 'resumo final correto');
}

// ---------------------------------------------------------------- cenario 2
console.log('\n2. sem distribuicao previa');
{
  const t = montarAmbiente({
    vendedores: [CAB_V, ['ANA SOUZA', 'PA', 'ana@ex.com']],
    resumo: null
  });
  t.sandbox.enviarCarteiras();
  ok(t.enviados.length === 0, 'nao enviou nada');
  ok(/Não encontrei uma distribuição/.test(t.alertas[0]), 'avisou para distribuir antes', t.alertas[0]);
}

// ---------------------------------------------------------------- cenario 3
console.log('\n3. exclusoes: sem e-mail, e-mail invalido, zero clientes');
{
  const t = montarAmbiente({
    vendedores: [CAB_V,
      ['ANA SOUZA', 'PA', 'ana@ex.com'],
      ['BRUNO LIMA', 'TO', ''],
      ['CARLA DIAS', 'RO', 'carla#errado'],
      ['DINA MOTA', 'AC', 'dina@ex.com']],
    resumo: [CAB_R,
      ['ANA SOUZA', 'PA', 91, 100],
      ['BRUNO LIMA', 'TO', 45, 100],
      ['CARLA DIAS', 'RO', 30, 100],
      ['DINA MOTA', 'AC', 0, 0]],
    arquivosNoDrive: ['ANA SOUZA']
  });
  t.sandbox.enviarCarteiras();
  ok(t.enviados.length === 1 && t.enviados[0].to === 'ana@ex.com', 'so a Ana recebeu', t.enviados.map(e => e.to));
  const conf = t.alertas[0], fim = t.alertas[t.alertas.length - 1];
  ok(/BRUNO LIMA/.test(conf) && /Sem e-mail cadastrado/.test(conf), 'confirmacao lista quem esta sem e-mail');
  ok(/CARLA DIAS/.test(conf) && /inválido/.test(conf), 'confirmacao lista e-mail invalido');
  ok(/DINA MOTA/.test(conf) && /Sem clientes/.test(conf), 'confirmacao lista quem ficou sem clientes');
  ok(/1 de 1 e-mails enviados/.test(fim), 'resumo final conta so a fila real', fim);
}

// ---------------------------------------------------------------- cenario 4
console.log('\n4. cota do Gmail insuficiente');
{
  const t = montarAmbiente({
    vendedores: [CAB_V, ['ANA SOUZA', 'PA', 'ana@ex.com'], ['BRUNO LIMA', 'TO', 'bruno@ex.com']],
    resumo: [CAB_R, ['ANA SOUZA', 'PA', 5, 1], ['BRUNO LIMA', 'TO', 5, 1]],
    arquivosNoDrive: ['ANA SOUZA', 'BRUNO LIMA'],
    cota: 1
  });
  t.sandbox.enviarCarteiras();
  ok(t.enviados.length === 0, 'nao enviou nada com cota curta');
  ok(/Cota do Gmail insuficiente/.test(t.alertas[0]), 'explicou a cota', t.alertas[0]);
  ok(/restam 1/.test(t.alertas[0]), 'informou quanto resta');
}

// ---------------------------------------------------------------- cenario 5
console.log('\n5. usuario cancela a confirmacao');
{
  const t = montarAmbiente({
    vendedores: [CAB_V, ['ANA SOUZA', 'PA', 'ana@ex.com']],
    resumo: [CAB_R, ['ANA SOUZA', 'PA', 91, 1]],
    arquivosNoDrive: ['ANA SOUZA'],
    confirmar: false
  });
  t.sandbox.enviarCarteiras();
  ok(t.enviados.length === 0, 'nada enviado apos cancelar');
  ok(t.logEnvios.length === 0, 'nada registrado no log');
}

// ---------------------------------------------------------------- cenario 6
console.log('\n6. planilha do vendedor sumiu do Drive');
{
  const t = montarAmbiente({
    vendedores: [CAB_V, ['ANA SOUZA', 'PA', 'ana@ex.com'], ['BRUNO LIMA', 'TO', 'bruno@ex.com']],
    resumo: [CAB_R, ['ANA SOUZA', 'PA', 91, 1], ['BRUNO LIMA', 'TO', 45, 1]],
    arquivosNoDrive: ['ANA SOUZA']   // a do Bruno foi apagada
  });
  t.sandbox.enviarCarteiras();
  ok(t.enviados.length === 1, 'enviou so para quem tem planilha', t.enviados.length);
  const fim = t.alertas[t.alertas.length - 1];
  ok(/BRUNO LIMA/.test(fim) && /não encontrada/.test(fim), 'relatou a planilha faltando', fim);
  ok(t.logEnvios.some(r => /FALHA/.test(String(r[6]))), 'log registrou a falha');
  ok(/1 de 2 e-mails enviados/.test(fim), 'contagem correta', fim);
}

// ---------------------------------------------------------------- cenario 7
console.log('\n7. o Gmail recusa um envio no meio do lote');
{
  const t = montarAmbiente({
    vendedores: [CAB_V, ['ANA SOUZA', 'PA', 'ana@ex.com'], ['BRUNO LIMA', 'TO', 'bruno@ex.com'],
      ['CARLA DIAS', 'RO', 'carla@ex.com']],
    resumo: [CAB_R, ['ANA SOUZA', 'PA', 9, 1], ['BRUNO LIMA', 'TO', 9, 1], ['CARLA DIAS', 'RO', 9, 1]],
    arquivosNoDrive: ['ANA SOUZA', 'BRUNO LIMA', 'CARLA DIAS'],
    falharPara: ['bruno@ex.com']
  });
  t.sandbox.enviarCarteiras();
  ok(t.enviados.length === 2, 'os outros dois foram enviados mesmo assim', t.enviados.length);
  const fim = t.alertas[t.alertas.length - 1];
  ok(/2 de 3 e-mails enviados/.test(fim), 'contagem correta', fim);
  ok(/caixa de entrada cheia/.test(fim), 'mostrou o motivo da falha', fim);
  ok(t.logEnvios.filter(r => /FALHA/.test(String(r[6]))).length === 1, 'log tem exatamente 1 falha');
}

// ---------------------------------------------------------------- cenario 8
console.log('\n8. ninguem elegivel');
{
  const t = montarAmbiente({
    vendedores: [CAB_V, ['ANA SOUZA', 'PA', '']],
    resumo: [CAB_R, ['ANA SOUZA', 'PA', 91, 1]]
  });
  t.sandbox.enviarCarteiras();
  ok(t.enviados.length === 0, 'nao enviou nada');
  ok(/Nenhum e-mail a enviar/.test(t.alertas[0]), 'avisou o motivo', t.alertas[0]);
}

console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTodos os cenarios passaram.');
process.exit(falhas ? 1 : 0);
