import { create } from "zustand";
import type { Storm, TrackPoint, Observation } from "@/lib/types";
import { fetchStorms, fetchStormTrack, fetchStormObservations } from "@/lib/api";

interface CycloneState {
  activeStorm: Storm | null;
  stormList: Storm[];
  track: TrackPoint[];
  observations: Observation[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;

  setActiveStorm: (storm: Storm) => void;
  clearActiveStorm: () => void;
  fetchStorms: () => Promise<void>;
  fetchTrack: (stormId: string) => Promise<void>;
  fetchObservations: (stormId: string) => Promise<void>;
}

export const useCycloneStore = create<CycloneState>((set) => ({
  activeStorm: null,
  stormList: [],
  track: [],
  observations: [],
  isLoading: false,
  error: null,
  lastUpdated: null,

  setActiveStorm: (storm) => set({ activeStorm: storm }),

  clearActiveStorm: () =>
    set({ activeStorm: null, track: [], observations: [] }),

  fetchStorms: async () => {
    set({ isLoading: true, error: null });
    try {
      const storms = await fetchStorms();
      set((state) => ({
        stormList: storms,
        activeStorm:
          state.activeStorm && storms.some((storm) => storm.id === state.activeStorm?.id)
            ? state.activeStorm
            : storms[0] ?? null,
        isLoading: false,
        lastUpdated: new Date().toISOString(),
      }));
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  fetchTrack: async (stormId) => {
    try {
      const track = await fetchStormTrack(stormId);
      set({ track });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  fetchObservations: async (stormId) => {
    try {
      const observations = await fetchStormObservations(stormId);
      set({ observations });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
}));
