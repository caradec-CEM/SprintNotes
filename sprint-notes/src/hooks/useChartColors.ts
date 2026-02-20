import { useThemeStore } from '../stores/themeStore';

const lightColors = {
  grid: '#dfe1e6',
  axis: '#5e6c84',
  tooltipBg: '#ffffff',
  tooltipBorder: '#dfe1e6',
  primary: '#0052cc',
  dev: '#36b37e',
  review: '#4c9aff',
  ptoLabel: '#b38600',
  cursorFill: 'rgba(0, 0, 0, 0.06)',
};

const darkColors = {
  grid: '#373e47',
  axis: '#768390',
  tooltipBg: '#2d333b',
  tooltipBorder: '#444c56',
  primary: '#4c9aff',
  dev: '#56d364',
  review: '#79b8ff',
  ptoLabel: '#e3b341',
  cursorFill: 'rgba(255, 255, 255, 0.08)',
};

export function useChartColors() {
  const isDark = useThemeStore((state) => state.isDark);
  return isDark ? darkColors : lightColors;
}
