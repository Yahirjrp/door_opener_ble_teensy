const connectionStatus = document.getElementById("connection-status");
const lastCommand = document.getElementById("last-command");

const connectBtn = document.getElementById("connect-btn");
const connectSerialBtn = document.getElementById("connect-serial-btn");
const disconnectBtn = document.getElementById("disconnect-btn");
const openBtn = document.getElementById("open-btn");
const closeBtn = document.getElementById("close-btn");
const stopBtn = document.getElementById("stop-btn");
const manualBtn = document.getElementById("manual-btn");
const setupBtn = document.getElementById("setup-btn");
const clearMonitorBtn = document.getElementById("clear-monitor-btn");
const serialOutput = document.getElementById("serial-output");

const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_UUID_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_UUID_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

let bluetoothDevice = null;
let gattServer = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let serialPort = null;
let serialReader = null;
let serialKeepReading = false;
let activeTransport = null;

function setConnectionStatus(text) {
  connectionStatus.textContent = text;
}

function setLastCommand(text) {
  lastCommand.textContent = `Last command: ${text}`;
}

function appendSerialMessage(message, source = "DEVICE") {
  const cleanMessage = message.replace(/\r/g, "").trimEnd();
  if (!cleanMessage) {
    return;
  }

  if (serialOutput.textContent === "Waiting for a connection...") {
    serialOutput.textContent = "";
  }

  const timestamp = new Date().toLocaleTimeString();
  serialOutput.textContent += `[${timestamp}] ${source}: ${cleanMessage}\n`;
  serialOutput.scrollTop = serialOutput.scrollHeight;
}

function onTxValueChanged(event) {
  const value = event.target.value;
  const message = new TextDecoder().decode(value);
  appendSerialMessage(message);
}

function onDisconnected() {
  if (txCharacteristic) {
    txCharacteristic.removeEventListener(
      "characteristicvaluechanged",
      onTxValueChanged
    );
  }

  rxCharacteristic = null;
  txCharacteristic = null;
  gattServer = null;
  if (activeTransport === "ble") {
    activeTransport = null;
  }
  setConnectionStatus("CONNECTION: DISCONNECTED");
  disconnectBtn.disabled = true;
  appendSerialMessage("BLE connection closed", "SITE");
}

async function connectBLE() {
  if (activeTransport) {
    alert("Disconnect the current device before starting another connection.");
    return;
  }

  if (!navigator.bluetooth) {
    setConnectionStatus("BLE: UNSUPPORTED");
    alert("Web Bluetooth not supported in this browser");
    return;
  }

  try {
    setConnectionStatus("BLE: REQUESTING DEVICE");

    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID]
    });

    bluetoothDevice.addEventListener("gattserverdisconnected", onDisconnected);

    setConnectionStatus("BLE: CONNECTING");
    gattServer = await bluetoothDevice.gatt.connect();

    const service = await gattServer.getPrimaryService(SERVICE_UUID);
    rxCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID_RX);
    txCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID_TX);

    txCharacteristic.addEventListener(
      "characteristicvaluechanged",
      onTxValueChanged
    );
    await txCharacteristic.startNotifications();

    activeTransport = "ble";
    disconnectBtn.disabled = false;
    setConnectionStatus(`BLE: CONNECTED (${bluetoothDevice.name || "ESP32"})`);
    appendSerialMessage(
      `Connected to ${bluetoothDevice.name || "BLE device"}; notifications enabled`,
      "SITE"
    );
  } catch (error) {
    console.error(error);
    setConnectionStatus("BLE: DISCONNECTED");
    appendSerialMessage(`Connection failed: ${error.message}`, "SITE");
  }
}

async function readSerialData() {
  const decoder = new TextDecoder();
  let pendingText = "";

  while (serialPort && serialPort.readable && serialKeepReading) {
    serialReader = serialPort.readable.getReader();

    try {
      while (serialKeepReading) {
        const { value, done } = await serialReader.read();
        if (done) {
          break;
        }
        if (!value) {
          continue;
        }

        pendingText += decoder.decode(value, { stream: true });
        const lines = pendingText.split(/\r?\n/);
        pendingText = lines.pop();
        lines.forEach(line => appendSerialMessage(line, "TEENSY"));
      }
    } catch (error) {
      appendSerialMessage(`Serial read failed: ${error.message}`, "SITE");
    } finally {
      serialReader.releaseLock();
      serialReader = null;
    }
  }

  pendingText += decoder.decode();
  if (pendingText.trim()) {
    appendSerialMessage(pendingText, "TEENSY");
  }

  if (activeTransport === "serial") {
    activeTransport = null;
    disconnectBtn.disabled = true;
    setConnectionStatus("CONNECTION: DISCONNECTED");
    appendSerialMessage("Teensy serial connection closed", "SITE");
  }
}

async function connectSerial() {
  if (activeTransport) {
    alert("Disconnect the current device before starting another connection.");
    return;
  }

  if (!("serial" in navigator)) {
    setConnectionStatus("USB SERIAL: UNSUPPORTED");
    alert("Web Serial is not supported in this browser. Use desktop Chrome or Edge.");
    return;
  }

  try {
    setConnectionStatus("USB SERIAL: REQUESTING PORT");
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 115200 });

    serialKeepReading = true;
    activeTransport = "serial";
    disconnectBtn.disabled = false;
    setConnectionStatus("TEENSY USB: CONNECTED");
    appendSerialMessage("Connected to Teensy at 115200 baud", "SITE");

    void readSerialData();
  } catch (error) {
    console.error(error);
    serialPort = null;
    serialKeepReading = false;
    activeTransport = null;
    setConnectionStatus("USB SERIAL: DISCONNECTED");
    appendSerialMessage(`Serial connection failed: ${error.message}`, "SITE");
  }
}

async function disconnectCurrent() {
  if (activeTransport === "ble") {
    if (bluetoothDevice?.gatt?.connected) {
      bluetoothDevice.gatt.disconnect();
    } else {
      onDisconnected();
    }
    return;
  }

  if (activeTransport === "serial") {
    serialKeepReading = false;

    if (serialReader) {
      await serialReader.cancel();
    }

    // readSerialData releases the reader lock after cancel resolves.
    while (serialReader) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    if (serialPort) {
      await serialPort.close();
      serialPort = null;
    }
  }
}

async function sendSerialCommand(command) {
  if (!serialPort || !serialPort.writable) {
    throw new Error("Teensy serial port is not writable");
  }

  const writer = serialPort.writable.getWriter();
  try {
    await writer.write(new TextEncoder().encode(`${command}\n`));
  } finally {
    writer.releaseLock();
  }
}

async function sendCommand(command) {
  if (!activeTransport) {
    alert("Connect to the ESP32 by BLE or to the Teensy by USB first.");
    return;
  }

  try {
    if (activeTransport === "ble") {
      if (!rxCharacteristic) {
        throw new Error("BLE RX characteristic is unavailable");
      }
      const data = new TextEncoder().encode(command);
      await rxCharacteristic.writeValue(data);
    } else if (activeTransport === "serial") {
      await sendSerialCommand(command);
    }

    console.log("Sent:", command);
    setLastCommand(command);
    appendSerialMessage(command, "SENT");
  } catch (error) {
    console.error(error);
    appendSerialMessage(`Send failed: ${error.message}`, "SITE");
    alert("Failed to send command.");
  }
}

connectBtn.addEventListener("click", connectBLE);
connectSerialBtn.addEventListener("click", connectSerial);
disconnectBtn.addEventListener("click", () => {
  void disconnectCurrent();
});
openBtn.addEventListener("click", () => sendCommand("OPEN"));
closeBtn.addEventListener("click", () => sendCommand("CLOSE"));
stopBtn.addEventListener("click", () => sendCommand("STOP"));
manualBtn.addEventListener("click", () => sendCommand("MANUAL OPERATION"));
setupBtn.addEventListener("click", () => sendCommand("WHEEL SETUP"));
clearMonitorBtn.addEventListener("click", () => {
  serialOutput.textContent = "";
});

setConnectionStatus("CONNECTION: DISCONNECTED");
setLastCommand("none");
