import {
  Map as MapLibreMap,
  NavigationControl,
  type LngLatBoundsLike,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
  type PaddingOptions,
} from 'maplibre-gl';
import { feature } from 'topojson-client';
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

const [ranges, peaks] = await Promise.all([
  loadGeoJson<RangeProperties>('data/ranges.geojson'),
  loadGeoJson<PeakProperties>('data/peaks.geojson'),
]);

const rangesById = new globalThis.Map(ranges.features.map((range) => [range.properties.id, range]));
const peaksById = new globalThis.Map(peaks.features.map((peak) => [peak.properties.id, peak]));
const map = new MapLibreMap({
  container: mapElement,
  style: {
    version: 8,
    sources: {},
    layers: [{ id: 'ocean', type: 'background', paint: { 'background-color': '#0d1c2a' } }],
  },
  center: [10, 26],
  zoom: 0.65,
  minZoom: 0.3,
  maxZoom: 9,
  attributionControl: false,
});

map.addControl(new NavigationControl({ showCompass: true }), 'bottom-right');

map.on('load', () => {
  map.setProjection({ type: 'globe' });
  const countriesObject = countriesTopology.objects.countries;
  const countries = feature(countriesTopology as never, countriesObject as never) as unknown as GeoJSON.FeatureCollection;

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
    id: 'range-fill',
    type: 'fill',
    source: 'ranges',
    paint: {
      'fill-color': ['match', ['get', 'status'], 'climbed', '#547b66', '#b86a4b'],
      'fill-opacity': 0.58,
    },
  });
  map.addLayer({
    id: 'range-outline',
    type: 'line',
    source: 'ranges',
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
    paint: { 'circle-radius': 7, 'circle-color': '#f8f2e6', 'circle-opacity': 0.95 },
  });
  map.addLayer({
    id: 'peak-marker',
    type: 'circle',
    source: 'peaks',
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

function selectRange(rangeId: string, fly: boolean): void {
  const range = rangesById.get(rangeId);
  if (!range) return;
  const peak = peaksById.get(range.properties.highestPeakId);
  if (!peak) return;

  map.setFilter('selected-range-outline', ['==', ['get', 'id'], rangeId]);
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
  if (fly) {
    const bounds = getBounds(range.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon);
    map.fitBounds(bounds, { padding: panelPadding(), maxZoom: 6.3, duration: 1050 });
  }
}

function clearSelection(): void {
  map.setFilter('selected-range-outline', ['==', ['get', 'id'], '']);
  panelElement.hidden = true;
  emptyStateElement.hidden = false;
  const url = new URL(window.location.href);
  url.searchParams.delete('range');
  window.history.replaceState({}, '', url);
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
