#!/bin/zsh
# Builds the photographed Earth the web globe draws, from the same two NASA
# maps as the app (see build-ios-earth.sh): Blue Marble Next Generation,
# December, with topography and bathymetry, by day; Black Marble 2016 by night.
# Writes public/earth/day-4096.webp and night-4096.webp (the lights, grey),
# and the 8192 pair for large screens. Both maps are public domain.
#
#   scripts/build-web-earth.sh <blue-marble.jpg> <black-marble.jpg>
set -euo pipefail

if (( $# != 2 )); then
  print -u2 "usage: $0 <blue-marble.jpg> <black-marble.jpg>"
  exit 2
fi
command -v magick >/dev/null || { print -u2 "magick is needed (brew install imagemagick)"; exit 2; }

out=${0:A:h:h}/public/earth
mkdir -p $out
magick "$1" -filter Lanczos -resize 8192x4096! -strip -quality 78 -define webp:method=6 "$out/day-8192.webp"
magick "$1" -filter Lanczos -resize 4096x2048! -strip -quality 80 -define webp:method=6 "$out/day-4096.webp"
magick "$2" -colorspace Gray -filter Lanczos -resize 4096x2048! -strip -quality 85 -define webp:method=6 "$out/night-4096.webp"
magick "$2" -colorspace Gray -filter Lanczos -resize 8192x4096! -strip -quality 85 -define webp:method=6 "$out/night-8192.webp"
ls -la $out
