import { useColorScheme } from 'react-native';

const light = {
  bg: '#FBF7F2',
  card: '#FFFFFF',
  text: '#2B2621',
  muted: '#7A7068',
  border: '#EDE4DA',
  primary: '#D8664F',
  primaryText: '#FFFFFF',
  soft: '#F6EDE4',
  success: '#3E9B6E',
  successSoft: '#E4F3EA',
  warn: '#C98A1B',
  warnSoft: '#FBF0DA',
  danger: '#C8483A',
  dangerSoft: '#FBE5E2',
  info: '#3B7DD8',
  infoSoft: '#E5EEFB',
  heart: '#E0506F',
};

const dark: typeof light = {
  bg: '#1B1815',
  card: '#26221E',
  text: '#F3EDE6',
  muted: '#A99E94',
  border: '#3A342E',
  primary: '#E77C66',
  primaryText: '#FFFFFF',
  soft: '#302A25',
  success: '#5CC08F',
  successSoft: '#23352B',
  warn: '#E0A94A',
  warnSoft: '#3A3020',
  danger: '#E5685A',
  dangerSoft: '#3D2522',
  info: '#6EA2EB',
  infoSoft: '#1F2B3C',
  heart: '#F0708C',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };
export const radius = { s: 10, m: 14, l: 20 };
export const font = { small: 14, body: 17, title: 20, big: 26, huge: 32 };
