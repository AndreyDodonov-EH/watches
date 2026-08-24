// Web Bluetooth transport: Nordic UART Service (RX write / TX notify) carrying the same line protocol.
import { LineTransport } from './line';

const NUS = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';  // central → board
const NUS_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';  // board → central
const NAME_PREFIX = 'liquid-watch';

export class BleTransport extends LineTransport {
  private device: any = null;
  private rx: any = null;

  get supported(): boolean { return 'bluetooth' in navigator; }

  async connect(): Promise<void> {
    this.setStatus('connecting');
    try {
      const dev = await (navigator as any).bluetooth.requestDevice({ filters: [{ namePrefix: NAME_PREFIX }], optionalServices: [NUS] });
      dev.addEventListener('gattserverdisconnected', () => { if (this.device === dev) { this.device = null; this.rx = null; this.setStatus('disconnected', 'link lost'); } });
      const svc = await dev.gatt.connect().then((g: any) => g.getPrimaryService(NUS));
      const tx = await svc.getCharacteristic(NUS_TX);
      tx.addEventListener('characteristicvaluechanged', (e: any) => { const dv: DataView = e.target.value; this.feed(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)); });
      await tx.startNotifications();
      this.rx = await svc.getCharacteristic(NUS_RX);
      this.device = dev;
      this.setStatus('connected');
    } catch (e) { this.device = null; this.rx = null; this.setStatus('error', String(e)); throw e; }
  }

  async disconnect(): Promise<void> {
    const dev = this.device; this.device = null; this.rx = null;
    try { dev?.gatt.disconnect(); } catch { /* gone */ }
    this.setStatus('disconnected');
  }

  protected write(bytes: Uint8Array): Promise<void> | null {
    return this.rx ? this.rx.writeValueWithoutResponse(bytes) : null;
  }
}
