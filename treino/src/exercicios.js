/* O catalogo. Todo o resto do app e conta em cima desta lista.
 *
 * Cada exercicio carrega o que o montador precisa para decidir se ele cabe
 * no treino de hoje:
 *
 *   grupo       inferior | superior | core | corpo-todo
 *   padrao      o movimento por baixo do nome. Dois exercicios do mesmo
 *               padrao cansam a mesma coisa, entao o montador nunca poe um
 *               atras do outro: agachamento e afundo sao nomes diferentes
 *               para pernas cansadas do mesmo jeito.
 *   equipamento o que precisa ter em casa. Lista vazia = peso do corpo.
 *   impacto     'alto' e tudo que sai do chao ou faz barulho. Quem treina
 *               em apartamento as 6h da manha desliga isso nos Ajustes, e
 *               nao pode sobrar nenhum polichinelo no treino.
 *   nivel       1 comeco, 2 ja treina, 3 pesado.
 *   unilateral  um lado de cada vez. O cronometro parte o tempo no meio e
 *               avisa a troca — sem isso a pessoa faz 40 s de perna direita
 *               e esquece a esquerda.
 *
 * As dicas nao sao enfeite: sao o que um professor falaria em voz alta na
 * hora, e aparecem na tela grande durante a serie. Por isso sao curtas — a
 * pessoa esta ofegante, nao vai ler paragrafo.
 */

const PADROES = {
  agachar: 'Agachar',
  dobradica: 'Dobradiça',
  avancar: 'Avançar',
  empurrar: 'Empurrar',
  puxar: 'Puxar',
  girar: 'Girar',
  sustentar: 'Sustentar',
  deslocar: 'Deslocar',
};

const EQUIPAMENTOS = {
  halter: 'Halteres',
  kettlebell: 'Kettlebell',
  elastico: 'Elástico',
  caixa: 'Caixa ou degrau',
  corda: 'Corda de pular',
  barra: 'Barra fixa',
  bola: 'Bola',
};

const GRUPOS = {
  inferior: 'Pernas e glúteos',
  superior: 'Braços, peito e costas',
  core: 'Abdômen e lombar',
  'corpo-todo': 'Corpo todo',
};

/* tipo: 'principal' entra no circuito; 'aquecimento' e 'solta' so entram nas
   pontas do treino, e sempre em tempo curto. */
const LISTA = [
  /* ---------------------------- aquecimento --------------------------- */
  { id: 'trote-parado', nome: 'Trote parado', tipo: 'aquecimento', grupo: 'corpo-todo',
    padrao: 'deslocar', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['Pé leve, quase sem sair do chão', 'Ombro solto, respiração pelo nariz'] },
  { id: 'circulo-de-bracos', nome: 'Círculo de braços', tipo: 'aquecimento', grupo: 'superior',
    padrao: 'girar', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['Meia volta para frente, meia para trás', 'Braço esticado, sem forçar o ombro'] },
  { id: 'rotacao-de-tronco', nome: 'Rotação de tronco', tipo: 'aquecimento', grupo: 'core',
    padrao: 'girar', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['Quadril parado, só o tronco gira', 'Olhar acompanha o ombro'] },
  { id: 'gato-camelo', nome: 'Gato e camelo', tipo: 'aquecimento', grupo: 'core',
    padrao: 'sustentar', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['De quatro: solta a barriga, depois arredonda as costas', 'Devagar, no ritmo da respiração'] },
  { id: 'abertura-de-quadril', nome: 'Abertura de quadril', tipo: 'aquecimento', grupo: 'inferior',
    padrao: 'avancar', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['Passo longo à frente, mão no chão do lado do pé', 'Alterna os lados sem pressa'] },
  { id: 'agachamento-solto', nome: 'Agachamento solto', tipo: 'aquecimento', grupo: 'inferior',
    padrao: 'agachar', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['Meio agachamento, só para esquentar o joelho', 'Calcanhar no chão o tempo todo'] },
  { id: 'elevacao-de-joelho', nome: 'Elevação de joelho', tipo: 'aquecimento', grupo: 'corpo-todo',
    padrao: 'deslocar', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['Joelho na altura do quadril', 'Barriga firme para não arquear a lombar'] },
  { id: 'polichinelo-leve', nome: 'Polichinelo leve', tipo: 'aquecimento', grupo: 'corpo-todo',
    padrao: 'deslocar', equipamento: [], impacto: 'alto', nivel: 1,
    dicas: ['Ritmo de conversa, não de corrida', 'Joelho macio na aterrissagem'] },

  /* ------------------------------ agachar ----------------------------- */
  { id: 'agachamento-livre', nome: 'Agachamento livre', tipo: 'principal', grupo: 'inferior',
    padrao: 'agachar', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['Peito aberto, joelho na direção do pé', 'Desce até onde a lombar não arredonda'],
    dificulta: 'agachamento-goblet' },
  { id: 'agachamento-sumo', nome: 'Agachamento sumô', tipo: 'principal', grupo: 'inferior',
    padrao: 'agachar', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['Pés mais largos, ponta para fora', 'Empurra o chão para longe na subida'] },
  { id: 'agachamento-goblet', nome: 'Agachamento goblet', tipo: 'principal', grupo: 'inferior',
    padrao: 'agachar', equipamento: ['halter'], impacto: 'baixo', nivel: 2,
    dicas: ['Peso junto ao peito, cotovelo para baixo', 'O peso na frente é o que segura o tronco em pé'],
    facilita: 'agachamento-livre' },
  { id: 'agachamento-na-parede', nome: 'Cadeirinha na parede', tipo: 'principal', grupo: 'inferior',
    padrao: 'agachar', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['Coxa paralela ao chão, costas coladas', 'Não prende a respiração — conta em voz alta'] },
  { id: 'agachamento-bulgaro', nome: 'Agachamento búlgaro', tipo: 'principal', grupo: 'inferior',
    padrao: 'agachar', equipamento: ['caixa'], impacto: 'baixo', nivel: 3, unilateral: true,
    dicas: ['Pé de trás no apoio, peso todo na perna da frente', 'Desce em linha reta, sem jogar o corpo'],
    facilita: 'agachamento-livre' },
  { id: 'agachamento-com-salto', nome: 'Agachamento com salto', tipo: 'principal', grupo: 'inferior',
    padrao: 'agachar', equipamento: [], impacto: 'alto', nivel: 3,
    dicas: ['Aterrissa macio, joelho dobrando', 'Se o barulho aumentar, você parou de amortecer'],
    facilita: 'agachamento-livre' },

  /* ----------------------------- dobradica ---------------------------- */
  { id: 'ponte-de-gluteo', nome: 'Ponte de glúteo', tipo: 'principal', grupo: 'inferior',
    padrao: 'dobradica', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['Aperta o glúteo em cima e segura 1 segundo', 'Costela para baixo: quem sobe é o quadril'],
    dificulta: 'ponte-unilateral' },
  { id: 'ponte-unilateral', nome: 'Ponte com uma perna', tipo: 'principal', grupo: 'inferior',
    padrao: 'dobradica', equipamento: [], impacto: 'baixo', nivel: 2, unilateral: true,
    dicas: ['Quadril nivelado, sem cair para o lado', 'A perna solta fica parada no ar'],
    facilita: 'ponte-de-gluteo' },
  { id: 'bom-dia', nome: 'Bom dia', tipo: 'principal', grupo: 'inferior',
    padrao: 'dobradica', equipamento: [], impacto: 'baixo', nivel: 2,
    dicas: ['Joelho quase reto, quadril vai para trás', 'Costas retas o caminho inteiro'] },
  { id: 'terra-halter', nome: 'Levantamento terra com halteres', tipo: 'principal', grupo: 'inferior',
    padrao: 'dobradica', equipamento: ['halter'], impacto: 'baixo', nivel: 2,
    dicas: ['Peso raspando a perna', 'Sobe empurrando o chão, não puxando com a lombar'] },
  { id: 'stiff-unilateral', nome: 'Stiff em uma perna', tipo: 'principal', grupo: 'inferior',
    padrao: 'dobradica', equipamento: [], impacto: 'baixo', nivel: 3, unilateral: true,
    dicas: ['Perna livre vai para trás como contrapeso', 'Quadril fechado, sem abrir para o lado'],
    facilita: 'bom-dia' },
  { id: 'balanco-kettlebell', nome: 'Balanço com kettlebell', tipo: 'principal', grupo: 'corpo-todo',
    padrao: 'dobradica', equipamento: ['kettlebell'], impacto: 'baixo', nivel: 3,
    dicas: ['Quem joga o peso é o quadril, não o braço', 'Para na altura do peito e deixa voltar'] },

  /* ------------------------------ avancar ----------------------------- */
  { id: 'afundo-reverso', nome: 'Afundo para trás', tipo: 'principal', grupo: 'inferior',
    padrao: 'avancar', equipamento: [], impacto: 'baixo', nivel: 1, unilateral: true,
    dicas: ['Passo para trás é mais amigo do joelho', 'Tronco em pé, desce reto'],
    dificulta: 'afundo-alternado' },
  { id: 'afundo-alternado', nome: 'Afundo alternado', tipo: 'principal', grupo: 'inferior',
    padrao: 'avancar', equipamento: [], impacto: 'baixo', nivel: 2,
    dicas: ['Joelho de trás quase encosta no chão', 'Alterna a perna a cada repetição'],
    facilita: 'afundo-reverso' },
  { id: 'passada-lateral', nome: 'Passada lateral', tipo: 'principal', grupo: 'inferior',
    padrao: 'avancar', equipamento: [], impacto: 'baixo', nivel: 2,
    dicas: ['Passo largo para o lado, senta no quadril', 'A outra perna fica esticada'] },
  { id: 'subida-na-caixa', nome: 'Subida na caixa', tipo: 'principal', grupo: 'inferior',
    padrao: 'avancar', equipamento: ['caixa'], impacto: 'baixo', nivel: 2, unilateral: true,
    dicas: ['Sobe com a perna de cima, sem impulso do pé de baixo', 'Desce devagar — a descida é metade do exercício'] },
  { id: 'afundo-com-salto', nome: 'Afundo com salto', tipo: 'principal', grupo: 'inferior',
    padrao: 'avancar', equipamento: [], impacto: 'alto', nivel: 3,
    dicas: ['Troca a perna no ar', 'Aterrissa já na posição de baixo, amortecendo'],
    facilita: 'afundo-alternado' },

  /* ----------------------------- empurrar ----------------------------- */
  { id: 'flexao-inclinada', nome: 'Flexão inclinada', tipo: 'principal', grupo: 'superior',
    padrao: 'empurrar', equipamento: ['caixa'], impacto: 'baixo', nivel: 1,
    dicas: ['Mão apoiada em cima: quanto mais alto, mais fácil', 'Corpo reto da cabeça ao calcanhar'],
    dificulta: 'flexao-de-braco' },
  { id: 'flexao-de-braco', nome: 'Flexão de braço', tipo: 'principal', grupo: 'superior',
    padrao: 'empurrar', equipamento: [], impacto: 'baixo', nivel: 2,
    dicas: ['Cotovelo a 45°, não aberto em T', 'Barriga firme: o quadril não afunda'],
    facilita: 'flexao-inclinada', dificulta: 'flexao-diamante' },
  { id: 'flexao-diamante', nome: 'Flexão diamante', tipo: 'principal', grupo: 'superior',
    padrao: 'empurrar', equipamento: [], impacto: 'baixo', nivel: 3,
    dicas: ['Mãos juntas embaixo do peito', 'Cotovelo raspando o corpo'],
    facilita: 'flexao-de-braco' },
  { id: 'flexao-pike', nome: 'Flexão de ombro', tipo: 'principal', grupo: 'superior',
    padrao: 'empurrar', equipamento: [], impacto: 'baixo', nivel: 3,
    dicas: ['Quadril alto, corpo em V', 'Cabeça desce para a frente das mãos'] },
  { id: 'desenvolvimento-halter', nome: 'Desenvolvimento com halteres', tipo: 'principal', grupo: 'superior',
    padrao: 'empurrar', equipamento: ['halter'], impacto: 'baixo', nivel: 2,
    dicas: ['Empurra para cima sem arquear a lombar', 'Costela para baixo, glúteo apertado'] },
  { id: 'supino-no-chao', nome: 'Supino no chão', tipo: 'principal', grupo: 'superior',
    padrao: 'empurrar', equipamento: ['halter'], impacto: 'baixo', nivel: 2,
    dicas: ['Cotovelo encosta no chão e sobe', 'Pé firme, quadril no chão'] },

  /* ------------------------------- puxar ------------------------------ */
  { id: 'remada-elastico', nome: 'Remada com elástico', tipo: 'principal', grupo: 'superior',
    padrao: 'puxar', equipamento: ['elastico'], impacto: 'baixo', nivel: 1,
    dicas: ['Puxa levando o cotovelo para trás', 'Junta as escápulas no fim do movimento'] },
  { id: 'abre-elastico', nome: 'Abertura com elástico', tipo: 'principal', grupo: 'superior',
    padrao: 'puxar', equipamento: ['elastico'], impacto: 'baixo', nivel: 1,
    dicas: ['Braço na altura do ombro, abre até formar um T', 'Ombro longe da orelha'] },
  { id: 'remada-serrote', nome: 'Remada serrote', tipo: 'principal', grupo: 'superior',
    padrao: 'puxar', equipamento: ['halter'], impacto: 'baixo', nivel: 2, unilateral: true,
    dicas: ['Uma mão apoiada, costas paralelas ao chão', 'Puxa o peso até o quadril, sem girar o tronco'] },
  { id: 'remada-curvada', nome: 'Remada curvada', tipo: 'principal', grupo: 'superior',
    padrao: 'puxar', equipamento: ['halter'], impacto: 'baixo', nivel: 2,
    dicas: ['Quadril para trás, costas retas', 'Desce o peso devagar'] },
  { id: 'remada-invertida', nome: 'Remada invertida', tipo: 'principal', grupo: 'superior',
    padrao: 'puxar', equipamento: ['barra'], impacto: 'baixo', nivel: 2,
    dicas: ['Corpo reto embaixo da barra, peito toca a barra', 'Quanto mais deitado, mais pesado'],
    dificulta: 'barra-fixa' },
  { id: 'barra-fixa', nome: 'Barra fixa', tipo: 'principal', grupo: 'superior',
    padrao: 'puxar', equipamento: ['barra'], impacto: 'baixo', nivel: 3,
    dicas: ['Começa puxando o ombro para baixo, depois dobra o cotovelo', 'Desce controlado até esticar'],
    facilita: 'remada-invertida' },

  /* ------------------------- core e sustentar ------------------------- */
  { id: 'prancha', nome: 'Prancha', tipo: 'principal', grupo: 'core',
    padrao: 'sustentar', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['Cotovelo embaixo do ombro, corpo em linha', 'Aperta glúteo e barriga — não é descanso'],
    dificulta: 'prancha-toque-no-ombro' },
  { id: 'prancha-toque-no-ombro', nome: 'Prancha com toque no ombro', tipo: 'principal', grupo: 'core',
    padrao: 'sustentar', equipamento: [], impacto: 'baixo', nivel: 2,
    dicas: ['Pé afastado para o quadril não balançar', 'Toca devagar: quem ganha aqui é quem fica parado'],
    facilita: 'prancha' },
  { id: 'prancha-lateral', nome: 'Prancha lateral', tipo: 'principal', grupo: 'core',
    padrao: 'sustentar', equipamento: [], impacto: 'baixo', nivel: 2, unilateral: true,
    dicas: ['Quadril alto, corpo em linha reta', 'Ombro de baixo empurrando o chão'] },
  { id: 'abdominal-morto', nome: 'Abdominal morto', tipo: 'principal', grupo: 'core',
    padrao: 'sustentar', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['Lombar colada no chão o tempo todo', 'Braço e perna opostos descem juntos, devagar'] },
  { id: 'canoa', nome: 'Canoa', tipo: 'principal', grupo: 'core',
    padrao: 'sustentar', equipamento: [], impacto: 'baixo', nivel: 2,
    dicas: ['Lombar colada, braço e perna esticados', 'Se a lombar sair do chão, dobra o joelho'] },
  { id: 'elevacao-de-pernas', nome: 'Elevação de pernas', tipo: 'principal', grupo: 'core',
    padrao: 'sustentar', equipamento: [], impacto: 'baixo', nivel: 2,
    dicas: ['Desce até onde a lombar aguenta ficar colada', 'Mão embaixo do quadril ajuda no começo'] },
  { id: 'giro-russo', nome: 'Giro russo', tipo: 'principal', grupo: 'core',
    padrao: 'girar', equipamento: [], impacto: 'baixo', nivel: 2,
    dicas: ['Peito aberto, gira do tronco e não do braço', 'Pé no chão facilita, pé no ar dificulta'] },
  { id: 'escalador', nome: 'Escalador', tipo: 'principal', grupo: 'core',
    padrao: 'deslocar', equipamento: [], impacto: 'baixo', nivel: 2,
    dicas: ['Quadril na altura do ombro, sem subir', 'Joelho vem até o peito, um de cada vez'] },
  { id: 'passeio-do-fazendeiro', nome: 'Passeio do fazendeiro', tipo: 'principal', grupo: 'core',
    padrao: 'deslocar', equipamento: ['halter'], impacto: 'baixo', nivel: 1,
    dicas: ['Peso pesado nas duas mãos, ombro para trás', 'Anda reto e devagar, sem inclinar'] },

  /* ---------------------------- corpo todo ---------------------------- */
  { id: 'burpee-sem-salto', nome: 'Burpee sem salto', tipo: 'principal', grupo: 'corpo-todo',
    padrao: 'deslocar', equipamento: [], impacto: 'baixo', nivel: 2,
    dicas: ['Mão no chão, pé para trás um de cada vez', 'Sobe e estica o corpo, sem pular'],
    dificulta: 'burpee' },
  { id: 'burpee', nome: 'Burpee', tipo: 'principal', grupo: 'corpo-todo',
    padrao: 'deslocar', equipamento: [], impacto: 'alto', nivel: 3,
    dicas: ['Peito no chão, salto no fim', 'Ritmo que dá para manter o bloco inteiro'],
    facilita: 'burpee-sem-salto' },
  { id: 'urso-caminhando', nome: 'Urso caminhando', tipo: 'principal', grupo: 'corpo-todo',
    padrao: 'deslocar', equipamento: [], impacto: 'baixo', nivel: 2,
    dicas: ['Joelho a um palmo do chão', 'Mão e pé opostos saem juntos'] },
  { id: 'polichinelo', nome: 'Polichinelo', tipo: 'principal', grupo: 'corpo-todo',
    padrao: 'deslocar', equipamento: [], impacto: 'alto', nivel: 1,
    dicas: ['Braço passa da linha da cabeça', 'Cai na ponta do pé, macio'] },
  { id: 'corrida-parado', nome: 'Corrida parado', tipo: 'principal', grupo: 'corpo-todo',
    padrao: 'deslocar', equipamento: [], impacto: 'alto', nivel: 1,
    dicas: ['Joelho na altura do quadril', 'Braço acompanha, cotovelo dobrado'] },
  { id: 'pular-corda', nome: 'Pular corda', tipo: 'principal', grupo: 'corpo-todo',
    padrao: 'deslocar', equipamento: ['corda'], impacto: 'alto', nivel: 2,
    dicas: ['Salto baixo, quem gira é o punho', 'Cotovelo junto ao corpo'] },
  { id: 'arremesso-de-bola', nome: 'Arremesso de bola', tipo: 'principal', grupo: 'corpo-todo',
    padrao: 'dobradica', equipamento: ['bola'], impacto: 'alto', nivel: 2,
    dicas: ['Estica o corpo em cima e joga com força', 'Agacha para pegar, não curva a lombar'] },
  { id: 'levantar-do-chao', nome: 'Levantar do chão com peso', tipo: 'principal', grupo: 'corpo-todo',
    padrao: 'sustentar', equipamento: ['kettlebell'], impacto: 'baixo', nivel: 3, unilateral: true,
    dicas: ['Peso sempre apontado para o teto, olho nele', 'Um passo de cada vez: cotovelo, mão, joelho, em pé'] },

  /* ------------------------------- solta ------------------------------ */
  { id: 'respiracao-longa', nome: 'Respiração longa', tipo: 'solta', grupo: 'core',
    padrao: 'sustentar', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['Puxa em 4 tempos, solta em 6', 'É isso que faz o coração descer'] },
  { id: 'postura-da-crianca', nome: 'Postura da criança', tipo: 'solta', grupo: 'core',
    padrao: 'sustentar', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['Joelho aberto, quadril sentado no calcanhar', 'Braço esticado à frente'] },
  { id: 'along-posterior', nome: 'Alongar posterior de coxa', tipo: 'solta', grupo: 'inferior',
    padrao: 'dobradica', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['Perna esticada, quadril vai para trás', 'Sem forçar: é alongar, não competir'] },
  { id: 'along-quadriceps', nome: 'Alongar quadríceps', tipo: 'solta', grupo: 'inferior',
    padrao: 'sustentar', equipamento: [], impacto: 'baixo', nivel: 1, unilateral: true,
    dicas: ['Joelho apontado para baixo, quadril à frente', 'Apoia na parede se precisar'] },
  { id: 'along-panturrilha', nome: 'Alongar panturrilha', tipo: 'solta', grupo: 'inferior',
    padrao: 'sustentar', equipamento: [], impacto: 'baixo', nivel: 1, unilateral: true,
    dicas: ['Mão na parede, perna de trás esticada', 'Calcanhar no chão'] },
  { id: 'along-peitoral', nome: 'Alongar peitoral', tipo: 'solta', grupo: 'superior',
    padrao: 'empurrar', equipamento: [], impacto: 'baixo', nivel: 1, unilateral: true,
    dicas: ['Antebraço na parede, gira o corpo para o lado oposto', 'Ombro para baixo'] },
  { id: 'torcao-deitada', nome: 'Torção deitada', tipo: 'solta', grupo: 'core',
    padrao: 'girar', equipamento: [], impacto: 'baixo', nivel: 1, unilateral: true,
    dicas: ['Deitado, joelho cai para um lado', 'Ombro no chão, olhar para o outro lado'] },
  { id: 'joelho-ao-peito', nome: 'Joelhos ao peito', tipo: 'solta', grupo: 'inferior',
    padrao: 'sustentar', equipamento: [], impacto: 'baixo', nivel: 1,
    dicas: ['Abraça os joelhos e respira fundo', 'Lombar espalhada no chão'] },
];

const POR_ID = {};
LISTA.forEach((e) => { POR_ID[e.id] = e; });

function porId(id) {
  return POR_ID[id] || null;
}

/* Os equipamentos que aparecem no catalogo, na ordem em que estao escritos
   em EQUIPAMENTOS. A tela de Ajustes desenha a lista a partir daqui: se
   amanha entrar um exercicio com corda naval, o interruptor aparece
   sozinho. */
function equipamentosUsados() {
  const vistos = {};
  LISTA.forEach((e) => e.equipamento.forEach((q) => { vistos[q] = true; }));
  return Object.keys(EQUIPAMENTOS).filter((q) => vistos[q]);
}

/* Cabe no que a pessoa tem em casa? Lista vazia (peso do corpo) sempre cabe. */
function cabeNoQueTenho(ex, disponiveis) {
  const tenho = disponiveis || [];
  return ex.equipamento.every((q) => tenho.indexOf(q) >= 0);
}

/* O filtro que o montador usa. `foco` 'corpo-todo' aceita todo mundo; os
   outros aceitam o proprio grupo mais os de corpo todo, que servem para
   qualquer treino. */
function filtrar(op) {
  const o = op || {};
  const tipo = o.tipo || 'principal';
  return LISTA.filter((e) => {
    if (e.tipo !== tipo) return false;
    if (o.equipamentos && !cabeNoQueTenho(e, o.equipamentos)) return false;
    if (o.semImpacto && e.impacto === 'alto') return false;
    if (o.nivel && e.nivel > o.nivel) return false;
    if (o.foco && o.foco !== 'corpo-todo' && e.grupo !== o.foco && e.grupo !== 'corpo-todo') return false;
    if (o.padrao && e.padrao !== o.padrao) return false;
    return true;
  });
}

/* Troca um exercicio pelo mais facil ou pelo mais dificil, quando existir.
   E o que o botao "muito pesado / muito leve" da tela de execucao faz. */
function vizinho(id, direcao) {
  const ex = porId(id);
  if (!ex) return null;
  const alvo = direcao === 'facilita' ? ex.facilita : ex.dificulta;
  return alvo ? porId(alvo) : null;
}

const Exercicios = {
  LISTA, PADROES, EQUIPAMENTOS, GRUPOS,
  porId, filtrar, vizinho, equipamentosUsados, cabeNoQueTenho,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Exercicios;
else window.Exercicios = Exercicios;
