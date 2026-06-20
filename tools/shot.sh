#!/bin/bash
# shot.sh — headless screenshot hry přes Windows Chrome (žádný browser ve WSL netřeba).
# Použití: tools/shot.sh [URL_suffix]   (default ?autotest=1)
# Výstup: /mnt/d/smazak_shot.png (vizuál) + vypíše #__diag (konzole/chyby ze hry).
set -u
PORT="${PORT:-8099}"
SUFFIX="${1:-/?autotest=1}"
URL="http://localhost:${PORT}${SUFFIX}"
CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
[ -x "$CHROME" ] || CHROME="/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
SHOT_WIN='D:\smazak_shot.png'
SHOT_WSL='/mnt/d/smazak_shot.png'
DOM_WSL='/mnt/d/smazak_dom.html'
FLAGS=(--headless=new --disable-gpu --enable-unsafe-swiftshader --hide-scrollbars
       --no-first-run --no-default-browser-check --window-size=400,820
       --virtual-time-budget=9000)

# server: pokud neběží, spusť ho na pozadí
if ! curl -sf "http://localhost:${PORT}/" >/dev/null 2>&1; then
  echo "[shot] startuji http server na :${PORT}"
  ( cd "$(dirname "$0")/.." && nohup python3 -m http.server "${PORT}" --bind 0.0.0.0 >/tmp/smazak_http.log 2>&1 & )
fi
for i in $(seq 1 20); do curl -sf "http://localhost:${PORT}/" >/dev/null 2>&1 && break; sleep 0.5; done

rm -f "$SHOT_WSL" "$DOM_WSL"
echo "[shot] screenshot → $SHOT_WSL"
timeout 45 "$CHROME" "${FLAGS[@]}" --screenshot="$SHOT_WIN" "$URL" >/dev/null 2>&1
echo "[shot] dump-dom (diagnostika)"
timeout 45 "$CHROME" "${FLAGS[@]}" --dump-dom "$URL" > "$DOM_WSL" 2>/dev/null

echo "----- DIAG (#__diag ze hry) -----"
grep -o '<div id="__diag"[^>]*>[^<]*</div>' "$DOM_WSL" 2>/dev/null | sed -E 's/<[^>]+>//g' || echo "(žádný #__diag — hra možná spadla před startem)"
echo "---------------------------------"
[ -f "$SHOT_WSL" ] && echo "[shot] OK: $SHOT_WSL ($(stat -c%s "$SHOT_WSL") B)" || echo "[shot] CHYBA: screenshot nevznikl"
