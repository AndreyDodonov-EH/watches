// Line-protocol core shared by the transports (`p name=value`, `p?`, `T epoch tz`).
// Commands are serialized: one in flight, resolved by the first reply line. The board echoes the
// command line before replying; IMU stream lines (CSV) interleave at 50 Hz and go to `onLine`.
import { migrateParams, type ParamKey, type Params } from '../params';
import type { TransportStatus, WatchTransport } from './types';

const REPLY_TIMEOUT_MS = 1000;

const isCsv = (line: string): boolean => {
  const f = line.split(',');
  return f.length >= 7 && f.every((x) => x !== '' && !Number.isNaN(Number(x)));
};

const fmt = (v: Params[ParamKey]): string => (typeof v === 'boolean' ? (v ? '1' : '0') : String(v));

export abstract class LineTransport implements WatchTransport {
  status: TransportStatus = 'disconnected';
  onStatus: (s: TransportStatus, detail?: string) => void = () => {};
  /** Unsolicited lines (IMU stream). */
  onLine: (line: string) => void = () => {};
  private pending: { sent: string; resolve: (l: string) => void } | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private buf = '';
  private dec = new TextDecoder();

  abstract readonly supported: boolean;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  /** Null when the link is down. */
  protected abstract write(bytes: Uint8Array): Promise<void> | null;

  get connected(): boolean { return this.status === 'connected'; }

  /** Send a line; resolves with the first reply line ('' on timeout or when disconnected). */
  request(line: string): Promise<string> {
    const run = () => new Promise<string>((resolve) => {
      const timer = setTimeout(() => { this.pending = null; resolve(''); }, REPLY_TIMEOUT_MS);
      this.pending = { sent: line, resolve: (l) => { clearTimeout(timer); this.pending = null; resolve(l); } };
      const w = this.write(new TextEncoder().encode(line + '\n'));
      if (!w) { this.pending.resolve(''); return; }
      w.catch(() => { this.pending?.resolve(''); });
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
    return (await this.request(`p ${key}=${fmt(value)}`)).startsWith('ok');
  }

  async setParams(patch: Partial<Params>): Promise<void> {
    for (const k of Object.keys(patch) as ParamKey[]) await this.setParam(k, patch[k]!);
  }

  async setTime(epochMs: number, tzOffsetMin: number): Promise<void> {
    await this.request(`T ${Math.floor(epochMs / 1000)} ${tzOffsetMin}`);
  }

  protected setStatus(s: TransportStatus, detail?: string): void { this.status = s; this.onStatus(s, detail); }

  /** Incoming bytes; lines may span chunks. */
  protected feed(bytes: Uint8Array): void {
    this.buf += this.dec.decode(bytes, { stream: true });
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) { this.dispatch(this.buf.slice(0, nl).trim()); this.buf = this.buf.slice(nl + 1); }
  }

  private dispatch(line: string): void {
    if (!line) return;
    if (isCsv(line)) { this.onLine(line); return; }
    const p = this.pending;
    if (!p) return;
    if (line === p.sent) return;  // echo
    p.resolve(line);
  }
}
