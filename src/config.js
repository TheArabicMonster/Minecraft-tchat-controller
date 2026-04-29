const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Charger la configuration depuis config.json
const configPath = path.join(__dirname, '../config/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Validation stricte des variables d'environnement
const requiredEnvVars = [
  'TWITCH_CHANNEL',
  'TWITCH_BOT_USERNAME',
  'TWITCH_OAUTH_TOKEN',
  'DISCORD_TOKEN',
  'MINECRAFT_RCON_PASSWORD'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('❌ ERREUR: Variables d\'environnement manquantes:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('\nCopiez .env.example vers .env et remplissez toutes les variables requises.');
  process.exit(1);
}

// Validation des valeurs numériques
const rconPort = parseInt(process.env.MINECRAFT_RCON_PORT, 10);
if (isNaN(rconPort) || rconPort <= 0 || rconPort > 65535) {
  console.error('❌ ERREUR: MINECRAFT_RCON_PORT doit être un port valide (1-65535)');
  process.exit(1);
}

const overlayPort = parseInt(process.env.OVERLAY_PORT, 10);
if (process.env.OVERLAY_PORT && (isNaN(overlayPort) || overlayPort <= 0 || overlayPort > 65535)) {
  console.error('❌ ERREUR: OVERLAY_PORT doit être un port valide (1-65535)');
  process.exit(1);
}

// Ajouter les variables d'environnement
config.twitch = {
  channel: process.env.TWITCH_CHANNEL,
  botUsername: process.env.TWITCH_BOT_USERNAME,
  oauthToken: process.env.TWITCH_OAUTH_TOKEN
};

config.discord = {
  token: process.env.DISCORD_TOKEN,
  channelId: process.env.DISCORD_CHANNEL_ID
};

config.rcon = {
  host: process.env.MINECRAFT_RCON_HOST || 'localhost',
  port: rconPort,
  password: process.env.MINECRAFT_RCON_PASSWORD
};

config.debug = process.env.DEBUG === 'true';

module.exports = config;
