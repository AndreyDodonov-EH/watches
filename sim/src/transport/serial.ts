// Web Serial transport. Owns the port.
import { LineTransport } from './line';

const BAUD = 115200;

export class SerialTransport extends LineTransport {
  private port: any = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  get supported(): boolean { return 'serial' in navigator; }

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

  protected write(bytes: Uint8Array): Promise<void> | null { return this.writer?.write(bytes) ?? null; }

  private async readLoop(): Promise<void> {
    while (this.port?.readable) {
      const reader: ReadableStreamDefaultReader<Uint8Array> = this.port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          this.feed(value);
        }
      } catch (e) { if (this.port) this.setStatus('error', String(e)); }
      finally { reader.releaseLock(); }
    }
    if (this.status === 'connected') this.setStatus('disconnected', 'port closed');
  }
}
