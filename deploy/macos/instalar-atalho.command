#!/bin/bash
# Liga Comercial — atalho e abertura automática no macOS.
set -euo pipefail

NOME="Liga Comercial"
PERFIL="$HOME/Library/Application Support/LigaComercial/perfil"

echo
echo "  LIGA COMERCIAL — instalação"
echo "  ---------------------------"
echo

if [ -f "$(dirname "$0")/LINK.txt" ]; then
  LINK="$(tr -d '[:space:]' < "$(dirname "$0")/LINK.txt")"
else
  echo "  Cole o SEU link pessoal (o gestor enviou para você):"
  read -r LINK
fi

case "$LINK" in
  http://*|https://*) ;;
  *) echo "  Link inválido — precisa começar com http:// ou https://"; exit 1 ;;
esac

NAVEGADOR=""
for candidato in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
  [ -x "$candidato" ] && NAVEGADOR="$candidato" && break
done

if [ -z "$NAVEGADOR" ]; then
  echo "  Não encontrei o Chrome nem o Edge. Instale um deles e rode de novo."
  exit 1
fi

mkdir -p "$PERFIL"
APP_DIR="$HOME/Applications/$NOME.app/Contents/MacOS"
mkdir -p "$APP_DIR"

cat > "$APP_DIR/$NOME" <<LAUNCHER
#!/bin/bash
exec "$NAVEGADOR" --app="$LINK" --user-data-dir="$PERFIL" --window-size=430,780 --no-first-run
LAUNCHER
chmod +x "$APP_DIR/$NOME"

osascript -e "tell application \"System Events\" to make login item at end with properties {path:\"$HOME/Applications/$NOME.app\", hidden:true}" >/dev/null 2>&1 || true

echo "  Aplicativo criado em ~/Applications/$NOME.app"
echo "  Abertura automática no login configurada (oculta)."
echo "  Arraste o ícone para o Dock se quiser deixá-lo à mão."
echo
