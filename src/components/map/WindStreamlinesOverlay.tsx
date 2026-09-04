"use client";

import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Storm } from "@/lib/types";

interface WindStreamlinesOverlayProps {
  map: MapLibreMap | null;
  storm: Storm | null;
  enabled?: boolean;
}

const PARTICLE_COUNT = 450;
const TRAIL_LENGTH = 7;

export default function WindStreamlinesOverlay({
  map,
  storm,
  enabled = true,
}: WindStreamlinesOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!enabled || !map) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (container) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = container.clientWidth * dpr;
        canvas.height = container.clientHeight * dpr;
        ctx.scale(dpr, dpr);
      }
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const getWidth = () => canvas.parentElement?.clientWidth || window.innerWidth;
    const getHeight = () => canvas.parentElement?.clientHeight || window.innerHeight;

    interface ScreenParticle {
      x: number;
      y: number;
      history: { x: number; y: number }[];
      age: number;
      maxAge: number;
    }

    const createParticle = (): ScreenParticle => ({
      x: Math.random() * getWidth(),
      y: Math.random() * getHeight(),
      history: [],
      age: Math.floor(Math.random() * 40),
      maxAge: 40 + Math.floor(Math.random() * 50),
    });

    let particles: ScreenParticle[] = Array.from({ length: PARTICLE_COUNT }, createParticle);

    // Reset particles on map movement
    const handleMapMove = () => {
      particles = Array.from({ length: PARTICLE_COUNT }, createParticle);
    };
    map.on("movestart", handleMapMove);
    map.on("zoomstart", handleMapMove);

    const stormLat = storm?.lat ?? 16.5;
    const stormLon = storm?.lon ?? 85.0;
    const stormWind = storm?.wind_kt ?? 65;

    const render = () => {
      if (!ctx || !canvas) return;

      const w = getWidth();
      const h = getHeight();

      // Clear canvas 100% transparently so MapLibre tiles remain 100% visible!
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Unproject screen (x, y) to (lon, lat)
        let lon = 85.0;
        let lat = 16.5;
        try {
          const lngLat = map.unproject([p.x, p.y]);
          lon = lngLat.lng;
          lat = lngLat.lat;
        } catch {
          particles[i] = createParticle();
          continue;
        }

        // Distance from cyclone center
        const dx = lon - stormLon;
        const dy = lat - stormLat;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;

        // Cyclonic flow equation
        const coreRadius = 4.0;
        const vProfile = dist / (dist * dist + coreRadius * coreRadius);
        const vTan = (stormWind * 0.85) * vProfile;
        const vInward = -0.32 * vTan;

        const uStorm = (-dy / dist) * vTan + (dx / dist) * vInward;
        const vStorm = (dx / dist) * vTan + (dy / dist) * vInward;

        // Ambient background monsoon flow
        const uAmbient = 10.0 + 4.0 * Math.sin(lat * 0.2);
        const vAmbient = 3.0 + 3.0 * Math.cos(lon * 0.2);

        const uTotal = uStorm + uAmbient;
        const vTotal = vStorm + vAmbient;
        const speed = Math.sqrt(uTotal * uTotal + vTotal * vTotal);

        const speedScale = 0.16;
        const nextX = p.x + uTotal * speedScale;
        const nextY = p.y - vTotal * speedScale;

        // Push current point to trail history
        p.history.push({ x: p.x, y: p.y });
        if (p.history.length > TRAIL_LENGTH) {
          p.history.shift();
        }

        // Draw particle trail lines
        if (p.history.length > 1) {
          const lifeProgress = p.age / p.maxAge;
          const baseAlpha = Math.sin(lifeProgress * Math.PI) * 0.85;

          let colorRgb = "34, 211, 238"; // Cyan
          if (speed > 55) {
            colorRgb = "244, 63, 94"; // Crimson Red
          } else if (speed > 35) {
            colorRgb = "245, 158, 11"; // Amber
          } else if (speed > 20) {
            colorRgb = "52, 211, 153"; // Emerald
          }

          for (let k = 0; k < p.history.length - 1; k++) {
            const p1 = p.history[k];
            const p2 = p.history[k + 1];
            const segmentAlpha = (k / p.history.length) * baseAlpha;

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(${colorRgb}, ${segmentAlpha})`;
            ctx.lineWidth = 1.0 + (k / p.history.length) * 1.0;
            ctx.lineCap = "round";
            ctx.stroke();
          }
        }

        p.x = nextX;
        p.y = nextY;
        p.age++;

        // Reset if expired or out of screen bounds
        if (p.age >= p.maxAge || p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
          particles[i] = createParticle();
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resizeCanvas);
      map.off("movestart", handleMapMove);
      map.off("zoomstart", handleMapMove);
    };
  }, [enabled, map, storm]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
    />
  );
}
