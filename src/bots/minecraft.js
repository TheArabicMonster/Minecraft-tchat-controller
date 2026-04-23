const { RCON } = require('minecraft-server-util');
const config = require('../config');
const overlayServer = require('../overlay/server');

// État global
let lastCommandTime = 0;

class RconClient {
  constructor() {
    this.client = null;
    this.playerName = 'nomade'; // À adapter si besoin
  }

  async connect() {
    try {
      this.client = new RCON(config.rcon.host, {
        port: config.rcon.port,
        password: config.rcon.password
      });
      await this.client.connect();
      console.log('✅ Connecté au serveur Minecraft RCON');
      return true;
    } catch (error) {
      console.error('❌ Erreur de connexion RCON:', error.message || error.code || error);
      if (error.code === 'ECONNREFUSED') {
        console.error('   → Le serveur Minecraft n\'est pas démarré ou RCON est désactivé');
      }
      return false;
    }
  }

  async disconnect() {
    if (this.client) {
      try {
        this.client.close();
      } catch (_) {}
      this.client = null;
      console.log('Déconnecté du serveur RCON');
    }
  }

  async executeCommand(command) {
    if (!this.client) {
      console.error('RCON client non connecté');
      return null;
    }
    try {
      const response = await this.client.execute(command);
      if (config.debug) console.log(`[RCON] ${command}`);
      return response;
    } catch (error) {
      console.error(`Erreur RCON pour la commande "${command}":`, error.message);
      return null;
    }
  }

  isOnCooldown() {
    const now = Date.now();
    const cooldown = config.cooldown.global || 5000;
    return (now - lastCommandTime) < cooldown;
  }

  updateCooldown() {
    lastCommandTime = Date.now();
  }

  async spawnTnt(count = 1, source = 'unknown') {
    if (this.isOnCooldown()) {
      console.log(`⏳ Cooldown actif (${source})`);
      return false;
    }

    for (let i = 0; i < count; i++) {
      // Spawn TNT au-dessus du joueur
      await this.executeCommand(
        `/execute at @p run summon tnt ~ ~2 ~ {Fuse:80}`
      );
    }

    this.updateCooldown();
    overlayServer.registerCommand('tnt', count);
    
    if (config.features.notifications) {
      await this.notifyChat(source, '!tnt', count);
    }

    return true;
  }

  async spawnMobs(count = 1, source = 'unknown') {
    if (this.isOnCooldown()) {
      console.log(`⏳ Cooldown actif (${source})`);
      return false;
    }

    const mobTypes = config.commands.mob.twitch.types;
    
    for (let i = 0; i < count; i++) {
      const randomMob = mobTypes[Math.floor(Math.random() * mobTypes.length)];
      await this.executeCommand(
        `/execute at @p run summon ${randomMob} ~ ~ ~`
      );
    }

    this.updateCooldown();
    overlayServer.registerCommand('mob', count);

    if (config.features.notifications) {
      await this.notifyChat(source, '!mob', count);
    }

    return true;
  }

  async spawnLightning(count = 1, source = 'unknown') {
    if (this.isOnCooldown()) {
      console.log(`⏳ Cooldown actif (${source})`);
      return false;
    }

    for (let i = 0; i < count; i++) {
      await this.executeCommand(
        `/execute at @p run summon lightning_bolt ~ ~ ~`
      );
    }

    this.updateCooldown();
    overlayServer.registerCommand('foudre', count);

    if (config.features.notifications) {
      await this.notifyChat(source, '!foudre', count);
    }

    return true;
  }

  async notifyChat(source, command, count) {
    const sourceLabel = source.includes('discord') ? '📘 Discord' : '📺 Twitch';
    const effect = command === '!tnt' ? 'TNT' : command === '!mob' ? 'Mob' : 'Foudre';
    
    await this.executeCommand(
      `/say ${sourceLabel} a lancé ${command} (×${count}) - ${effect} activé !`
    );
  }
}

module.exports = new RconClient();
