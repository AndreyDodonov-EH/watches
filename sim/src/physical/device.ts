import { SerialTransport } from '../transport/serial';
import { BleTransport } from '../transport/ble';
import type { LineTransport } from '../transport/line';
import type { PhysicalParams } from './model';
import { PHYSICAL_SCHEMA_DIGEST, validatePhysicalParams } from './model';

export type LinkKind = 'serial' | 'ble';
export class PhysicalDevice {
  readonly links = { serial: new SerialTransport(), ble: new BleTransport() };
  transport: LineTransport = this.links.serial;
  mode: 'legacy' | 'physical' = 'legacy';
  capable = false;
  onStatus: (text: string) => void = () => {};

  async connect(kind: LinkKind): Promise<void> {
    this.capable = false;
    this.transport = this.links[kind];
    this.transport.onStatus = (status, detail) => {
      if (status !== 'connected') this.capable = false;
      this.onStatus(detail ? `${status} · ${detail}` : status);
    };
    await this.transport.connect();
    const raw = await this.transport.request('V');
    let caps: { physical?: number; schema?: string; renderer?: string };
    try {
      caps = JSON.parse(raw);
    } catch {
      await this.disconnect();
      throw new Error('Device did not return capabilities.');
    }
    if (caps?.physical !== 1 || caps?.schema !== PHYSICAL_SCHEMA_DIGEST) {
      await this.disconnect();
      throw new Error('Device physical renderer/schema is incompatible.');
    }
    if (!this.transport.connected) throw new Error('Device disconnected during capability check.');
    this.mode = caps.renderer === 'physical' ? 'physical' : 'legacy';
    this.capable = true;
    this.onStatus('connected · physical schema verified');
  }

  async disconnect(): Promise<void> {
    this.capable = false;
    if (this.transport.connected) await this.transport.disconnect();
    this.onStatus('disconnected');
  }

  private requireConnection(): void {
    if (!this.capable || !this.transport.connected) {
      throw new Error('Connect and verify device capability first.');
    }
  }

  async select(mode: 'legacy' | 'physical'): Promise<void> {
    this.requireConnection();
    const reply = await this.transport.request(`R ${mode}`);
    if (!reply.startsWith('ok')) throw new Error(reply || 'Renderer selection failed.');
    this.mode = mode;
  }

  async push(params: PhysicalParams): Promise<void> {
    this.requireConnection();
    const snapshot = validatePhysicalParams(params);
    const begin = await this.transport.request('Pbegin');
    if (!begin.startsWith('ok')) throw new Error(begin || 'Pbegin failed.');
    try {
      for (const [key, value] of Object.entries(snapshot)) {
        const reply = await this.transport.request(`P ${key}=${value}`);
        if (!reply.startsWith('ok')) throw new Error(`${key}: ${reply || 'no reply'}`);
      }
      const done = await this.transport.request('Pcommit');
      if (!done.startsWith('ok')) throw new Error(done || 'Pcommit failed.');
    } catch (error) {
      await this.transport.request('Pcancel');
      throw error;
    }
  }

  async pull(): Promise<PhysicalParams> {
    this.requireConnection();
    const raw = await this.transport.request('P?');
    return validatePhysicalParams(JSON.parse(raw));
  }

  async setTime(date: Date, speed: number): Promise<void> {
    this.requireConnection();
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid time.');
    if (!Number.isFinite(speed) || speed < 0 || speed > 3600) {
      throw new Error('Demo speed must be 0–3600.');
    }
    await this.transport.setDemoSpeed(speed);
    await this.transport.setTime(date.getTime(), -date.getTimezoneOffset());
  }
}
