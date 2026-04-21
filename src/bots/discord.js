const { Client, GatewayIntentBits } = require('discord.js');
const config = require('../config');
const minecraftBot = require('./minecraft');

class DiscordBot {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  init() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    this.client.on('ready', () => this.onReady());
    this.client.on('messageCreate', (message) => this.onMessage(message));
  }

  async connect() {
    try {
      await this.client.login(config.discord.token);
    } catch (error) {
      console.error('❌ Erreur connexion Discord:', error);
    }
  }

  onReady() {
    this.connected = true;
    console.log(`✅ Bot Discord connecté en tant que ${this.client.user.tag}`);
  }

  onMessage(message) {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase().slice(1);
    const username = message.author.username;
    const source = `discord_${username}`;

    console.log(`📘 [Discord] ${username}: ${message.content}`);

    this.handleCommand(command, source);
  }

  handleCommand(commandName, source) {
    switch (commandName) {
      case 'tnt':
        minecraftBot.spawnTnt(
          config.commands.tnt.discord.count,
          source
        );
        break;
      case 'mob':
        minecraftBot.spawnMobs(
          config.commands.mob.discord.count,
          source
        );
        break;
      case 'foudre':
        minecraftBot.spawnLightning(
          config.commands.foudre.discord.count,
          source
        );
        break;
      default:
        if (config.debug) console.log(`Commande Discord inconnue: ${commandName}`);
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.destroy();
    }
  }
}

module.exports = new DiscordBot();
