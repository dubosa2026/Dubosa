# O app

`bussola.html` é o app inteiro em um arquivo. `dist/` é a mesma coisa com o
manifesto e o service worker do lado, para instalar na tela de início. Os
dois saem de `src/` pelo `build_app.py`:

```bash
python3 app/build_app.py
```

Não edite `bussola.html` nem `dist/index.html` — são gerados. Mexa em
`src/` e rode o build.

## Por que arquivo único

O app precisa abrir no elevador, no metrô e com 5% de bateria. Nada de CDN,
nada de pacote, nada de rede: as fontes entram embutidas em base64 e o HTML
inteiro tem uns 270 KB — menos que uma foto.

## Os módulos, em ordem de dependência

| arquivo | do que cuida |
|---|---|
| `formato.js` | dinheiro, datas e número falado ("quarenta e cinco reais e noventa") |
| `nucleo.js` | saldo, contas fixas viram calendário, média variável, projeção, teto do dia |
| `voz.js` | a trava da tela desbloqueada e a interpretação das frases |
| `conselhos.js` | o assessor que roda no aparelho, e o retrato que vai para a IA |
| `ui.js` | as quatro abas |

`formato.js`, `nucleo.js`, `voz.js` e `conselhos.js` são JavaScript puro:
não tocam na tela e rodam no node, que é como os testes conferem a
matemática sem subir navegador. `ui.js` é o único que conhece o DOM.

No build cada módulo entra dentro da própria função anônima. Sem isso o
`var F` do núcleo e o `const F` da interface colidiriam no escopo global e o
navegador recusaria o arquivo inteiro.

## Sobre o número grande da primeira tela

"Pode gastar hoje" é um **limite**, não uma previsão: divide o que sobra
pelos dias até a próxima entrada. As projeções da aba Futuro é que são
previsão — e elas dizem, na própria tela, de quantos dias de histórico
saiu a média que as sustenta.
