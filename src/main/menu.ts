import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

export function buildMenu(win: BrowserWindow) {
  const send = (cmd: string) => () => win.webContents.send('menu', cmd);
  const item = (label: string, cmd: string, accelerator?: string): MenuItemConstructorOptions => ({ label, accelerator, click: send(cmd) });
  const isMac = process.platform === 'darwin';
  const workspaces = (verb: 'save' | 'restore') =>
    [1, 2, 3, 4, 5].map((n) => item(`${verb === 'save' ? 'Guardar en' : 'Restaurar'} espacio ${n}`, `ws-${verb}-${n}`, verb === 'save' ? `CmdOrCtrl+Alt+Shift+${n}` : `CmdOrCtrl+Alt+${n}`));

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'Archivo',
      submenu: [
        item('Nueva pestaña', 'new-tab', 'CmdOrCtrl+T'),
        item('Duplicar pestaña', 'duplicate-tab'),
        item('Reabrir pestaña cerrada', 'reopen-tab', 'CmdOrCtrl+Shift+T'),
        item('Cerrar pestaña', 'close-tab', 'CmdOrCtrl+W'),
        { type: 'separator' },
        item('Ir a dirección…', 'focus-url', 'CmdOrCtrl+L'),
        item('Abrir carpeta local (modo local)…', 'open-folder', 'CmdOrCtrl+O'),
        item('Live reload de una carpeta…', 'live-reload'),
        item('Recarga automática…', 'auto-reload'),
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Salir' },
      ],
    },
    { label: 'Edición', role: 'editMenu' },
    {
      label: 'Ver',
      submenu: [
        item('Recargar paneles', 'reload', 'CmdOrCtrl+R'),
        item('Vaciar caché y recargar', 'hard-reload', 'CmdOrCtrl+Shift+R'),
        item('Recargar solo CSS', 'reload-css', 'CmdOrCtrl+Alt+R'),
        { type: 'separator' },
        item('Diseño horizontal', 'layout-horizontal', 'Alt+1'),
        item('Diseño en cuadrícula', 'layout-grid', 'Alt+2'),
        item('Diseño enfocado', 'layout-focus', 'Alt+3'),
        item('Diseño completo', 'layout-full', 'Alt+4'),
        { type: 'separator' },
        item('Acercar', 'zoom-in', 'CmdOrCtrl+='),
        item('Alejar', 'zoom-out', 'CmdOrCtrl+-'),
        item('Ajustar a la ventana', 'zoom-fit', 'CmdOrCtrl+0'),
        item('Zoom 100 %', 'zoom-reset', 'CmdOrCtrl+Shift+0'),
        item('Zoom de página +', 'page-zoom-in', 'CmdOrCtrl+Alt+='),
        item('Zoom de página −', 'page-zoom-out', 'CmdOrCtrl+Alt+-'),
        item('Restablecer zoom de página', 'page-zoom-reset'),
        { type: 'separator' },
        item('Mostrar/ocultar panel lateral', 'toggle-panel', 'CmdOrCtrl+\\'),
        item('Mostrar/ocultar encabezados de panel', 'toggle-headers'),
        item('Reglas', 'toggle-rulers', 'CmdOrCtrl+Alt+U'),
        item('Depuración de layout', 'toggle-layout-debug', 'CmdOrCtrl+Alt+D'),
        item('Sincronizar scroll', 'toggle-sync-scroll'),
        item('Tema claro/oscuro', 'toggle-dark'),
        { type: 'separator' },
        { label: 'Herramientas de desarrollo de Tessera', accelerator: 'CmdOrCtrl+Alt+I', click: () => win.webContents.toggleDevTools() },
      ],
    },
    {
      label: 'Paneles',
      submenu: [
        item('Nuevo panel', 'new-pane', 'CmdOrCtrl+Shift+N'),
        item('Rotar paneles', 'rotate-panes'),
        item('Tamaños aleatorios', 'randomize-panes'),
        item('Quitar todos los paneles', 'remove-panes'),
        { type: 'separator' },
        item('Crear paneles desde breakpoints CSS', 'bp-panes'),
        item('Crear paneles en los bordes de breakpoints', 'bp-edges'),
        { type: 'separator' },
        { label: 'Guardar en espacio de trabajo', submenu: workspaces('save') },
        { label: 'Restaurar espacio de trabajo', submenu: workspaces('restore') },
      ],
    },
    {
      label: 'Herramientas',
      submenu: [
        item('Barra de comandos', 'command', 'CmdOrCtrl+K'),
        item('Buscar en la página', 'find', 'CmdOrCtrl+F'),
        item('DevTools de Chromium (panel seleccionado)', 'devtools-pane', 'F12'),
        { type: 'separator' },
        item('Captura de todos los paneles', 'screenshot-all', 'CmdOrCtrl+Shift+S'),
        item('Captura de página completa (todos)', 'screenshot-full-all'),
        item('Grabar video', 'record', 'CmdOrCtrl+Shift+E'),
        item('Portal (dispositivos reales)', 'portal'),
        { type: 'separator' },
        item('Autocompletar formularios', 'fill-forms', 'CmdOrCtrl+Shift+F'),
        item('Limpiar formularios', 'clear-forms'),
        { type: 'separator' },
        item('Desactivar Content-Security-Policy', 'toggle-csp'),
        item('Permitir CORS (Access-Control-Allow-Origin)', 'toggle-cors'),
        item('Borrar caché', 'clear-cache'),
        item('Borrar cookies', 'clear-cookies'),
        item('Borrar todo el almacenamiento', 'clear-storage'),
      ],
    },
    {
      label: 'Ayuda',
      role: 'help',
      submenu: [item('Atajos de teclado', 'shortcuts', 'CmdOrCtrl+/'), { label: 'Versión ' + app.getVersion(), enabled: false }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
