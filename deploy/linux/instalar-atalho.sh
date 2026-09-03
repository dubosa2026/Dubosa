#!/bin/bash
# Liga Comercial — atalho e abertura automática no Linux (freedesktop).
set -euo pipefail

NOME="Liga Comercial"
ID="liga-comercial"
PERFIL="$HOME/.local/share/LigaComercial/perfil"

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

NAVEGADOR="$(command -v google-chrome || command -v chromium || command -v chromium-browser || command -v microsoft-edge || true)"
if [ -z "$NAVEGADOR" ]; then
  echo "  Não encontrei Chrome, Chromium nem Edge. Instale um deles e rode de novo."
  exit 1
fi

mkdir -p "$PERFIL" "$HOME/.local/share/applications" "$HOME/.config/autostart" "$HOME/Desktop" 2>/dev/null || true

ATALHO="[Desktop Entry]
Type=Application
Name=$NOME
Comment=Seu placar do dia
Exec=$NAVEGADOR --app=$LINK --user-data-dir=$PERFIL --window-size=430,780 --no-first-run
Icon=applications-office
Terminal=false
Categories=Office;
StartupWMClass=$ID
"

echo "$ATALHO" > "$HOME/.local/share/applications/$ID.desktop"
echo "$ATALHO" > "$HOME/.config/autostart/$ID.desktop"
[ -d "$HOME/Desktop" ] && echo "$ATALHO" > "$HOME/Desktop/$ID.desktop" && chmod +x "$HOME/Desktop/$ID.desktop"
chmod +x "$HOME/.local/share/applications/$ID.desktop" "$HOME/.config/autostart/$ID.desktop"

echo "  Atalho criado no menu de aplicativos e na área de trabalho."
echo "  Abertura automática no login configurada."
echo
