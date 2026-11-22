"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Context } from "react";
import type { Flight, Side } from "../../lib/data";
import type { LngLat } from "../../lib/geo";

export type Camera =
  // around: flights whose centre the globe turns to; defaults to the scene's flights.
  | { kind: "world"; around?: Flight[] }
  // anchor: where the globe turns when the points are too spread to frame at once.
  | { kind: "fit"; points: LngLat[]; maxZoom?: number; anchor?: LngLat };

export type Scene = {
  // Flights drawn as the base network.
  flights: Flight[];
  // Flights drawn bright above a dimmed base; null shows the base at full strength.
  focus: Flight[] | null;
  // Airports whose labels must show while this scene is active.
  pinned?: string[];
  // Draw focus flights one by one in travel order, each in its own direction.
  directed?: boolean;
  // Colours by side, on a page about two people; otherwise the reader's tone.
  colors?: Partial<Record<Side, string>>;
  // Someone else's flights on a public page: they can be read, not opened.
  readOnly?: boolean;
  camera: Camera;
  // Light the globe as at this instant (ms), as at a flight's take-off; otherwise now.
  sunAt?: number;
  // The camera moves only when this key changes.
  cameraKey: string;
};

// The part of the stage hidden behind the panel or the sheet, in CSS pixels.
export type Inset = { top: number; right: number; bottom: number; left: number };

type StageValue = {
  scene: Scene | null;
  preview: Flight[] | null;
  inset: Inset;
  setScene: (scene: Scene) => void;
  setPreview: (flights: Flight[] | null) => void;
  setInset: (inset: Inset) => void;
};

const NO_INSET: Inset = { top: 0, right: 0, bottom: 0, left: 0 };

// Vinext can hot-reload provider and consumers as separate module versions;
// one shared Context object keeps a refreshed consumer attached in development.
const stageGlobal = globalThis as typeof globalThis & { __flyprintStageContext?: Context<StageValue | null> };
const StageContext = stageGlobal.__flyprintStageContext ?? createContext<StageValue | null>(null);
if (process.env.NODE_ENV !== "production") stageGlobal.__flyprintStageContext = StageContext;

export function StageProvider({ children }: { children: React.ReactNode }) {
  const [scene, setSceneState] = useState<Scene | null>(null);
  const [preview, setPreviewState] = useState<Flight[] | null>(null);
  const [inset, setInsetState] = useState<Inset>(NO_INSET);
  const setScene = useCallback((next: Scene) => setSceneState(next), []);
  const setPreview = useCallback((next: Flight[] | null) => setPreviewState(next), []);
  const setInset = useCallback((next: Inset) => setInsetState((current) =>
    current.top === next.top && current.right === next.right && current.bottom === next.bottom && current.left === next.left ? current : next), []);
  const value = useMemo(() => ({ scene, preview, inset, setScene, setPreview, setInset }), [scene, preview, inset, setScene, setPreview, setInset]);
  return <StageContext.Provider value={value}>{children}</StageContext.Provider>;
}

export function useStage() {
  const value = useContext(StageContext);
  if (!value) throw new Error("useStage must be used within StageProvider");
  return value;
}

export function useScene(scene: Scene) {
  const { setScene, setPreview } = useStage();
  useEffect(() => { setScene(scene); }, [scene, setScene]);
  useEffect(() => () => setPreview(null), [setPreview]);
}
