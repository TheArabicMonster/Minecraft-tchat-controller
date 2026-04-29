const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config');

class MapResetManager {
  constructor() {
    this.isResetting = false;
    this.serverPath = process.env.MINECRAFT_SERVER_PATH || path.join(process.cwd(), 'server');
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
      // Vérifier que les templates existent
      if (!fs.existsSync(this.worldTemplate)) {
        await minecraftBot.executeCommand('/say ❌ Erreur: Template de map introuvable. Reset annulé.');
        console.error('❌ Template de map introuvable:', this.worldTemplate);
        this.isResetting = false;
        return false;
      }
      
      // Countdown
      for (let i = 3; i >= 1; i--) {
        await minecraftBot.executeCommand(`/say Redémarrage dans ${i}...`);
        await this.sleep(1000);
      }
      
      // Stop server
      await minecraftBot.executeCommand('/stop');
      await this.sleep(2000);
      
      // Delete current worlds
      await this.deleteDirectory(this.world);
      await this.deleteDirectory(this.worldNether);
      await this.deleteDirectory(this.worldEnd);
      
      // Copy template worlds
      await this.copyDirectory(this.worldTemplate, this.world);
      await this.copyDirectory(this.worldNetherTemplate, this.worldNether);
      await this.copyDirectory(this.worldEndTemplate, this.worldEnd);
      
      // Apply seed if fixed
      if (config.reset && config.reset.seedMode === 'fixed' && config.reset.fixedSeed) {
        await this.updateServerProperties('level-seed', config.reset.fixedSeed);
      } else if (config.reset && config.reset.seedMode === 'random') {
        const randomSeed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
        await this.updateServerProperties('level-seed', randomSeed);
      }
      
      // Restart server
      this.startServer();
      
      // Reset session stats and timer
      const statsManager = require('../stats/stats');
      statsManager.resetSessionStats();
      
      const overlayServer = require('../overlay/server');
      overlayServer.registerPlayerSpawn(); // Réinitialise le timer et compteurs
      
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
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async deleteDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      return;
    }
    
    return new Promise((resolve, reject) => {
      fs.rm(dirPath, { recursive: true, force: true }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
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
  
  startServer() {
    const jarPath = process.env.MINECRAFT_SERVER_JAR || 'paper.jar';
    const javaArgs = process.env.MINECRAFT_SERVER_JAVA_ARGS || '-Xmx4G -Xms1G';
    
    const serverJar = path.join(this.serverPath, jarPath);
    
    console.log('🚀 Démarrage du serveur Minecraft...');
    
    const serverProcess = spawn('java', [...javaArgs.split(' '), '-jar', serverJar, 'nogui'], {
      cwd: this.serverPath,
      stdio: 'inherit'
    });
    
    serverProcess.on('error', (error) => {
      console.error('❌ Erreur démarrage serveur:', error);
    });
  }
}

module.exports = new MapResetManager();
