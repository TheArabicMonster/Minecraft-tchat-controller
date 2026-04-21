const tmi = require('tmi.js');
const config = require('../config');
const minecraftBot = require('./minecraft');

class TwitchBot {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  init() {
    this.client = new tmi.Client({
      options: { debug: config.debug },
      identity: {
        username: config.twitch.botUsername,
        password: config.twitch.oauthToken
      },
      channels: [config.twitch.channel]
    });

    // Event listeners
    this.client.on('connected', () => this.onConnected());
    this.client.on('disconnected', () => this.onDisconnected());
    this.client.on('message', (channel, tags, message, self) => 
      this.onMessage(channel, tags, message, self)
    );
  }

  async connect() {
    try {
      await this.client.connect();
    } catch (error) {
      console.error('❌ Erreur connexion Twitch:', error);
    }
  }

  onConnected() {
    this.connected = true;
    console.log('✅ Bot Twitch connecté');
  }

  onDisconnected() {
    this.connected = false;
    console.log('❌ Bot Twitch déconnecté');
  }

  onMessage(channel, tags, message, self) {
    if (self) return; // Ignorer les messages du bot lui-même

    const args = message.split(' ');
    const command = args[0].toLowerCase();

    if (!command.startsWith('!')) return;

    const commandName = command.slice(1);
    const username = tags['display-name'] || tags.username;
    const source = `twitch_${username}`;

    console.log(`📺 [Twitch] ${username}: ${message}`);

    this.handleCommand(commandName, source);
  }

  handleCommand(commandName, source) {
    switch (commandName) {
      case 'tnt':
        minecraftBot.spawnTnt(
          config.commands.tnt.twitch.count,
          source
        );
        break;
      case 'mob':
        minecraftBot.spawnMobs(
          config.commands.mob.twitch.count,
          source
        );
        break;
      case 'foudre':
        minecraftBot.spawnLightning(
          config.commands.foudre.twitch.count,
          source
        );
        break;
      default:
        if (config.debug) console.log(`Commande Twitch inconnue: ${commandName}`);
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
    }
  }
}

module.exports = new TwitchBot();
