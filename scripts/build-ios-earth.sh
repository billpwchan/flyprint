#!/bin/zsh
# Builds the photographed Earth the iOS globe draws, from two NASA maps:
#   day:   Blue Marble Next Generation, December, with topography and bathymetry
#          world.topo.bathy.200412.3x21600x10800.jpg
#          https://visibleearth.nasa.gov/images/73909/december-blue-marble-next-generation-w-topography-and-bathymetry
#   night: Black Marble 2016, 3 km
#          BlackMarble_2016_3km.jpg
#          https://earthobservatory.nasa.gov/features/NightLights/page3.php
# Writes ios/Flyprint/Resources/earth-day.ktx (sRGB) and earth-night.ktx (linear),
# ASTC 4x4 with mipmaps. The files are large, so they stay out of git; a build
# without them draws the globe in its night style.
#
#   scripts/build-ios-earth.sh <blue-marble.jpg> <black-marble.jpg>
set -euo pipefail

if (( $# != 2 )); then
  print -u2 "usage: $0 <blue-marble.jpg> <black-marble.jpg>"
  exit 2
fi
for tool in magick basisu; do
  command -v $tool >/dev/null || { print -u2 "$tool is needed (brew install imagemagick basis_universal)"; exit 2; }
done

root=${0:A:h:h}
out=$root/ios/Flyprint/Resources
work=$(mktemp -d)
trap 'command rm -rf "$work"' EXIT

magick "$1" -filter Lanczos -resize 8192x4096! -depth 8 "$work/day.png"
magick "$2" -colorspace Gray -filter Lanczos -resize 4096x2048! -depth 8 "$work/night.png"

cd "$work"
basisu -uastc -uastc_level 1 -mipmap -ktx2 -output_file day.ktx2 day.png >/dev/null
basisu -uastc -uastc_level 1 -mipmap -ktx2 -linear -output_file night.ktx2 night.png >/dev/null
basisu -export_ktx ASTC day.ktx2 >/dev/null
basisu -export_ktx ASTC -linear night.ktx2 >/dev/null

cp day_ASTC.ktx "$out/earth-day.ktx"
cp night_ASTC.ktx "$out/earth-night.ktx"
ls -la "$out"/earth-*.ktx
