// shared design tokens for the app pages (login / consent / dashboard / settings) —
// the hero and its demo keep their own local copies of these, so this file
// is only imported by the newer app-shell pages
export const BODY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
export const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
export const SERIF = "'CMU Serif', 'Old Standard TT', serif";
export const FONT_IMPORT = `@import url('https://fonts.cdnfonts.com/css/cmu-serif'); @import url('https://fonts.googleapis.com/css2?family=Old+Standard+TT:ital,wght@0,400;1,400&display=swap');`;

export const INK = "#1B1B18";
export const INK_SOFT = "#6E6C62";
export const ACCENT = "#5C8A94";
export const ACCENT_SOFT = "#D9E7EA";
export const LINE = "#E7E3D6";
export const DANGER = "#B4544A";

export const PAPER_WARM = "#FBF9F4";
export const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)' opacity='0.14'/%3E%3C/svg%3E\")";
