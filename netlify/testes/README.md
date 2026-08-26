# Testes da função da IA

```bash
npm install
node netlify/testes/testes_conselho.mjs
```

Sobe um servidor local que finge ser a API da Anthropic e aponta o SDK para
ele por `ANTHROPIC_BASE_URL`. Nenhuma chamada de verdade é feita, nenhum
centavo é gasto e nenhuma chave é necessária.

O que ele verifica, além dos freios (recurso desligado, senha errada, teto
do dia): que o texto livre dos lançamentos **não chega ao modelo**, nem
mesmo quando alguém força um campo extra no pedido.
