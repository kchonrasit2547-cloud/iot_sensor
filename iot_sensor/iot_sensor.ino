#include <WiFi.h>
#include <WiFiManager.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <PZEM004Tv30.h>
#include <time.h>
#include <sys/time.h>

// ==========================================
// 1. CONFIGURATION & PINS
// ==========================================
#define DHTPIN       4
#define DHTTYPE      DHT11
#define LDRPIN       34
#define PZEM_RX_PIN  16
#define PZEM_TX_PIN  17

// สลับโหมด: true = จำลองค่า PZEM (ทดสอบหอพัก), false = อ่านค่า PZEM จริง
#define USE_MOCK_PZEM true  

// Local MQTT Broker Settings
const char* LOCAL_MQTT_SERVER = "192.168.1.5";
const int   LOCAL_MQTT_PORT   = 1883;
const char* LOCAL_TOPIC       = "iot/sensor";

// HiveMQ Cloud MQTT Broker Settings (TLS)
const char* CLOUD_MQTT_SERVER = "b1846ae35bad4e6f83b3e0bf47e1e724.s1.eu.hivemq.cloud";
const int   CLOUD_MQTT_PORT   = 8883;
const char* CLOUD_MQTT_USER   = "esp32_pzem01";
const char* CLOUD_MQTT_PASS   = "1qazxsw2";

// ==========================================
// 2. OBJECTS & GLOBALS
// ==========================================
DHT dht(DHTPIN, DHTTYPE);
HardwareSerial pzemSerial(2); // Hardware UART2

PZEM004Tv30 pzem1(pzemSerial, PZEM_RX_PIN, PZEM_TX_PIN, 0x01);
PZEM004Tv30 pzem2(pzemSerial, PZEM_RX_PIN, PZEM_TX_PIN, 0x02);
PZEM004Tv30 pzem3(pzemSerial, PZEM_RX_PIN, PZEM_TX_PIN, 0x03);

WiFiClient espLocalClient;
PubSubClient localMqtt(espLocalClient);

WiFiClientSecure espCloudClient;
PubSubClient cloudMqtt(espCloudClient);

// Sensor Variables
float temperature = 0.0;
float humidity    = 0.0;
int   lightADC    = 0;
float lightLux    = 0.0;

// Timers
unsigned long lastSensorRead = 0;
unsigned long lastLocalPub   = 0;
unsigned long lastCloudPub   = 0;

const unsigned long readInterval  = 2000;  // อ่านเซ็นเซอร์และอัปเดต Serial Monitor ทุก 2 วินาที
const unsigned long localInterval = 60000; // ส่ง Local MQTT ทุก 1 นาที
const unsigned long cloudInterval = 60000; // ส่ง HiveMQ Cloud ทุก 1 นาที (ใช้ millis จับเวลา)

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================

// แปลงค่า ADC ของ LDR เป็น Lux แบบ Inverted Logic (4095 = 0 Lux)
float adcToLux(int adcVal) {
  if (adcVal >= 4090) return 0.0; // มืดสนิท
  float invADC = 4095.0 - adcVal;
  float lux = (invADC / 4095.0) * 1000.0;
  return (lux < 0.0) ? 0.0 : lux;
}

// ดึงเวลาปัจจุบันผ่าน HTTP (WorldTimeAPI)
void syncTimeHTTP() {
  Serial.println("\n[HTTP Time] Starting Time Synchronization...");
  delay(2000); // หน่วงเวลาให้ Wi-Fi / DNS ตั้งตัว

  HTTPClient http;
  http.setTimeout(5000);

  for (int attempt = 1; attempt <= 3; attempt++) {
    Serial.printf(" Attempt %d/3: Connecting to WorldTimeAPI...", attempt);
    http.begin("http://worldtimeapi.org/api/timezone/Asia/Bangkok");
    int httpCode = http.GET();
    
    if (httpCode == 200) {
      String payload = http.getString();
      int idx = payload.indexOf("\"unixtime\":");
      if (idx != -1) {
        String timeStr = payload.substring(idx + 11);
        time_t epoch = (time_t)timeStr.toInt();
        if (epoch > 1700000000) {
          struct timeval tv = { epoch, 0 };
          settimeofday(&tv, NULL);
          setenv("TZ", "ICT-7", 1); // UTC+7 Thailand
          tzset();
          Serial.println(" SUCCESS!");
          http.end();
          return;
        }
      }
    } else {
      Serial.printf(" Failed (HTTP Code: %d)\n", httpCode);
    }
    http.end();
    if (attempt < 3) delay(2000);
  }
  Serial.println(">>> HTTP Time Sync FAILED! (Using internal clock)");
}

String tsYMD_HMS() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return "1970-01-01 00:00:00";
  }
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
  return String(buf);
}

// อ่านค่าสภาพแวดล้อมเข้าตัวแปร
void updateEnvironmentalSensors() {
  temperature = dht.readTemperature();
  humidity    = dht.readHumidity();
  lightADC    = analogRead(LDRPIN);
  lightLux    = adcToLux(lightADC);
}

// ==========================================
// 4. MQTT RECONNECT & PUBLISH
// ==========================================
void reconnectLocalMQTT() {
  if (!localMqtt.connected()) {
    Serial.print("Connecting Local MQTT (192.168.1.5)... ");
    if (localMqtt.connect("ESP32_Local_Env")) {
      Serial.println("Connected!");
    } else {
      Serial.printf("Failed (rc=%d)\n", localMqtt.state());
    }
  }
}

void reconnectCloudMQTT() {
  if (!cloudMqtt.connected()) {
    Serial.print("Connecting HiveMQ Cloud... ");
    if (cloudMqtt.connect("ESP32_PZEM_Hub", CLOUD_MQTT_USER, CLOUD_MQTT_PASS)) {
      Serial.println("Connected!");
    } else {
      Serial.printf("Failed (rc=%d)\n", cloudMqtt.state());
    }
  }
}

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
  float v, i, w, e;

  if (USE_MOCK_PZEM) {
    v = 220.0 + (random(-30, 30) / 10.0);   
    i = 1.000 + (random(0, 4000) / 1000.0); 
    w = v * i * 0.95;                       
    e = 150.25 + (id * 10.5);               
    Serial.printf("[MOCK] PZEM%u -> V=%.2f I=%.3f P=%.1f E=%.2f\n", id, v, i, w, e);
  } else {
    v = p.voltage(); delay(60);
    i = p.current(); delay(60);
    w = p.power();   delay(60);
    e = p.energy();  delay(60);
    Serial.printf("[REAL] PZEM%u -> V=%.2f I=%.3f P=%.1f E=%.2f\n", 
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

  // Initialize Hardware
  dht.begin();
  pinMode(LDRPIN, INPUT);

  // WiFiManager Provisioning
  WiFiManager wm;
  wm.setConfigPortalTimeout(180); 
  if (!wm.autoConnect("PZEM-Setup")) {
    Serial.println("Failed to connect Wi-Fi, restarting...");
    ESP.restart();
  }
  Serial.print(">>> WiFi Connected! IP: ");
  Serial.println(WiFi.localIP());

  // HTTP Time Sync
  syncTimeHTTP();
  Serial.print(">>> Current Time (UTC+7): ");
  Serial.println(tsYMD_HMS());

  // อ่านค่าเซ็นเซอร์ตั้งต้นทันที 1 ครั้ง (ป้องกันการส่งค่า 0.0)
  delay(1000);
  updateEnvironmentalSensors();

  // MQTT Server Configurations
  localMqtt.setServer(LOCAL_MQTT_SERVER, LOCAL_MQTT_PORT);
  
  espCloudClient.setInsecure(); // Skip TLS Cert Validation for HiveMQ
  cloudMqtt.setServer(CLOUD_MQTT_SERVER, CLOUD_MQTT_PORT);
}

// ==========================================
// 6. MAIN LOOP
// ==========================================
void loop() {
  unsigned long currentMillis = millis();

  // Maintain MQTT Connections
  if (WiFi.status() == WL_CONNECTED) {
    if (!localMqtt.connected()) reconnectLocalMQTT();
    if (!cloudMqtt.connected()) reconnectCloudMQTT();
  }
  localMqtt.loop();
  cloudMqtt.loop();

  // Task A: อ่านค่าเซ็นเซอร์และแสดงผล Serial Monitor ทุก 2 วินาที
  if (currentMillis - lastSensorRead >= readInterval) {
    lastSensorRead = currentMillis;
    updateEnvironmentalSensors();

    Serial.printf("[ENV] Temp: %.1f °C | Hum: %.1f %% | Light ADC: %d (%.1f Lux)\n",
                  isnan(temperature) ? -1 : temperature,
                  isnan(humidity) ? -1 : humidity,
                  lightADC, lightLux);
  }

  // Task B: ส่งค่าสภาพแวดล้อมเข้า Local MQTT -> Topic: "iot/sensor" ทุก 1 นาที
  if (currentMillis - lastLocalPub >= localInterval) {
    lastLocalPub = currentMillis;
    if (localMqtt.connected()) {
      char payload[128];
      snprintf(payload, sizeof(payload), 
               "{\"temperature\":%.1f,\"humidity\":%.1f,\"light\":%.1f}", 
               isnan(temperature) ? -1 : temperature, 
               isnan(humidity) ? -1 : humidity, 
               lightLux);
      
      localMqtt.publish(LOCAL_TOPIC, payload);
      Serial.println(">>> Published to Local MQTT (iot/sensor) OK");
    }
  }

  // Task C: ส่งข้อมูลไฟฟ้า 3 เฟสเข้า HiveMQ Cloud ทุก 1 นาที (ใช้ millis จับเวลา)
  if (currentMillis - lastCloudPub >= cloudInterval) {
    lastCloudPub = currentMillis;
    String ts = tsYMD_HMS();
    
    Serial.printf("\n[%s] Trigger Periodic Cloud Publish...\n", ts.c_str());
    if (cloudMqtt.connected()) {
      readAndSendPZEM(pzem1, 1, ts);
      readAndSendPZEM(pzem2, 2, ts);
      readAndSendPZEM(pzem3, 3, ts);
      Serial.println(">>> HiveMQ Cloud Publish Complete!\n");
    } else {
      Serial.println(">>> HiveMQ Cloud Publish Skipped: Disconnected!\n");
    }
  }
}