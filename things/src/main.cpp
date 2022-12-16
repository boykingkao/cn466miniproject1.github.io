#include <Wire.h>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Update.h>
#include <Adafruit_NeoPixel.h>
#include <Adafruit_BMP280.h>
#include <Adafruit_HTS221.h>
#include <Adafruit_MPU6050.h>
#include <WiFi.h>
#include <WiFiManager.h>

#include <MQTT.h>

#define I2C_SDA 41
#define I2C_SCL 40
#define LED_PIN 2
#define RGBLED_PIN 18
const char *ssid = "Goh-kok";
const char *passpassword = "9999999999";

const char *mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;
String sensor_status = "on";

WiFiManager WifiManager;
Adafruit_BMP280 bmp;
Adafruit_MPU6050 mpu;
Adafruit_HTS221 hts;
Adafruit_NeoPixel pixels(1, 18, NEO_GRB + NEO_KHZ800);

WiFiClient wifiClient;
MQTTClient mqttClient;

void setupWifi()
{
  bool res;
  WiFi.mode(WIFI_STA);

  res = WifiManager.autoConnect("Goh-kok", "9999999999");

  if (!res)
  {
    Serial.println("Failed to connect or hit timeout");
    // ESP.restart();
  }
  else
  {
    // if you get here you have connected to the WiFi
    Serial.println("connected...yeey :)");
  }
}

void setupMqtt()
{
  mqttClient.begin(mqtt_server, 1883, wifiClient);
  while (!mqttClient.connect("ESP32Client"))
  {
    Serial.println("Connecting to MQTT broker...");
    delay(500);
  }
  Serial.println("Connected to MQTT broker");
}

void onMQTTRecieve(String &topic, String &payload)
{

  Serial.println("Received message: " + payload + " on topic: " + topic);

  if (payload == "on")
  {
    Serial.println("เริ่มการส่ง data ให้ broker");
    pixels.setPixelColor(0, pixels.Color(0, 255, 0));
    pixels.show();
    sensor_status = "on";
  }

  if (payload == "off")
  {
    Serial.println("ปิดการส่ง data ให้ broker");
    pixels.setPixelColor(0, pixels.Color(255, 0, 0));
    pixels.show();
    sensor_status = "off";
  }
}

void setup()
{
  Serial.begin(115200);

  setupWifi();

  setupMqtt();

  // Wire.begin(SDA_PIN, SCL_PIN);

  pinMode(0, INPUT_PULLUP);
  pinMode(2, OUTPUT);
  pixels.begin();
  pixels.setBrightness(20);

  Wire.begin(41, 40);

  if (bmp.begin(0x76))
  { // prepare BMP280 sensor
    Serial.println("BMP280 sensor ready");
  }
  if (hts.begin_I2C())
  { // prepare HTS221 sensor
    Serial.println("HTS221 sensor ready");
  }
  if (mpu.begin())
  { // prepare MPU6050 sensor
    Serial.println("MPU6050 sensor ready");
  }

  mqttClient.onMessage(onMQTTRecieve);

  mqttClient.subscribe("cn466/status");

  Serial.println("START! new ");
}

void loop()
{

  static uint32_t millis_count = 0;

  char json_body[200];
  const char json_tmpl[] = "{\"pressure\": %.2f, \"temperature\": %.2f, \"humidity\": %.2f,"
                           "\"acceleration\": [%.2f,%.2f,%.2f], \"angular_velocity\":[%.2f,%.2f,%.2f]}";
  sensors_event_t humidity, temp;
  sensors_event_t a, g;

  // Serial.println(millis_count);

  pixels.clear();
  if ((millis() - millis_count >= 5000) && (sensor_status == "on"))
  {
    millis_count = millis();
    float pressure = bmp.readPressure();

    hts.getEvent(&humidity, &temp);
    float temperate = temp.temperature;
    float humid = humidity.relative_humidity;

   
    Serial.print("temperate = ");
    Serial.print(temperate);
    Serial.print("  ");
    Serial.print("humidity = ");
    Serial.print(humid);
    Serial.print("  ");
    Serial.print("Pressure = ");
    Serial.println(pressure);

    mpu.getEvent(&a, &g, &temp);
    float ax = a.acceleration.x;
    float ay = a.acceleration.y;
    float az = a.acceleration.z;
    float gx = g.gyro.x;
    float gy = g.gyro.y;
    float gz = g.gyro.z;
    // sprintf(json_body, json_tmpl, pressure, temperate, humid, ax, ay, az, gx, gy, gz);
    // Serial.println(json_body);

    StaticJsonDocument<200> doc;
    doc["temperature"] = temperate;
    doc["humidity"] = humid;
    doc["pressure"] = pressure;
    char buffer[200];
    serializeJson(doc, buffer);

    // mqttClient.publish("cn466/sensor", "Hello from ESP32 every 5 second ครับ");
    mqttClient.publish("cn466/sensor", buffer);
    // mqttClient.publish("cn466/sensor", json_body);

    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
  }
  mqttClient.loop();
  delay(100);
}
