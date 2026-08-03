# Singapore Township Guessr

A click-the-map quiz over Singapore's **55 URA planning areas**, drawn from the
actual Master Plan 2019 boundaries. The game names an area, you find it on the
island, and you get told exactly how far off you were.

No backend, no accounts, no network calls at runtime. The whole map is 49 KB of
inline SVG path data.

## What's in it

**Four modes**

| Mode | What it is |
| --- | --- |
| Classic | Three tries an area. 100 / 55 / 25 points, plus a streak bonus that caps at +50. |
| Time attack | Clear the board against the clock. Every miss adds ten seconds. |
| Sudden death | One wrong click ends the run. |
| Field notes | No scoring. Tap anything, read what it is known for. |

**Scopes** — the whole island, any one of the five planning regions, or *weak
spots*: the fifteen areas you personally get wrong most often, worst first,
computed from a local mastery ledger.

**The miss mechanic.** A wrong click drops a survey probe showing the ground
distance to the target and nothing else, so two misses let you trilaterate your
way in. Bearing unlocks on the second miss. When the round resolves, a chord is
drawn from every click to the truth, labelled in kilometres and compass points.

**Getting it wrong is the fun part.** Three tries, three escalating shouts:
*Aiyo!* then *Alamak lah!* then *Cannot make it sial!*, thrown onto the map at
the exact spot you fumbled. Underneath it the game names what you actually hit
and takes a Singlish swing at the place, so a bad run still teaches you the
island. Sounds are synthesised at runtime with the Web Audio API rather than
shipped as files, and there is a mute toggle that survives a reload.

**The city core plate.** Eleven planning areas in the centre are tiny — Museum
and Straits View are both under a square kilometre. Street directories solve
this with a magnified inset, so this does too, and it is fully clickable.
Everything else gets a tap-assist circle bounded at 45% of the distance to its
nearest neighbour, so an assist can never swallow a click that belonged to
somebody else.

## Data

Boundaries come from
[data.gov.sg](https://data.gov.sg/datasets/d_8594ae9ff96d0c708bc2af633048edfb/view),
*Master Plan 2019 Subzone Boundary (No Sea)*, under the
[Singapore Open Data Licence v1.0](https://data.gov.sg/open-data-licence).
332 subzones are dissolved into the 55 official planning areas, simplified to
10%, projected to Web Mercator and fitted to a 1000-unit viewBox.

```
npm run geo              # regenerate src/data/geo.generated.ts from data/pa.geojson
./scripts/fetch-geo.sh   # re-download from data.gov.sg and reprocess (only when URA republishes)
npm run content          # regenerate src/data/content.ts from data/content.json + data/quips.json
```

Blurbs and quips live in separate JSON files so the Singlish can be rewritten
without touching the researched copy, and vice versa.
`scripts/build-content.mjs` refuses to build if any area is missing copy, if a
hint contains its own area's name, if a blurb has an em dash in it, or if a quip
carries its own exclamation mark (the game already shouted one).

The projection is verified against published coordinates in `src/lib/geo.test.ts`:
every area lands inside Singapore, Tuas to Changi measures 30-50 km, and the
scale bar is checked against the real width of the country.

## Running it

```
npm install
npm run dev
npm test          # 35 tests over the scoring engine, projection and reaction copy
npm run build
```

## Layout

```
src/
  data/geo.generated.ts   55 planning areas: SVG paths, label anchors, bboxes, neighbour gaps
  data/content.ts         blurb, hint and one verified fact per area
  data/areas.ts           joins the two, adds grid refs and tap-target maths
  game/engine.ts          pure reducer: scoring, streaks, tries, grades. No React.
  game/storage.ts         localStorage mastery ledger, records, queue building
  lib/geo.ts              inverse Mercator, haversine, bearings, street-directory grid refs
  lib/sfx.ts              Web Audio synthesis: no sound files, no network, mute persisted
  game/reactions.ts       the three-shout ladder
  map/useCamera.ts        pan, wheel zoom, pinch, tap-vs-drag, resize re-framing
  map/MapView.tsx         the plate: land, graticule, probes, chords, inset, furniture
  ui/                     start screen, prompt, hud, reveal card, results sheet
```

The engine is deliberately free of React and DOM so the scoring rules can be
tested directly.

## Notes on the writing

The blurbs are affectionate local stereotype plus a real, checkable fact. They
were drafted per region, fact-checked against sources, and edited as a set to
kill repeated jokes. Where an area's reputation is genuinely edgy (Geylang,
Changi Prison, Yishun's cursed meme, Pulau Tekong and National Service) it is
written honestly rather than sanded down. Yishun is, for the record,
statistically one of the safer estates.

## Licence

Code MIT. Boundary data under the Singapore Open Data Licence v1.0, attribution
retained in-app and above.
