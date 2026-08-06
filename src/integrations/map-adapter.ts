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
 * The public app currently uses a Leaflet Canvas map. This small contract is
 * retained so a future ArcGIS, vector-tile, or other map can replace the view
 * without changing postcode loading or calculation code.
 */
export type PostcodeMapAdapterFactory = () => OptionalPostcodeMapAdapter;
