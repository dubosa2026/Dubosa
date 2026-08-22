/* ==================================================================
   Roteiro de ligacao -- painel ao lado das listas do vendedor.

   O conteudo (aberturas e objecoes) e fixo, mas as falas trazem marcas
   como {CLIENTE} e {DIAS} que sao trocadas pelos dados do cliente que o
   vendedor clicar na tabela. Sem cliente escolhido, a marca vira um
   rotulo cinza -- melhor um espaco em branco visivel do que um numero
   inventado no meio da ligacao.

   Tudo aqui usa classes com prefixo rt- para nao esbarrar no CSS do app
   do gestor, que compartilha a mesma folha de estilo.
   ================================================================== */

var Roteiro = (function () {
  'use strict';

  function rtEsc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
  }

  var VEND = '';       // primeiro nome do vendedor, para entrar nas falas
  var atual = null;    // cliente escolhido na tabela
  var tipo = 'normal'; // qual conjunto de aberturas mostrar

  /* ---------- as falas ---------- */

  function eu() { return VEND || 'seu nome'; }
  function nm() { return '<span class="rt-fill">nome do contato</span>'; }

  var ABERTURAS = {
    normal: [
      { nome: 'A data que constrange',
        fala: function () { return nm() + ', aqui é o ' + eu() + ', da BelEnergy. Estou com o cadastro da <em>{CLIENTE}</em> aberto e vi que a última compra foi em <em>{ULTIMA}</em> — de lá pra cá foram <em>{DIAS}</em>. Antes de eu tirar conclusão errada: aconteceu alguma coisa com a gente, ou foi só o movimento mesmo?'; },
        porque: 'Um número específico prova preparação e cria uma pausa. A pergunta dá uma saída honrosa, e quase sempre ele revela o motivo real.' },
      { nome: 'O histórico que ele esqueceu que tinha',
        fala: function () { return nm() + ', ' + eu() + ' da BelEnergy. A {CLIENTE} fez <em>{PEDIDOS} pedidos</em> com a gente, <em>{VALOR}</em> no total. Hoje está parada, e eu não quero perder um cliente desse tamanho por falta de contato. Me dá dois minutos pra eu entender o que mudou?'; },
        porque: 'Devolve ao cliente o tamanho da própria relação. Use quando os pedidos ou o faturamento forem expressivos.' },
      { nome: 'O vizinho',
        fala: function () { return nm() + ', ' + eu() + ' da BelEnergy. Estou atendendo os integradores de <em>{CIDADE}</em> esta semana e o nome da {CLIENTE} apareceu. Antes de eu tomar seu tempo: hoje vocês estão comprando de quem?'; },
        porque: 'Proximidade gera pertencimento, e a pergunta direta costuma ser respondida — dá o quadro competitivo em 10 segundos.' },
      { nome: 'A pergunta que inverte a posição',
        fala: function () { return nm() + ', ' + eu() + ' da BelEnergy — 30 segundos e você decide se vale a pena continuar. Vocês são integradores em <em>{CIDADE}</em>, certo? Me responde uma coisa: <em>quando você perde uma venda hoje, perde por preço ou por prazo de entrega?</em>'; },
        porque: 'Oferece uma saída logo de cara e faz a pergunta que todo integrador tem vontade de responder. A resposta define o pitch inteiro.' },
      { nome: 'O pedido de ajuda',
        fala: function () { return nm() + ', ' + eu() + ' da BelEnergy. Vou ser honesto: a {CLIENTE} está na minha carteira e nunca conversamos. <em>Não vou oferecer nada agora.</em> Só quero entender que tipo de projeto vocês tocam — residencial, rural, comercial — pra eu saber se faz sentido ligar de novo ou se deixo vocês em paz.'; },
        porque: 'Remove a pressão de venda, que é o que dispara o "não tenho interesse" automático. Ideal para quem nunca comprou.' },
      { nome: 'A âncora de mercado',
        fala: function () { return nm() + ', ' + eu() + ' da BelEnergy. Ligo por um motivo específico: <span class="rt-fill">fato real de preço, prazo ou disponibilidade</span>. Pra quem tem obra fechando este mês isso muda a conta. Vocês têm projeto em andamento agora?'; },
        porque: 'A única que abre com oferta, e por isso a mais arriscada. Só use com fato verificável — preço inventado destrói a segunda ligação.' }
    ],
    carteira: [
      { nome: 'A cadência quebrada',
        fala: function () { return nm() + ', ' + eu() + ' da BelEnergy. A {CLIENTE} compra com a gente <em>quase todo mês</em> e este mês ainda não passou pedido. Não liguei pra cobrar — liguei porque quando isso acontece geralmente faltou alguma coisa da nossa parte. Faltou?'; },
        porque: 'Nomeia o padrão sem acusar e assume a responsabilidade antes de atribuir culpa. É a que mais destrava reclamação represada.' },
      { nome: 'A obra na frente',
        fala: function () { return nm() + ', ' + eu() + ' da BelEnergy. Pergunta rápida: <em>o que vocês têm de obra fechando nos próximos 15 dias?</em> Quero garantir que o material esteja separado antes de virar o mês.'; },
        porque: 'Não fala do que não aconteceu, fala do que vem. Coloca o vendedor como quem organiza a operação do cliente.' },
      { nome: 'O fechamento de mês',
        fala: function () { return nm() + ', ' + eu() + '. Faltam <span class="rt-fill">tantos</span> dias pro fechamento e a {CLIENTE} ainda não pontuou este mês. Se tiver qualquer coisa pra entrar, é agora que eu consigo <span class="rt-fill">condição real</span>. Tem algo que eu possa adiantar?'; },
        porque: 'Prazo é urgência real. Mas o benefício precisa existir — senão o cliente sente que virou meta, e isso queima.' },
      { nome: 'A conta que ele não fez',
        fala: function () { return nm() + ', ' + eu() + ' da BelEnergy. A {CLIENTE} já fez <em>{PEDIDOS} pedidos</em> com a gente e este mês está zerada. Ou vocês acharam preço melhor em algum lugar, ou o movimento caiu. Qual dos dois é?'; },
        porque: 'As duas opções cobrem quase toda a realidade. Escolha binária é mais fácil de responder que pergunta aberta.' },
      { nome: 'O aviso antes da falta',
        fala: function () { return nm() + ', ' + eu() + '. Liguei porque <span class="rt-fill">o item que vocês mais compram está com prazo esticando</span>. Como não passou pedido este mês, achei melhor avisar antes de precisar e não ter. Quer que eu separe?'; },
        porque: 'É serviço, não venda. Costuma ser a de maior conversão — e a mais perigosa se a informação for falsa.' },
      { nome: 'A checagem de relacionamento',
        fala: function () { return nm() + ', ' + eu() + ' da BelEnergy. Vou ser direto porque respeito seu tempo: <em>eu perdi vocês pra alguém este mês?</em> Se perdi, quero saber por quê — não pra brigar por preço, mas pra não repetir o erro.'; },
        porque: 'Franqueza desarma. Mesmo com a venda do mês perdida, o vendedor sai com a informação competitiva.' }
    ]
  };

  var GRUPOS = [
    { titulo: 'Frete', itens: [1, 2, 3, 4] },
    { titulo: 'A disputa do integrador com o concorrente dele', itens: [5, 6, 7] },
    { titulo: 'Prazo e distância', itens: [8, 9] },
    { titulo: 'Preço', itens: [10, 11] },
    { titulo: 'Concorrência e relacionamento', itens: [12, 13, 14] },
    { titulo: 'Marca e adiamento', itens: [15, 16, 17] }
  ];

  var OBJ = {
    1: { t: 'O frete de vocês é muito caro',
         p: 'Ele compara frete com frete, isolado do resto.',
         f: ['Entendo, e é verdade — sai mais caro que o de quem tem CD aí. Mas deixa eu te perguntar uma coisa que quase ninguém para pra pensar: <em>quando você fecha o orçamento pro cliente final, você entrega o frete separado ou entrega o projeto pronto?</em> O cliente final não compra frete, compra usina instalada. Me manda a lista da próxima obra que eu te devolvo a conta fechada. <em>Qual é a próxima que você tem pra cotar?</em>'] },
    2: { t: 'Seu frete é o dobro do dele',
         p: 'Ele fez a comparação certa e você perdeu nela. Fugir aqui destrói a conversa inteira.',
         f: ['É maior mesmo, e vai continuar sendo — sai de São Paulo, o dele sai de Belém. Isso eu não tenho como mudar e não vou tentar te convencer do contrário.<br><br>O que eu quero que você olhe é <em>o que essa diferença compra</em>. Ela compra o material estar lá. Você já me ligou procurando coisa que faltou no CD de perto, e naquele dia o frete não foi o seu problema. <em>Nos últimos seis meses, quantas vezes você precisou de algo que o fornecedor perto não tinha?</em>'],
         q: 'Concordar com o número tira o vendedor da defensiva. A pergunta traz o histórico de falta, que é o campo onde a BelEnergy ganha.' },
    3: { t: 'Esse frete come minha margem',
         p: 'Ele olha o frete contra o lucro dele, não contra o projeto.',
         f: ['Entendo, é a conta que importa pra você. Só que ela precisa estar completa. O frete num projeto inteiro costuma dar <span class="rt-fill">poucos por cento</span> do total — e a margem some ou não some dependendo do preço do produto, não do frete sozinho.<br><br>Me deixa fazer o fechado da sua próxima obra, com produto e frete somados, e você compara com o fechado dele. Se o meu total for maior, eu não vou insistir. <em>Qual obra você tem pra eu fazer essa conta?</em>'],
         q: 'Aceita ser medido pelo número final e assume o risco de perder. Isso compra a chance de cotar.' },
    4: { t: 'Por causa do frete, compensa mais comprar dele',
         p: 'Compensa quando ele tem o material. É esse "quando" que ninguém coloca na conta.',
         f: ['Compensa, quando ele tem. E boa parte do ano ele tem — não vou fingir que não.<br><br>O problema é o resto. Quando falta, você não escolhe: paga urgência, atrasa a obra, ou perde a venda. <em>Aí o meu frete deixa de ser caro e vira barato</em>, só que você descobre isso no pior dia.<br><br>Não vim tirar ele de você. Vim pra você não depender de um só. <em>O que aconteceria com sua obra hoje se o item principal não estivesse no estoque dele?</em>'] },
    5: { t: 'Perco a obra pro meu concorrente. Ou tiro da mão de obra',
         p: 'Ele não está negociando com você. Está mostrando que a conta não fecha na ponta dele — e provavelmente tem razão. Tratar como objeção de preço soa surdo.',
         f: ['Essa é a única reclamação que eu levo a sério de verdade, porque não é sobre mim, é sobre você perder obra.<br><br>Antes de eu tentar qualquer coisa, faz essa conta comigo agora, no telefone. <em>Quanto sai o kit dele com frete, quanto sai o meu com frete, e por quanto você está propondo a obra?</em> Na maioria das vezes que eu faço essa conta, a diferença de frete não é o que está perdendo a venda. <em>Me passa esses três números?</em>'],
         conta: true,
         f2: ['Olha o que aparece aí: <em>tirar da mão de obra não ganha essa obra. Só empobrece uma obra que você talvez nem ganhe.</em> Os R$ 800 de frete são 2% do projeto. O que está te separando dele são R$ 1.500, e isso não é frete — é o cliente achar que as duas propostas são a mesma coisa. <em>Ele te disse que era preço, ou você concluiu que era preço?</em>'],
         c: 'Nunca sugira que ele corte mão de obra. Ele já disse que faria, e concordar é assinar embaixo de uma obra mal executada — que volta como problema para os dois.' },
    6: { t: 'Não adianta falar de qualidade. Meu cliente só olha preço',
         p: 'É o que ele acredita depois de perder algumas obras seguidas. Quase sempre é conclusão, não constatação.',
         f: ['Alguns só olham preço mesmo, e esses você não vai ganhar comigo — nem deveria tentar, dá dor de cabeça e margem zero.<br><br>Mas deixa eu te perguntar: <em>as duas propostas que o cliente comparou eram parecidas na aparência?</em> Quando as duas dizem "10 kWp, tantos módulos, instalado", o cliente não tem outra coisa pra olhar além do preço. Não é que ele só olhe preço — é que ninguém deu outra coisa pra ele olhar.<br><br><em>Sua proposta mostra qual estrutura vai no telhado dele e qual a garantia dela?</em> A nossa é a mais bem avaliada do mercado, e isso se coloca na proposta em uma linha. <em>Quer que eu te mande o que dá pra destacar?</em>'],
         q: 'Não briga com a crença dele, isola a parte falsa. E termina oferecendo ajuda concreta na venda dele.' },
    7: { t: 'Meu concorrente vende abaixo do meu custo',
         p: 'Ou o rival compra um kit diferente, ou trabalha com margem que não se sustenta. Nenhuma das duas é o seu frete.',
         f: ['Se ele vende abaixo do seu custo, uma de duas coisas está acontecendo: <em>ou o kit dele não é o mesmo que o seu, ou ele está trabalhando de graça pra pegar mercado.</em><br><br>A segunda se resolve sozinha, é questão de tempo. A primeira você precisa saber. <em>Você já viu a proposta dele?</em> Qual inversor, qual estrutura, quantos anos de garantia, tem monitoramento?<br><br>Me manda o que conseguir que eu comparo item por item com o kit que eu te ofereço. Se ele estiver entregando a mesma coisa mais barato, eu quero saber — é problema meu resolver. <em>Mas se não for a mesma coisa, aí você tem o que mostrar pro cliente. Consegue me passar?</em>'],
         q: 'Transforma a derrota numa investigação conjunta. Quando o kit rival é inferior, o integrador ganha o argumento de que precisava.' },
    8: { t: 'Demora muito. O concorrente entrega em dois dias',
         p: 'Medo de obra parada, não pressa em si.',
         f: ['É real, não vou vender ilusão: até <em>{CIDADE}</em> são <span class="rt-fill">tantos</span> dias. Contra dois dias eu não compito, e não vou fingir que compito. Então eu trabalho diferente: <em>o que é previsível a gente programa.</em> Sua obra você fecha com 15, 20 dias de antecedência — esse volume vem comigo com folga e condição melhor. Emergência você resolve aí mesmo, e eu não vou brigar por isso. <em>O que você já tem fechado pra daqui 20, 30 dias?</em>'] },
    9: { t: 'Eles têm CD aqui. Vocês estão em São Paulo',
         p: 'Ele acha que localização decide tudo.',
         f: ['Têm, e é uma vantagem real. Só que aparece um detalhe quando você mais precisa: <em>CD perto com estoque pequeno resolve o pequeno e trava o grande.</em> Você mesmo já me procurou por causa de material que faltou lá. A distância é deles. <em>O estoque é meu.</em> O ideal não é escolher um — é saber qual usar em cada situação. <em>Quantas vezes esse ano você ficou na mão por falta de material?</em>'] },
    10: { t: 'O preço de vocês é mais alto',
          p: 'Nunca responda preço com preço: você perde ou destrói margem.',
          f: ['É, e não vou fingir que não é. <em>Nossa política nunca foi ser o mais barato</em> — é ser o mais completo. Quem compete só por preço corta de algum lugar: estoque, engenharia, pós-venda, qualidade de estrutura. A gente escolheu não cortar. <em>Quando dá problema numa obra sua, quanto tempo você leva pra resolver com o fornecedor mais barato?</em>'] },
    11: { t: 'Me manda a lista de preços que eu comparo',
          p: 'Ele quer usar sua tabela para pressionar o outro fornecedor.',
          f: ['Mando. Só que lista solta engana, porque você compara item por item e esquece o resto. <em>Me passa o projeto</em> — potência, tipo de estrutura, prazo — que eu te devolvo o fechado: material, estrutura, frete e condição, tudo junto. Aí a comparação é justa. <em>Qual projeto eu pego pra te mostrar?</em>'] },
    12: { t: 'Já tenho fornecedor e estou satisfeito',
          p: 'Trocar fornecedor bom é besteira, e ele sabe. Não peça isso.',
          f: ['Que bom, e nem vim pedir pra trocar. <em>Vim pra ser o segundo.</em> Todo integrador que roda sério tem dois, porque um dia falta, um dia atrasa, um dia o preço não fecha. Só quero estar ativo pra quando isso acontecer você não perder a obra. <em>Posso te manter cadastrado e avisar quando tiver algo que valha a pena?</em>'],
          q: 'Pedir o segundo lugar tem taxa de aceitação altíssima — e o segundo vira primeiro quando o primeiro falha.' },
    13: { t: 'Só compro de vocês quando falta material lá',
          p: 'Não é objeção, é abertura. O cenário mais importante da operação do Norte.',
          f: ['Exatamente, e é por isso que estou te ligando. <em>Você já me usa como garantia</em> — só que sempre no pior momento: obra parada, correndo, pagando urgência. Eu fico com a parte ruim e você com o prejuízo.<br><br>Minha proposta é inverter. <em>Me dá um item fixo do seu mês</em>, aquele que você mais gira e que nunca pode faltar. Esse vem comigo programado. O resto você compra onde quiser. Se em três meses eu não provar que vale, você me tira e não perdeu nada. <em>Qual item é esse na sua operação?</em>'],
          q: 'Vira o comprador de emergência em comprador recorrente, sem pedir exclusividade nem brigar por preço.' },
    14: { t: 'Tive problema com vocês uma vez',
          p: 'Nunca defenda a empresa antes de ouvir. É o erro que mata a ligação.',
          f: ['Me conta o que aconteceu, com data se você lembrar.',
              '<span class="rt-nota">(ouvir até o fim, sem interromper, sem justificar)</span>',
              'Certo. Não vou tentar explicar o que não tem explicação. Vou levantar esse caso e te retornar <span class="rt-fill">até quando você puder cumprir</span> com o que aconteceu e o que mudou. <em>Se eu te retornar com a resposta, você me dá uma chance de cotar a próxima obra?</em>'],
          c: 'Só prometa retorno se for retornar. Aqui a venda não é o pedido, é recuperar o direito de ligar de novo.' },
    15: { t: 'Nunca ouvi falar de vocês',
          p: 'Não é desprezo, é falta de referência.',
          f: ['Somos a <em>maior distribuidora do Brasil</em>, e reconhecida na <span class="rt-fill">pesquisa, categoria e ano</span>. Não falo pra impressionar, falo por um motivo prático: <em>tamanho de distribuidor vira estoque na hora que falta.</em> É a única coisa que não dá pra improvisar. E não somos só kit fotovoltaico — tem estrutura de fixação com a melhor avaliação do mercado, engenharia e pós-venda. <em>Que tipo de projeto vocês tocam hoje, pra eu mostrar só o que interessa?</em>'],
          c: 'Cite o prêmio com nome, categoria e ano. "Somos os melhores" não convence; o primeiro lugar numa categoria e num ano convence.' },
    16: { t: 'Agora não estou comprando. O movimento caiu',
          p: 'Adiamento honesto. Não force a venda de hoje.',
          f: ['Entendo, e está geral, não é só vocês. Por isso mesmo não vim vender agora — <em>vim pra estar pronto quando voltar.</em> Deixa eu deixar o cadastro em dia e a tabela atualizada, pra quando a obra aparecer vocês não perderem três dias resolvendo burocracia. <em>Quando você acha que o movimento volta aí na sua região?</em>'] },
    17: { t: 'Me manda no WhatsApp que eu vejo depois',
          p: 'Fuga educada. Aceite e transforme em qualificação.',
          f: ['Mando agora. Só me responde uma coisa antes, pra eu mandar a coisa certa: <em>você está com obra em andamento ou cotando pra fechar?</em> Se for cotação eu mando preço, se for obra andando eu mando prazo. Mandando os dois você não lê nenhum. <em>Qual dos dois?</em>'] }
  };

  var CONTA =
    '<div class="rt-etapa">A conta que ele faz junto com o cliente</div>' +
    '<div class="rt-contawrap"><table>' +
    '<thead><tr><th>Projeto 10 kWp</th><th class="num">Concorrente</th><th class="num">BelEnergy</th></tr></thead>' +
    '<tbody>' +
    '<tr><td>Kit</td><td class="num">R$ 22.000</td><td class="num">R$ 21.500</td></tr>' +
    '<tr><td>Frete</td><td class="num">R$ 600</td><td class="num">R$ 1.900</td></tr>' +
    '<tr><td><b>Custo do kit</b></td><td class="num"><b>R$ 22.600</b></td><td class="num"><b>R$ 23.400</b></td></tr>' +
    '</tbody></table></div>' +
    '<div class="rt-gap">Diferença do kit: <span class="rt-bom">R$ 800</span><br>' +
    'Proposta dele: R$ 40.000<br>Proposta do rival: R$ 38.500<br>' +
    'Distância a cobrir: <span class="rt-ruim">R$ 1.500</span></div>' +
    '<p class="rt-porque"><b>O argumento inteiro está aí:</b> R$ 800 de frete não explicam um gap de ' +
    'R$ 1.500. Mesmo tirando os R$ 800 da mão de obra, ele continua R$ 700 mais caro — e com menos ' +
    'margem para executar. Os valores são um exemplo: use os números da obra dele.</p>';

  /* ---------- preencher as marcas ---------- */

  var VAZIO = {
    '{CLIENTE}': 'o cliente',
    '{CIDADE}': 'a cidade',
    '{ULTIMA}': 'a data da última compra',
    '{DIAS}': 'o tempo parado',
    '{PEDIDOS}': 'tantos',
    '{VALOR}': 'o valor'
  };

  function preencher(txt) {
    return String(txt).replace(/\{(CLIENTE|CIDADE|ULTIMA|DIAS|PEDIDOS|VALOR)\}/g, function (marca) {
      if (atual && atual[marca]) return rtEsc(atual[marca]);
      return '<span class="rt-fill">' + VAZIO[marca] + '</span>';
    });
  }

  /* ---------- ler o cliente da linha da tabela ---------- */

  function acharCol(colunas, re) {
    for (var i = 0; i < colunas.length; i++) if (re.test(colunas[i])) return colunas[i];
    return null;
  }

  /* "CLI-0000000123 - SOLAR NORTE LTDA" -> "SOLAR NORTE LTDA" */
  function nomeCurto(v) {
    var s = String(v == null ? '' : v).trim();
    var m = s.match(/^CLI[-\s]?\d+\s*[-–]\s*(.+)$/i);
    return (m ? m[1] : s).trim();
  }

  /* Datas chegam como "dd/mm/aaaa" -- e o formato que o leitor de xlsx
     produz. Qualquer outra coisa devolve null em vez de um numero errado. */
  function diasDesde(txt) {
    var m = String(txt == null ? '' : txt).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    var d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (isNaN(d.getTime())) return null;
    var dias = Math.floor((Date.now() - d.getTime()) / 86400000);
    return dias >= 0 && dias < 36500 ? dias : null;
  }

  function textoDias(n) {
    if (n === null) return null;
    if (n < 45) return n + ' dias';
    var meses = Math.round(n / 30);
    return meses + (meses === 1 ? ' mês' : ' meses');
  }

  function daLinha(linha, colunas, modo) {
    var cNome = acharCol(colunas, /integrador/i);
    var cCidade = acharCol(colunas, /^cidade$/i);
    var cUltima = acharCol(colunas, /última nota|ultima nota/i);
    var cPedidos = acharCol(colunas, /pedido/i);
    var cValor = acharCol(colunas, /valor|faturad/i);

    // moeda() e inteiro() vivem em carteira.js e sao a unica leitura de
    // numero desta pagina. Ler aqui por conta propria foi o que produziu
    // R$ 9.586.270.100.000.000 no lugar de R$ 958.627.
    var dias = cUltima ? diasDesde(linha[cUltima]) : null;

    return {
      rotulo: cNome ? nomeCurto(linha[cNome]) : '',
      // Mesma chave que carteira.js usa para guardar as anotacoes: o codigo
      // CLI quando existe. Se as duas divergirem, o caderno do cliente some.
      cliente: chaveCliente(linha, colunas),
      modo: modo,
      '{CLIENTE}': cNome ? nomeCurto(linha[cNome]) : '',
      '{CIDADE}': cCidade ? String(linha[cCidade] || '').trim() : '',
      '{ULTIMA}': cUltima ? String(linha[cUltima] || '').trim() : '',
      '{DIAS}': textoDias(dias),
      '{PEDIDOS}': cPedidos ? inteiro(linha[cPedidos]) : null,
      '{VALOR}': cValor ? moeda(linha[cValor]) : null
    };
  }

  /* ---------- desenhar ---------- */

  function html() {
    return '<section class="panel rt-painel">' +
        '<div class="panel-head">' +
          '<h3>Roteiro de ligação</h3>' +
          '<span class="rt-conta-itens">6 aberturas · 17 objeções</span>' +
        '</div>' +
        '<div id="rtEscolhido"></div>' +
        '<div class="rt-tabs" role="tablist">' +
          '<button class="rt-tab" role="tab" aria-selected="true" data-rtaba="abrir">Como abrir</button>' +
          '<button class="rt-tab" role="tab" aria-selected="false" data-rtaba="obj">Se ele disser que…</button>' +
          '<button class="rt-tab" role="tab" aria-selected="false" data-rtaba="notas" id="rtTabNotas">Anotações</button>' +
        '</div>' +
        '<div id="rtAbrir">' +
          '<div class="rt-seg" role="group" aria-label="Tipo de lista">' +
            '<button data-rttipo="normal" aria-pressed="true">Prospecção</button>' +
            '<button data-rttipo="carteira" aria-pressed="false">Sem compras</button>' +
          '</div>' +
          '<div id="rtCards"></div>' +
        '</div>' +
        '<div id="rtObj" hidden>' +
          '<input class="rt-busca" id="rtBusca" type="search" ' +
            'placeholder="frete, preço, concorrente, prazo…" ' +
            'aria-label="Buscar objeção">' +
          '<div id="rtObjs"></div>' +
          '<p class="empty" id="rtSemResultado" hidden>Nada encontrado. Tente outra palavra.</p>' +
          '<div class="rt-ia" id="rtIa" hidden>' +
            '<div class="rt-ia-topo">' +
              '<span class="rt-ia-nome">Não achou?</span>' +
              '<span class="rt-ia-selo">Pergunte à IA</span>' +
            '</div>' +
            '<p class="rt-ia-dica" id="rtIaDica">Escreva o que o cliente falou, com as palavras dele.</p>' +
            '<textarea class="rt-ia-txt" id="rtIaTxt" maxlength="600" rows="3" ' +
              'placeholder="Ex.: ele disse que o filho é engenheiro e vai fazer o projeto sozinho…"></textarea>' +
            '<div class="btn-row" style="margin-top:10px">' +
              '<button class="btn btn-sm rt-btn-ia" id="rtIaPerguntar">Perguntar</button>' +
              '<span class="rt-ia-conta" id="rtIaConta"></span>' +
            '</div>' +
            '<div id="rtIaSaida"></div>' +
          '</div>' +
        '</div>' +
        '<div id="rtNotas" hidden></div>' +
      '</section>';
  }

  function el(t, cls, inner) {
    var e = document.createElement(t);
    if (cls) e.className = cls;
    if (inner != null) e.innerHTML = inner;
    return e;
  }

  function copiar(txt, botao) {
    var limpo = String(txt).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
    var antes = botao.textContent;
    function pronto() {
      botao.textContent = 'Copiado';
      setTimeout(function () { botao.textContent = antes; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(limpo).then(pronto, pronto);
    } else {
      pronto();
    }
  }

  function desenharEscolhido() {
    var alvo = document.getElementById('rtEscolhido');
    if (!alvo) return;
    if (!atual) {
      alvo.innerHTML = '<p class="rt-dica">Clique num cliente da lista para o roteiro ' +
        'usar os dados dele — data da última compra, cidade e histórico entram na fala.</p>';
      return;
    }
    var partes = [];
    if (atual['{CIDADE}']) partes.push(rtEsc(atual['{CIDADE}']));
    if (atual['{ULTIMA}']) {
      partes.push('última compra <b>' + rtEsc(atual['{ULTIMA}']) + '</b>' +
        (atual['{DIAS}'] ? ' · parado há <b>' + rtEsc(atual['{DIAS}']) + '</b>' : ''));
    }
    if (atual['{PEDIDOS}']) partes.push('<b>' + rtEsc(atual['{PEDIDOS}']) + '</b> pedidos');
    if (atual['{VALOR}']) partes.push('<b>' + rtEsc(atual['{VALOR}']) + '</b>');

    alvo.innerHTML = '<div class="rt-escolhido">' +
      '<div class="rt-quem">' + rtEsc(atual.rotulo) + '</div>' +
      (partes.length ? '<div class="rt-dados">' + partes.join('<br>') + '</div>' : '') +
      '</div>';
  }

  function desenharCards() {
    var alvo = document.getElementById('rtCards');
    if (!alvo) return;
    alvo.innerHTML = '';
    ABERTURAS[tipo].forEach(function (a) {
      var texto = preencher(a.fala());
      var card = el('div', 'rt-card');
      card.appendChild(el('div', 'rt-nome', rtEsc(a.nome)));
      card.appendChild(el('div', 'rt-fala', texto));
      card.appendChild(el('p', 'rt-porque', rtEsc(a.porque)));
      var linha = el('div', 'btn-row');
      var b = el('button', 'btn btn-sm btn-ghost', 'Copiar');
      b.addEventListener('click', function () { copiar(texto, b); });
      linha.appendChild(b);
      card.appendChild(linha);
      alvo.appendChild(card);
    });
  }

  function desenharObjs(filtro) {
    var alvo = document.getElementById('rtObjs');
    if (!alvo) return;
    alvo.innerHTML = '';
    var f = String(filtro || '').trim().toLowerCase();
    var achou = 0;

    GRUPOS.forEach(function (g) {
      var itens = g.itens.filter(function (n) {
        if (!f) return true;
        var o = OBJ[n];
        var tudo = n + ' ' + o.t + ' ' + o.p + ' ' + o.f.join(' ') + ' ' + (o.f2 || []).join(' ');
        return tudo.toLowerCase().indexOf(f) > -1;
      });
      if (!itens.length) return;
      achou += itens.length;
      alvo.appendChild(el('div', 'rt-grupo', rtEsc(g.titulo)));

      itens.forEach(function (n) {
        var o = OBJ[n];
        var caixa = el('div', 'rt-obj');
        if (f) caixa.setAttribute('data-aberto', '1');

        var topo = el('button', 'rt-obj-topo');
        topo.setAttribute('aria-expanded', f ? 'true' : 'false');
        topo.appendChild(el('span', 'rt-n', String(n)));
        topo.appendChild(el('span', 'rt-obj-txt', '&ldquo;' + rtEsc(o.t) + '&rdquo;'));
        topo.appendChild(el('span', 'rt-seta', '&#9654;'));
        topo.addEventListener('click', function () {
          var aberto = caixa.getAttribute('data-aberto') === '1';
          caixa.setAttribute('data-aberto', aberto ? '0' : '1');
          topo.setAttribute('aria-expanded', aberto ? 'false' : 'true');
        });

        var corpo = el('div', 'rt-obj-corpo');
        corpo.appendChild(el('p', 'rt-portras', '<b>Por trás disso:</b> ' + rtEsc(o.p)));
        corpo.appendChild(el('div', 'rt-etapa', 'O que dizer'));
        o.f.forEach(function (t) { corpo.appendChild(el('div', 'rt-fala', preencher(t))); });
        if (o.conta) corpo.appendChild(el('div', null, CONTA));
        if (o.f2) {
          corpo.appendChild(el('div', 'rt-etapa', 'Se ele insistir'));
          o.f2.forEach(function (t) { corpo.appendChild(el('div', 'rt-fala', preencher(t))); });
        }
        if (o.q) corpo.appendChild(el('p', 'rt-porque', '<b>Por que funciona:</b> ' + rtEsc(o.q)));
        if (o.c) corpo.appendChild(el('div', 'rt-cuidado', '<b>Cuidado:</b> ' + rtEsc(o.c)));

        var linha = el('div', 'btn-row');
        linha.style.marginTop = '12px';
        var b = el('button', 'btn btn-sm btn-ghost', 'Copiar resposta');
        b.addEventListener('click', function () { copiar(preencher(o.f.join('\n\n')), b); });
        linha.appendChild(b);
        corpo.appendChild(linha);

        caixa.appendChild(topo);
        caixa.appendChild(corpo);
        alvo.appendChild(caixa);
      });
    });

    var vazio = document.getElementById('rtSemResultado');
    if (vazio) vazio.hidden = achou > 0;
  }

  function trocarTipo(novo) {
    if (tipo === novo) return;
    tipo = novo;
    var botoes = document.querySelectorAll('[data-rttipo]');
    for (var i = 0; i < botoes.length; i++) {
      botoes[i].setAttribute('aria-pressed',
        botoes[i].getAttribute('data-rttipo') === novo ? 'true' : 'false');
    }
    desenharCards();
  }

  /* ---------- anotacoes ----------
     O painel nao guarda nada: pede tudo ao dono (carteira.js), que fala com
     o servidor. Aqui so existe o desenho e o que o vendedor digitou. */

  var ponte = {};   // funcoes injetadas por carteira.js

  function hojeBR() {
    var h = new Date();
    return String(h.getDate()).padStart(2, '0') + '/' +
           String(h.getMonth() + 1).padStart(2, '0') + '/' + h.getFullYear();
  }

  function trocarAba(qual) {
    var abas = document.querySelectorAll('[data-rtaba]');
    for (var k = 0; k < abas.length; k++) {
      abas[k].setAttribute('aria-selected',
        abas[k].getAttribute('data-rtaba') === qual ? 'true' : 'false');
    }
    document.getElementById('rtAbrir').hidden = qual !== 'abrir';
    document.getElementById('rtObj').hidden = qual !== 'obj';
    document.getElementById('rtNotas').hidden = qual !== 'notas';
  }

  function contarNotas() {
    var t = document.getElementById('rtTabNotas');
    if (!t) return;
    var n = (atual && ponte.notasDe) ? ponte.notasDe(atual.cliente).length : 0;
    t.innerHTML = 'Anotações' + (n ? '<span class="rt-pip">' + n + '</span>' : '');
  }

  function desenharNotas() {
    var alvo = document.getElementById('rtNotas');
    if (!alvo) return;
    alvo.innerHTML = '';

    if (!atual || !atual.cliente) {
      alvo.appendChild(el('p', 'rt-dica',
        'Escolha um cliente na lista para ver e escrever anotações.'));
      return;
    }

    var cliente = atual.cliente;
    var lista = ponte.notasDe ? ponte.notasDe(cliente) : [];

    if (!lista.length) {
      alvo.appendChild(el('p', 'rt-notas-vazio',
        'Nenhuma anotação sua para este cliente ainda. Escreva a primeira abaixo.'));
    }

    var tabela = el('table', 'rt-notas',
      '<thead><tr><th style="width:96px">Data</th><th>Anotação</th><th style="width:34px"></th></tr></thead>');
    var corpo = document.createElement('tbody');

    // Mais recente primeiro: e a conversa que interessa antes de ligar.
    lista.slice().reverse().forEach(function (n, ordem) {
      var indice = lista.length - 1 - ordem;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="dt"><input class="rt-nota-data" value="' + rtEsc(n.data) + '"></td>' +
        '<td><textarea class="rt-nota-txt" rows="2">' + rtEsc(n.texto) + '</textarea></td>' +
        '<td><button class="rt-apagar" title="Apagar esta anotação" aria-label="Apagar">✕</button></td>';

      var campoData = tr.querySelector('.rt-nota-data');
      var campoTxt = tr.querySelector('.rt-nota-txt');
      var original = { data: n.data, texto: n.texto };

      function guardar() {
        var d = campoData.value.trim(), t = campoTxt.value.trim();
        if (!t) { campoTxt.value = original.texto; return; }
        if (d === original.data && t === original.texto) return;
        campoTxt.disabled = campoData.disabled = true;
        ponte.editarNota(cliente, indice, d, t).then(function () {
          original = { data: d, texto: t };
          campoTxt.disabled = campoData.disabled = false;
          avisar(tr, 'salvo');
        }, function () {
          campoData.value = original.data; campoTxt.value = original.texto;
          campoTxt.disabled = campoData.disabled = false;
          avisar(tr, 'não salvou');
        });
      }
      campoTxt.addEventListener('blur', guardar);
      campoData.addEventListener('blur', guardar);

      tr.querySelector('.rt-apagar').addEventListener('click', function () {
        if (!window.confirm('Apagar esta anotação?')) return;
        ponte.apagarNota(cliente, indice).then(function () {
          desenharNotas(); contarNotas();
        }, function () { avisar(tr, 'não apagou'); });
      });

      corpo.appendChild(tr);
    });

    // Linha em branco, sempre pronta para a proxima conversa.
    var nova = document.createElement('tr');
    nova.setAttribute('data-rtnova', '1');
    nova.innerHTML =
      '<td class="dt"><input class="rt-nota-data" value="' + hojeBR() + '"></td>' +
      '<td><textarea class="rt-nota-txt" rows="2" placeholder="O que aconteceu nessa conversa…"></textarea></td>' +
      '<td></td>';
    corpo.appendChild(nova);
    tabela.appendChild(corpo);
    alvo.appendChild(tabela);

    var linha = el('div', 'btn-row');
    linha.style.marginTop = '14px';
    var salvar = el('button', 'btn btn-sm btn-primary', 'Salvar anotação');
    var recado = el('span', 'rt-salvo', '');
    salvar.addEventListener('click', function () {
      var t = nova.querySelector('.rt-nota-txt').value.trim();
      var d = nova.querySelector('.rt-nota-data').value.trim();
      if (!t) { recado.textContent = 'Escreva alguma coisa antes de salvar.'; return; }
      salvar.disabled = true;
      recado.textContent = 'salvando…';
      ponte.salvarNota(cliente, d, t).then(function () {
        salvar.disabled = false;
        desenharNotas(); contarNotas();
      }, function (e) {
        salvar.disabled = false;
        recado.textContent = (e && e.message) || 'Não consegui salvar.';
      });
    });
    linha.append(salvar, recado);
    alvo.appendChild(linha);

    alvo.appendChild(el('div', 'rt-privado',
      '<b>Só você vê isto.</b> Suas anotações não aparecem para nenhum outro vendedor, ' +
      'nem para o seu gestor. Ficam guardadas com o seu nome e o código do cliente: se ele ' +
      'passar para outro vendedor numa próxima distribuição, o que você escreveu não vai ' +
      'junto — e se voltar para você, tudo reaparece.'));
  }

  function avisar(tr, texto) {
    var marca = tr.querySelector('.rt-salvo-linha');
    if (!marca) {
      marca = el('span', 'rt-salvo-linha', '');
      tr.querySelector('td:nth-child(2)').appendChild(marca);
    }
    marca.textContent = texto;
    setTimeout(function () { if (marca) marca.textContent = ''; }, 1800);
  }

  /* ---------- pergunta a IA ---------- */

  function desenharSaldo(dados) {
    var conta = document.getElementById('rtIaConta');
    var bloco = document.getElementById('rtIa');
    if (!conta || !bloco) return;
    if (!dados || !dados.ligado) { bloco.hidden = true; return; }
    bloco.hidden = false;
    var restam = Number(dados.restantes) || 0;
    conta.textContent = restam + ' de ' + dados.limite + ' perguntas restantes hoje';
    conta.setAttribute('data-baixo', restam <= 3 ? '1' : '0');
    document.getElementById('rtIaPerguntar').disabled = restam <= 0;
  }

  function desenharResposta(r, restantes) {
    var saida = document.getElementById('rtIaSaida');
    saida.innerHTML = '';
    var cx = el('div', 'rt-ia-resposta');
    cx.appendChild(el('div', 'rt-etapa', 'Por trás disso'));
    cx.appendChild(el('p', 'rt-portras', rtEsc(r.porTras)));
    cx.appendChild(el('div', 'rt-etapa', 'O que dizer'));
    cx.appendChild(el('div', 'rt-fala', rtEsc(r.fala)));
    if (r.porQue) {
      cx.appendChild(el('div', 'rt-etapa', 'Por que funciona'));
      cx.appendChild(el('p', 'rt-porque', rtEsc(r.porQue)));
    }
    if (r.cuidado) cx.appendChild(el('div', 'rt-cuidado', '<b>Cuidado:</b> ' + rtEsc(r.cuidado)));

    var linha = el('div', 'btn-row');
    linha.style.marginTop = '12px';
    var b = el('button', 'btn btn-sm btn-ghost', 'Copiar resposta');
    b.addEventListener('click', function () { copiar(r.fala, b); });
    linha.appendChild(b);
    cx.appendChild(linha);

    cx.appendChild(el('p', 'rt-rodape-ia',
      'Resposta gerada agora. <strong>Ela não sabe preço, prazo, estoque nem condição do ' +
      'mês</strong> — quando a pergunta depende disso, manda confirmar com o gestor.'));

    if (restantes === 0) {
      cx.appendChild(el('div', 'rt-cuidado',
        '<b>Acabaram suas perguntas de hoje.</b> Volta amanhã. Os 17 cenários prontos e a ' +
        'busca continuam funcionando.'));
    }
    saida.appendChild(cx);
  }

  function perguntar() {
    var campo = document.getElementById('rtIaTxt');
    var botao = document.getElementById('rtIaPerguntar');
    var saida = document.getElementById('rtIaSaida');
    var texto = campo.value.trim();
    if (texto.length < 5) { campo.focus(); return; }

    botao.disabled = true;
    saida.innerHTML = '';
    saida.appendChild(el('div', 'rt-pensando',
      '<span class="rt-ponto"></span><span class="rt-ponto"></span>' +
      '<span class="rt-ponto"></span><span>Pensando na melhor resposta…</span>'));

    ponte.perguntarIa('perguntar', texto).then(function (dados) {
      botao.disabled = false;
      desenharResposta(dados.resposta, dados.restantes);
      var conta = document.getElementById('rtIaConta');
      if (conta && typeof dados.restantes === 'number') {
        conta.textContent = dados.restantes + ' perguntas restantes hoje';
        conta.setAttribute('data-baixo', dados.restantes <= 3 ? '1' : '0');
        botao.disabled = dados.restantes <= 0;
      }
    }, function (e) {
      botao.disabled = false;
      saida.innerHTML = '';
      saida.appendChild(el('div', 'rt-cuidado', rtEsc((e && e.message) || 'Não consegui responder.')));
    });
  }

  /* ---------- API ---------- */

  return {
    html: html,
    daLinha: daLinha,
    abrirNotas: function () { trocarAba('notas'); },

    saldoIa: function () {
      if (!ponte.perguntarIa) return;
      ponte.perguntarIa('saldo').then(desenharSaldo, function () {
        var bloco = document.getElementById('rtIa');
        if (bloco) bloco.hidden = true;
      });
    },

    iniciar: function (nomeVendedor, funcoes) {
      VEND = String(nomeVendedor || '').trim();
      ponte = funcoes || {};

      var abas = document.querySelectorAll('[data-rtaba]');
      for (var i = 0; i < abas.length; i++) {
        abas[i].addEventListener('click', function () {
          trocarAba(this.getAttribute('data-rtaba'));
        });
      }

      var perguntarBtn = document.getElementById('rtIaPerguntar');
      if (perguntarBtn) perguntarBtn.addEventListener('click', perguntar);

      var segs = document.querySelectorAll('[data-rttipo]');
      for (var j = 0; j < segs.length; j++) {
        segs[j].addEventListener('click', function () {
          trocarTipo(this.getAttribute('data-rttipo'));
        });
      }

      var busca = document.getElementById('rtBusca');
      if (busca) {
        busca.addEventListener('input', function () { desenharObjs(this.value); });
      }

      desenharEscolhido();
      desenharCards();
      desenharObjs('');
      desenharNotas();
      contarNotas();
    },

    /* Cliente escolhido na tabela: as falas passam a usar os dados dele, e o
       conjunto de aberturas segue o tipo da lista de onde ele veio. */
    selecionar: function (cliente) {
      atual = cliente;
      if (cliente && cliente.modo && ABERTURAS[cliente.modo]) trocarTipo(cliente.modo);
      desenharEscolhido();
      desenharCards();
      var busca = document.getElementById('rtBusca');
      desenharObjs(busca ? busca.value : '');
      desenharNotas();
      contarNotas();
    }
  };
})();
