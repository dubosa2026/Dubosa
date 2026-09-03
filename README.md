# Liga Comercial

Aplicativo de competição comercial diária para a equipe de vendas.

Cada vendedor tem uma posição calculada pelo sistema e vê **apenas os próprios
números**. O gestor vê a operação inteira. O ranking nominal não existe no
aplicativo do vendedor — não como tela escondida, mas como dado que nunca é
montado para ele.

Dois indicadores, e só eles: **pedidos do dia** e **faturamento do dia**.

## Estado atual

**Modo de Espera de Dados**, com a conexão pronta para ser ligada.

O aplicativo funciona por inteiro — navegação, permissões, ranking, cálculos,
projeções, gamificação — e as telas que dependem de produção real mostram estado
de espera em vez de números inventados.

Para colocar produção real na Liga há três caminhos, todos sem programar:

- **Configuração → Lançar** é o que funciona hoje: cole a lista que aparece na
  tela do sistema de pedidos (ou digite), registre, e clique em **Publicar o
  dia** para enviar o arquivo ao repositório — a partir daí a equipe inteira vê
  o mesmo placar. Cada lançamento vira um ponto da curva do dia, e com a curva
  vêm ritmo, projeção e comparação com ontem;

- **Configuração → Base de dados** conecta direto num endereço de dados, com um
  diagnóstico que roda no navegador do gestor e diz passo a passo o que entendeu
  da resposta;
- **`netlify/functions/producao.mjs`** faz a busca no servidor, guarda a senha
  fora do repositório e calcula o ranking lá — o único desenho em que os números
  dos colegas nunca chegam ao navegador do vendedor.

Ver [docs/INTEGRACAO-DADOS.md](docs/INTEGRACAO-DADOS.md).

## O que o vendedor vê

```
MATHEUS SOUZA DE BARROS                          BRONZE

  17º de 22        Você está em 17º lugar.
                   ▼ 4 posições perdidas hoje

  Pedidos hoje         3        ▼ −6      −66,7%
  Faturamento hoje     R$ 24.200  ▼ −R$ 28.800   −54,3%

  ⚔️  A disputa está apertando. Faltam R$ 1.800 para avançar.
  ⚡  Você precisa acelerar o ritmo para alcançar sua projeção.

  A DISPUTA
    Para avançar uma posição      R$ 1.800
    Vantagem sobre quem vem atrás R$ 11.200

  🔒 Você vê a distância, nunca quem está na outra posição.
```

E mais: comparação com ontem no mesmo horário, projeção de fechamento, ritmo de
produção, curva do dia contra a de ontem, nível, conquistas e o total agregado da
equipe.

## O que o gestor vê

Ranking nominal completo com pedidos, faturamento, variação contra o mesmo
horário de ontem, ritmo, projeção, nível, movimento de posição e distância para a
próxima. Painel individual por vendedor, comparação entre dois vendedores e
exportação em CSV/JSON.

## Instalar

Hospedagem gratuita, atalho na área de trabalho, abertura automática ao ligar o
computador e janela pequena que fica de lado sem atrapalhar.

Passo a passo em [docs/INSTALACAO.md](docs/INSTALACAO.md).

## Documentação

| documento | assunto |
|-----------|---------|
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | camadas, modelo de dados, regras de ranking e projeção, permissões |
| [docs/PRIVACIDADE.md](docs/PRIVACIDADE.md) | as três barreiras, o que é garantido e o que ainda não é |
| [docs/INTEGRACAO-DADOS.md](docs/INTEGRACAO-DADOS.md) | como conectar a base quando ela for definida |
| [docs/INSTALACAO.md](docs/INSTALACAO.md) | publicar, cadastrar a equipe, instalar nas máquinas |
| [docs/LIGAR-SEM-SERVIDOR.md](docs/LIGAR-SEM-SERVIDOR.md) | leitura automática do sistema de pedidos usando só o GitHub, de graça |

## Desenvolvimento

Sem framework, sem build, sem dependências. Basta servir a pasta:

```bash
python3 -m http.server 8080
node tests/run.js               # 123 verificações do núcleo, incluindo as de privacidade
node tests/funcao-producao.js   # 11 verificações da função de servidor
```

## Estrutura

```
index.html              casca do aplicativo
config/                 regras, cadastro da equipe, acessos, produção publicada
src/core/               relógio comercial, métricas, ranking, gamificação,
                        mensagens e o núcleo de privacidade
src/data/               contrato de dados, Modo de Espera, adaptadores
src/ui/                 telas e componentes
netlify/functions/      busca com escopo no servidor (privacidade no transporte)
deploy/                 instaladores para Windows, macOS e Linux
docs/                   documentação
tests/                  testes do núcleo e da função de servidor
```
