import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const ranges = readGeoJson('public/data/ranges.geojson');
const peaks = readGeoJson('public/data/peaks.geojson');
const failures = [];

if (ranges.type !== 'FeatureCollection' || peaks.type !== 'FeatureCollection') {
  failures.push('Range and peak data must both be GeoJSON FeatureCollections.');
}

const rangeIds = new Set();
for (const item of ranges.features ?? []) {
  const { properties = {}, geometry } = item;
  const id = properties.id;
  if (!id || typeof id !== 'string') failures.push('Every range needs a string properties.id.');
  else if (rangeIds.has(id)) failures.push(`Duplicate range ID: ${id}.`);
  else rangeIds.add(id);
  if (!['Polygon', 'MultiPolygon'].includes(geometry?.type)) failures.push(`Range ${id ?? '(unknown)'} must use Polygon or MultiPolygon geometry.`);
  if (!['climbed', 'unvisited'].includes(properties.status)) failures.push(`Range ${id ?? '(unknown)'} has an invalid status.`);
  if (!Array.isArray(properties.countries) || properties.countries.length === 0) failures.push(`Range ${id ?? '(unknown)'} needs at least one country code.`);
  if (!properties.highestPeakId) failures.push(`Range ${id ?? '(unknown)'} needs a highestPeakId.`);
  if (!properties.heroImage || !existsSync(resolve(root, 'public', properties.heroImage))) failures.push(`Range ${id ?? '(unknown)'} references a missing hero image.`);
}

const peakIds = new Set();
for (const item of peaks.features ?? []) {
  const { properties = {}, geometry } = item;
  const id = properties.id;
  if (!id || typeof id !== 'string') failures.push('Every peak needs a string properties.id.');
  else if (peakIds.has(id)) failures.push(`Duplicate peak ID: ${id}.`);
  else peakIds.add(id);
  if (geometry?.type !== 'Point') failures.push(`Peak ${id ?? '(unknown)'} must use Point geometry.`);
  if (!Number.isFinite(properties.elevationM)) failures.push(`Peak ${id ?? '(unknown)'} needs a numeric elevationM.`);
  if (!Array.isArray(properties.countries) || properties.countries.length === 0 || properties.countries.length > 2) failures.push(`Peak ${id ?? '(unknown)'} needs one or two country codes.`);
}

for (const item of ranges.features ?? []) {
  const { id, parentId, highestPeakId } = item.properties ?? {};
  if (parentId && !rangeIds.has(parentId)) failures.push(`Range ${id} refers to an unknown parentId: ${parentId}.`);
  if (highestPeakId && !peakIds.has(highestPeakId)) failures.push(`Range ${id} refers to an unknown highestPeakId: ${highestPeakId}.`);
}
for (const item of peaks.features ?? []) {
  const { id, rangeId } = item.properties ?? {};
  if (!rangeIds.has(rangeId)) failures.push(`Peak ${id} refers to an unknown rangeId: ${rangeId}.`);
}

if (failures.length) {
  console.error('Data validation failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`Data valid: ${ranges.features.length} range(s), ${peaks.features.length} peak(s).`);

function readGeoJson(file) {
  return JSON.parse(readFileSync(resolve(root, file), 'utf8'));
}
