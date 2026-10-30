import { App } from './app';

const app = new App();
app.init().catch((e) => {
  document.body.textContent = 'Error al iniciar Tessera: ' + (e?.message ?? e);
  console.error(e);
});
(window as any).__tessera = app;
