import { useEffect, useEffectEvent, useRef, type CSSProperties } from "react";
import type { NumberFormatStyle } from "@/engine/bigNumber";
import { LANE_HEIGHT, LANE_WIDTH } from "@/engine/simulation";
import type { LaneRuntimeState, SimulationState } from "@/engine/types";
import type { LanePalette } from "@/theme/theme";
import { renderLaneCanvas } from "./laneCanvas";
import styles from "./RaceArena.module.css";

interface LaneSurfaceProps {
  lane: LaneRuntimeState;
  sim: SimulationState;
  palette: LanePalette;
  dark: boolean;
  format: NumberFormatStyle;
}

export default function LaneSurface({ lane, sim, palette, dark, format }: LaneSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const displayWidth = useRef(0);
  const paint = useEffectEvent(() => {
    const canvas = canvasRef.current;
    if (canvas && displayWidth.current > 0) {
      renderLaneCanvas(canvas, displayWidth.current, lane, sim, palette, dark, format);
    }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      displayWidth.current = width;
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      paint();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  // The simulator advances its existing state object on each frame.
  useEffect(() => {
    paint();
  });

  return (
    <div
      className={styles.surface}
      data-mode={dark ? "dark" : "light"}
      style={{
        "--lane-tint": palette.softBg,
        "--field-ratio": LANE_WIDTH / LANE_HEIGHT,
      } as CSSProperties}
    >
      <canvas
        ref={canvasRef}
        width={LANE_WIDTH}
        height={LANE_HEIGHT}
        className={styles.canvas}
        role="img"
        aria-label={`${lane.config.name}的小球、算符门和数字墙`}
      />
    </div>
  );
}
