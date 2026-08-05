export interface MapFocusTarget {
  postcode: string;
  latitude: number;
  longitude: number;
}

export interface OptionalPostcodeMapAdapter {
  mount(container: HTMLElement, boundaryGeoJsonUrl: string): Promise<void>;
  focus(target: MapFocusTarget): Promise<void>;
  destroy(): void;
}

/**
 * The Phase 4 application does not instantiate a map. A later MapLibre,
 * Leaflet, ArcGIS JS, or other adapter can implement this contract without
 * changing postcode loading or calculation code.
 */
export type PostcodeMapAdapterFactory = () => OptionalPostcodeMapAdapter;
