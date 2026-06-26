/// <reference types="google.maps" />
import { useEffect, useRef } from "react";
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

function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const onReady = () => resolve();
    if (existing) {
      if (window.google?.maps) return resolve();
      existing.addEventListener("load", onReady);
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

function colorFor(days: number): string {
  if (days < 40) return "#16a34a";
  if (days < 90) return "#f59e0b";
  return "#ff5722";
}

export function NycGoogleMap({ neighborhoods, permit, selectedSlug, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());

  // Init map once
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return;
        mapRef.current = new window.google.maps.Map(containerRef.current, {
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
          ],
        });
      })
      .catch((err) => {
        console.error("[NycGoogleMap]", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync markers with neighborhoods + permit
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    const existing = markersRef.current;

    neighborhoods.forEach((n) => {
      const days = n.days[permit];
      const color = colorFor(days);
      const isSel = n.slug === selectedSlug;
      let marker = existing.get(n.slug);
      const icon: google.maps.Symbol = {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: isSel ? 13 : 9,
        fillColor: color,
        fillOpacity: 0.85,
        strokeColor: "#ffffff",
        strokeWeight: isSel ? 3 : 2,
      };
      if (!marker) {
        marker = new window.google.maps.Marker({
          position: { lat: n.lat, lng: n.lng },
          map,
          title: `${n.name} — ${days}d`,
          icon,
        });
        marker.addListener("click", () => onSelect(n.slug));
        existing.set(n.slug, marker);
      } else {
        marker.setIcon(icon);
        marker.setTitle(`${n.name} — ${days}d`);
      }
    });
  }, [neighborhoods, permit, selectedSlug, onSelect]);

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
