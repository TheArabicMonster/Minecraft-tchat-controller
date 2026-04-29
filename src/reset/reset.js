const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const config = require('../config');

class MapResetManager {
  constructor() {
    this.isResetting = false;
    this.serverPath = process.env.MINECRAFT_SERVER_PATH || path.join(process.cwd(), 'server');
    this.useTemplates = this.parseBoolEnv(process.env.MINECRAFT_USE_TEMPLATES, true);
    this.logPath = process.env.MINECRAFT_LOG_PATH || path.join(this.serverPath, 'logs', 'latest.log');
    this.worldTemplate = path.join(this.serverPath, 'world-template');
    this.worldNetherTemplate = path.join(this.serverPath, 'world_nether-template');
    this.worldEndTemplate = path.join(this.serverPath, 'world_the_end-template');
    this.world = path.join(this.serverPath, 'world');
    this.worldNether = path.join(this.serverPath, 'world_nether');
    this.worldEnd = path.join(this.serverPath, 'world_the_end');
  }
  
  async resetMap(minecraftBot) {
    if (this.isResetting) {
      console.log('⚠️ Reset déjà en cours...');
      return false;
    }
    
    this.isResetting = true;
    
    try {
      if (!fs.existsSync(this.serverPath)) {
        const errorMsg = '❌ Erreur: dossier serveur introuvable. Reset annulé.';
        await minecraftBot.executeCommand(`/say ${errorMsg}`);
        console.error('❌ Dossier serveur introuvable:', this.serverPath);
        this.isResetting = false;
        return false;
      }

      if (this.useTemplates) {
        // Vérifier que les templates existent
        if (!fs.existsSync(this.worldTemplate)) {
          const errorMsg = '❌ Erreur: Template de map introuvable. Reset annulé.';
          await minecraftBot.executeCommand(`/say ${errorMsg}`);
          console.error('❌ Template de map introuvable:', this.worldTemplate);
          this.isResetting = false;
          return false;
        }
      }
      
      // Countdown
      for (let i = 3; i >= 1; i--) {
        await minecraftBot.executeCommand(`/say Redémarrage dans ${i}...`);
        await this.sleep(1000);
      }
      
      // Stop server
      await minecraftBot.executeCommand('/stop');

      const stopped = await this.waitForServerStopped();
      if (!stopped) {
        const twitchBot = require('../bots/twitch');
        await twitchBot.sendMessage('❌ Reset annulé: serveur encore actif. Réessaie dans quelques secondes.');
        this.isResetting = false;
        return false;
      }

      // Laisser le temps au serveur de libérer les fichiers
      await this.sleep(2000);
      
      // Delete current worlds
      await this.deleteDirectory(this.world);
      await this.deleteDirectory(this.worldNether);
      await this.deleteDirectory(this.worldEnd);
      
      if (this.useTemplates) {
        // Copy template worlds
        await this.copyDirectory(this.worldTemplate, this.world);
        await this.copyDirectory(this.worldNetherTemplate, this.worldNether);
        await this.copyDirectory(this.worldEndTemplate, this.worldEnd);
      }
      
      // Apply seed if fixed
      if (config.reset && config.reset.seedMode === 'fixed' && config.reset.fixedSeed) {
        await this.updateServerProperties('level-seed', config.reset.fixedSeed);
      } else if (config.reset && config.reset.seedMode === 'random') {
        const randomSeed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
        await this.updateServerProperties('level-seed', randomSeed);
      }

      // Reset player advancements/stats
      await this.resetPlayerProgress();
      
      const logOffset = this.getLogOffset();

      // Restart server
      this.startServer();
      
      // Reset session stats and timer
      const statsManager = require('../stats/stats');
      statsManager.resetSessionStats();
      
      const overlayServer = require('../overlay/server');
      overlayServer.resetForNewRun(); // Reset le timer sans le relancer
      
      const isReady = await this.waitForServerReady(logOffset);

      // Annonce de succès (Twitch)
      const twitchBot = require('../bots/twitch');
      if (isReady) {
        await twitchBot.sendMessage('✅ Serveur Minecraft prêt après reset. Map et stats réinitialisées.');
      } else {
        await twitchBot.sendMessage('⚠️ Reset effectué, mais le serveur met plus de temps à démarrer.');
      }
      
      console.log('✅ Map réinitialisée avec succès');
      this.isResetting = false;
      return true;
      
    } catch (error) {
      console.error('❌ Erreur lors du reset de la map:', error);
      await minecraftBot.executeCommand('/say ❌ Erreur lors du reset de la map.');
      this.isResetting = false;
      return false;
    }
  }

  getLogOffset() {
    try {
      if (!fs.existsSync(this.logPath)) {
        return 0;
      }
      return fs.statSync(this.logPath).size;
    } catch (_) {
      return 0;
    }
  }

  async waitForServerReady(startOffset, timeoutMs = 120000, pollMs = 1000) {
    const startTime = Date.now();
    let offset = startOffset || 0;

    while (Date.now() - startTime < timeoutMs) {
      if (fs.existsSync(this.logPath)) {
        const stats = await fs.promises.stat(this.logPath);
        if (stats.size > offset) {
          const length = stats.size - offset;
          const handle = await fs.promises.open(this.logPath, 'r');
          try {
            const buffer = Buffer.alloc(length);
            await handle.read(buffer, 0, length, offset);
            offset = stats.size;
            const lines = buffer.toString('utf8').split(/\r?\n/);
            if (lines.some((line) => this.isServerReadyLine(line))) {
              return true;
            }
          } finally {
            await handle.close();
          }
        }
      }

      await this.sleep(pollMs);
    }

    return false;
  }

  isServerReadyLine(line) {
    if (!line) {
      return false;
    }

    return /Done \(|For help, type "help"/i.test(line);
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async deleteDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      return;
    }

    const retryable = new Set(['ENOTEMPTY', 'EPERM', 'EBUSY', 'EACCES']);
    const maxAttempts = 10;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await fs.promises.rm(dirPath, { recursive: true, force: true });
        return;
      } catch (error) {
        if (!retryable.has(error.code) || attempt === maxAttempts) {
          throw error;
        }

        await this.sleep(1000);
      }
    }
  }
  
  async copyDirectory(src, dest) {
    if (!fs.existsSync(src)) {
      throw new Error(`Template non trouvé: ${src}`);
    }
    
    return new Promise((resolve, reject) => {
      fs.cp(src, dest, { recursive: true }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
  
  async updateServerProperties(key, value) {
    const propertiesPath = path.join(this.serverPath, 'server.properties');
    
    if (!fs.existsSync(propertiesPath)) {
      console.warn('⚠️ server.properties non trouvé');
      return;
    }
    
    const content = fs.readFileSync(propertiesPath, 'utf8');
    const lines = content.split('\n');
    const newLines = lines.map(line => {
      if (line.startsWith(`${key}=`)) {
        return `${key}=${value}`;
      }
      return line;
    });
    
    // Add if not exists
    if (!newLines.some(line => line.startsWith(`${key}=`))) {
      newLines.push(`${key}=${value}`);
    }
    
    fs.writeFileSync(propertiesPath, newLines.join('\n'), 'utf8');
  }

  getServerPort() {
    const propertiesPath = path.join(this.serverPath, 'server.properties');
    if (fs.existsSync(propertiesPath)) {
      const content = fs.readFileSync(propertiesPath, 'utf8');
      const line = content.split('\n').find((entry) => entry.startsWith('server-port='));
      if (line) {
        const value = parseInt(line.split('=')[1], 10);
        if (!Number.isNaN(value)) {
          return value;
        }
      }
    }

    return 25565;
  }

  async waitForServerStopped(timeoutMs = 60000, pollMs = 1000) {
    const startTime = Date.now();
    const port = this.getServerPort();

    while (Date.now() - startTime < timeoutMs) {
      const open = await this.isPortOpen(port);
      if (!open) {
        return true;
      }

      await this.sleep(pollMs);
    }

    return false;
  }

  isPortOpen(port, host = '127.0.0.1') {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        try {
          socket.destroy();
        } catch (_) {}
        resolve(result);
      };

      socket.setTimeout(500);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));

      socket.connect(port, host);
    });
  }

  async resetPlayerProgress() {
    const advancementsPath = path.join(this.world, 'advancements');
    const statsPath = path.join(this.world, 'stats');
    const playerDataPath = path.join(this.world, 'playerdata');

    await this.deleteDirectory(advancementsPath);
    await this.deleteDirectory(statsPath);
    await this.deleteDirectory(playerDataPath);
  }

  parseBoolEnv(value, defaultValue) {
    if (typeof value !== 'string') {
      return defaultValue;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }

    return defaultValue;
  }
  
  startServer() {
    const jarPath = process.env.MINECRAFT_SERVER_JAR || 'server.jar';
    const javaArgs = process.env.MINECRAFT_SERVER_JAVA_ARGS || '-Xmx4G -Xms1G';
    
    const serverJar = path.join(this.serverPath, jarPath);

    if (!fs.existsSync(serverJar)) {
      console.error('❌ Jar serveur introuvable:', serverJar);
      return;
    }

    const javaCommand = this.resolveJavaCommand();
    if (!javaCommand) {
      console.error('❌ Java introuvable. Configurez JAVA_HOME ou JAVA_PATH.');
      return;
    }
    
    console.log('🚀 Démarrage du serveur Minecraft...');
    
    const serverProcess = spawn(javaCommand, [...javaArgs.split(' '), '-jar', serverJar, 'nogui'], {
      cwd: this.serverPath,
      stdio: 'inherit'
    });
    
    serverProcess.on('error', (error) => {
      console.error('❌ Erreur démarrage serveur:', error);
    });
  }

  resolveJavaCommand() {
    if (process.env.JAVA_PATH && process.env.JAVA_PATH.trim()) {
      return process.env.JAVA_PATH.trim();
    }

    if (process.env.JAVA_HOME && process.env.JAVA_HOME.trim()) {
      return path.join(process.env.JAVA_HOME.trim(), 'bin', 'java.exe');
    }

    return 'java';
  }
}

module.exports = new MapResetManager();
