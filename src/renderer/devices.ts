import type { BrowserUI, Device, Insets } from '../shared/types';

const IOS = (v = '18_6') => `Mozilla/5.0 (iPhone; CPU iPhone OS ${v} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v.replace('_', '.')} Mobile/15E148 Safari/604.1`;
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const ANDROID = (model: string) => `Mozilla/5.0 (Linux; Android 15; ${model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36`;
const ANDROID_TAB = (model: string) => `Mozilla/5.0 (Linux; Android 15; ${model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36`;

const SA_NOTCH: Insets = { top: 47, right: 0, bottom: 34, left: 0 };
const SA_ISLAND: Insets = { top: 59, right: 0, bottom: 34, left: 0 };
const SA_PUNCH: Insets = { top: 28, right: 0, bottom: 16, left: 0 };
const UI_IOS: BrowserUI = { top: 59, bottom: 134 };
const UI_IOS_HOME: BrowserUI = { top: 70, bottom: 49 };
const UI_ANDROID: BrowserUI = { top: 80, bottom: 48 };
const UI_IPAD: BrowserUI = { top: 74, bottom: 0 };

const phone = (id: string, name: string, width: number, height: number, dpr: number, ua: string, notch: Device['notch'], safeArea: Insets | undefined, ui: BrowserUI): Device => ({ id, name, group: 'phone', width, height, dpr, mobile: true, touch: true, ua, notch, safeArea, ui });

export const DEVICES: Device[] = [
  phone('iphone-se', 'iPhone SE', 375, 667, 2, IOS(), 'none', undefined, UI_IOS_HOME),
  phone('iphone-13-mini', 'iPhone 13 mini', 375, 812, 3, IOS(), 'notch', SA_NOTCH, UI_IOS),
  phone('iphone-14', 'iPhone 14', 390, 844, 3, IOS(), 'notch', SA_NOTCH, UI_IOS),
  phone('iphone-15', 'iPhone 15 / 16', 393, 852, 3, IOS(), 'island', SA_ISLAND, UI_IOS),
  phone('iphone-16-pro', 'iPhone 16 Pro', 402, 874, 3, IOS(), 'island', SA_ISLAND, UI_IOS),
  phone('iphone-15-plus', 'iPhone 15 Plus / 16 Plus', 430, 932, 3, IOS(), 'island', SA_ISLAND, UI_IOS),
  phone('iphone-16-pro-max', 'iPhone 16 Pro Max', 440, 956, 3, IOS(), 'island', SA_ISLAND, UI_IOS),
  phone('pixel-7', 'Pixel 7', 412, 915, 2.625, ANDROID('Pixel 7'), 'punch', SA_PUNCH, UI_ANDROID),
  phone('pixel-8-pro', 'Pixel 8 Pro', 448, 998, 3, ANDROID('Pixel 8 Pro'), 'punch', SA_PUNCH, UI_ANDROID),
  phone('galaxy-s24', 'Galaxy S24', 360, 780, 3, ANDROID('SM-S921B'), 'punch', SA_PUNCH, UI_ANDROID),
  phone('galaxy-s24-ultra', 'Galaxy S24 Ultra', 384, 832, 3.75, ANDROID('SM-S928B'), 'punch', SA_PUNCH, UI_ANDROID),
  phone('galaxy-a54', 'Galaxy A54', 384, 832, 2.8125, ANDROID('SM-A546B'), 'punch', SA_PUNCH, UI_ANDROID),
  phone('galaxy-fold-cover', 'Galaxy Z Fold (cerrado)', 344, 882, 2.625, ANDROID('SM-F946B'), 'punch', SA_PUNCH, UI_ANDROID),
  { id: 'ipad-mini', name: 'iPad mini', group: 'tablet', width: 744, height: 1133, dpr: 2, mobile: true, touch: true, ua: IPAD, ui: UI_IPAD, safeArea: { top: 24, right: 0, bottom: 20, left: 0 } },
  { id: 'ipad-air', name: 'iPad Air 11"', group: 'tablet', width: 820, height: 1180, dpr: 2, mobile: true, touch: true, ua: IPAD, ui: UI_IPAD, safeArea: { top: 24, right: 0, bottom: 20, left: 0 } },
  { id: 'ipad-pro-11', name: 'iPad Pro 11"', group: 'tablet', width: 834, height: 1194, dpr: 2, mobile: true, touch: true, ua: IPAD, ui: UI_IPAD, safeArea: { top: 24, right: 0, bottom: 20, left: 0 } },
  { id: 'ipad-pro-13', name: 'iPad Pro 13"', group: 'tablet', width: 1032, height: 1376, dpr: 2, mobile: true, touch: true, ua: IPAD, ui: UI_IPAD, safeArea: { top: 24, right: 0, bottom: 20, left: 0 } },
  { id: 'galaxy-tab-s9', name: 'Galaxy Tab S9', group: 'tablet', width: 800, height: 1280, dpr: 2, mobile: true, touch: true, ua: ANDROID_TAB('SM-X710'), ui: { top: 80, bottom: 48 } },
  { id: 'surface-pro', name: 'Surface Pro', group: 'laptop', width: 1440, height: 960, dpr: 2, mobile: false, touch: true },
  { id: 'laptop-hd', name: 'Laptop HD', group: 'laptop', width: 1366, height: 768, dpr: 1, mobile: false, touch: false },
  { id: 'laptop-win', name: 'Laptop 1536 (FHD 125 %)', group: 'laptop', width: 1536, height: 864, dpr: 1.25, mobile: false, touch: false },
  { id: 'macbook-air', name: 'MacBook Air 13"', group: 'laptop', width: 1280, height: 832, dpr: 2, mobile: false, touch: false },
  { id: 'macbook-pro-14', name: 'MacBook Pro 14"', group: 'laptop', width: 1512, height: 982, dpr: 2, mobile: false, touch: false },
  { id: 'macbook-pro-16', name: 'MacBook Pro 16"', group: 'laptop', width: 1728, height: 1117, dpr: 2, mobile: false, touch: false },
  { id: 'desktop-fhd', name: 'Escritorio Full HD', group: 'desktop', width: 1920, height: 1080, dpr: 1, mobile: false, touch: false },
  { id: 'desktop-qhd', name: 'Escritorio QHD', group: 'desktop', width: 2560, height: 1440, dpr: 1, mobile: false, touch: false },
  { id: 'imac-24', name: 'iMac 24"', group: 'desktop', width: 2240, height: 1260, dpr: 2, mobile: false, touch: false },
  { id: 'display-5k', name: 'Pantalla 5K', group: 'desktop', width: 2560, height: 1440, dpr: 2, mobile: false, touch: false },
  { id: 'desktop-4k', name: 'Escritorio 4K', group: 'desktop', width: 3840, height: 2160, dpr: 1, mobile: false, touch: false },
  { id: 'ultrawide', name: 'Ultrawide', group: 'desktop', width: 3440, height: 1440, dpr: 1, mobile: false, touch: false },
  { id: 'tv-1080', name: 'Smart TV 1080p', group: 'other', width: 1920, height: 1080, dpr: 1, mobile: false, touch: false },
];

export const GROUP_LABELS: Record<Device['group'], string> = {
  phone: 'Teléfonos',
  tablet: 'Tabletas',
  laptop: 'Laptops',
  desktop: 'Escritorio',
  other: 'Otros',
};

export const PRESETS: Record<string, { label: string; widths?: number[]; devices?: string[] }> = {
  default: { label: 'Móvil · Tableta · Laptop', devices: ['iphone-15', 'ipad-air', 'laptop-hd'] },
  phones: { label: 'Teléfonos populares', devices: ['iphone-se', 'iphone-15', 'iphone-16-pro-max', 'pixel-8-pro', 'galaxy-s24'] },
  tailwind: { label: 'Breakpoints de Tailwind', widths: [375, 640, 768, 1024, 1280, 1536] },
  bootstrap: { label: 'Breakpoints de Bootstrap', widths: [375, 576, 768, 992, 1200, 1400] },
  material: { label: 'Breakpoints de Material', widths: [360, 600, 905, 1240, 1440] },
};

export function deviceById(id: string) {
  return DEVICES.find((d) => d.id === id);
}
