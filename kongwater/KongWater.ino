// Kong's Water: auto-dump dog bowl controller
// ESP32 (classic WROOM) + HomeSpan, shows up in Apple Home as a faucet.
// One dump = close inlet, open drain, hold, close drain, reopen inlet. Float valve refills.

#include "HomeSpan.h"

// ---- pins (screw-terminal adapter labels) ----
const int PIN_RELAY_INLET = 26;   // relay 1 -> 1/4" NO motorized valve. Energized = inlet CLOSED
const int PIN_RELAY_DRAIN = 27;   // relay 2 -> 3/4" NC motorized valve. Energized = drain OPEN
const int PIN_PIR         = 14;   // HC-SR501 OUT (3.3V-safe)
const int PIN_LEAK_PWR    = 25;   // leak probe VCC, only powered while reading (stops electrolysis)
const int PIN_LEAK_SIG    = 34;   // leak probe AO (ADC1, input only)
const int PIN_LED         = 2;    // onboard LED

// ---- tuning ----
const bool     RELAY_ACTIVE_LOW   = true;          // most kit relay boards trigger on LOW; flip if yours clicks backwards
const uint32_t VALVE_STROKE_MS    = 8000;          // US Solid is 3-5 s; pad it
const uint32_t MIN_DRAIN_S        = 60;            // auto-return cap needs ~60 s of power to recharge
const uint32_t MAX_AGE_MS         = 4UL * 3600000; // fallback dump if nothing triggered one in 4 h
const uint32_t PIR_QUIET_MS       = 120000;        // need 2 min with no motion before starting
const uint32_t PIR_GIVEUP_MS      = 30UL * 60000;  // if he camps there 30 min, skip this dump
const int      LEAK_THRESHOLD     = 1200;          // ADC counts (0-4095); dry probe reads near 0

void relay(int pin, bool on) { digitalWrite(pin, (on ^ RELAY_ACTIVE_LOW) ? HIGH : LOW); }

enum Phase { IDLE, WAIT_QUIET, CLOSE_INLET, DRAINING, CLOSE_DRAIN, LOCKOUT };
const char *phaseName[] = {"idle", "waiting for Kong to leave", "closing inlet", "draining", "closing drain", "LEAK LOCKOUT"};

struct DogMotion : Service::MotionSensor {
  SpanCharacteristic *motion;
  uint32_t lastMotion = 0;
  DogMotion() : Service::MotionSensor() {
    motion = new Characteristic::MotionDetected(0);
    pinMode(PIN_PIR, INPUT);
  }
  void loop() override {
    int m = digitalRead(PIN_PIR);
    if (m) lastMotion = millis();
    if (motion->getVal() != m && motion->timeVal() > 1000) motion->setVal(m);
  }
  bool quietFor(uint32_t ms) { return millis() - lastMotion > ms && !digitalRead(PIN_PIR); }
};

struct LeakProbe : Service::LeakSensor {
  SpanCharacteristic *leak;
  uint32_t lastRead = 0;
  LeakProbe() : Service::LeakSensor() {
    leak = new Characteristic::LeakDetected(0);
    pinMode(PIN_LEAK_PWR, OUTPUT);
    digitalWrite(PIN_LEAK_PWR, LOW);
  }
  void loop() override {
    if (millis() - lastRead < 5000) return;
    lastRead = millis();
    digitalWrite(PIN_LEAK_PWR, HIGH);
    delay(10);
    int v = analogRead(PIN_LEAK_SIG);
    digitalWrite(PIN_LEAK_PWR, LOW);
    int wet = v > LEAK_THRESHOLD;
    if (leak->getVal() != wet) {
      leak->setVal(wet);
      WEBLOG("Leak probe %s (adc=%d)", wet ? "WET" : "dry", v);
    }
  }
  bool wet() { return leak->getVal(); }
};

DogMotion *pir;
LeakProbe *probe;

struct DumpValve : Service::Valve {
  SpanCharacteristic *active, *inUse, *setDur, *remDur, *fault;
  Phase phase = IDLE;
  uint32_t phaseStart = 0, lastDump = 0, drainMs = 0;

  DumpValve() : Service::Valve() {
    active = new Characteristic::Active(0);
    inUse  = new Characteristic::InUse(0);
    new Characteristic::ValveType(3);                                   // FAUCET
    setDur = (new Characteristic::SetDuration(75, true))->setRange(MIN_DRAIN_S, 300, 5);
    remDur = new Characteristic::RemainingDuration(0);
    fault  = new Characteristic::StatusFault(0);
    pinMode(PIN_RELAY_INLET, OUTPUT);
    pinMode(PIN_RELAY_DRAIN, OUTPUT);
    relay(PIN_RELAY_INLET, false);
    relay(PIN_RELAY_DRAIN, false);
    lastDump = millis();
  }

  void go(Phase p) {
    phase = p;
    phaseStart = millis();
    WEBLOG("Phase -> %s", phaseName[p]);
  }

  void start(const char *why) {
    if (phase != IDLE) return;
    WEBLOG("Dump requested (%s)", why);
    if (!active->getVal()) active->setVal(1);
    inUse->setVal(1);
    go(WAIT_QUIET);
  }

  void finish() {
    relay(PIN_RELAY_DRAIN, false);
    relay(PIN_RELAY_INLET, false);
    active->setVal(0);
    inUse->setVal(0);
    remDur->setVal(0);
    lastDump = millis();
    go(IDLE);
  }

  boolean update() override {
    if (active->updated()) {
      if (active->getNewVal() == 1 && phase == IDLE) {
        WEBLOG("Dump requested (Apple Home)");
        inUse->setVal(1);
        go(WAIT_QUIET);
      } else if (active->getNewVal() == 0 && (phase == WAIT_QUIET || phase == CLOSE_INLET)) {
        WEBLOG("Dump cancelled before draining");
        finish();
      }
    }
    return true;
  }

  void loop() override {
    uint32_t t = millis() - phaseStart;

    if (probe->wet() && phase != LOCKOUT) {          // any leak: shut inlet, shut drain, stay there
      relay(PIN_RELAY_DRAIN, false);
      relay(PIN_RELAY_INLET, true);
      fault->setVal(1);
      active->setVal(0);
      inUse->setVal(0);
      go(LOCKOUT);
      return;
    }

    switch (phase) {
      case IDLE:
        if (millis() - lastDump > MAX_AGE_MS) start("4 h max age");
        break;

      case WAIT_QUIET:
        if (pir->quietFor(PIR_QUIET_MS)) {
          relay(PIN_RELAY_INLET, true);
          go(CLOSE_INLET);
        } else if (t > PIR_GIVEUP_MS) {
          WEBLOG("Kong never left, skipping this dump");
          finish();
        }
        break;

      case CLOSE_INLET:
        if (t > VALVE_STROKE_MS) {
          drainMs = max<uint32_t>(setDur->getVal(), MIN_DRAIN_S) * 1000UL;
          relay(PIN_RELAY_DRAIN, true);
          go(DRAINING);
        }
        break;

      case DRAINING: {
        uint32_t left = t >= drainMs ? 0 : (drainMs - t) / 1000;
        if (remDur->getVal() != (int)left && remDur->timeVal() > 1000) remDur->setVal(left);
        if (t >= drainMs) {
          relay(PIN_RELAY_DRAIN, false);
          go(CLOSE_DRAIN);
        }
        break;
      }

      case CLOSE_DRAIN:
        if (t > VALVE_STROKE_MS) {
          relay(PIN_RELAY_INLET, false);               // NO valve springs open, float refills
          finish();
        }
        break;

      case LOCKOUT:
        digitalWrite(PIN_LED, (millis() / 250) % 2);   // fast blink = leak
        if (!probe->wet() && t > 60000) {            // dry for a minute: release
          fault->setVal(0);
          relay(PIN_RELAY_INLET, false);
          go(IDLE);
        }
        break;
    }
    if (phase != LOCKOUT) digitalWrite(PIN_LED, phase != IDLE);
  }
};

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  homeSpan.setLogLevel(1);
  homeSpan.enableWebLog(50, "pool.ntp.org", "EST5EDT,M3.2.0,M11.1.0", "log");
  homeSpan.begin(Category::Faucets, "Kong's Water", "kongwater", "Kong Waterer v1");

  new SpanAccessory();
    new Service::AccessoryInformation();
      new Characteristic::Identify();
      new Characteristic::Manufacturer("Foreman Works");
      new Characteristic::Model("Auto-dump bowl v1");
      new Characteristic::FirmwareRevision("1.0");
    pir   = new DogMotion();
    probe = new LeakProbe();
    new DumpValve();
}

void loop() {
  homeSpan.poll();
}
