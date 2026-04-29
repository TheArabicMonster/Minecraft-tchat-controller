const fs = require('fs');
const path = require('path');

class StatsManager {
  constructor() {
    this.sessionStats = {
      tnt: 0,
      mob: 0,
      foudre: 0,
      mort: 0
    };
    
    this.globalStats = {
      tnt: 0,
      mob: 0,
      foudre: 0,
      mort: 0,
      runsCompleted: 0,
      bestTimeMs: null
    };
    
    this.sessionStatsPath = path.join(process.cwd(), 'data', 'stats-session.json');
    this.globalStatsPath = path.join(process.cwd(), 'data', 'stats-global.json');
  }
  
  loadGlobalStats() {
    try {
      if (!fs.existsSync(this.globalStatsPath)) {
        return;
      }
      
      const file = JSON.parse(fs.readFileSync(this.globalStatsPath, 'utf8'));
      this.globalStats = { ...this.globalStats, ...file };
    } catch (error) {
      console.error('⚠️ Impossible de charger les stats globales:', error.message);
    }
  }
  
  saveGlobalStats() {
    try {
      fs.mkdirSync(path.dirname(this.globalStatsPath), { recursive: true });
      fs.writeFileSync(
        this.globalStatsPath,
        JSON.stringify(this.globalStats, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('⚠️ Impossible de sauvegarder les stats globales:', error.message);
    }
  }
  
  resetSessionStats() {
    this.sessionStats = {
      tnt: 0,
      mob: 0,
      foudre: 0,
      mort: 0
    };
  }
  
  incrementStat(type, count = 1) {
    if (!Object.prototype.hasOwnProperty.call(this.sessionStats, type)) {
      return;
    }
    
    this.sessionStats[type] += count;
    this.globalStats[type] += count;
    this.saveGlobalStats();
  }
  
  getSessionStats() {
    return { ...this.sessionStats };
  }
  
  getGlobalStats() {
    return { ...this.globalStats };
  }
  
  completeRun(timeMs) {
    this.globalStats.runsCompleted += 1;
    
    if (!this.globalStats.bestTimeMs || timeMs < this.globalStats.bestTimeMs) {
      this.globalStats.bestTimeMs = timeMs;
    }
    
    this.saveGlobalStats();
  }
}

module.exports = new StatsManager();
