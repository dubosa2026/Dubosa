# Testar os links secretos sem conta no Netlify

`servidor_local.mjs` sobe em `http://localhost:8899` o site de `app/dist` e
roda as duas funções reais (`publicar` e `carteira`) sem alterar uma linha
delas. O único substituto é o `@netlify/blobs`, trocado por `blobs_falso.mjs`,
que guarda tudo em memória.

Como o Node resolve `node_modules` a partir do caminho real do arquivo, o
teste roda numa pasta temporária com o pacote falso instalado:

```bash
SANDBOX=$(mktemp -d)
mkdir -p "$SANDBOX/node_modules/@netlify/blobs"
cp netlify/testes/blobs_falso.mjs "$SANDBOX/node_modules/@netlify/blobs/index.mjs"
printf '{"name":"@netlify/blobs","type":"module","main":"index.mjs"}' \
  > "$SANDBOX/node_modules/@netlify/blobs/package.json"
cp -r netlify "$SANDBOX/netlify"
cp netlify/testes/servidor_local.mjs "$SANDBOX/servidor.mjs"

python3 app/build_app.py
(cd "$SANDBOX" && ADMIN_TOKEN=senha-de-teste node servidor.mjs &)
sleep 2
python3 netlify/testes/test_links.py
```

O `test_links.py` (precisa de Playwright) percorre o fluxo inteiro pelo
navegador: o gestor publica, cada vendedor abre o próprio link, e confere o
que importa — que um token só devolve a carteira do seu dono, que token
inválido responde 404 sem vazar nada, que a senha errada é recusada e que o
link continua o mesmo depois de republicar.

Isto exercita a lógica, não a infraestrutura. O comportamento real do
Netlify Blobs e das funções em produção precisa ser conferido no primeiro
deploy.
