# Testar os links secretos sem conta no Netlify

`servidor_local.mjs` sobe em `http://localhost:8899` o site de `app/dist` e
roda as funções reais (`publicar`, `carteira`, `situacao` e `apagar`) sem
alterar uma linha delas. Cada função declara a própria rota em
`export const config`, e o servidor monta o roteamento a partir disso — não
é preciso registrar nada à mão. O único substituto é o `@netlify/blobs`,
trocado por `blobs_falso.mjs`, que guarda tudo em memória.

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

São três roteiros. O `test_acumulo.py` cobre o acúmulo de rodadas no link:
publicar Distribuição e depois Sem compras deixa as duas no ar, publicar de
novo troca só a do mesmo tipo, uma rodada vazia **não apaga nada** (só o
botão Apagar apaga), e o cliente repetido entre listas recebe a etiqueta de
aviso.

O `test_controle.py` reproduz o trabalho estado a estado, que foi onde o
problema apareceu: publicar o PA na Distribuição, depois o PA em Sem
compras, e então o TO na Distribuição. Ao final confere que nada do PA foi
tocado pela rodada do TO, que desmarcar um vendedor deixa o link dele
intacto, que o painel de situação lista as rodadas de cada um, e que apagar
uma lista não leva junto a outra. Também confere que sem a senha de gestor
não se consulta nem se apaga nada.

O `test_links.py` (precisa de Playwright) percorre o fluxo inteiro pelo
navegador: o gestor publica, cada vendedor abre o próprio link, e confere o
que importa — que um token só devolve a carteira do seu dono, que token
inválido responde 404 sem vazar nada, que a senha errada é recusada e que o
link continua o mesmo depois de republicar.

O `test_blobs_antigo.py` sobe um segundo servidor, numa porta própria, com
o stub em modo antigo (`BLOBS_SEM_CONDICIONAL=1`): a escrita condicional é
aceita, ignorada e não devolve `modified`. É o que acontece quando a versão
do `@netlify/blobs` no site é anterior à 8.1, e foi o que quebrou o botão
**Salvar anotação** em produção — o vendedor via "Não consegui salvar
agora" e o texto era gravado uma vez por tentativa, seis cópias por clique.
Precisa da variável `SANDBOX` apontando para a pasta montada acima:

```bash
SANDBOX=$SANDBOX python3 netlify/testes/test_blobs_antigo.py
```

Isto exercita a lógica, não a infraestrutura. O comportamento real do
Netlify Blobs e das funções em produção precisa ser conferido no primeiro
deploy.
