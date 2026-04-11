export type ReleasePalette = {
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentContrast: string;
  accentText: string;
  bgStart: string;
  bgMid: string;
  bgEnd: string;
};

export const DEFAULT_PALETTE: ReleasePalette = {
  accent: "rgb(51 65 85)",
  accentHover: "rgb(30 41 59)",
  accentSoft: "rgb(203 213 225)",
  accentContrast: "rgb(255 255 255)",
  accentText: "rgb(30 41 59)",
  bgStart: "rgb(232 238 247)",
  bgMid: "rgb(226 236 255)",
  bgEnd: "rgb(245 248 252)",
};

export const BRAND_FALLBACK_PALETTE: ReleasePalette = {
  accent: "rgb(16 185 129)",
  accentHover: "rgb(5 150 105)",
  accentSoft: "rgb(110 231 183)",
  accentContrast: "rgb(255 255 255)",
  accentText: "rgb(5 150 105)",
  bgStart: "rgb(221 245 234)",
  bgMid: "rgb(226 236 255)",
  bgEnd: "rgb(248 251 250)",
};
