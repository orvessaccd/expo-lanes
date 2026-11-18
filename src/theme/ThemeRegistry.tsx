"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { createLabTheme } from "./theme";

export type ColorMode = "dark" | "light";

interface ColorModeContextValue {
  mode: ColorMode;
  toggleColorMode: () => void;
  setColorMode: (mode: ColorMode) => void;
}

const ColorModeContext = createContext<ColorModeContextValue>({
  mode: "dark",
  toggleColorMode: () => {},
  setColorMode: () => {},
});

export function useColorMode() {
  return useContext(ColorModeContext);
}

const STORAGE_KEY = "expo-lanes:color-mode";

let currentColorMode: ColorMode | null = null;
const colorModeListeners = new Set<() => void>();

function readClientColorMode(): ColorMode {
  if (currentColorMode) return currentColorMode;
  if (typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") {
        currentColorMode = saved;
        return saved;
      }
    } catch {
      // Ignore localStorage failures in restricted environments
    }
  }
  currentColorMode = "dark";
  return "dark";
}

function subscribeColorMode(listener: () => void) {
  colorModeListeners.add(listener);
  return () => {
    colorModeListeners.delete(listener);
  };
}

function updateStoredColorMode(next: ColorMode) {
  currentColorMode = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }
  colorModeListeners.forEach((fn) => fn());
}

export default function ThemeRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  const mode = useSyncExternalStore<ColorMode>(
    subscribeColorMode,
    readClientColorMode,
    () => "dark"
  );

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", mode);
    }
  }, [mode]);

  const contextValue = useMemo<ColorModeContextValue>(
    () => ({
      mode,
      toggleColorMode: () => {
        updateStoredColorMode(mode === "dark" ? "light" : "dark");
      },
      setColorMode: (next: ColorMode) => {
        updateStoredColorMode(next);
      },
    }),
    [mode]
  );

  const theme = useMemo(() => createLabTheme(mode), [mode]);

  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      <ColorModeContext.Provider value={contextValue}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </ThemeProvider>
      </ColorModeContext.Provider>
    </AppRouterCacheProvider>
  );
}
