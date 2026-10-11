#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <math.h>

// =========================
// WiFi Config
// =========================
const char* ssid = "SSB206";
const char* password = "650603F9";

// =========================
// MQTT Config
// =========================
const char* mqtt_server = "192.168.1.5";
const int mqtt_port = 1883;
const char* mqtt_topic = "iot/sensor";

// =========================
// DHT11 Config
// =========================
#define DHTPIN 4
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

// =========================
// LDR Config
// =========================
#define LIGHT_PIN 34

// =========================
// WiFi & MQTT
// =========================
WiFiClient espClient;
PubSubClient client(espClient);

// =========================
// Timers
// =========================
unsigned long lastRead = 0;
unsigned long lastMQTT = 0;

const unsigned long readInterval = 2000;
const unsigned long mqttInterval = 60000;

// =========================
// Sensor Variables
// =========================
float temperature = NAN;
float humidity = NAN;

int lightADC = 0;
float lightLux = NAN;

// =========================
// LDR Calibration Table
// หมายเหตุ: ค่า Lux เป็นค่าประมาณ
// ต้องปรับเทียบกับเครื่องวัด Lux จริง
// =========================
struct CalibrationPoint {
  int adc;
  float lux;
};

const CalibrationPoint CALIBRATION[] = {
  {500,  800.0},
  {1000, 500.0},
  {2000, 200.0},
  {3000,  50.0},
  {4000,   5.0}
};

const int CAL_SIZE =
  sizeof(CALIBRATION) / sizeof(CALIBRATION[0]);

// =========================
// Convert ADC to Lux
// Linear Interpolation
// =========================
float adcToLux(int adc) {

  if (adc <= CALIBRATION[0].adc) {
    return CALIBRATION[0].lux;
  }

  if (adc >= CALIBRATION[CAL_SIZE - 1].adc) {
    return CALIBRATION[CAL_SIZE - 1].lux;
  }

  for (int i = 0; i < CAL_SIZE - 1; i++) {

    int adc1 = CALIBRATION[i].adc;
    int adc2 = CALIBRATION[i + 1].adc;

    if (adc >= adc1 && adc <= adc2) {

      float lux1 = CALIBRATION[i].lux;
      float lux2 = CALIBRATION[i + 1].lux;

      return lux1 +
        ((float)(adc - adc1) / (adc2 - adc1))
        * (lux2 - lux1);
    }
  }

  return NAN;
}

// =========================
// Read LDR
// =========================
int readLDR() {

  long total = 0;

  for (int i = 0; i < 16; i++) {
    total += analogRead(LIGHT_PIN);
    delay(2);
  }

  return total / 16;
}

// =========================
// WiFi Connection
// =========================
void setup_wifi() {

  Serial.print("Connecting WiFi");

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected");

  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

// =========================
// MQTT Reconnect
// =========================
void reconnectMQTT() {

  while (!client.connected()) {

    Serial.print("Connecting MQTT...");

    if (client.connect("ESP32_Sensor_Client")) {

      Serial.println("Connected");

    } else {

      Serial.print("Failed, rc=");
      Serial.println(client.state());

      delay(2000);
    }
  }
}

// =========================
// Setup
// =========================
void setup() {

  Serial.begin(115200);

  analogReadResolution(12);
  pinMode(LIGHT_PIN, INPUT);

  dht.begin();

  setup_wifi();

  client.setServer(mqtt_server, mqtt_port);

  Serial.println("==============================");
  Serial.println("ESP32 + DHT11 + LDR");
  Serial.println("==============================");
}

// =========================
// Read All Sensors
// =========================
void readSensors() {

  humidity = dht.readHumidity();
  temperature = dht.readTemperature();

  lightADC = readLDR();
  lightLux = adcToLux(lightADC);

  Serial.println("\n--- SENSOR READINGS ---");

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("DHT11: Read Error!");
  } else {
    Serial.printf(
      "Temp: %.1f C | Humi: %.1f %%\n",
      temperature,
      humidity
    );
  }

  Serial.printf("LDR ADC: %d\n", lightADC);

  if (isnan(lightLux)) {
    Serial.println("LDR Lux: Calibration Error");
  } else {
    Serial.printf(
      "LDR Lux (estimated): %.1f lx\n",
      lightLux
    );
  }

  Serial.println("-----------------------");
}

// =========================
// Float to JSON Number
// =========================
String jsonNumber(float value, int decimals) {

  if (isnan(value) || isinf(value)) {
    return "null";
  }

  return String(value, decimals);
}

// =========================
// Send MQTT JSON
// =========================
void sendMQTT() {

  String payload = "{";

  payload += "\"temperature\":";
  payload += jsonNumber(temperature, 1);
  payload += ",";

  payload += "\"humidity\":";
  payload += jsonNumber(humidity, 1);
  payload += ",";

  payload += "\"light\":";
  payload += jsonNumber(lightLux, 1);
  payload += ",";

  payload += "\"light_adc\":";
  payload += String(lightADC);

  payload += "}";

  Serial.println("\n========== MQTT PUBLISH ==========");

  Serial.print("Topic: ");
  Serial.println(mqtt_topic);

  Serial.print("Payload: ");
  Serial.println(payload);

  if (client.publish(mqtt_topic, payload.c_str())) {
    Serial.println("Status: SUCCESS");
  } else {
    Serial.println("Status: FAILED");
  }

  Serial.println("==================================");
}

// =========================
// Main Loop
// =========================
void loop() {

  if (WiFi.status() != WL_CONNECTED) {
    setup_wifi();
  }

  if (!client.connected()) {
    reconnectMQTT();
  }

  client.loop();

  unsigned long currentMillis = millis();

  // Read sensors every 2 seconds
  if (currentMillis - lastRead >= readInterval) {

    lastRead = currentMillis;
    readSensors();
  }

  // Publish MQTT every 60 seconds
  if (currentMillis - lastMQTT >= mqttInterval) {

    lastMQTT = currentMillis;
    sendMQTT();
  }
}