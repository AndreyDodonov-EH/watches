// Transport abstraction: the UI drives the watch through this interface only.
// Implementations: serial.ts (Web Serial, line protocol). BLE / HTTP later.
import type { ParamKey, Params } from '../params';

export type TransportStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WatchTransport {
  readonly status: TransportStatus;
  onStatus: (s: TransportStatus, detail?: string) => void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Full struct as exported by the device. */
  getParams(): Promise<Partial<Params>>;
  /** Resolves false if the device rejected the key. */
  setParam(key: ParamKey, value: Params[ParamKey]): Promise<boolean>;
  setParams(patch: Partial<Params>): Promise<void>;
  setTime(epochMs: number, tzOffsetMin: number): Promise<void>;
}
