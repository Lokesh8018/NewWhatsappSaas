<h1 align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/240px-WhatsApp.svg.png" alt="PhpNuxBill" width="150">
  <br>Api Whatsapp Gateway - To send notifications to customers<br>
</h1>

<h4 align="center">Unofficial Whatsapp Gateway Using NodeJs</h4>

<p align="center">
  <a href="https://github.com/Lokesh8018/NewWhatsappSaas/releases">
    <img alt="GitHub release (with filter)" src="https://img.shields.io/github/v/release/Lokesh8018/NewWhatsappSaas?label=Latest%20Release&labelColor=CE5A67">
  </a>
  <a href="https://github.com/Lokesh8018/NewWhatsappSaas/blob/main/LICENSE">
   <img alt="GitHub" src="https://img.shields.io/github/license/Lokesh8018/NewWhatsappSaas">
  </a>
  
</p>

## Features

Easy Setup Headless multi session Whatsapp Gateway with NodeJS.

- Support multi device
- Support Pairing Code
- Anti delay message
- Admin dashboard for session management
- Multi-session support

<p>

#### Based on [WhiskeySockets-Baileys](https://github.com/WhiskeySockets/Baileys)

<p>

## Documentation

### Environment Variables

Copy `.env.example` to `.env` and configure:

```
PORT=5001                        # Port for the server
ADMIN_PASSWORD=your_secure_pass  # Admin panel password (default: admin123)
API_KEY=                         # Optional: API key to protect /send-message
COUNTRY_CODE=ID                  # Country code (ISO)
COUNTRY_CODE_PHONE=62            # Country phone prefix
TIMEZONE=Asia/Jakarta            # Timezone
USE_PAIRING=false                # true = Pairing Code, false = QR Code
PAIRING_NUMBER=                  # WhatsApp number for pairing
MAX_SESSIONS=10                  # Max concurrent sessions
SESSION_DIR=sessions             # Directory for session auth data
DATA_DIR=data                    # Directory for metadata
```

### Install and Running

Clone the project

```bash
  git clone https://github.com/Lokesh8018/NewWhatsappSaas.git
```

Go to the project directory

```bash
  cd NewWhatsappSaas
```

Install dependencies

```bash
  npm install
```

Copy and configure environment variables

```bash
  cp .env.example .env
```

Start the server

```bash
  npm run start
```

Development mode (with auto-restart)

```bash
  npm run dev
```

Open On Browser & Start New Session to Get QRCode if PairingCode False

```bash
  http://localhost:5001/scan
```

## Deploy to Render

1. Fork this repository to your GitHub account
2. Create a new **Web Service** on [Render](https://render.com)
3. Connect your GitHub repository
4. Configure the service:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Add environment variables in the Render dashboard (see `.env.example`)
6. Deploy!

Render automatically sets the `PORT` environment variable — this app respects it.

## API Reference

### Health Check

```
  GET /health
```

Returns `{ "status": "ok", "uptime": <seconds> }`

### Send Text Message

```
  POST /send-message
  GET /send-message?message=Text&number=08123456789
```

| Parameter | Type     | Description                                                         |
| :-------- | :------- | :------------------------------------------------------------------ |
| `message` | `string` | **Required**. Text Message                                          |
| `number`  | `string` | **Required**. Receiver Phone Number (e.g: 62812345678 / 0812345678) |

**Optional API Key Auth:** If `API_KEY` is set in your environment, you must provide it via:
- Query parameter: `?api_key=YOUR_KEY`
- Header: `x-api-key: YOUR_KEY`

### Admin Panel

Access the admin dashboard at `/admin` (login with your `ADMIN_PASSWORD`).

## Changelog

#### [CHANGELOG.md](CHANGELOG.md)
