# Chatmagal Mobile Application (iOS & Android)

The official cross-platform mobile client for **Chatmagal** built with React Native and Expo. Supports both **Workspace Staff/Agents** and **End-Customers**.

---

## 📱 Features

### 🏢 1. Workspace Staff / Agent Experience
- **Live WhatsApp Inbox**:
  - Real-time conversation list powered by WebSockets (Socket.IO).
  - Unread badges, customer sentiment tags (`HAPPY`, `NEUTRAL`, `ANGRY`, `URGENT`), and priority tags (`URGENT`, `HIGH`, `STANDARD`).
  - Search by customer name, phone number, or Customer ID.
  - Filter tabs: All, Unread, Urgent, and Human Takeover.
- **Interactive Live Chat**:
  - Real-time inbound & outbound message feed.
  - **One-Tap AI Bot Switch in the Header**: Instantly toggle between "AI Active" and "Human Only" takeover mode.
  - Quick reply response templates.
  - Manual message input and sending via WhatsApp Business API.
- **Order Management**:
  - Live feed of customer orders and service requests.
  - Status tracking (`Pending`, `In Progress`, `Completed`, `Cancelled`).
  - View price quotes and submitted form details.
- **Settings & Workspace Overview**:
  - Real-time wallet balance and subscription plan details.

---

### 👤 2. Client Portal Experience
- **My Orders & Services**:
  - View all past and active service requests (Monetization, Followers, Advertising).
  - Order status tracking, price quotes, and full order specifications.
- **Support Chat**:
  - Direct live chat with Chatmagal's AI assistant and human support team.
- **Client Profile**:
  - View unique Falcus Media Customer ID (e.g. `FM-123456`), email verification status, and phone number.

---

## 🚀 How to Run the Mobile App

### 1. Install Dependencies
```bash
cd mobile
npm install
```

### 2. Start the Development Server
```bash
npx expo start
```

### 3. Test on Physical Devices (Zero Setup!)

#### **On iPhone**:
1. Download **Expo Go** from the Apple App Store.
2. Open the default iOS **Camera app** and scan the QR code displayed in your terminal.
3. Tap the prompt to open in Expo Go.

#### **On Android**:
1. Download **Expo Go** from the Google Play Store.
2. Open the Expo Go app and tap **"Scan QR code"**.
3. Scan the QR code displayed in your terminal.

---

## 🌐 Connecting to Your Backend

The app is pre-configured to connect to:
- Default: `https://chatmagal.com`

To connect to a local development machine or custom IP:
1. On the Login screen, tap the **"API Server"** link at the bottom.
2. Enter your machine's local IP address (e.g., `http://192.168.1.100:3000`).
3. Tap **Save Server**. The app and real-time Socket.IO will immediately reconnect.
