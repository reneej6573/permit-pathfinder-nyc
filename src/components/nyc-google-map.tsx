/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import type { Neighborhood, PermitType } from "@/lib/permit-data";

interface Props {
  neighborhoods: Neighborhood[];
  permit: PermitType;
  selectedSlug: string;
  onSelect: (slug: string) => void;
}

declare global {
  interface Window {
    google?: typeof google;
    __initNycMap?: () => void;
    __nycMapReady?: boolean;
  }
}

const SCRIPT_ID = "google-maps-js";
const ZCTA_URL =
  "https://data.cityofnewyork.us/resource/pri4-ifjk.json?$select=modzcta,the_geom&$limit=500";

function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.maps) return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Maps failed to load")));
      return;
    }
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
    if (!key) return reject(new Error("Missing Google Maps key"));
    window.__initNycMap = () => {
      window.__nycMapReady = true;
      resolve();
    };
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initNycMap${
      channel ? `&channel=${channel}` : ""
    }`;
    s.onerror = () => reject(new Error("Maps script failed"));
    document.head.appendChild(s);
  });
}

// Sequential color ramp (light → bold brand orange) for choropleth fills.
const RAMP = ["#fde9e1", "#fbc7b0", "#f99e76", "#f47042", "#d94915", "#a32f08"];

function colorForDays(days: number, max: number): string {
  if (!days || days <= 0) return "#e7e5e4";
  const t = Math.min(1, days / Math.max(1, max));
  const idx = Math.min(RAMP.length - 1, Math.floor(t * RAMP.length));
  return RAMP[idx];
}

// Cache GeoJSON across instances/re-renders.
let zctaCache: Promise<Record<string, google.maps.Data.Feature[]>> | null = null;

interface SocrataGeom {
  type: "MultiPolygon" | "Polygon";
  coordinates: number[][][] | number[][][][];
}
interface ZctaRow {
  modzcta: string;
  the_geom: SocrataGeom;
}

async function loadZctaFeatures(): Promise<Record<string, google.maps.Data.Feature[]>> {
  if (zctaCache) return zctaCache;
  zctaCache = (async () => {
    const res = await fetch(ZCTA_URL);
    const rows: ZctaRow[] = await res.json();
    const byZip: Record<string, google.maps.Data.Feature[]> = {};
    for (const row of rows) {
      if (!row.the_geom || !row.modzcta) continue;
      const geojson = {
        type: "Feature" as const,
        properties: { zip: row.modzcta },
        geometry: row.the_geom,
      };
      const feats = new window.google!.maps.Data().addGeoJson(geojson);
      byZip[row.modzcta] = feats;
    }
    return byZip;
  })();
  return zctaCache;
}

export function NycGoogleMap({ neighborhoods, permit, selectedSlug, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const dataLayerRef = useRef<google.maps.Data | null>(null);
  const [ready, setReady] = useState(false);

  // Init map + load polygons once
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(async () => {
        if (cancelled || !containerRef.current || !window.google) return;
        const map = new window.google.maps.Map(containerRef.current, {
          center: { lat: 40.7308, lng: -73.9973 },
          zoom: 11,
          disableDefaultUI: false,
          mapTypeControl: false,
          streetViewControl: false,
          styles: [
            { elementType: "geometry", stylers: [{ color: "#f5f3ef" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#525252" }] },
            { featureType: "water", stylers: [{ color: "#cfe2eb" }] },
            { featureType: "road", stylers: [{ color: "#ffffff" }] },
            { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
            { featureType: "administrative", elementType: "labels", stylers: [{ visibility: "simplified" }] },
          ],
        });
        mapRef.current = map;

        const data = new window.google.maps.Data({ map });
        dataLayerRef.current = data;

        const byZip = await loadZctaFeatures();
        if (cancelled) return;
        // Add a fresh copy of each feature to this data layer.
        Object.entries(byZip).forEach(([zip, feats]) => {
          feats.forEach((f) => {
            const geom = f.getGeometry();
            if (!geom) return;
            data.add(new window.google!.maps.Data.Feature({ geometry: geom, properties: { zip } }));
          });
        });

        data.addListener("click", (ev: google.maps.Data.MouseEvent) => {
          const zip = ev.feature.getProperty("zip") as string | undefined;
          if (!zip) return;
          const match = neighborhoodsRef.current.find((n) => n.zips.includes(zip));
          if (match) onSelect(match.slug);
        });

        setReady(true);
      })
      .catch((err) => console.error("[NycGoogleMap]", err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a ref to latest neighborhoods for the stable click handler.
  const neighborhoodsRef = useRef(neighborhoods);
  useEffect(() => {
    neighborhoodsRef.current = neighborhoods;
  }, [neighborhoods]);

  // Re-style polygons whenever data, permit, or selection changes.
  useEffect(() => {
    const data = dataLayerRef.current;
    if (!data || !ready) return;
    const zipToDays = new Map<string, number>();
    for (const n of neighborhoods) {
      const d = n.days[permit];
      for (const z of n.zips) zipToDays.set(z, d);
    }
    const max = Math.max(1, ...Array.from(zipToDays.values()));
    data.setStyle((feature) => {
      const zip = feature.getProperty("zip") as string | undefined;
      const days = zip ? zipToDays.get(zip) : undefined;
      const isSel =
        zip && neighborhoods.find((n) => n.slug === selectedSlug)?.zips.includes(zip);
      return {
        fillColor: days ? colorForDays(days, max) : "#eeeae6",
        fillOpacity: days ? 0.78 : 0.25,
        strokeColor: isSel ? "#111111" : "#ffffff",
        strokeWeight: isSel ? 2.2 : 0.6,
        zIndex: isSel ? 10 : 1,
      };
    });
  }, [ready, neighborhoods, permit, selectedSlug]);

  // Zoom into selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const sel = neighborhoods.find((n) => n.slug === selectedSlug);
    if (sel) {
      map.panTo({ lat: sel.lat, lng: sel.lng });
      map.setZoom(14);
    } else {
      map.panTo({ lat: 40.7308, lng: -73.9973 });
      map.setZoom(11);
    }
  }, [selectedSlug, neighborhoods]);

  return <div ref={containerRef} className="absolute inset-0 w-full h-full" />;
}
