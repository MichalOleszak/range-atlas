# Range Atlas

A personal, globe-based atlas of mountain ranges and their highest summits.

The map is a static GitHub Pages site. It has no external map-tile or WebGL
dependency: the globe and country boundaries are rendered locally as SVG, while
range geometry, summits, and photos are maintained in this repository.

Drag the globe to rotate it and use a trackpad pinch or mouse wheel to zoom.
Selecting a range or its highest-peak marker centres and zooms the globe on that
range.

## Run locally

```bash
npm install
npm run dev
```

Run the same checks that GitHub Actions runs with:

```bash
npm run build
```

## Add a mountain range

Range geometry is ordinary GeoJSON in `public/data/ranges.geojson`. The easiest
workflow is [geojson.io](https://geojson.io):

1. Clone the repository and open `public/data/ranges.geojson` in geojson.io
   (drag the file onto the map, or use **Open**).
2. Choose the **Polygon** drawing tool and trace the mountain range. Close the
   shape by clicking its first point. Use `MultiPolygon` only for genuinely
   separate parts of one range.
3. Give the new feature the properties shown below. IDs must be lowercase,
   hyphen-separated, and unique.
4. Save/export as **GeoJSON** and replace `public/data/ranges.geojson` in your
   local checkout. Do not export a JavaScript or KML file.
5. Add the range's highest summit to `public/data/peaks.geojson`, add its hero
   photo, and run `npm run build` before committing.

Coordinates are standard GeoJSON longitude/latitude (`[longitude, latitude]`)
in WGS 84. Parent polygons do not need to be the exact union of their
subranges; draw the extent that best represents the range.

Export ordinary GeoJSON from geojson.io rather than hand-reversing polygon
points. Range Atlas defensively corrects a polygon that would otherwise render
as its globe-spanning inverse, but a normal GeoJSON exterior ring is preferred.

### Range properties

```json
{
  "id": "western-alps",
  "name": "Western Alps",
  "parentId": "alps",
  "countries": ["CH", "FR", "IT"],
  "status": "unvisited",
  "highestPeakId": "mont-blanc",
  "heroImage": "images/ranges/western-alps.webp",
  "heroAlt": "Snow-covered ridge in the Western Alps"
}
```

- `parentId` is `null` for a top-level range. A child range must use an existing
  range ID. The map shows top-level ranges first, then reveals children after
  selecting their parent.
- Use ISO 3166-1 alpha-2 country codes.
- `status` is either `climbed` or `unvisited`.
- `highestPeakId` must refer to exactly one feature in `peaks.geojson`.
- `heroImage` is relative to `public/`; use an optimised `.webp` or `.avif`.
- `heroAlt` describes the photo for people using screen readers.

### Highest-peak properties

Add one `Point` feature to `public/data/peaks.geojson` for every range's
highest summit:

```json
{
  "id": "mont-blanc",
  "name": "Mont Blanc",
  "elevationM": 4805,
  "countries": ["FR", "IT"],
  "rangeId": "western-alps"
}
```

`countries` has one or two ISO country codes. Use two where a peak lies on an
international border. `rangeId` must refer to the range that presents the peak
as its highest summit.

### Photos

Store the single hero photo at `public/images/ranges/<range-id>.webp` (or
`.avif`). Keep it web-sized rather than adding camera originals. Photos and
map data are your copyrighted material and are excluded from the repository's
source-code licence.

## Data checks

`npm run build` validates GeoJSON before building the site. It rejects duplicate
IDs, invalid geometry types, missing parent/peak references, invalid statuses,
and missing hero-image paths. A failed validation also prevents deployment from
GitHub Actions.

## Deployment

Every push to `main` runs the validation, builds the static site, and deploys
it to GitHub Pages through `.github/workflows/deploy.yml`.

## Prototype data

The initial `Test Range` and `Test Peak` are fictional PoC data. Replace or
remove them when adding real content.

## Attribution

Country boundaries are derived from [Natural Earth](https://www.naturalearthdata.com/)
at 1:50m scale, public-domain map data bundled through the `world-atlas` package.
