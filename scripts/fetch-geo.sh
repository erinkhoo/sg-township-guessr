#!/usr/bin/env bash
# Re-download and re-process the URA planning-area boundaries.
#
# Source: data.gov.sg, "Master Plan 2019 Subzone Boundary (No Sea)"
#         dataset d_8594ae9ff96d0c708bc2af633048edfb
#         Singapore Open Data Licence v1.0
#
# Only needed when URA publishes a new Master Plan. The committed
# data/pa.geojson + data/inner.geojson are the processed outputs.
set -euo pipefail
cd "$(dirname "$0")/.."

DATASET=d_8594ae9ff96d0c708bc2af633048edfb
MS="npx -y mapshaper@0.6.102"

echo "==> resolving download url"
URL=$(curl -fsS "https://api-open.data.gov.sg/v1/public/api/datasets/$DATASET/poll-download" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.url))")

echo "==> downloading subzones"
curl -fsSL "$URL" -o data/subzone.geojson

echo "==> dissolving to the 55 planning areas"
$MS data/subzone.geojson \
  -dissolve2 PLN_AREA_N \
  -clean sliver-control=0 \
  -simplify 10% keep-shapes planar \
  -o precision=0.000001 format=geojson data/pa.geojson

echo "==> computing interior label points"
$MS data/pa.geojson -points inner -o format=geojson data/inner.geojson

echo "==> island silhouette for the favicon"
$MS data/pa.geojson -dissolve2 -simplify 1.2% keep-shapes planar \
  -filter-islands min-area=900000 -o format=geojson data/island.geojson

echo "==> generating src/data/geo.generated.ts"
node scripts/build-geo.mjs
