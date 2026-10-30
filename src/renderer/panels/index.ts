import type { App } from '../app';
import { a11yPanel, outlinePanel, simulatorsPanel } from './a11y';
import { consolePanel, elementsPanel, networkPanel } from './devtools';
import { metaPanel, socialPanel } from './seo';
import { debugPanel, emulationPanel, performancePanel, portalPanel, settingsPanel, storagePanel } from './tools';

export interface PanelInstance {
  el: HTMLElement;
  show?(): void;
  hide?(): void;
}

export interface PanelDef {
  id: string;
  title: string;
  icon: string;
  /** Created at startup so it records events before it is first opened. */
  eager?: boolean;
  create(app: App): PanelInstance;
}

export const PANELS: PanelDef[] = [
  { id: 'meta', title: 'Meta y SEO', icon: 'meta', create: metaPanel },
  { id: 'social', title: 'Vista previa social', icon: 'social', create: socialPanel },
  { id: 'outline', title: 'Esquema', icon: 'outline', create: outlinePanel },
  { id: 'a11y', title: 'Accesibilidad', icon: 'a11y', create: a11yPanel },
  { id: 'simulators', title: 'Simuladores', icon: 'eye', create: simulatorsPanel },
  { id: 'emulation', title: 'Emulación', icon: 'emulate', create: emulationPanel },
  { id: 'elements', title: 'Elementos', icon: 'elements', create: elementsPanel },
  { id: 'console', title: 'Consola', icon: 'console', eager: true, create: consolePanel },
  { id: 'network', title: 'Red', icon: 'network', create: networkPanel },
  { id: 'performance', title: 'Rendimiento', icon: 'perf', create: performancePanel },
  { id: 'debug', title: 'Depuración', icon: 'debug', create: debugPanel },
  { id: 'storage', title: 'Almacenamiento', icon: 'storage', create: storagePanel },
  { id: 'portal', title: 'Portal', icon: 'portal', create: portalPanel },
  { id: 'settings', title: 'Ajustes', icon: 'settings', create: settingsPanel },
];
