import { useThemeStore } from '../stores/themeStore';

// Brand palette:
// Benchmark Navy #2A3241 | Insight Blue #4A75A3 | Community Cyan #85C3DE
// Waterfall Blue #E8F5F5 | Guide Grey #999999   | Framework Grey #E8E4E2
// Violet #7a6392         | Lavender #d7d2e8     | Teal #56878a
// Mint #98cec2           | Scatter Gold #d1962e  | Bar Yellow #fffadb

const lightColors = {
  grid: '#eeedec',         // lighter than Framework Grey
  axis: '#999999',         // Guide Grey
  tooltipBg: '#ffffff',
  tooltipBorder: '#E8E4E2', // Framework Grey
  text: '#2A3241',         // Benchmark Navy
  primary: '#2A3241',      // Benchmark Navy — main velocity line
  dev: '#85C3DE',          // Community Cyan — dev bars (light, good fill contrast)
  review: '#4A75A3',       // Insight Blue — review bars (dark, pairs with dev)
  normalized: '#7a6392',   // Violet — adjusted/normalized lines
  ptoLabel: '#d1962e',     // Scatter Gold
  it: '#d1962e',           // Scatter Gold — IT helpdesk
  cursorFill: 'rgba(0, 0, 0, 0.06)',
};

const darkColors = {
  grid: '#373e47',
  axis: '#999999',         // Guide Grey
  tooltipBg: '#2A3241',    // Benchmark Navy
  tooltipBorder: '#4A75A3', // Insight Blue
  text: '#E8F5F5',         // Waterfall Blue
  primary: '#85C3DE',      // Community Cyan — main velocity line
  dev: '#98cec2',          // Mint — dev bars
  review: '#4A75A3',       // Insight Blue — review bars
  normalized: '#d7d2e8',   // Lavender — adjusted/normalized lines
  ptoLabel: '#d1962e',     // Scatter Gold
  it: '#d1962e',           // Scatter Gold — IT helpdesk
  cursorFill: 'rgba(255, 255, 255, 0.08)',
};

export function useChartColors() {
  const isDark = useThemeStore((state) => state.isDark);
  return isDark ? darkColors : lightColors;
}
