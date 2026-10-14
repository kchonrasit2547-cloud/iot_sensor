#include <WiFi.h>
#include <WiFiManager.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <PZEM004Tv30.h>
#include <time.h>
#include "secrets.h"

// ==========================================
// 1. CONFIGURATION & PINS
// ==========================================
#define DHTPIN       4
#define DHTTYPE      DHT11
#define LDRPIN       34
#define PZEM_RX_PIN  16
#define PZEM_TX_PIN  17

// true = จำลองค่า PZEM (ทดสอบ), false = อ่านค่า PZEM จริง
#define USE_MOCK_PZEM false

// Local MQTT Broker
const char* LOCAL_MQTT_SERVER = "192.168.1.9";
const int   LOCAL_MQTT_PORT   = 1883;
const char* LOCAL_TOPIC       = "iot/sensor";

// NTP / Timezone (UTC+7)
const long  GMT_OFFSET_SEC = 7 * 3600;

// ==========================================
// 2. OBJECTS & GLOBALS
// ==========================================
DHT dht(DHTPIN, DHTTYPE);
HardwareSerial pzemSerial(2);

PZEM004Tv30 pzem1(pzemSerial, PZEM_RX_PIN, PZEM_TX_PIN, 0x01);
PZEM004Tv30 pzem2(pzemSerial, PZEM_RX_PIN, PZEM_TX_PIN, 0x02);
PZEM004Tv30 pzem3(pzemSerial, PZEM_RX_PIN, PZEM_TX_PIN, 0x03);

WiFiClient espLocalClient;
PubSubClient localMqtt(espLocalClient);

WiFiClientSecure espCloudClient;
PubSubClient cloudMqtt(espCloudClient);

// Sensor variables (NAN = ไม่มีข้อมูลที่ใช้ได้)
float temperature = NAN;
float humidity    = NAN;
int   lightADC    = 0;
float lightLux    = 0.0;
uint8_t dhtFailCount = 0;

// Timers
unsigned long lastSensorRead = 0;
unsigned long lastLocalPub   = 0;
unsigned long lastCloudPub   = 0;
unsigned long lastLocalTry   = 0;
unsigned long lastCloudTry   = 0;

const unsigned long readInterval      = 2000;
const unsigned long localInterval     = 60000;
const unsigned long cloudInterval     = 60000;
const unsigned long reconnectInterval = 5000;  // ลองต่อ MQTT ใหม่ทุก 5 วินาที (ไม่บล็อกทุก loop)

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================

// ADC (inverted: 4095 = มืด) -> Lux แบบประมาณการ ควร calibrate กับ lux meter
float adcToLux(int adcVal) {
  if (adcVal >= 4090) return 0.0;
  float lux = ((4095.0 - adcVal) / 4095.0) * 1000.0;
  return (lux < 0.0) ? 0.0 : lux;
}

bool timeValid() {
  return time(nullptr) > 1700000000;
}

// ซิงก์เวลาด้วย NTP (ทำงานเบื้องหลังต่อเนื่องหลังเรียก configTime)
bool syncTimeNTP(uint32_t timeoutMs = 10000) {
  Serial.print("[NTP] Syncing time... ");
  configTime(GMT_OFFSET_SEC, 0, "pool.ntp.org", "time.google.com", "time.windows.com");
  uint32_t start = millis();
  while (!timeValid() && millis() - start < timeoutMs) delay(200);
  if (timeValid()) {
    Serial.println("SUCCESS");
    return true;
  }
  Serial.println("FAILED (will keep retrying in background)");
  return false;
}

String tsYMD_HMS() {
  struct tm timeinfo;
  if (!timeValid() || !getLocalTime(&timeinfo, 100)) return "";
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
  return String(buf);
}

String jsonNum(float v, int decimals) {
  return isnan(v) ? String("null") : String(v, decimals);
}

void updateEnvironmentalSensors() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (isnan(t) || isnan(h)) {
    // ถ้าอ่านพลาดติดกัน 5 ครั้ง ถือว่าเซ็นเซอร์มีปัญหา ไม่ใช้ค่าเก่าค้าง
    if (++dhtFailCount >= 5) { temperature = NAN; humidity = NAN; }
  } else {
    dhtFailCount = 0;
    temperature = t;
    humidity = h;
  }

  lightADC = analogRead(LDRPIN);
  lightLux = adcToLux(lightADC);
}

// ==========================================
// 4. MQTT
// ==========================================
void reconnectLocalMQTT() {
  Serial.print("Connecting Local MQTT... ");
  if (localMqtt.connect("ESP32_Local_Env")) {
    Serial.println("Connected!");
  } else {
    Serial.printf("Failed (rc=%d)\n", localMqtt.state());
  }
}

void reconnectCloudMQTT() {
  Serial.print("Connecting HiveMQ Cloud... ");
  // client id ไม่ซ้ำกันในแต่ละบอร์ด
  String clientId = "ESP32_PZEM_Hub_" + String((uint32_t)ESP.getEfuseMac(), HEX);
  if (cloudMqtt.connect(clientId.c_str(), CLOUD_MQTT_USER, CLOUD_MQTT_PASS)) {
    Serial.println("Connected!");
  } else {
    Serial.printf("Failed (rc=%d)\n", cloudMqtt.state());
  }
}

// ค่าที่อ่านไม่ได้ (NaN) ส่งเป็น -1 เหมือนโค้ดเดิม เพื่อให้ HTML เดิมใช้ได้
void publishCloudNumber(uint8_t id, const char* metric, float val) {
  if (isnan(val)) val = -1.0;
  char topic[100];
  snprintf(topic, sizeof(topic), "ku/engineering/power3phase/data/%u/%s", id, metric);
  char buf[32];
  dtostrf(val, 1, 3, buf);
  cloudMqtt.publish(topic, buf);
}

void publishCloudTimestamp(uint8_t id, const String& ts) {
  char topic[100];
  snprintf(topic, sizeof(topic), "ku/engineering/power3phase/data/%u/timestamp", id);
  cloudMqtt.publish(topic, ts.c_str());
}

void readAndSendPZEM(PZEM004Tv30& p, uint8_t id, const String& ts) {
  float v, i, w, e;  // e ส่งค่าตามที่ไลบรารีให้ (kWh) เหมือนโค้ดเดิม ไม่แปลงหน่วย

  if (USE_MOCK_PZEM) {
    static float mockEnergy[4] = {0, 160.75, 171.25, 181.75};
    v = 220.0 + (random(-30, 30) / 10.0);
    i = 1.000 + (random(0, 4000) / 1000.0);
    w = v * i * 0.95;
    mockEnergy[id] += (w / 1000.0) * (cloudInterval / 3600000.0);  // สะสมตามเวลาจริง
    e = mockEnergy[id];
    Serial.printf("[MOCK] PZEM%u -> V=%.2f I=%.3f P=%.1f E=%.3f\n", id, v, i, w, e);
  } else {
    v = p.voltage(); delay(60);
    i = p.current(); delay(60);
    w = p.power();   delay(60);
    e = p.energy();  delay(60);
    Serial.printf("[REAL] PZEM%u -> V=%.2f I=%.3f P=%.1f E=%.3f\n",
                  id, isnan(v)?-1:v, isnan(i)?-1:i, isnan(w)?-1:w, isnan(e)?-1:e);
  }

  publishCloudTimestamp(id, ts);
  publishCloudNumber(id, "volt", v);
  publishCloudNumber(id, "amp", i);
  publishCloudNumber(id, "watt", w);
  publishCloudNumber(id, "energy_wh", e);
}

// ==========================================
// 5. SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== ESP32 Multi-Node IoT Hub Starting ===");
  Serial.println(USE_MOCK_PZEM ? ">>> MODE: MOCK PZEM" : ">>> MODE: REAL PZEM");

  dht.begin();
  pinMode(LDRPIN, INPUT);

  WiFi.setAutoReconnect(true);
  WiFiManager wm;
  wm.setConfigPortalTimeout(180);
  if (!wm.autoConnect("PZEM-Setup")) {
    Serial.println("Failed to connect Wi-Fi, restarting...");
    ESP.restart();
  }
  Serial.print(">>> WiFi Connected! IP: ");
  Serial.println(WiFi.localIP());

  syncTimeNTP();
  Serial.print(">>> Current Time (UTC+7): ");
  Serial.println(tsYMD_HMS());

  delay(1000);
  updateEnvironmentalSensors();

  localMqtt.setServer(LOCAL_MQTT_SERVER, LOCAL_MQTT_PORT);

  // หมายเหตุ: setInsecure() ไม่ตรวจสอบ certificate ของ server
  // ถ้าต้องการความปลอดภัยเต็มที่ ใช้ espCloudClient.setCACert(<ISRG Root X1>) แทน
  espCloudClient.setInsecure();
  cloudMqtt.setServer(CLOUD_MQTT_SERVER, CLOUD_MQTT_PORT);
  cloudMqtt.setKeepAlive(30);
}

// ==========================================
// 6. MAIN LOOP
// ==========================================
void loop() {
  unsigned long now = millis();

  // ต่อ MQTT ใหม่แบบจำกัดความถี่ (ไม่บล็อก loop ทุกรอบ)
  if (WiFi.status() == WL_CONNECTED) {
    if (!localMqtt.connected() && now - lastLocalTry >= reconnectInterval) {
      lastLocalTry = now;
      reconnectLocalMQTT();
    }
    if (!cloudMqtt.connected() && now - lastCloudTry >= reconnectInterval) {
      lastCloudTry = now;
      reconnectCloudMQTT();
    }
  }
  localMqtt.loop();
  cloudMqtt.loop();

  // Task A: อ่านเซ็นเซอร์ทุก 2 วินาที
  if (now - lastSensorRead >= readInterval) {
    lastSensorRead = now;
    updateEnvironmentalSensors();
    Serial.printf("[ENV] Temp: %s °C | Hum: %s %% | Light ADC: %d (%.1f Lux)\n",
                  jsonNum(temperature, 1).c_str(), jsonNum(humidity, 1).c_str(),
                  lightADC, lightLux);
  }

  // Task B: ส่งค่าสภาพแวดล้อมเข้า Local MQTT ทุก 1 นาที (ค่าที่อ่านไม่ได้ส่งเป็น null)
  if (now - lastLocalPub >= localInterval) {
    lastLocalPub = now;
    if (localMqtt.connected()) {
      String payload = "{\"temperature\":" + String(isnan(temperature) ? -1.0f : temperature, 1) +
                       ",\"humidity\":"    + String(isnan(humidity) ? -1.0f : humidity, 1) +
                       ",\"light\":"       + String(lightLux, 1) + "}";
      localMqtt.publish(LOCAL_TOPIC, payload.c_str());
      Serial.println(">>> Published to Local MQTT OK");
    } else {
      Serial.println(">>> Local MQTT Publish Skipped: Disconnected");
    }
  }

  // Task C: ส่งข้อมูลไฟฟ้า 3 เฟสเข้า HiveMQ Cloud ทุก 1 นาที
  if (now - lastCloudPub >= cloudInterval) {
    lastCloudPub = now;
    String ts = tsYMD_HMS();

    if (ts.length() == 0) {
      Serial.println(">>> Cloud Publish Skipped: เวลายังไม่ซิงก์ (กัน timestamp 1970)");
    } else if (!cloudMqtt.connected()) {
      Serial.println(">>> Cloud Publish Skipped: Disconnected");
    } else {
      Serial.printf("\n[%s] Periodic Cloud Publish...\n", ts.c_str());
      readAndSendPZEM(pzem1, 1, ts);
      readAndSendPZEM(pzem2, 2, ts);
      readAndSendPZEM(pzem3, 3, ts);
      Serial.println(">>> HiveMQ Cloud Publish Complete!\n");
    }
  }
}
