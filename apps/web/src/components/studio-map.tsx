"use client";
import { useEffect, useRef } from "react";

export function StudioMap() {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!target.current) {
      return;
    }
    let disposed = false;
    let map: import("maplibre-gl").Map | undefined;
    (async () => {
      const lib = await import("maplibre-gl");
      if (disposed || !target.current) {
        return;
      }
      map = new lib.Map({
        attributionControl: false,
        center: [-93.265, 44.978],
        container: target.current,
        maxZoom: 18,
        style: {
          glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
          layers: [{ id: "osm-raster", source: "osm", type: "raster" }],
          sources: {
            osm: {
              attribution: "© OpenStreetMap contributors",
              tileSize: 256,
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              type: "raster",
            },
          },
          version: 8,
        },
        zoom: 9.8,
      });
      map.addControl(
        new lib.NavigationControl({ visualizePitch: true }),
        "bottom-right"
      );
      map.addControl(
        new lib.AttributionControl({ compact: true }),
        "bottom-left"
      );
    })().catch(() => {
      /* Map tiles may be blocked; keep list usable. */
    });
    return () => {
      disposed = true;
      map?.remove();
    };
  }, []);
  return (
    <div className="studio-map-wrap">
      <section
        aria-label="Twin Cities geographic exploration map"
        className="studio-map"
        ref={target}
      />
      <div className="studio-map-caption">Twin Cities · Geographic view</div>
      <div className="studio-map-nopins">
        <strong>No verified coordinates yet</strong>
        <span>
          Imported prospects appear on this map after geocoding and location
          verification.
        </span>
      </div>
    </div>
  );
}
