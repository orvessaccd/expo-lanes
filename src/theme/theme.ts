import { createTheme, alpha } from "@mui/material/styles";

export interface LanePalette {
  id: number;
  label: string;
  main: string;
  light: string;
  softBg: string;
  canvasFill: string;
  canvasTrail: string;
}

export function getLanePalettes(mode: "dark" | "light"): LanePalette[] {
  const isDark = mode === "dark";
  return [
    {
      id: 0,
      label: "1号赛道",
      main: isDark ? "#00C8E8" : "#0084A1",
      light: isDark ? "#67E8F9" : "#06B6D4",
      softBg: isDark ? "rgba(0, 200, 232, 0.11)" : "rgba(0, 132, 161, 0.09)",
      canvasFill: isDark ? "#00D4F5" : "#0088A8",
      canvasTrail: isDark ? "rgba(0, 212, 245, 0.22)" : "rgba(0, 136, 168, 0.18)",
    },
    {
      id: 1,
      label: "2号赛道",
      main: isDark ? "#FF7A1A" : "#D45800",
      light: isDark ? "#FDBA74" : "#F97316",
      softBg: isDark ? "rgba(255, 122, 26, 0.11)" : "rgba(212, 88, 0, 0.09)",
      canvasFill: isDark ? "#FF852B" : "#D95B00",
      canvasTrail: isDark ? "rgba(255, 133, 43, 0.22)" : "rgba(217, 91, 0, 0.18)",
    },
    {
      id: 2,
      label: "3号赛道",
      main: isDark ? "#10D988" : "#078A52",
      light: isDark ? "#6EE7B7" : "#10B981",
      softBg: isDark ? "rgba(16, 217, 136, 0.11)" : "rgba(7, 138, 82, 0.09)",
      canvasFill: isDark ? "#14E08E" : "#07965C",
      canvasTrail: isDark ? "rgba(20, 224, 142, 0.22)" : "rgba(7, 150, 92, 0.18)",
    },
  ];
}

export function createLabTheme(mode: "dark" | "light") {
  const isDark = mode === "dark";

  const bgDefault = isDark ? "#0B0E13" : "#F3F6FA";
  const bgPaper = isDark ? "#121720" : "#FFFFFF";
  const primaryMain = isDark ? "#00C8E8" : "#007A96";
  const secondaryMain = isDark ? "#FF7A1A" : "#D45800";
  const dividerColor = isDark
    ? "rgba(226, 232, 240, 0.08)"
    : "rgba(15, 23, 42, 0.09)";

  return createTheme({
    palette: {
      mode,
      primary: {
        main: primaryMain,
      },
      secondary: {
        main: secondaryMain,
      },
      success: {
        main: isDark ? "#10D988" : "#078A52",
      },
      warning: {
        main: isDark ? "#F59E0B" : "#D97706",
      },
      error: {
        main: isDark ? "#F43F5E" : "#E11D48",
      },
      background: {
        default: bgDefault,
        paper: bgPaper,
      },
      text: {
        primary: isDark ? "#EEF2F7" : "#0F172A",
        secondary: isDark ? "#94A3B8" : "#475569",
      },
      divider: dividerColor,
    },
    shape: {
      borderRadius: 10,
    },
    typography: {
      fontFamily: "var(--font-sans)",
      h1: {
        fontSize: "1.65rem",
        fontWeight: 700,
        letterSpacing: "-0.025em",
        lineHeight: 1.25,
      },
      h2: {
        fontSize: "1.25rem",
        fontWeight: 700,
        letterSpacing: "-0.02em",
        lineHeight: 1.3,
      },
      h3: {
        fontSize: "1.02rem",
        fontWeight: 600,
        letterSpacing: "-0.01em",
      },
      button: {
        textTransform: "none",
        fontWeight: 600,
        letterSpacing: "-0.005em",
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: bgDefault,
            backgroundImage: isDark
              ? "radial-gradient(ellipse 80% 45% at 50% -10%, rgba(0, 200, 232, 0.055), transparent)"
              : "radial-gradient(ellipse 80% 45% at 50% -10%, rgba(0, 122, 150, 0.045), transparent)",
          },
        },
      },
      MuiPaper: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            backgroundImage: isDark
              ? "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0) 100%)"
              : "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(248,250,252,0.9) 100%)",
            border: `1px solid ${dividerColor}`,
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: 8,
            paddingInline: 14,
            transition: "transform 120ms ease, background-color 150ms ease, border-color 150ms ease",
            "&:active": {
              transform: "scale(0.985)",
            },
          },
          outlined: {
            borderColor: isDark
              ? "rgba(226, 232, 240, 0.16)"
              : "rgba(15, 23, 42, 0.16)",
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 600,
            borderRadius: 7,
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 42,
            fontWeight: 600,
            textTransform: "none",
          },
        },
      },
      MuiAccordion: {
        defaultProps: {
          elevation: 0,
          disableGutters: true,
        },
        styleOverrides: {
          root: {
            backgroundColor: alpha(bgPaper, 0.65),
            "&::before": {
              display: "none",
            },
          },
        },
      },
    },
  });
}
