// Web Serial bridge to the board's `i` IMU stream (t_ms,ax,ay,az,gx,gy,gz at 50 Hz).
// Chrome/Edge only. Maps IMU axes to tube frame using spec/layout IMU_* constants.
import { IMU_AXIS_ALONG_TUBE, IMU_ALONG_TUBE_SIGN, IMU_AXIS_ACROSS_TUBE, IMU_ACROSS_TUBE_SIGN } from '@spec/layout';
import type { TiltInput } from './physics';

export class SerialImu {
  port: any = null;
  reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  last: TiltInput = { along: 0, across: 0, gyroAlong: 0, gyroAcross: 0 };
  raw = '';
  connected = false;
  onStatus: (s: string) => void = () => {};

  get supported(): boolean { return 'serial' in navigator; }

  async connect(): Promise<void> {
    const nav = navigator as any;
    this.port = await nav.serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    this.connected = true;
    this.onStatus('connected');
    const w = this.port.writable.getWriter();
    await w.write(new TextEncoder().encode('i'));
    w.releaseLock();
    this.readLoop();
  }

  async disconnect(): Promise<void> {
    try {
      if (this.port?.writable) { const w = this.port.writable.getWriter(); await w.write(new TextEncoder().encode('i')); w.releaseLock(); }
      await this.reader?.cancel();
      await this.port?.close();
    } catch { /* ignore */ }
    this.connected = false; this.onStatus('disconnected');
  }

  private async readLoop(): Promise<void> {
    const dec = new TextDecoder();
    let buf = '';
    while (this.port?.readable && this.connected) {
      const reader: ReadableStreamDefaultReader<Uint8Array> = this.port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            this.parse(line);
          }
        }
      } catch (e) { this.onStatus('error: ' + e); }
      finally { reader.releaseLock(); }
    }
  }

  private parse(line: string): void {
    const f = line.split(',').map(Number);
    if (f.length < 7 || f.some(Number.isNaN)) return;
    const a = [f[1], f[2], f[3]], g = [f[4], f[5], f[6]];
    const n = Math.hypot(a[0], a[1], a[2]) || 1;  // normalise (board reads ~0.94 g)
    this.last = {
      along: (IMU_ALONG_TUBE_SIGN * a[IMU_AXIS_ALONG_TUBE]) / n,
      across: (IMU_ACROSS_TUBE_SIGN * a[IMU_AXIS_ACROSS_TUBE]) / n,
      gyroAlong: g[IMU_AXIS_ALONG_TUBE],
      gyroAcross: g[IMU_AXIS_ACROSS_TUBE],
    };
    this.raw = line;
  }
}
