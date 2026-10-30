// Precise position of this machine. Electron's Chromium never reaches macOS
// Location Services on its own, so a bundled helper app asks CoreLocation.
import { app } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface DeviceLocation {
  lat?: number;
  lng?: number;
  accuracy?: number;
  /** 'denied' | 'disabled' | 'timeout' | 'unsupported' or a CoreLocation message. */
  error?: string;
}

function helperPath() {
  return app.isPackaged ? join(process.resourcesPath, 'native/FronttierLocation.app') : join(__dirname, 'native/FronttierLocation.app');
}

export function locateDevice(): Promise<DeviceLocation> {
  const helper = helperPath();
  if (process.platform !== 'darwin' || !existsSync(helper)) return Promise.resolve({ error: 'unsupported' });
  // Launched through LaunchServices so macOS attributes the permission prompt
  // to the helper's own Info.plist instead of the calling process.
  const dir = mkdtempSync(join(tmpdir(), 'fronttier-locate-'));
  const out = join(dir, 'out.json');
  return new Promise((resolve) => {
    execFile('open', ['-W', '-n', '-g', helper, '--stdout', out, '--stderr', out], { timeout: 45_000 }, () => {
      try {
        resolve(JSON.parse(readFileSync(out, 'utf8').trim().split('\n').pop() || '{}'));
      } catch {
        resolve({ error: 'timeout' });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
}
