const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Charger la configuration depuis config.json
const configPath = path.join(__dirname, '../config/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

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
  port: parseInt(process.env.MINECRAFT_RCON_PORT) || 25575,
  password: process.env.MINECRAFT_RCON_PASSWORD
};

config.debug = process.env.DEBUG === 'true';

module.exports = config;
