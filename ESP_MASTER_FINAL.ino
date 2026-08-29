#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <DNSServer.h>
#include <EEPROM.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <time.h>
#include <espnow.h>
#include <WiFiClientSecure.h>

const char *AP_SSID = "ESP_MASTER_SETUP";
const char *AP_PASSWORD = "12345678";
const IPAddress AP_IP(192, 168, 4, 1);

const char *BACKEND_URL = "https://backend-for-sih-internal-wattwise.onrender.com";
const char *FIRMWARE_VERSION = "MASTER_V2";

const uint16_t EEPROM_SIZE = 512;
const char *EEPROM_MAGIC = "MSTR5";

const int RGB_RED = D1;
const int RGB_GREEN = D2;
const int RGB_BLUE = D3;

enum ConnectionState {
  WIFI_IDLE,
  WIFI_SETUP_AP,
  WIFI_CONNECTING,
  WIFI_CONNECTED,
  WIFI_FAILED
};

ConnectionState wifiState = WIFI_SETUP_AP;

enum LedState {
  LED_AP,
  LED_CONNECTING,
  LED_ONLINE,
  LED_OFFLINE,
  LED_SYNCING,
  LED_ERROR
};

LedState ledState = LED_AP;

struct DeviceConfig {
  char magic[8];
  char version[16];
  char ssid[32];
  char password[64];
  char userId[32];
  char masterId[32];
  bool valid;
};

DeviceConfig config;

ESP8266WebServer server(80);
DNSServer dnsServer;

const uint8_t broadcastMac[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

struct __attribute__((packed)) SlaveStatus {
  char type[8];
  char masterId[16];
  char slaveId[16];
  uint8_t relayStates[4];
  uint8_t online;
  uint32_t seq;
};

struct __attribute__((packed)) SlaveCommand {
  char type[8];
  char masterId[16];
  char slaveId[16];
  uint8_t relayIndex;
  uint8_t state;
  uint8_t reserved;
  uint32_t seq;
};

struct __attribute__((packed)) MotionStatus {
  char type[8];
  char masterId[16];
  char slaveId[16];
  uint8_t occupied;
  uint8_t soundDetected;
  uint16_t soundLevel;
  uint32_t seq;
};

const String FORM_HTML = R"=====(
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ESP Master Setup</title>
  <style>
    body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 30px; }
    .card { max-width: 520px; margin: 40px auto; background: #111827; border-radius: 14px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); }
    input, button { width: 100%; box-sizing: border-box; padding: 12px; border-radius: 8px; margin-top: 10px; border: none; }
    input { background: #e5e7eb; color: #111827; }
    button { background: #10b981; color: white; font-weight: bold; cursor: pointer; }
    label { display: block; margin-top: 16px; font-weight: bold; color: #cbd5e1; }
  </style>
</head>
<body>
  <div class="card">
    <h2>ESP Master Setup</h2>
    <form method="POST" action="/save">
      <label>WiFi SSID</label>
      <input name="ssid" placeholder="MyWiFi" required>

      <label>WiFi Password</label>
      <input name="password" type="password" placeholder="Password" required>

      <label>User ID</label>
      <input name="userId" placeholder="64f..." required>

      <label>Master ID</label>
      <input name="masterId" placeholder="ESP_MASTER_01" required>

      <button type="submit">Save and Connect</button>
    </form>
  </div>
</body>
</html>
)=====";

bool configLoaded = false;
bool masterRegistered = false;
bool backendSynced = false;
bool wifiDebugPrinted = false;
bool connectAfterSave = false;

unsigned long wifiConnectStartedAt = 0;
unsigned long lastTelemetryAttempt = 0;
unsigned long pendingConnectDelayStart = 0;

void setLedColor(int r, int g, int b) {
  analogWrite(RGB_RED, 1023 - r);
  analogWrite(RGB_GREEN, 1023 - g);
  analogWrite(RGB_BLUE, 1023 - b);
}

void updateLed(LedState state) {
  ledState = state;
  switch (state) {
    case LED_AP:
      setLedColor(0, 0, 255);
      break;
    case LED_CONNECTING:
      setLedColor(150, 0, 200);
      break;
    case LED_ONLINE:
      setLedColor(0, 255, 0);
      break;
    case LED_OFFLINE:
      setLedColor(255, 0, 0);
      break;
    case LED_SYNCING:
      setLedColor(255, 255, 0);
      break;
    case LED_ERROR:
      setLedColor(255, 80, 0);
      break;
  }
}

bool loadConfig() {
  EEPROM.get(0, config);

  bool hasMagic = (strcmp(config.magic, EEPROM_MAGIC) == 0);
  bool isValid = (config.valid == true);
  bool versionMatch = (strcmp(config.version, FIRMWARE_VERSION) == 0);

  if (hasMagic && isValid) {
    Serial.println("Saved EEPROM config found.");
    Serial.printf("EEPROM version: %s\n", config.version);
    Serial.printf("Current firmware version: %s\n", FIRMWARE_VERSION);
    
    if (!versionMatch) {
      Serial.println("Firmware version mismatch! Clearing EEPROM for fresh setup...");
      EEPROM.begin(EEPROM_SIZE);
      for (int i = 0; i < EEPROM_SIZE; i++) {
        EEPROM.write(i, 0);
      }
      EEPROM.commit();
      EEPROM.end();
      
      memset(&config, 0, sizeof(config));
      config.valid = false;
      return false;
    }
    
    return true;
  }

  Serial.println("No valid saved config found. Starting AP setup.");
  memset(&config, 0, sizeof(config));
  config.valid = false;
  return false;
}

bool validateConfigInput(String ssid, String password, String userId, String masterId) {
  ssid.trim();
  password.trim();
  userId.trim();
  masterId.trim();

  if (ssid.length() < 1 || ssid.length() > 31) return false;
  if (password.length() < 8 || password.length() > 63) return false;
  if (userId.length() < 1 || userId.length() > 31) return false;
  if (masterId.length() < 1 || masterId.length() > 31) return false;

  return true;
}

String urlEncode(const String &value) {
  String encoded;
  for (unsigned int i = 0; i < value.length(); i++) {
    char c = value[i];
    if (isalnum((unsigned char)c) || c == '-' || c == '_' || c == '.' || c == '~') {
      encoded += c;
    } else {
      encoded += '%';
      char hex[3];
      sprintf(hex, "%02X", (unsigned char)c);
      encoded += hex;
    }
  }
  return encoded;
}

bool connectWiFiWithDelay(const String &ssid, const String &password, uint32_t timeoutMs) {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(200);

  WiFi.begin(ssid.c_str(), password.c_str());

  unsigned long start = millis();
  while (millis() - start < timeoutMs) {
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("Validated WiFi credentials successfully.");
      Serial.print("Connected IP: ");
      Serial.println(WiFi.localIP());
      return true;
    }
    delay(250);
  }

  Serial.println("WiFi validation failed.");
  WiFi.disconnect();
  return false;
}

bool masterIdExistsInDb(const String &userId, const String &masterId) {
  BearSSL::WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/masters/user/" + urlEncode(userId);

  if (!http.begin(client, url)) {
    Serial.println("HTTP begin failed for master-check");
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  int code = http.GET();

  if (code != 200) {
    Serial.printf("Master existence check failed: %d\n", code);
    http.end();
    return false;
  }

  String body = http.getString();
  http.end();

  DynamicJsonDocument doc(4096);
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.println("Failed to parse master list response.");
    return false;
  }

  JsonArray arr = doc["data"];
  for (JsonVariant v : arr) {
    String existingMasterId = v["masterId"].as<String>();
    if (existingMasterId == masterId) {
      return true;
    }
  }
  return false;
}

void sendErrorPage(const String &message) {
  String html =
    "<!doctype html><html><body style='font-family:Arial;background:#111827;color:white;padding:40px;'>"
    "<h2>Setup Error</h2>"
    "<p>" + message + "</p>"
    "<script>"
    "alert('" + message + "');"
    "window.location.href = '/';"
    "</script>"
    "</body></html>";

  server.send(400, "text/html", html);
}

void saveConfigFromForm(String ssid, String password, String userId, String masterId) {
  memset(&config, 0, sizeof(config));

  strncpy(config.magic, EEPROM_MAGIC, sizeof(config.magic));
  strncpy(config.version, FIRMWARE_VERSION, sizeof(config.version) - 1);
  strncpy(config.ssid, ssid.c_str(), sizeof(config.ssid) - 1);
  strncpy(config.password, password.c_str(), sizeof(config.password) - 1);
  strncpy(config.userId, userId.c_str(), sizeof(config.userId) - 1);
  strncpy(config.masterId, masterId.c_str(), sizeof(config.masterId) - 1);
  config.valid = true;

  EEPROM.put(0, config);
  EEPROM.commit();

  Serial.println("Saved WiFi config to EEPROM:");
  Serial.printf("Firmware version: %s\n", config.version);
  Serial.printf("SSID: %s\n", config.ssid);
  Serial.printf("Password: %s\n", config.password);
  Serial.printf("UserID: %s\n", config.userId);
  Serial.printf("MasterID: %s\n", config.masterId);
}

void startAccessPoint() {
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(AP_IP, AP_IP, IPAddress(255, 255, 255, 0));
  WiFi.softAP(AP_SSID, AP_PASSWORD);

  wifiState = WIFI_SETUP_AP;
  updateLed(LED_AP);

  Serial.println("AP started");
  Serial.print("AP IP: ");
  Serial.println(WiFi.softAPIP());
}

void handleRoot() {
  server.send(200, "text/html", FORM_HTML);
}

void handleSave() {
  String ssid = server.arg("ssid");
  String password = server.arg("password");
  String userId = server.arg("userId");
  String masterId = server.arg("masterId");

  ssid.trim();
  password.trim();
  userId.trim();
  masterId.trim();

  Serial.println("Received config from web form:");
  Serial.printf("SSID: %s\n", ssid.c_str());
  Serial.printf("Password: %s\n", password.c_str());
  Serial.printf("UserID: %s\n", userId.c_str());
  Serial.printf("MasterID: %s\n", masterId.c_str());

  if (!validateConfigInput(ssid, password, userId, masterId)) {
    sendErrorPage("Invalid WiFi credentials or IDs. Please check the form.");
    return;
  }

  if (!connectWiFiWithDelay(ssid, password, 12000UL)) {
    WiFi.disconnect();
    WiFi.mode(WIFI_AP);
    sendErrorPage("WiFi credentials failed. Please enter a valid WiFi network.");
    return;
  }

  if (masterIdExistsInDb(userId, masterId)) {
    WiFi.disconnect();
    WiFi.mode(WIFI_AP);
    sendErrorPage("Master ID already exists in database.");
    return;
  }

  WiFi.disconnect();
  WiFi.mode(WIFI_AP);

  saveConfigFromForm(ssid, password, userId, masterId);
  configLoaded = true;

  Serial.println("Redirecting to /done...");
  server.sendHeader("Location", "/done");
  server.send(302, "text/plain", "Saved");
}

void handleDone() {
  String html = R"=====(
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Connecting...</title>
      <style>
        body {
          background: #0f172a;
          color: #e2e8f0;
          font-family: Arial, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
        }
        .box {
          background: #111827;
          border-radius: 12px;
          padding: 30px;
          max-width: 500px;
          text-align: center;
          box-shadow: 0 10px 30px rgba(0,0,0,0.25);
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h2>Credentials saved</h2>
        <p>Connecting to WiFi and registering device...</p>
      </div>
      <script>
        setTimeout(function() {
          window.location.href = "/";
        }, 1500);
      </script>
    </body>
    </html>
  )=====";

  server.send(200, "text/html", html);
}

void handleNotFound() {
  server.sendHeader("Location", "/");
  server.send(302, "text/plain", "Redirecting...");
}

bool ensureFS() {
  if (!LittleFS.begin()) {
    Serial.println("LittleFS mount failed");
    return false;
  }
  return true;
}

void writeFile(String path, String content) {
  File f = LittleFS.open(path, "w");
  if (!f) return;
  f.print(content);
  f.close();
}

String readFile(String path) {
  File f = LittleFS.open(path, "r");
  if (!f) return "";
  String out = "";
  while (f.available()) out += (char)f.read();
  f.close();
  return out;
}

void beginNonBlockingWifiConnect() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(config.ssid, config.password);

  wifiState = WIFI_CONNECTING;
  wifiConnectStartedAt = millis();
  updateLed(LED_CONNECTING);

  Serial.println("Attempting WiFi connection...");
  Serial.printf("SSID: %s\n", config.ssid);
  Serial.printf("Password: %s\n", config.password);
}

void printCurrentWifiDebug() {
  if (wifiDebugPrinted) return;

  Serial.println("Current saved WiFi config:");
  Serial.printf("SSID: %s\n", config.ssid);
  Serial.printf("Password: %s\n", config.password);
  Serial.printf("UserID: %s\n", config.userId);
  Serial.printf("MasterID: %s\n", config.masterId);

  wifiDebugPrinted = true;
}

void processWiFiConnection() {
  if (wifiState == WIFI_SETUP_AP || wifiState == WIFI_IDLE) return;

  if (wifiState == WIFI_CONNECTING) {
    if (!wifiDebugPrinted) {
      printCurrentWifiDebug();
    }

    if (WiFi.status() == WL_CONNECTED) {
      wifiState = WIFI_CONNECTED;
      updateLed(LED_ONLINE);
      Serial.println("WiFi connected");
      Serial.print("IP: ");
      Serial.println(WiFi.localIP());
      return;
    }

    if (millis() - wifiConnectStartedAt > 10000UL) {
      wifiState = WIFI_FAILED;
      updateLed(LED_OFFLINE);
      Serial.println("WiFi connection timed out");
      Serial.printf("Tried SSID: %s\n", config.ssid);
    }
    return;
  }

  if (wifiState == WIFI_FAILED) {
    updateLed(LED_OFFLINE);

    if (millis() - wifiConnectStartedAt > 15000UL) {
      beginNonBlockingWifiConnect();
    }
  }
}

String httpGet(String url) {
  BearSSL::WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.GET();
  String payload = "";

  if (httpCode > 0) {
    payload = http.getString();
  } else {
    Serial.printf("GET failed: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
  return payload;
}

String httpPost(String url, String body) {
  BearSSL::WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(body);
  String payload = "";

  if (httpCode > 0) {
    payload = http.getString();
  } else {
    Serial.printf("POST failed: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
  return payload;
}

bool registerMasterDevice() {
  if (wifiState != WIFI_CONNECTED) return false;

  DynamicJsonDocument doc(1024);
  doc["masterId"] = config.masterId;
  doc["userId"] = config.userId;
  doc["name"] = config.masterId;

  String body;
  serializeJson(doc, body);

  String url = String(BACKEND_URL) + "/api/masters/register";
  String response = httpPost(url, body);

  if (response.length() == 0) {
    Serial.println("Failed to register master device");
    updateLed(LED_ERROR);
    return false;
  }

  DynamicJsonDocument resDoc(2048);
  DeserializationError err = deserializeJson(resDoc, response);

  if (err) {
    Serial.println("Failed to parse register response");
    Serial.println(response);
    updateLed(LED_ERROR);
    return false;
  }

  if (resDoc["success"] == true) {
    Serial.println("Master device registered successfully");
    masterRegistered = true;
    updateLed(LED_ONLINE);
    return true;
  }

  String message = resDoc["message"].as<String>();
  Serial.printf("Registration failed: %s\n", message.c_str());
  updateLed(LED_ERROR);
  return false;
}

bool syncBackendConfig() {
  if (wifiState != WIFI_CONNECTED) return false;

  String mastersUrl = String(BACKEND_URL) + "/api/masters/user/" + String(config.userId);
  String slavesUrl = String(BACKEND_URL) + "/api/slaves/user/" + String(config.userId);

  String mastersJson = httpGet(mastersUrl);
  String slavesJson = httpGet(slavesUrl);

  if (mastersJson.length() == 0 || slavesJson.length() == 0) {
    Serial.println("Failed to fetch config from backend");
    updateLed(LED_OFFLINE);
    return false;
  }

  DynamicJsonDocument mastersDoc(8192);
  DynamicJsonDocument slavesDoc(8192);

  DeserializationError mastersErr = deserializeJson(mastersDoc, mastersJson);
  DeserializationError slavesErr = deserializeJson(slavesDoc, slavesJson);

  if (mastersErr || slavesErr) {
    Serial.println("Config JSON parse failed");
    Serial.println(mastersJson);
    Serial.println(slavesJson);
    updateLed(LED_ERROR);
    return false;
  }

  JsonArray masters = mastersDoc["data"];
  JsonArray slaves = slavesDoc["data"];

  DynamicJsonDocument doc(8192);
  doc["masters"] = masters;
  doc["slaves"] = slaves;

  String out;
  serializeJson(doc, out);
  writeFile("/config.json", out);

  backendSynced = true;
  Serial.println("Backend config synced");
  updateLed(LED_ONLINE);
  return true;
}

String isoNowUTC() {
  time_t now = time(nullptr);
  if (now <= 0) return "1970-01-01T00:00:00.000Z";

  struct tm timeinfo;
  gmtime_r(&now, &timeinfo);

  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S.000Z", &timeinfo);
  return String(buf);
}

String buildTelemetryPayload() {
  DynamicJsonDocument doc(4096);
  JsonArray slaves = doc.createNestedArray("slaves");
  doc["deviceId"] = config.masterId;

  JsonObject s1 = slaves.createNestedObject();
  s1["slaveId"] = "SLAVE_01";
  s1["type"] = "motion";
  s1["timestamp"] = isoNowUTC();
  s1["occupied"] = true;

  JsonObject s2 = slaves.createNestedObject();
  s2["slaveId"] = "SLAVE_02";
  s2["type"] = "power";
  s2["timestamp"] = isoNowUTC();

  JsonArray appliances = s2.createNestedArray("appliances");
  JsonObject ap = appliances.createNestedObject();
  ap["applianceId"] = "APP_1";
  ap["name"] = "Light";
  ap["voltage"] = 230.0;
  ap["current"] = 0.5;
  ap["power"] = 115.0;

  String out;
  serializeJson(doc, out);
  return out;
}

bool sendTelemetryToBackend(String payload) {
  if (wifiState != WIFI_CONNECTED) return false;

  BearSSL::WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/telemetry";

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");

  updateLed(LED_SYNCING);
  int httpCode = http.POST(payload);

  bool ok = false;

  if (httpCode == 200 || httpCode == 201) {
    ok = true;
    updateLed(LED_ONLINE);
    Serial.println("Telemetry sent");
  } else {
    updateLed(LED_ERROR);
    Serial.printf("Telemetry failed: %d\n", httpCode);
    if (httpCode > 0) {
      Serial.println(http.getString());
    } else {
      Serial.println(http.errorToString(httpCode));
    }
  }

  http.end();
  return ok;
}

void queueTelemetry(String payload) {
  String pending = readFile("/pending.json");
  DynamicJsonDocument doc(4096);

  if (pending.length() > 0) {
    DeserializationError err = deserializeJson(doc, pending);
    if (!err && doc.is<JsonArray>()) {
      JsonArray arr = doc.as<JsonArray>();
      arr.add(payload);

      String out;
      serializeJson(arr, out);
      writeFile("/pending.json", out);
      return;
    }
  }

  JsonArray arr = doc.to<JsonArray>();
  arr.add(payload);

  String out;
  serializeJson(arr, out);
  writeFile("/pending.json", out);
}

bool flushPendingTelemetry() {
  if (wifiState != WIFI_CONNECTED) return false;

  String pending = readFile("/pending.json");
  if (pending.length() == 0) return true;

  DynamicJsonDocument doc(4096);
  DeserializationError err = deserializeJson(doc, pending);

  if (err || !doc.is<JsonArray>()) {
    Serial.println("Invalid pending queue");
    return false;
  }

  JsonArray arr = doc.as<JsonArray>();
  bool allSent = true;

  for (JsonVariant v : arr) {
    String item = v.as<String>();
    if (!sendTelemetryToBackend(item)) {
      allSent = false;
      break;
    }
  }

  if (allSent) {
    writeFile("/pending.json", "[]");
    updateLed(LED_ONLINE);
  }

  return allSent;
}

void OnDataSent(uint8_t *mac_addr, uint8_t status) {
  // optional
}

void OnDataRecv(uint8_t *mac, uint8_t *incoming, uint8_t len) {
  if (len < sizeof(SlaveStatus)) return;

  SlaveStatus *status = (SlaveStatus *)incoming;

  if (strcmp(status->type, "STATUS") == 0) {
    Serial.printf("Slave %s online / relay states: %d %d %d %d\n",
      status->slaveId,
      status->relayStates[0], status->relayStates[1],
      status->relayStates[2], status->relayStates[3]);
    return;
  }

  if (strcmp(status->type, "MOTION") == 0) {
    MotionStatus *motion = (MotionStatus *)incoming;
    Serial.printf("Motion slave %s => occupied=%d sound=%d soundLevel=%d\n",
      motion->slaveId, motion->occupied, motion->soundDetected, motion->soundLevel);
  }
}

void initEspNow() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  if (esp_now_init() != 0) {
    Serial.println("ESPNow init failed");
    updateLed(LED_ERROR);
    return;
  }

  esp_now_set_self_role(ESP_NOW_ROLE_CONTROLLER);
  esp_now_register_send_cb(OnDataSent);
  esp_now_register_recv_cb(OnDataRecv);

  uint8_t peer[6];
  memcpy(peer, broadcastMac, 6);
  esp_now_add_peer(peer, ESP_NOW_ROLE_SLAVE, 1, NULL, 0);
}

void sendCommandToSlave(String slaveId, uint8_t relayIndex, uint8_t state) {
  SlaveCommand packet;
  memset(&packet, 0, sizeof(packet));

  strcpy(packet.type, "CTRL");
  strcpy(packet.masterId, config.masterId);
  strcpy(packet.slaveId, slaveId.c_str());
  packet.relayIndex = relayIndex;
  packet.state = state;
  packet.seq = millis();

  uint8_t peerMac[6];
  memcpy(peerMac, broadcastMac, 6);

  esp_now_send(peerMac, (uint8_t *)&packet, sizeof(packet));
}

void setup() {
  Serial.begin(115200);
  EEPROM.begin(EEPROM_SIZE);
  ensureFS();

  pinMode(RGB_RED, OUTPUT);
  pinMode(RGB_GREEN, OUTPUT);
  pinMode(RGB_BLUE, OUTPUT);

  if (!loadConfig()) {
    Serial.println("No valid config found. Starting AP setup mode.");
    startAccessPoint();

    server.on("/", HTTP_GET, handleRoot);
    server.on("/save", HTTP_POST, handleSave);
    server.on("/done", HTTP_GET, handleDone);
    server.onNotFound(handleNotFound);

    server.begin();
    return;
  }

  Serial.println("EEPROM config loaded successfully.");
  Serial.printf("Stored SSID: %s\n", config.ssid);
  Serial.printf("Stored Password: %s\n", config.password);
  Serial.printf("Stored UserID: %s\n", config.userId);
  Serial.printf("Stored MasterID: %s\n", config.masterId);

  configLoaded = true;
  initEspNow();
  connectAfterSave = true;
  pendingConnectDelayStart = millis();
}

void loop() {
  if (!configLoaded) {
    dnsServer.processNextRequest();
    server.handleClient();
    return;
  }

  if (connectAfterSave && millis() - pendingConnectDelayStart > 1500UL) {
    beginNonBlockingWifiConnect();
    connectAfterSave = false;
  }

  processWiFiConnection();

  if (wifiState == WIFI_CONNECTED) {
    // STEP 1: Register master device first
    if (!masterRegistered) {
      registerMasterDevice();
    }

    // STEP 2: After registration, sync backend config
    if (masterRegistered && !backendSynced) {
      syncBackendConfig();
    }

    // STEP 3: Flush any pending telemetry
    flushPendingTelemetry();

    // STEP 4: Send new telemetry periodically
    if (millis() - lastTelemetryAttempt > 60000UL) {
      String payload = buildTelemetryPayload();

      if (!sendTelemetryToBackend(payload)) {
        queueTelemetry(payload);
        updateLed(LED_OFFLINE);
      }

      lastTelemetryAttempt = millis();
    }
  }

  delay(10);
}
