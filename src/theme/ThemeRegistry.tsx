"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
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

export default function ThemeRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<ColorMode>("dark");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") {
        setMode(saved);
      }
    } catch {
      // Ignore localStorage failures in restricted environments
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", mode);
    }
  }, [mode]);

  const contextValue = useMemo<ColorModeContextValue>(
    () => ({
      mode,
      toggleColorMode: () => {
        setMode((prev) => {
          const next = prev === "dark" ? "light" : "dark";
          try {
            window.localStorage.setItem(STORAGE_KEY, next);
          } catch {
            // ignore
          }
          return next;
        });
      },
      setColorMode: (next: ColorMode) => {
        setMode(next);
        try {
          window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // ignore
        }
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
