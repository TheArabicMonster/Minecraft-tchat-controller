const { RCON } = require('minecraft-server-util');
const config = require('../config');
const overlayServer = require('../overlay/server');
const statsManager = require('../stats/stats');

// État global
let lastCommandTime = 0;

class RconClient {
  constructor() {
    this.client = null;
    this.playerName = 'nomade'; // À adapter si besoin
  }

  async connect() {
    let attempts = 0;
    const maxAttempts = 3;
    const retryDelay = 5000; // 5 secondes

    while (attempts < maxAttempts) {
      try {
        this.client = new RCON(config.rcon.host, {
          port: config.rcon.port,
          password: config.rcon.password
        });
        await this.client.connect();
        console.log('✅ Connecté au serveur Minecraft RCON');
        return true;
      } catch (error) {
        attempts++;
        console.error(`❌ Erreur de connexion RCON (tentative ${attempts}/${maxAttempts}):`, error.message || error.code || error);
        
        if (error.code === 'ECONNREFUSED') {
          console.error('   → Le serveur Minecraft n\'est pas démarré ou RCON est désactivé');
        }
        
        if (attempts < maxAttempts) {
          console.log(`🔄 Nouvelle tentative dans ${retryDelay / 1000} secondes...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          console.error('❌ Échec de connexion RCON après toutes les tentatives');
          return false;
        }
      }
    }
    
    return false;
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
    const cmdCount = this.incrementCommandCount();
    overlayServer.registerCommand('tnt', count);
    statsManager.incrementStat('tnt', count);
    
    // Vérifier si un mini-boss doit apparaître (toutes les 100 commandes)
    if (cmdCount % 100 === 0) {
      await this.triggerMiniBoss(source);
    }
    
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

    const isDiscord = source.includes('discord');
    const mobConfig = isDiscord 
      ? config.commands.mob.discord.types 
      : config.commands.mob.twitch.types;
    const mobTypes = mobConfig || ['creeper', 'zombie', 'skeleton'];
    
    for (let i = 0; i < count; i++) {
      const randomMob = mobTypes[Math.floor(Math.random() * mobTypes.length)];
      await this.executeCommand(
        `/execute at @p run summon ${randomMob} ~ ~ ~`
      );
    }

    this.updateCooldown();
    const cmdCount = this.incrementCommandCount();
    overlayServer.registerCommand('mob', count);
    statsManager.incrementStat('mob', count);

    // Vérifier si un mini-boss doit apparaître (toutes les 100 commandes)
    if (cmdCount % 100 === 0) {
      await this.triggerMiniBoss(source);
    }

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
    const cmdCount = this.incrementCommandCount();
    overlayServer.registerCommand('foudre', count);
    statsManager.incrementStat('foudre', count);

    // Vérifier si un mini-boss doit apparaître (toutes les 100 commandes)
    if (cmdCount % 100 === 0) {
      await this.triggerMiniBoss(source);
    }

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
  
  async resetMap() {
    const resetManager = require('../reset/reset');
    return await resetManager.resetMap(this);
  }
  
  // Compteur de commandes valides pour les mini-boss
  getCommandCount() {
    return this.commandCount || 0;
  }
  
  incrementCommandCount() {
    this.commandCount = (this.commandCount || 0) + 1;
    return this.commandCount;
  }
  
  async spawnMiniBoss() {
    const miniBosses = ['wither', 'ghast', 'evoker', 'creeper'];
    const randomBoss = miniBosses[Math.floor(Math.random() * miniBosses.length)];
    
    await this.executeCommand(
      `/execute at @p run summon ${randomBoss} ~ ~2 ~`
    );
    
    return randomBoss;
  }
  
  async triggerMiniBoss(source) {
    const bossName = await this.spawnMiniBoss();
    const sourceLabel = source.includes('discord') ? 'Discord' : 'Twitch';
    const username = source.split('_')[1] || 'Un utilisateur';
    
    // Annonce dans le chat Minecraft
    await this.executeCommand(
      `/say 🎉 100ème commande atteinte ! ${username} (${sourceLabel}) invoque un ${bossName.toUpperCase()} ! 🎉`
    );
    
    console.log(`👹 Mini-boss invoqué: ${bossName} (déclenché par ${username} sur ${sourceLabel})`);
  }
}

module.exports = new RconClient();
