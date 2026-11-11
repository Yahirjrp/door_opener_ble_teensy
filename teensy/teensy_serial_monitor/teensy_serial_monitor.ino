/**********************************************************************
  Teensy 4.1 USB Serial bridge test

  Receives newline-terminated commands from the web site's Web Serial
  connection and prints responses that appear in the site's Serial Monitor.

  This communication-only sketch intentionally does not drive a motor or
  actuator. Door/airbrake hardware logic can be added after its pins and
  safety requirements are defined.
**********************************************************************/

constexpr unsigned long SERIAL_BAUD = 115200;
constexpr size_t COMMAND_BUFFER_SIZE = 96;

char commandBuffer[COMMAND_BUFFER_SIZE];
size_t commandLength = 0;

void printStatus(const char* message) {
  Serial.println(message);
}

void processCommand(char* command) {
  while (*command == ' ' || *command == '\t') {
    command++;
  }

  if (*command == '\0') {
    return;
  }

  Serial.print("RX: ");
  Serial.println(command);

  if (strcmp(command, "OPEN") == 0) {
    printStatus("ACK: OPEN command received");
  } else if (strcmp(command, "CLOSE") == 0) {
    printStatus("ACK: CLOSE command received");
  } else if (strcmp(command, "STOP") == 0) {
    printStatus("ACK: STOP command received");
  } else if (strcmp(command, "MANUAL OPERATION") == 0) {
    printStatus("ACK: MANUAL OPERATION command received");
  } else if (strcmp(command, "WHEEL SETUP") == 0) {
    printStatus("ACK: WHEEL SETUP command received");
  } else if (strcmp(command, "PING") == 0) {
    printStatus("PONG");
  } else {
    printStatus("WARNING: Unknown command");
  }
}

void readSerialCommands() {
  while (Serial.available() > 0) {
    const char incoming = static_cast<char>(Serial.read());

    if (incoming == '\r') {
      continue;
    }

    if (incoming == '\n') {
      commandBuffer[commandLength] = '\0';
      processCommand(commandBuffer);
      commandLength = 0;
      continue;
    }

    if (commandLength < COMMAND_BUFFER_SIZE - 1) {
      commandBuffer[commandLength++] = incoming;
    } else {
      commandLength = 0;
      printStatus("ERROR: Command too long; buffer cleared");
    }
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD);

  // Avoid blocking forever when the Teensy is powered without a computer.
  const unsigned long waitStart = millis();
  while (!Serial && millis() - waitStart < 2000) {
    // Wait briefly for the USB serial connection.
  }

  printStatus("Teensy 4.1 serial monitor ready");
  printStatus("Waiting for newline-terminated commands...");
}

void loop() {
  readSerialCommands();
}
