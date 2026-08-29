#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <DNSServer.h>
#include <EEPROM.h>
#include <espnow.h>

const char *AP_SSID = "WATTWISE_POWER_SETUP";
const char *AP_PASSWORD = "12345678";
const IPAddress AP_IP(192, 168, 5, 1);

const char *FIRMWARE_VERSION = "POWER_SLAVE_V2";

const uint16_t EEPROM_SIZE = 512;
const char *EEPROM_MAGIC = "SLV2";

const uint8_t RELAY_PINS[4] = {D1, D2, D5, D6};
const int STATUS_LED = D8;

struct DeviceConfig {
  char magic[8];
  char version[16];
  char masterId[16];
  char slaveId[16];
  char applianceId1[20];
  char applianceId2[20];
  char applianceId3[20];
  char applianceId4[20];
  bool valid;
};

DeviceConfig config;

ESP8266WebServer server(80);
DNSServer dnsServer;

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

const uint8_t broadcastMac[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

uint8_t relayState[4] = {0, 0, 0, 0};
bool configLoaded = false;
unsigned long lastStatusSent = 0;

const String FORM_HTML = R"=====(
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ESP Power Slave Setup</title>
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
    <h2>ESP Power Slave Setup</h2>
    <form method="POST" action="/save">
      <label>Master ID</label>
      <input name="masterId" placeholder="ESP_MASTER_01" required>

      <label>Slave ID</label>
      <input name="slaveId" placeholder="SLAVE_01" required>

      <label>Appliance 1 ID</label>
      <input name="app1" placeholder="APP_1" required>

      <label>Appliance 2 ID</label>
      <input name="app2" placeholder="APP_2" required>

      <label>Appliance 3 ID</label>
      <input name="app3" placeholder="APP_3" required>

      <label>Appliance 4 ID</label>
      <input name="app4" placeholder="APP_4" required>

      <button type="submit">Save and Connect</button>
    </form>
  </div>
</body>
</html>
)=====";

void setStatusLed(bool on) {
  digitalWrite(STATUS_LED, on ? LOW : HIGH);
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
      for (int i = 0; i < EEPROM_SIZE; i++) {
        EEPROM.write(i, 0);
      }
      EEPROM.commit();
      
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

void saveConfigToEEPROM() {
  memset(&config.magic, 0, sizeof(config.magic));
  strncpy(config.magic, EEPROM_MAGIC, sizeof(config.magic));
  strncpy(config.version, FIRMWARE_VERSION, sizeof(config.version) - 1);
  config.valid = true;
  EEPROM.put(0, config);
  EEPROM.commit();

  Serial.println("Config saved to EEPROM:");
  Serial.printf("Master ID: %s\n", config.masterId);
  Serial.printf("Slave ID: %s\n", config.slaveId);
  Serial.printf("App 1: %s\n", config.applianceId1);
  Serial.printf("App 2: %s\n", config.applianceId2);
  Serial.printf("App 3: %s\n", config.applianceId3);
  Serial.printf("App 4: %s\n", config.applianceId4);
}

void initRelays() {
  for (int i = 0; i < 4; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], HIGH);
    relayState[i] = 0;
  }
  Serial.println("Relays initialized (all OFF)");
}

void applyRelayState(uint8_t index, uint8_t state) {
  if (index >= 4) return;

  relayState[index] = state;
  digitalWrite(RELAY_PINS[index], state == 1 ? LOW : HIGH);
  
  Serial.printf("Relay %d (App: %s) set to %s\n", index, 
    index == 0 ? config.applianceId1 : 
    index == 1 ? config.applianceId2 : 
    index == 2 ? config.applianceId3 : 
    config.applianceId4, 
    state ? "ON" : "OFF");
}

void setAllRelaysOff() {
  for (int i = 0; i < 4; i++) {
    relayState[i] = 0;
    digitalWrite(RELAY_PINS[i], HIGH);
  }
  Serial.println("All relays turned OFF");
}

void startAccessPoint() {
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(AP_IP, AP_IP, IPAddress(255, 255, 255, 0));
  WiFi.softAP(AP_SSID, AP_PASSWORD);

  setStatusLed(true);
  Serial.println("AP mode started");
  Serial.print("AP IP: ");
  Serial.println(WiFi.softAPIP());
}

void handleRoot() {
  server.send(200, "text/html", FORM_HTML);
}

bool validateConfigInput(String masterId, String slaveId, String app1, String app2, String app3, String app4) {
  masterId.trim();
  slaveId.trim();
  app1.trim();
  app2.trim();
  app3.trim();
  app4.trim();

  if (masterId.length() < 1 || masterId.length() > 15) return false;
  if (slaveId.length() < 1 || slaveId.length() > 15) return false;
  if (app1.length() < 1 || app1.length() > 19) return false;
  if (app2.length() < 1 || app2.length() > 19) return false;
  if (app3.length() < 1 || app3.length() > 19) return false;
  if (app4.length() < 1 || app4.length() > 19) return false;

  return true;
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

void handleSave() {
  String masterId = server.arg("masterId");
  String slaveId = server.arg("slaveId");
  String app1 = server.arg("app1");
  String app2 = server.arg("app2");
  String app3 = server.arg("app3");
  String app4 = server.arg("app4");

  Serial.println("Received config from web form:");
  Serial.printf("Master ID: %s\n", masterId.c_str());
  Serial.printf("Slave ID: %s\n", slaveId.c_str());
  Serial.printf("App 1: %s\n", app1.c_str());
  Serial.printf("App 2: %s\n", app2.c_str());
  Serial.printf("App 3: %s\n", app3.c_str());
  Serial.printf("App 4: %s\n", app4.c_str());

  if (!validateConfigInput(masterId, slaveId, app1, app2, app3, app4)) {
    sendErrorPage("Invalid inputs. Check length and format.");
    return;
  }

  memset(&config, 0, sizeof(config));
  strncpy(config.magic, EEPROM_MAGIC, sizeof(config.magic));
  strncpy(config.version, FIRMWARE_VERSION, sizeof(config.version) - 1);
  strncpy(config.masterId, masterId.c_str(), sizeof(config.masterId) - 1);
  strncpy(config.slaveId, slaveId.c_str(), sizeof(config.slaveId) - 1);
  strncpy(config.applianceId1, app1.c_str(), sizeof(config.applianceId1) - 1);
  strncpy(config.applianceId2, app2.c_str(), sizeof(config.applianceId2) - 1);
  strncpy(config.applianceId3, app3.c_str(), sizeof(config.applianceId3) - 1);
  strncpy(config.applianceId4, app4.c_str(), sizeof(config.applianceId4) - 1);

  saveConfigToEEPROM();
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
        <h2>Configuration Saved</h2>
        <p>Connecting to ESPNow network...</p>
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

void sendStatusToMaster() {
  SlaveStatus packet;
  memset(&packet, 0, sizeof(packet));

  strcpy(packet.type, "STATUS");
  strcpy(packet.masterId, config.masterId);
  strcpy(packet.slaveId, config.slaveId);

  memcpy(packet.relayStates, relayState, 4);
  packet.online = 1;
  packet.seq = millis();

  uint8_t peerMac[6];
  memcpy(peerMac, broadcastMac, 6);

  esp_now_send(peerMac, (uint8_t *)&packet, sizeof(packet));
  
  Serial.printf("Status sent: R1=%d R2=%d R3=%d R4=%d\n", 
    relayState[0], relayState[1], relayState[2], relayState[3]);
}

void OnDataRecv(uint8_t *mac, uint8_t *incoming, uint8_t len) {
  if (len < sizeof(SlaveCommand)) return;

  SlaveCommand *cmd = (SlaveCommand *)incoming;

  if (strcmp(cmd->type, "CTRL") != 0) {
    Serial.println("Invalid command type");
    return;
  }
  
  if (strcmp(cmd->masterId, config.masterId) != 0) {
    Serial.printf("Master ID mismatch: %s != %s\n", cmd->masterId, config.masterId);
    return;
  }
  
  if (strcmp(cmd->slaveId, config.slaveId) != 0) {
    Serial.printf("Slave ID mismatch: %s != %s\n", cmd->slaveId, config.slaveId);
    return;
  }

  if (cmd->relayIndex >= 4) {
    Serial.printf("Invalid relay index: %d\n", cmd->relayIndex);
    return;
  }

  Serial.printf("Command received: Relay %d, State %d\n", cmd->relayIndex, cmd->state);

  if (cmd->state == 0) {
    applyRelayState(cmd->relayIndex, 0);
  } else if (cmd->state == 1) {
    applyRelayState(cmd->relayIndex, 1);
  } else if (cmd->state == 2) {
    relayState[cmd->relayIndex] = relayState[cmd->relayIndex] ? 0 : 1;
    applyRelayState(cmd->relayIndex, relayState[cmd->relayIndex]);
  }

  delay(100);
  sendStatusToMaster();
}

void OnDataSent(uint8_t *mac_addr, uint8_t status) {
  // Optional callback
}

void initEspNow() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  if (esp_now_init() != 0) {
    Serial.println("ESPNow init failed");
    return;
  }

  esp_now_set_self_role(ESP_NOW_ROLE_SLAVE);
  esp_now_register_send_cb(OnDataSent);
  esp_now_register_recv_cb(OnDataRecv);

  uint8_t peer[6];
  memcpy(peer, broadcastMac, 6);

  if (esp_now_add_peer(peer, ESP_NOW_ROLE_CONTROLLER, 1, NULL, 0) == 0) {
    Serial.println("Peer added successfully");
  } else {
    Serial.println("Failed to add peer");
  }

  setStatusLed(false);
  Serial.println("ESPNow initialized in SLAVE mode");
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n=== ESP Power Slave Boot ===");
  
  EEPROM.begin(EEPROM_SIZE);

  pinMode(STATUS_LED, OUTPUT);
  setStatusLed(false);

  initRelays();

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
  Serial.printf("Master ID: %s\n", config.masterId);
  Serial.printf("Slave ID: %s\n", config.slaveId);
  Serial.printf("App 1: %s\n", config.applianceId1);
  Serial.printf("App 2: %s\n", config.applianceId2);
  Serial.printf("App 3: %s\n", config.applianceId3);
  Serial.printf("App 4: %s\n", config.applianceId4);

  configLoaded = true;
  initEspNow();

  delay(2000);
  sendStatusToMaster();
}

void loop() {
  if (!configLoaded) {
    dnsServer.processNextRequest();
    server.handleClient();
    return;
  }

  // Send status every 5 seconds
  if (millis() - lastStatusSent > 5000UL) {
    sendStatusToMaster();
    lastStatusSent = millis();
  }

  delay(10);
}
