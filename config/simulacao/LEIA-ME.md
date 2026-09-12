# Simulação de produção

Estes arquivos **não são a produção real da equipe**. São números fictícios,
gerados por `scripts/simular-producao.mjs`, para ver o aplicativo funcionando
por dentro — régua pessoal, desafio, barra coletiva, ranking — sem depender do
sistema de pedidos da direção.

A produção de verdade fica em `config/producao/`, e as duas pastas nunca se
misturam: são dois endereços e dois sites publicados.

Cada arquivo carrega `"simulacao": true`, e é a partir daí que o aplicativo
sobe a tarja **DADOS DE DEMONSTRAÇÃO** em cima de toda tela. Não depende de
ninguém lembrar de avisar.

## Refazer

```
node scripts/simular-producao.mjs 2026-08-01 2026-09-12 18:00
```

Os três argumentos são o primeiro dia, o último dia e a hora até onde o último
dia foi lido. Cada número sai de uma semente fixa (vendedor + data): rodar duas
vezes dá exatamente o mesmo mês.

## O que a simulação imita

- **pedidos por vendedor e faturamento só no total da equipe** — é o que o
  sistema da direção entrega, e é o que o aplicativo tem de saber mostrar;
- **a curva do dia**: leitura de dez em dez minutos, acumulada, com o intervalo
  do almoço parado;
- **a diferença entre pessoas e entre dias da semana** — é disso que a régua
  pessoal vive. Sem variação toda média bateria exata e a tela não diria nada.

No mundo simulado trabalha-se de segunda a sábado, para que o dia de hoje tenha
produção em qualquer dia da semana. O site publicado recebe essa configuração
junto (`app.config.overlay.json`).

## Apagar

Nada depende destes arquivos: apagar a pasta e o site `docs/liga/simulacao/`
deixa a Liga real exatamente como está.
