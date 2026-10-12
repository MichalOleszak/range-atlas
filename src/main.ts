import {
  Map as MapLibreMap,
  NavigationControl,
  type StyleSpecification,
  type LngLatBoundsLike,
  type FilterSpecification,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
  type PaddingOptions,
} from 'maplibre-gl';
import { feature } from 'topojson-client';
import { geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import countriesTopology from 'world-atlas/countries-110m.json';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import type { FeatureCollection, PeakProperties, RangeProperties } from './types';

const baseUrl = import.meta.env.BASE_URL;
const mapElement = document.querySelector<HTMLDivElement>('#map');
const panel = document.querySelector<HTMLElement>('#range-panel');
const emptyState = document.querySelector<HTMLElement>('#empty-state');

if (!mapElement || !panel || !emptyState) {
  throw new Error('The map interface could not be initialised.');
}
const panelElement = panel;
const emptyStateElement = emptyState;
const mapContainer = mapElement;

const [ranges, peaks] = await Promise.all([
  loadGeoJson<RangeProperties>('data/ranges.geojson'),
  loadGeoJson<PeakProperties>('data/peaks.geojson'),
]);

const rangesById = new globalThis.Map(ranges.features.map((range) => [range.properties.id, range]));
const peaksById = new globalThis.Map(peaks.features.map((peak) => [peak.properties.id, peak]));
const topLevelRangeIds = ranges.features
  .filter((range) => range.properties.parentId === null)
  .map((range) => range.properties.id);
const countriesObject = countriesTopology.objects.countries;
const countries = feature(countriesTopology as never, countriesObject as never) as unknown as GeoJSON.FeatureCollection;
let fallbackSelectedRangeId: string | null = null;
let globeRotation: [number, number] = [-10, -26];
let globeScale = 268;
const useSvgGlobe = new URLSearchParams(window.location.search).get('renderer') !== 'webgl';
const map = useSvgGlobe ? null : new MapLibreMap({
  container: mapContainer,
  style: {
    version: 8,
    projection: { type: 'globe' },
    sources: {},
    layers: [{ id: 'ocean', type: 'background', paint: { 'background-color': '#0d1c2a' } }],
  } as StyleSpecification,
  center: [10, 26],
  zoom: 0.65,
  minZoom: 0.3,
  maxZoom: 9,
  attributionControl: false,
});

if (map) {
  map.addControl(new NavigationControl({ showCompass: true }), 'bottom-right');

  map.on('load', () => {

  map.addSource('countries', { type: 'geojson', data: countries });
  map.addLayer({
    id: 'country-fill',
    type: 'fill',
    source: 'countries',
    paint: { 'fill-color': '#e8e4d9', 'fill-opacity': 1 },
  });
  map.addLayer({
    id: 'country-borders',
    type: 'line',
    source: 'countries',
    paint: { 'line-color': '#b3b5ab', 'line-width': 0.65, 'line-opacity': 0.8 },
  });
  map.addSource('ranges', { type: 'geojson', data: ranges });
  map.addSource('peaks', { type: 'geojson', data: peaks });
  map.addLayer({
    id: 'parent-context-fill',
    type: 'fill',
    source: 'ranges',
    filter: rangeIdFilter([]),
    paint: { 'fill-color': '#f8f2e6', 'fill-opacity': 0.14 },
  });
  map.addLayer({
    id: 'parent-context-outline',
    type: 'line',
    source: 'ranges',
    filter: rangeIdFilter([]),
    paint: { 'line-color': '#f8f2e6', 'line-width': 1.1, 'line-opacity': 0.55 },
  });
  map.addLayer({
    id: 'range-fill',
    type: 'fill',
    source: 'ranges',
    filter: rangeIdFilter(topLevelRangeIds),
    paint: {
      'fill-color': ['match', ['get', 'status'], 'climbed', '#547b66', '#b86a4b'],
      'fill-opacity': 0.58,
    },
  });
  map.addLayer({
    id: 'range-outline',
    type: 'line',
    source: 'ranges',
    filter: rangeIdFilter(topLevelRangeIds),
    paint: { 'line-color': '#382c28', 'line-width': 1.25, 'line-opacity': 0.9 },
  });
  map.addLayer({
    id: 'selected-range-outline',
    type: 'line',
    source: 'ranges',
    filter: ['==', ['get', 'id'], ''],
    paint: { 'line-color': '#f8f2e6', 'line-width': 2.8, 'line-opacity': 1 },
  });
  map.addLayer({
    id: 'peak-marker-halo',
    type: 'circle',
    source: 'peaks',
    filter: peakRangeFilter(topLevelRangeIds),
    paint: { 'circle-radius': 7, 'circle-color': '#f8f2e6', 'circle-opacity': 0.95 },
  });
  map.addLayer({
    id: 'peak-marker',
    type: 'circle',
    source: 'peaks',
    filter: peakRangeFilter(topLevelRangeIds),
    paint: { 'circle-radius': 4.2, 'circle-color': '#263b46', 'circle-stroke-color': '#10212a', 'circle-stroke-width': 1 },
  });

  map.on('mouseenter', 'range-fill', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'range-fill', () => {
    map.getCanvas().style.cursor = '';
  });
  map.on('click', 'range-fill', (event: MapLayerMouseEvent) => {
    const selected = event.features?.[0] as MapGeoJSONFeature | undefined;
    const id = selected?.properties?.id;
    if (typeof id === 'string') selectRange(id, true);
  });
  map.on('click', 'peak-marker', (event: MapLayerMouseEvent) => {
    const selected = event.features?.[0] as MapGeoJSONFeature | undefined;
    const rangeId = selected?.properties?.rangeId;
    if (typeof rangeId === 'string') selectRange(rangeId, true);
  });

  const requestedRange = new URLSearchParams(window.location.search).get('range');
  if (requestedRange && rangesById.has(requestedRange)) selectRange(requestedRange, false);
  });
} else {
  const requestedRange = new URLSearchParams(window.location.search).get('range');
  if (requestedRange && rangesById.has(requestedRange)) selectRange(requestedRange, false);
  else renderFallbackMap();
}

function selectRange(rangeId: string, fly: boolean): void {
  const range = rangesById.get(rangeId);
  if (!range) return;
  const peak = peaksById.get(range.properties.highestPeakId);
  if (!peak) return;

  fallbackSelectedRangeId = rangeId;
  if (map) {
    updateVisibleLayers(rangeId);
    map.setFilter('selected-range-outline', ['==', ['get', 'id'], rangeId]);
  } else {
    if (fly) focusFallbackRange(range);
    renderFallbackMap();
  }
  emptyStateElement.hidden = true;
  panelElement.hidden = false;
  panelElement.innerHTML = renderRangePanel(range.properties, peak.properties);
  panelElement.querySelector<HTMLButtonElement>('[data-close-panel]')?.addEventListener('click', clearSelection);
  panelElement.querySelector<HTMLButtonElement>('[data-parent-id]')?.addEventListener('click', (event) => {
    const parentId = (event.currentTarget as HTMLButtonElement).dataset.parentId;
    if (parentId) selectRange(parentId, true);
  });

  const url = new URL(window.location.href);
  url.searchParams.set('range', rangeId);
  window.history.replaceState({}, '', url);
  if (fly && map) {
    const bounds = getBounds(range.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon);
    map.fitBounds(bounds, { padding: panelPadding(), maxZoom: 6.3, duration: 1050 });
  }
}

function clearSelection(): void {
  fallbackSelectedRangeId = null;
  if (map) {
    updateVisibleLayers(null);
    map.setFilter('selected-range-outline', ['==', ['get', 'id'], '']);
  } else {
    renderFallbackMap();
  }
  panelElement.hidden = true;
  emptyStateElement.hidden = false;
  const url = new URL(window.location.href);
  url.searchParams.delete('range');
  window.history.replaceState({}, '', url);
}

function updateVisibleLayers(selectedId: string | null): void {
  if (!map) return;
  const selected = selectedId ? rangesById.get(selectedId) : undefined;
  const childIds = selected
    ? ranges.features
      .filter((range) => range.properties.parentId === selected.properties.id)
      .map((range) => range.properties.id)
    : [];
  const primaryIds = selected ? [selected.properties.id, ...childIds] : topLevelRangeIds;
  const parentId = selected?.properties.parentId ?? null;
  const peakRangeIds = parentId ? [parentId, ...primaryIds] : primaryIds;

  map.setFilter('range-fill', rangeIdFilter(primaryIds));
  map.setFilter('range-outline', rangeIdFilter(primaryIds));
  map.setFilter('parent-context-fill', rangeIdFilter(parentId ? [parentId] : []));
  map.setFilter('parent-context-outline', rangeIdFilter(parentId ? [parentId] : []));
  map.setFilter('peak-marker-halo', peakRangeFilter(peakRangeIds));
  map.setFilter('peak-marker', peakRangeFilter(peakRangeIds));
}

function renderFallbackMap(): void {
  const width = 1200;
  const height = 600;
  const projection = geoOrthographic()
    .translate([width / 2, height / 2])
    .scale(globeScale)
    .rotate(globeRotation)
    .clipAngle(90)
    .precision(0.25);
  const pathGenerator = geoPath(projection);
  const selected = fallbackSelectedRangeId ? rangesById.get(fallbackSelectedRangeId) : undefined;
  const childIds = selected
    ? ranges.features.filter((range) => range.properties.parentId === selected.properties.id).map((range) => range.properties.id)
    : [];
  const primaryIds = selected ? [selected.properties.id, ...childIds] : topLevelRangeIds;
  const parentId = selected?.properties.parentId ?? null;
  const visibleIds = new Set([...primaryIds, ...(parentId ? [parentId] : [])]);

  mapContainer.replaceChildren();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('fallback-map');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'application');
  svg.setAttribute('aria-label', 'Interactive globe showing mountain ranges. Drag to rotate and scroll to zoom.');
  installGlobeInteractions(svg);

  const sphere = document.createElementNS(svg.namespaceURI, 'path') as SVGPathElement;
  sphere.setAttribute('d', pathGenerator({ type: 'Sphere' }) ?? '');
  sphere.setAttribute('class', 'fallback-globe');
  svg.append(sphere);
  const graticule = document.createElementNS(svg.namespaceURI, 'path') as SVGPathElement;
  graticule.setAttribute('d', pathGenerator(geoGraticule10()) ?? '');
  graticule.setAttribute('class', 'fallback-graticule');
  svg.append(graticule);

  for (const country of countries.features) {
    if (!country.geometry) continue;
    const path = document.createElementNS(svg.namespaceURI, 'path') as SVGPathElement;
    path.setAttribute('d', pathGenerator(country) ?? '');
    path.setAttribute('class', 'fallback-country');
    svg.append(path);
  }
  for (const range of ranges.features) {
    const id = range.properties.id;
    if (!visibleIds.has(id)) continue;
    const path = document.createElementNS(svg.namespaceURI, 'path') as SVGPathElement;
    path.setAttribute('d', pathGenerator(range) ?? '');
    path.setAttribute('class', id === parentId ? 'fallback-range fallback-range--parent' : `fallback-range fallback-range--${range.properties.status}`);
    path.setAttribute('tabindex', '0');
    path.setAttribute('aria-label', `View ${range.properties.name}`);
    path.addEventListener('click', () => selectRange(id, true));
    path.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') selectRange(id, true);
    });
    svg.append(path);
  }
  for (const peak of peaks.features) {
    if (!visibleIds.has(peak.properties.rangeId)) continue;
    const [longitude, latitude] = (peak.geometry as GeoJSON.Point).coordinates as [number, number];
    const position = projection([longitude, latitude]);
    if (!position) continue;
    const [x, y] = position;
    const point = document.createElementNS(svg.namespaceURI, 'circle');
    point.setAttribute('cx', String(x));
    point.setAttribute('cy', String(y));
    point.setAttribute('r', '5');
    point.setAttribute('class', 'fallback-peak');
    point.setAttribute('tabindex', '0');
    point.setAttribute('aria-label', `View ${peak.properties.name}`);
    point.addEventListener('click', () => selectRange(peak.properties.rangeId, true));
    svg.append(point);
  }
  mapContainer.append(svg);
}

function installGlobeInteractions(svg: SVGSVGElement): void {
  svg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startRotation: [number, number] = [...globeRotation];
    let moved = false;
    const move = (pointerEvent: PointerEvent) => {
      const deltaX = pointerEvent.clientX - startX;
      const deltaY = pointerEvent.clientY - startY;
      moved ||= Math.abs(deltaX) + Math.abs(deltaY) > 3;
      globeRotation = [startRotation[0] + deltaX * 0.28, clamp(startRotation[1] - deltaY * 0.28, -78, 78)];
      renderFallbackMap();
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      if (moved) window.setTimeout(() => { moved = false; }, 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
  });
  svg.addEventListener('wheel', (event) => {
    event.preventDefault();
    globeScale = clamp(globeScale * (event.deltaY < 0 ? 1.12 : 0.89), 190, 980);
    renderFallbackMap();
  }, { passive: false });
}

function focusFallbackRange(range: FeatureCollection<RangeProperties>['features'][number]): void {
  const coordinates = range.geometry.type === 'Polygon'
    ? range.geometry.coordinates.flat(1)
    : range.geometry.type === 'MultiPolygon'
      ? range.geometry.coordinates.flat(2)
      : [];
  if (coordinates.length === 0) return;
  const [longitude, latitude] = coordinates.reduce<[number, number]>((sum, [currentLongitude, currentLatitude]) => [sum[0] + currentLongitude, sum[1] + currentLatitude], [0, 0]);
  globeRotation = [-longitude / coordinates.length, -latitude / coordinates.length];
  globeScale = 620;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function rangeIdFilter(ids: string[]): FilterSpecification {
  return ['in', ['get', 'id'], ['literal', ids]];
}

function peakRangeFilter(rangeIds: string[]): FilterSpecification {
  return ['in', ['get', 'rangeId'], ['literal', rangeIds]];
}

function renderRangePanel(range: RangeProperties, peak: PeakProperties): string {
  const parent = range.parentId ? rangesById.get(range.parentId)?.properties : undefined;
  const status = range.status === 'climbed' ? 'Climbed' : 'Unvisited';
  const demo = range.isDemo ? '<p class="prototype-note">Prototype content — replace this test range with your first real entry.</p>' : '';
  return `
    <button class="close-button" type="button" aria-label="Close range details" data-close-panel>×</button>
    <img class="hero-image" src="${baseUrl}${escapeHtml(range.heroImage)}" alt="${escapeHtml(range.heroAlt)}" />
    <div class="panel-content">
      <p class="eyebrow">Mountain range</p>
      <h1>${escapeHtml(range.name)}</h1>
      <p class="status status--${range.status}"><span></span>${status}</p>
      <dl>
        <div><dt>Highest peak</dt><dd>${escapeHtml(peak.name)} · ${peak.elevationM.toLocaleString('en')} m</dd></div>
        <div><dt>Peak country${peak.countries.length > 1 ? 'ies' : ''}</dt><dd>${formatCountries(peak.countries)}</dd></div>
        <div><dt>Range countr${range.countries.length > 1 ? 'ies' : 'y'}</dt><dd>${formatCountries(range.countries)}</dd></div>
        ${parent ? `<div><dt>Parent range</dt><dd><button class="link-button" type="button" data-parent-id="${escapeHtml(parent.id)}">${escapeHtml(parent.name)}</button></dd></div>` : ''}
      </dl>
      ${demo}
    </div>
  `;
}

function formatCountries(countries: string[]): string {
  return countries.join(', ');
}

function getBounds(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): LngLatBoundsLike {
  const coordinates = geometry.type === 'Polygon' ? geometry.coordinates.flat(1) : geometry.coordinates.flat(2);
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [longitude, latitude] of coordinates) {
    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  }
  return [[west, south], [east, north]];
}

function panelPadding(): PaddingOptions {
  return window.matchMedia('(min-width: 760px)').matches
    ? { top: 110, bottom: 80, left: 80, right: 470 }
    : { top: 80, bottom: 390, left: 36, right: 36 };
}

async function loadGeoJson<P>(path: string): Promise<FeatureCollection<P>> {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(`Could not load ${path}.`);
  return response.json() as Promise<FeatureCollection<P>>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}
