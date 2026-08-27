#include "ble.h"
#ifdef NO_BLE   // perf-baseline build (see tools/e2e.sh --no-ble): USB serial only
DualOut out;
void ble_init(const char *) {}
int ble_read() { return -1; }
size_t DualOut::write(uint8_t c) { return Serial.write(c); }
size_t DualOut::write(const uint8_t *buf, size_t n) { return Serial.write(buf, n); }
#else
#include <NimBLEDevice.h>

#define NUS_UUID    "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_RX_UUID "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_TX_UUID "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

static NimBLECharacteristic *txChar = nullptr;
static volatile bool connected = false;
static uint8_t rxBuf[512];
static volatile uint16_t rxHead = 0, rxTail = 0;  // written on the NimBLE task, drained in loop()
static uint8_t txBuf[244];
static size_t txLen = 0;
static volatile uint16_t peerMtu = 23;

static size_t txMax() { size_t m = peerMtu > 3 ? peerMtu - 3 : 20; return m < sizeof(txBuf) ? m : sizeof(txBuf); }

static void txFlush() {
  if (txLen && connected && txChar) { txChar->setValue(txBuf, txLen); txChar->notify(); }
  txLen = 0;
}

struct ServerCb : NimBLEServerCallbacks {
  void onConnect(NimBLEServer *, NimBLEConnInfo &ci) override { connected = true; peerMtu = ci.getMTU(); Serial.printf("ble: connect mtu %u\n", peerMtu); }
  void onDisconnect(NimBLEServer *, NimBLEConnInfo &, int reason) override { connected = false; txLen = 0; Serial.printf("ble: disconnect %d\n", reason); NimBLEDevice::startAdvertising(); }
  void onMTUChange(uint16_t mtu, NimBLEConnInfo &) override { peerMtu = mtu; Serial.printf("ble: mtu %u\n", mtu); }
};
struct RxCb : NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c, NimBLEConnInfo &) override {
    std::string v = c->getValue();
    for (char ch : v) { uint16_t nx = (rxHead + 1) % sizeof(rxBuf); if (nx != rxTail) { rxBuf[rxHead] = ch; rxHead = nx; } }
  }
};

void ble_init(const char *name) {
  NimBLEDevice::init(name);
  NimBLEDevice::setMTU(247);
  NimBLEServer *srv = NimBLEDevice::createServer();
  srv->setCallbacks(new ServerCb());
  NimBLEService *svc = srv->createService(NUS_UUID);
  txChar = svc->createCharacteristic(NUS_TX_UUID, NIMBLE_PROPERTY::NOTIFY);
  NimBLECharacteristic *rx = svc->createCharacteristic(NUS_RX_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  rx->setCallbacks(new RxCb());
  svc->start();
  // Name + 128-bit UUID exceed the 31-byte adv packet: name in adv, UUID in scan response.
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
  NimBLEAdvertisementData advData, scanData;
  advData.setFlags(BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP);
  advData.setName(name);
  scanData.setCompleteServices(NimBLEUUID(NUS_UUID));
  adv->setAdvertisementData(advData);
  adv->setScanResponseData(scanData);
  adv->start();
}

int ble_read() { if (rxHead == rxTail) return -1; uint8_t c = rxBuf[rxTail]; rxTail = (rxTail + 1) % sizeof(rxBuf); return c; }

DualOut out;
size_t DualOut::write(uint8_t c) {
  Serial.write(c);
  if (connected) { txBuf[txLen++] = c; if (c == '\n' || txLen >= txMax()) txFlush(); }
  return 1;
}
size_t DualOut::write(const uint8_t *buf, size_t n) { for (size_t i = 0; i < n; i++) write(buf[i]); return n; }
#endif  // NO_BLE
