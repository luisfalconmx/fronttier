import { api, toast } from './dom';

/** Records the Fronttier window (all panes) to a WebM file. */
export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  constructor(private onState: (recording: boolean) => void) {}

  async toggle() {
    if (this.rec) return this.stop();
    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
    this.rec = new MediaRecorder(this.stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.onstop = async () => {
      const blob = new Blob(this.chunks, { type: 'video/webm' });
      this.chunks = [];
      const path = await api().saveRecording(await blob.arrayBuffer());
      if (path) toast('Video guardado: ' + path);
    };
    this.rec.start(1000);
    this.onState(true);
    toast('Grabando… vuelve a pulsar el botón para detener.');
  }

  stop() {
    this.rec?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.rec = null;
    this.stream = null;
    this.onState(false);
  }
}
