# door_opener
its a Progressive Web App (PWA) that will connect via Bluetooth (BLE) to the Door Opener system. 

## BLE serial monitor

The site subscribes to the Nordic UART-style TX characteristic and displays
received text in the **SERIAL MONITOR** panel.

To test it:

1. Serve the `site` directory from HTTPS or `localhost`.
2. Open the site in a browser that supports Web Bluetooth, such as a compatible
   Chromium browser.
3. Turn on the ESP32 running `esp32/esp32.ino`.
4. Press **CONNECT BLE** and select `ESP32_Bluetooth`.
5. Trigger a firmware message sent with `sendPhoneMessage(...)`.

`Serial.print(...)` writes to the USB serial port only. A message that must also
appear in the web monitor needs to be sent over the BLE TX characteristic with
`sendPhoneMessage(...)` (or with a future helper that mirrors output to both).

The current BLE service uses:

- Service: `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`
- RX (site to microcontroller): `6E400002-B5A3-F393-E0A9-E50E24DCCA9E`
- TX (microcontroller to site): `6E400003-B5A3-F393-E0A9-E50E24DCCA9E`

## Teensy note

Teensy 4.1 does not provide onboard Bluetooth. The site therefore includes a
**CONNECT TEENSY (USB)** option based on Web Serial. This mode reads the
Teensy's USB `Serial` output into the same on-page monitor and sends each site
command as a newline-terminated text line at 115200 baud.

To test the Teensy mode:

1. Open `teensy/teensy_serial_monitor/teensy_serial_monitor.ino` in Arduino IDE.
2. Select Teensy 4.1 and upload the sketch.
3. Close Arduino Serial Monitor so it does not hold the port.
4. Serve the `site` directory from HTTPS or `localhost`.
5. Open it in a compatible desktop Chromium browser.
6. Press **CONNECT TEENSY (USB)** and select the Teensy port.
7. Use the command buttons and read the Teensy's responses in **SERIAL MONITOR**.

Use **DISCONNECT** before changing between BLE and Teensy USB modes.

Bluetooth operation with a Teensy will still require an external BLE
module/co-processor that exposes the same GATT service, such as an ESP32 bridge.
