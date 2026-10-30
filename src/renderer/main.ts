import { App } from './app';

const app = new App();
app.init().catch((e) => {
  document.body.textContent = 'Error al iniciar Fronttier: ' + (e?.message ?? e);
  console.error(e);
});
(window as any).__fronttier = app;
