// File: src/app/dashboard/map/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Map as MapIcon, Layers, Network } from "lucide-react"; // Removed Crosshair from imports as it's built natively into the pins now
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { db } from "@/lib/firebase";

// Native Firebase
import { collection, onSnapshot } from "firebase/firestore";

export default function AirfieldMapOverlayPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  
  // 🟢 NATIVE GIS MARKER TRACKER
  const markersRef = useRef<{ [key: string]: maplibregl.Marker }>({});
  
  const [mapProjects, setMapProjects] = useState<any[]>([]);
  const [geoLayers, setGeoLayers] = useState<any[]>([]);
  const [hoveredProject, setHoveredProject] = useState<any>(null);
  const [visibleLayers, setVisibleLayers] = useState<string[]>(["nodes", "uploaded_shapes"]);

  // Tweak these micro-decimal numbers until your blueprint perfectly snaps into place
  const LAT_OFFSET = -0.00000; 
  const LNG_OFFSET = 0.00000;  

  // 1. Initialize Native WebGL Map Engine
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [-98.4683, 29.5312], // Centered over SAT Airfield Coordinates
      zoom: 14,
      attributionControl: false
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 2. Fetch Projects and GeoLayers
  useEffect(() => {
    const unsubProjects = onSnapshot(
      collection(db, "admin_projects"),
      (snapshot) => {
        setMapProjects(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (error: Error) => {
        console.error("Firestore admin_projects listener error:", error);
      }
    );

    const unsubLayers = onSnapshot(collection(db, "airfield_map_layers"), (snapshot) => {
        const layers = snapshot.docs.map(doc => {
        const data = doc.data();
        let parsedFeatureCollection = null;
        
        try {
            if (data.geometryDataString) {
            const rawGeo = JSON.parse(data.geometryDataString);
            
            const applyOffset = (coords: any): any => {
                if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
                return [coords[0] + LNG_OFFSET, coords[1] + LAT_OFFSET];
                }
                return coords.map(applyOffset);
            };

            if (rawGeo.features) {
                rawGeo.features = rawGeo.features.map((f: any) => {
                if (f.geometry && f.geometry.coordinates) {
                    f.geometry.coordinates = applyOffset(f.geometry.coordinates);
                }
                return f;
                });
            } else if (rawGeo.coordinates) {
                rawGeo.coordinates = applyOffset(rawGeo.coordinates);
            }
            
            if (rawGeo.type === "FeatureCollection") {
                parsedFeatureCollection = rawGeo;
            } else if (rawGeo.type === "Feature") {
                parsedFeatureCollection = { type: "FeatureCollection", features: [rawGeo] };
            } else {
                parsedFeatureCollection = {
                type: "FeatureCollection",
                features: [{ type: "Feature", geometry: rawGeo, properties: {} }]
                };
            }
            }
        } catch (err) {
            console.error(`Failed to map layers for: ${data.layerName}`, err);
        }

        return {
            id: doc.id,
            layerName: data.layerName,
            geoJsonData: parsedFeatureCollection
        };
        });
        setGeoLayers(layers);
    }, (error: Error) => console.error("Firestore airfield_map_layers listener error:", error));

    return () => { unsubProjects(); unsubLayers(); };
  }, []);

  // 3. Inject and Toggle Vector Geospatial Overlays Directly on Style Load
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleLayerUpdate = () => {
      geoLayers.forEach((layer) => {
        const sourceId = `src-${layer.id}`;
        const fillId = `fill-${layer.id}`;
        const lineId = `line-${layer.id}`;

        if (!layer.geoJsonData) return;
        const visibility = visibleLayers.includes("uploaded_shapes") ? "visible" : "none";

        if (map.getSource(sourceId)) {
          const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
          source.setData(layer.geoJsonData);
          if (map.getLayer(fillId)) map.setLayoutProperty(fillId, "visibility", visibility);
          if (map.getLayer(lineId)) map.setLayoutProperty(lineId, "visibility", visibility);
        } else {
          map.addSource(sourceId, { type: "geojson", data: layer.geoJsonData });
          
          map.addLayer({
            id: fillId,
            type: "fill",
            source: sourceId,
            layout: { visibility },
            paint: { 
              "fill-color": "#1EA7F4", 
              "fill-opacity": layer.id === "footprint" ? 0.08 : 0.03 
            }
          });

          map.addLayer({
            id: lineId,
            type: "line",
            source: sourceId,
            layout: { visibility },
            paint: { 
              "line-color": "#1EA7F4", 
              "line-width": layer.id === "section" ? 2.0 : 1.2, 
              "line-opacity": 0.45 
            }
          });
        }
      });
    };

    if (map.isStyleLoaded()) {
      handleLayerUpdate();
    } else {
      map.once("style.load", handleLayerUpdate);
    }
  }, [geoLayers, visibleLayers]);

  // 🟢 4. THE NATIVE GEOGRAPHIC MARKER ENGINE
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Clear pins if layer is turned off
    if (!visibleLayers.includes("nodes")) {
      Object.values(markersRef.current).forEach(m => m.remove());
      markersRef.current = {};
      return;
    }

    const activeIds = mapProjects.map(p => p.id);

    mapProjects.forEach((p) => {
      // Safely check for flat OR nested coordinates to sync flawlessly with Admin Panel
      const lat = p.coordinates?.lat || p.latitude || 29.5312;
      const lng = p.coordinates?.lng || p.longitude || -98.4683;

      if (markersRef.current[p.id]) {
        // Smoothly update position if edited in the admin panel
        markersRef.current[p.id].setLngLat([lng, lat]);
      } else {
        // Create custom HTML marker element
        const el = document.createElement('div');
        el.className = 'cursor-pointer z-50'; 
        el.innerHTML = `
          <div class="relative flex items-center justify-center h-8 w-8 rounded-full bg-slate-950 border-2 border-[#1EA7F4] text-[#1EA7F4] shadow-2xl hover:bg-[#1EA7F4] hover:text-white transition-all duration-150">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/></svg>
            <span class="absolute top-9 bg-slate-900/90 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shadow border border-slate-800 whitespace-nowrap">
              ${p.id}
            </span>
          </div>
        `;
        
        // Bind hover events for the top-left HUD
        el.addEventListener('mouseenter', () => setHoveredProject(p));
        el.addEventListener('mouseleave', () => setHoveredProject(null));

        // Inject exactly onto the true geographic grid
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);

        markersRef.current[p.id] = marker;
      }
    });

    // Clean up pins if a project is deleted from the Admin Portal
    Object.keys(markersRef.current).forEach(id => {
      if (!activeIds.includes(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });
  }, [mapProjects, visibleLayers]);

  const toggleLayer = (layerId: string) => {
    setVisibleLayers(prev =>
      prev.includes(layerId) ? prev.filter(l => l !== layerId) : [...prev, layerId]
    );
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-2">
          <MapIcon className="h-6 w-6 text-[#142E88]" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Airfield Geospatial Overlay</h1>
            <p className="text-sm text-slate-500">True geographic cartographic tracking of layout vectors and active terminal layers.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded border text-xs">
          <span className="px-2 font-bold text-slate-500 uppercase text-[10px] flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" /> Active Map Layers:
          </span>
          <button 
            onClick={() => toggleLayer("nodes")} 
            className={`px-3 py-1 font-semibold rounded-sm transition-colors ${visibleLayers.includes("nodes") ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'}`}
          >
            Project Pins
          </button>
          <button 
            onClick={() => toggleLayer("uploaded_shapes")} 
            className={`px-3 py-1 font-semibold rounded-sm transition-colors ${visibleLayers.includes("uploaded_shapes") ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'}`}
          >
            Terminal Layout Vector ({geoLayers.length} Layers Live)
          </button>
        </div>
      </div>

      <div className="relative">
        <Card className="border-slate-200 shadow-sm rounded-sm overflow-hidden h-[750px] relative bg-slate-950">
          
          {/* NATIVE DIRECT DOM CONTAINER INJECTION WINDOW */}
          <div ref={mapContainerRef} className="w-full h-full absolute inset-0 z-0" />

          {/* CLEAN TOP-LEFT CORNER HUD SUMMARY CARD */}
          {hoveredProject && (
            <div className="absolute top-4 left-4 z-50 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-sm p-4 w-[320px] shadow-2xl space-y-3 pointer-events-none animation-fade-in">
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-1.5">
                  <Badge className="bg-slate-900 text-white font-mono text-[9px] rounded-xs">{hoveredProject.id}</Badge>
                  <Badge className="bg-blue-50 text-blue-700 border-blue-100 font-bold text-[9px] shadow-none rounded-xs">{hoveredProject.program}</Badge>
                </div>
                <span className="text-[10px] font-mono text-slate-400">WBS Bound</span>
              </div>
              
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-slate-900 leading-tight">{hoveredProject.name}</h3>
                <p className="text-[10px] font-mono text-slate-400 tracking-tight">{hoveredProject.wbs}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs">
                <div>
                  <span className="block text-[9px] font-bold text-slate-400 uppercase">Approved Budget</span>
                  <span className="font-bold text-[#142E88]">${(hoveredProject.budget || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="block text-[9px] font-bold text-slate-400 uppercase">Geospatial Center</span>
                  <span className="font-mono text-slate-600 text-[10px]">{
                    (hoveredProject.coordinates?.lat || hoveredProject.latitude || 0).toFixed(6)
                  }°N, {
                    (hoveredProject.coordinates?.lng || hoveredProject.longitude || 0).toFixed(6)
                  }°W</span>
                </div>
              </div>

              <div className="bg-slate-50 border p-2 rounded-xs flex items-start gap-1.5 text-[10px] text-slate-500 leading-relaxed">
                <Network className="h-3.5 w-3.5 text-purple-500 shrink-0 mt-0.5" />
                <span>True spatial scaling matches design shapes over geography flawlessly.</span>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
