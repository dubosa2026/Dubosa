# Instalação

Tudo aqui é gratuito. Não há servidor para pagar nem programa para instalar.

## 1. Publicar o aplicativo (uma vez, feito pelo gestor)

O caminho mais simples é o **GitHub Pages**, gratuito:

1. no repositório, vá em **Settings → Pages**;
2. em *Source*, escolha **Deploy from a branch**;
3. escolha a branch onde este aplicativo está e a pasta `/ (root)`;
4. salve e aguarde um ou dois minutos.

O endereço fica assim:

```
https://dubosa2026.github.io/Dubosa/
```

> Qualquer hospedagem estática serve — Netlify, Cloudflare Pages, um servidor
> interno. O aplicativo é um conjunto de arquivos; não precisa de nada rodando
> por trás.
>
> **Prefira o Netlify se for conectar o sistema de pedidos.** Lá o repositório
> traz junto a função `netlify/functions/producao.mjs`, que guarda a senha fora
> do código e calcula o ranking no servidor — o único desenho em que os números
> dos colegas nunca chegam ao navegador do vendedor. Ver
> [INTEGRACAO-DADOS.md](INTEGRACAO-DADOS.md).

## 2. Cadastrar a equipe e gerar os links

1. abra o endereço e clique em **Configurar como gestor**;
2. **guarde o link de gestor que aparece** — ele não é mostrado de novo;
3. na aba **Equipe**, confira a lista (ela já vem preenchida com os 22
   vendedores) e ajuste o que precisar;
4. na aba **Acessos**, gere o link de cada vendedor e **copie na hora** — o
   aplicativo guarda apenas o hash do código, então o link não é recuperável
   depois;
5. baixe **equipe.json** e envie o arquivo para a pasta `config/` do
   repositório (no GitHub: `config` → *Add file* → *Upload files*).

Sem esse último passo o cadastro existe só no navegador do gestor, e os links
não funcionam nas outras máquinas.

Para guardar os links com calma, use **Baixar links gerados (CSV)** — a planilha
sai com uma linha por vendedor.

## 3. Instalar no computador do vendedor

### Windows — atalho e abertura automática

1. copie a pasta `deploy/windows` para a máquina do vendedor;
2. dois cliques em **Instalar-Dubosa.bat**;
3. cole o link pessoal quando for pedido.

Resultado:

- ícone **Liga Comercial** na área de trabalho;
- abertura automática junto com o Windows, **já minimizada**;
- janela pequena e independente, sem abas e sem barra de endereços.

Para instalar em várias máquinas sem digitar nada, crie um `LINK.txt` ao lado do
instalador com o link dentro.

Para remover: **Desinstalar-Dubosa.bat**.

### macOS

Rode `deploy/macos/instalar-atalho.command`. Cria o aplicativo em
`~/Applications` e configura a abertura no login.

### Linux

Rode `deploy/linux/instalar-atalho.sh`. Cria o atalho no menu, na área de
trabalho e na inicialização automática.

### Sem instalar nada (qualquer sistema, inclusive celular)

Abra o link pessoal no Chrome ou no Edge e use **Instalar aplicativo** no menu do
navegador. O aplicativo ganha janela e ícone próprios.

## 4. Deixar de lado sem atrapalhar

Dentro do aplicativo, o botão **Compacto** reduz a tela ao essencial: posição,
pedidos, faturamento, distância para a próxima posição e o aviso de ritmo. Cabe
num canto do monitor o dia inteiro.

A janela atualiza sozinha (padrão: a cada 60 segundos, ajustável em
**Configuração → Regras**) e funciona offline: sem internet ela abre com o
último estado conhecido em vez de dar erro.

## Perguntas frequentes

**O vendedor consegue ver o resultado dos colegas?**
Não. Ele vê a própria posição e a distância para as posições vizinhas, sem nome e
sem número de ninguém. Detalhes e limites em [PRIVACIDADE.md](PRIVACIDADE.md).

**Perdi o link de um vendedor.**
Configuração → Acessos → **Novo link**. O anterior deixa de valer na hora.

**Um vendedor está zerado. Ele some do ranking?**
Não. O cadastro da equipe garante que todos apareçam; quem não produziu fica nas
últimas posições, marcado como *sem produção*.

**A tela mostra "Aguardando a base de dados".**
É o comportamento correto enquanto a origem não foi conectada. Ver
[INTEGRACAO-DADOS.md](INTEGRACAO-DADOS.md).
