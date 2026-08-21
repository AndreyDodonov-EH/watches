// Web Serial transport over the firmware's line protocol (`p name=value`, `p?`, `t HH:MM:SS`).
// Owns the port. Commands are serialized: one in flight, resolved by the first reply line.
// The board echoes the command line before replying; IMU stream lines (CSV) interleave at 50 Hz
// and are routed to `onLine` instead.
import { migrateParams, type ParamKey, type Params } from '../params';
import type { TransportStatus, WatchTransport } from './types';

const BAUD = 115200;
const REPLY_TIMEOUT_MS = 1000;

const isCsv = (line: string): boolean => {
  const f = line.split(',');
  return f.length >= 7 && f.every((x) => x !== '' && !Number.isNaN(Number(x)));
};

const fmt = (v: Params[ParamKey]): string => (typeof v === 'boolean' ? (v ? '1' : '0') : String(v));

export class SerialTransport implements WatchTransport {
  status: TransportStatus = 'disconnected';
  onStatus: (s: TransportStatus, detail?: string) => void = () => {};
  /** Unsolicited lines (IMU stream). */
  onLine: (line: string) => void = () => {};
  private port: any = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private pending: { sent: string; resolve: (l: string) => void } | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  get supported(): boolean { return 'serial' in navigator; }
  get connected(): boolean { return this.status === 'connected'; }

  async connect(): Promise<void> {
    this.setStatus('connecting');
    try {
      this.port = await (navigator as any).serial.requestPort();
      await this.port.open({ baudRate: BAUD });
      this.writer = this.port.writable.getWriter();
      this.setStatus('connected');
      void this.readLoop();
    } catch (e) { this.port = null; this.setStatus('error', String(e)); throw e; }
  }

  async disconnect(): Promise<void> {
    const port = this.port; this.port = null;
    try { this.writer?.releaseLock(); await this.reader?.cancel(); await port?.close(); } catch { /* port gone */ }
    this.writer = null; this.reader = null;
    this.setStatus('disconnected');
  }

  /** Send a line; resolves with the first reply line ('' on timeout or when disconnected). */
  request(line: string): Promise<string> {
    const run = () => new Promise<string>((resolve) => {
      const w = this.writer;
      if (!w) { resolve(''); return; }
      const timer = setTimeout(() => { this.pending = null; resolve(''); }, REPLY_TIMEOUT_MS);
      this.pending = { sent: line, resolve: (l) => { clearTimeout(timer); this.pending = null; resolve(l); } };
      w.write(new TextEncoder().encode(line + '\n')).catch(() => { this.pending?.resolve(''); });
    });
    const p = this.queue.then(run, run);
    this.queue = p;
    return p;
  }

  async getParams(): Promise<Partial<Params>> {
    for (let i = 0; i < 2; i++) {
      const r = await this.request('p?');
      if (r.startsWith('{')) return migrateParams(JSON.parse(r));
    }
    throw new Error('no params reply');
  }

  async setParam(key: ParamKey, value: Params[ParamKey]): Promise<boolean> {
    return (await this.request(`p ${key}=${fmt(value)}`)) === 'ok';
  }

  async setParams(patch: Partial<Params>): Promise<void> {
    for (const k of Object.keys(patch) as ParamKey[]) await this.setParam(k, patch[k]!);
  }

  async setTime(epochMs: number, tzOffsetMin: number): Promise<void> {
    await this.request(`T ${Math.floor(epochMs / 1000)} ${tzOffsetMin}`);
  }

  private setStatus(s: TransportStatus, detail?: string): void { this.status = s; this.onStatus(s, detail); }

  private dispatch(line: string): void {
    if (!line) return;
    if (isCsv(line)) { this.onLine(line); return; }
    const p = this.pending;
    if (!p) return;
    if (line === p.sent) return;  // echo
    p.resolve(line);
  }

  private async readLoop(): Promise<void> {
    const dec = new TextDecoder();
    let buf = '';
    while (this.port?.readable) {
      const reader: ReadableStreamDefaultReader<Uint8Array> = this.port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) { this.dispatch(buf.slice(0, nl).trim()); buf = buf.slice(nl + 1); }
        }
      } catch (e) { if (this.port) this.setStatus('error', String(e)); }
      finally { reader.releaseLock(); }
    }
    if (this.status === 'connected') this.setStatus('disconnected', 'port closed');
  }
}
