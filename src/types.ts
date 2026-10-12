export type Status = 'climbed' | 'unvisited';

export interface RangeProperties {
  id: string;
  name: string;
  parentId: string | null;
  countries: string[];
  status: Status;
  highestPeakId: string;
  heroImage: string;
  heroAlt: string;
  isDemo?: boolean;
}

export interface PeakProperties {
  id: string;
  name: string;
  elevationM: number;
  countries: string[];
  rangeId: string;
}

export interface GeoJsonFeature<P> {
  type: 'Feature';
  properties: P;
  geometry: GeoJSON.Geometry;
}

export interface FeatureCollection<P> {
  type: 'FeatureCollection';
  features: GeoJsonFeature<P>[];
}
