# KIOSK MODE — iPad Configuration

> **Phase:** 0 Revision  
> **Status:** Draft

---

## 1. PURPOSE

The iPad acts exclusively as the UI (User Interface) for the photobooth. 
It must be locked down so users cannot accidentally exit the application, browse the web, change settings, or put the iPad to sleep.

---

## 2. PREPARING SAFARI

### Add to Home Screen (PWA Mode)
By adding the web app to the home screen, Safari removes the URL bar and navigation buttons, making it look like a native full-screen app.

1. Ensure the Laptop Web Server is running.
2. Ensure Laptop and iPad are on the **same Wi-Fi network**.
3. Open Safari on the iPad.
4. Navigate to the Laptop's static IP (e.g., `http://192.168.1.10:3000`).
5. Tap the **Share** button (square with arrow pointing up).
6. Tap **Add to Home Screen**.
7. Name it "SI-FEST Photobooth" and tap **Add**.
8. Close Safari.
9. Launch the app from the newly created Home Screen icon.

---

## 3. ENABLING GUIDED ACCESS

Guided Access restricts the iPad to a single app and allows you to disable hardware buttons.

### Setup (One-time)
1. Go to iPad **Settings** > **Accessibility** > **Guided Access**.
2. Turn **Guided Access** ON.
3. Tap **Passcode Settings** > **Set Guided Access Passcode**.
4. Enter a passcode you will remember (e.g., `20262026`).
5. Turn **Display Auto-Lock** to **Never** (so the screen never turns off).

### Activating for the Event
1. Open the "SI-FEST Photobooth" app from the Home Screen.
2. Triple-click the **Home Button** (or **Top Button** on newer iPads).
3. The Guided Access interface will appear.
4. Tap **Options** (bottom left) and ensure:
   - **Sleep/Wake Button**: OFF
   - **Volume Buttons**: OFF
   - **Motion**: OFF
   - **Keyboards**: OFF
   - **Touch**: ON
5. Tap **Start** (top right).

The iPad is now completely locked to the Photobooth app.

### Exiting Guided Access
1. Triple-click the Home/Top button.
2. Enter your passcode.
3. Tap **End** (top left).

---

## 4. UI DESIGN CONSTRAINTS (For Developers)

Because the iPad is locked in Safari PWA mode:
- **No Scrolling:** Use `overflow: hidden` on the root `<body>` and `<html>` tags.
- **No Text Selection:** Use CSS `user-select: none;` globally.
- **No Zooming:** Add `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />`.
- **Landscape Only:** Design UI assuming a landscape aspect ratio (approx 4:3 for iPads).
- **Touch Targets:** Buttons must be large (min `64px` height) and easy to tap.

---

## 5. NETWORK RECOVERY

If the Wi-Fi drops, the Socket.IO client in the Next.js app will automatically attempt to reconnect. 
The UI will display a "Reconnecting..." banner. 
**Do not exit Guided Access** unless the connection fails to restore after several minutes (indicating a router/server issue).
