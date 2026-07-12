#!/usr/bin/env bash
# Fetch bundled woff2 for the catalog. Requires curl. Google Fonts serves woff2
# to a modern UA; we grab the latin (+ arabic) subset URL from the css2 API.
set -euo pipefail
OUT="src/renderer/src/assets/fonts"
mkdir -p "$OUT"
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36'

# family|weights|outbase  (one line per weight → outbase-<weight>.woff2)
grab() {
  local family="$1" weight="$2" out="$3"
  local css url
  css=$(curl -sfH "User-Agent: $UA" "https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap")
  # last woff2 url in the response = the widest (latin) subset for that weight
  url=$(printf '%s' "$css" | grep -oE "https://[^)]+\.woff2" | tail -1)
  [ -n "$url" ] || { echo "no url for $family $weight" >&2; exit 1; }
  curl -sfL "$url" -o "$OUT/$out-$weight.woff2"
  echo "  $out-$weight.woff2"
}

grab "DM+Sans" 400 dm-sans;          grab "DM+Sans" 700 dm-sans
grab "Sora" 400 sora;                grab "Sora" 700 sora
grab "Saira" 400 saira;              grab "Saira" 700 saira
grab "Noto+Sans" 400 noto-sans;      grab "Noto+Sans" 700 noto-sans
grab "Alexandria" 400 alexandria;    grab "Alexandria" 700 alexandria
grab "Archivo+Black" 400 archivo-black
grab "Unbounded" 400 unbounded;      grab "Unbounded" 700 unbounded
grab "Workbench" 400 workbench
grab "Press+Start+2P" 400 press-start-2p
grab "Geist+Pixel" 400 geist-pixel
grab "Roboto+Mono" 400 roboto-mono;  grab "Roboto+Mono" 700 roboto-mono
grab "Space+Mono" 400 space-mono;    grab "Space+Mono" 700 space-mono
grab "Tajawal" 400 tajawal;          grab "Tajawal" 700 tajawal
grab "Amiri" 400 amiri;              grab "Amiri" 700 amiri
echo "done"
