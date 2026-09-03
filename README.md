# Liga Comercial

Aplicativo de competição comercial diária para a equipe de vendas.

Cada vendedor tem uma posição calculada pelo sistema e vê **apenas os próprios
números**. O gestor vê a operação inteira. O ranking nominal não existe no
aplicativo do vendedor — não como tela escondida, mas como dado que nunca é
montado para ele.

Dois indicadores, e só eles: **pedidos do dia** e **faturamento do dia**.

## Estado atual

**Modo de Espera de Dados.** A forma de carregamento da base ainda não foi
definida, então nenhuma origem foi assumida. Tudo o mais funciona — navegação,
permissões, ranking, cálculos, projeções, gamificação — e as telas que dependem
de produção real mostram estado de espera em vez de números inventados.

Conectar a base depois é escrever um adaptador e apontar uma linha de
configuração. Nenhuma tela, cálculo ou regra de permissão muda.
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

## Desenvolvimento

Sem framework, sem build, sem dependências. Basta servir a pasta:

```bash
python3 -m http.server 8080
node tests/run.js      # 51 verificações do núcleo, incluindo as de privacidade
```

## Estrutura

```
index.html              casca do aplicativo
config/                 regras, cadastro da equipe, acessos
src/core/               relógio comercial, métricas, ranking, gamificação,
                        mensagens e o núcleo de privacidade
src/data/               contrato de dados, Modo de Espera, adaptadores
src/ui/                 telas e componentes
deploy/                 instaladores para Windows, macOS e Linux
docs/                   documentação
tests/run.js            testes do núcleo
```
