require("dotenv").config();
const fs = require("fs");

// ============= GLOBAL SETTING ============ //
global.port = process.env.PORT || "5001"; // Port Api / Browser
global.countrycode = process.env.COUNTRY_CODE || "ID"; // Country Code - https://countrycode.org/ (ISO CODES)
global.countrycodephone = process.env.COUNTRY_CODE_PHONE || "62"; // Country Phone - https://countrycode.org/ (COUNTRY CODE)
global.timezone = process.env.TIMEZONE || "Asia/Jakarta"; // Time Zone
global.usePairingNumber = process.env.USE_PAIRING === "true" || false; // true = Pairing Code / false = QRCode
global.pairingNumber = process.env.PAIRING_NUMBER || ""; // whatsapp number used as a bot, for pairing number
//========================================================

try {
  global.pp_bot = fs.readFileSync("./image/logo.png"); // location and name of the logo
} catch (e) {
  global.pp_bot = null; // logo file not found, image sending disabled
}
global.use_pp = true; // use a logo?

//========================================================

global.kontakadmin = ["6281287123512"]; // admin whatsapp number
global.kirimkontak_admin = false; // true = automatically send admin contact

//========================================================

global.sessionName = "session"; // session name
//========================================================

global.adminPassword = process.env.ADMIN_PASSWORD || "admin123"; // Admin panel password
global.maxSessions = parseInt(process.env.MAX_SESSIONS, 10) || 10; // Maximum concurrent sessions
global.sessionDir = process.env.SESSION_DIR || "sessions"; // Directory for session auth data
global.dataDir = process.env.DATA_DIR || "data"; // Directory for metadata
