const fs = require('fs');
const path = require('path');
const http = require('http');
const { WebSocket, WebSocketServer } = require('ws');
const statsManager = require('../stats/stats');

class OverlayServer {
  constructor() {
    this.httpServer = null;
    this.wss = null;
    this.port = parseInt(process.env.OVERLAY_PORT, 10) || 3001;

    this.state = {
      timer: {
        startedAt: null,
        endedAt: null,
        endedReason: null
      },
      personalBestMs: null,
      counters: {
        tnt: 0,
        mob: 0,
        foudre: 0,
        mort: 0
      }
    };

    this.dataPath = path.join(process.cwd(), 'data', 'overlay-stats.json');
    this.logPath = process.env.MINECRAFT_LOG_PATH || path.join(process.cwd(), 'logs', 'latest.log');

    this.logPollInterval = null;
    this.logOffset = 0;
    this.logInode = null;
    this.logInitialized = false;
  }

  start() {
    if (this.httpServer) {
      return;
    }

    this.loadPersistentData();
    statsManager.loadGlobalStats();

    this.httpServer = http.createServer((req, res) => this.handleRequest(req, res));
    this.wss = new WebSocketServer({ noServer: true });

    this.httpServer.on('upgrade', (req, socket, head) => {
      if (req.url !== '/ws') {
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req);
      });
    });

    this.wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ type: 'state', payload: this.getState() }));
    });

    this.httpServer.listen(this.port, () => {
      console.log(`🖥️  Overlay OBS disponible sur http://localhost:${this.port}`);
    });

    this.startLogMonitoring();
  }

  async stop() {
    if (this.logPollInterval) {
      clearInterval(this.logPollInterval);
      this.logPollInterval = null;
    }

    if (this.wss) {
      this.wss.clients.forEach((client) => {
        try {
          client.close();
        } catch (error) {
          if (process.env.DEBUG === 'true') {
            console.warn('⚠️ Erreur fermeture client overlay:', error.message);
          }
        }
      });
      this.wss.close();
      this.wss = null;
    }

    if (!this.httpServer) {
      return;
    }

    await new Promise((resolve) => this.httpServer.close(resolve));
    this.httpServer = null;
  }

  handleRequest(req, res) {
    const urlPath = req.url === '/' ? '/index.html' : req.url;

    if (urlPath === '/state') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(this.getState()));
      return;
    }

    if (!urlPath.startsWith('/assets/') && urlPath !== '/index.html') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const filePath = path.join(__dirname, urlPath === '/index.html' ? 'index.html' : urlPath);

    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const mimeByExt = {
        '.html': 'text/html; charset=utf-8',
        '.png': 'image/png',
        '.ttf': 'font/ttf',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2'
      };

      res.writeHead(200, { 'Content-Type': mimeByExt[ext] || 'application/octet-stream' });
      res.end(content);
    });
  }

  registerCommand(type, count = 1) {
    if (!Object.prototype.hasOwnProperty.call(this.state.counters, type)) {
      return;
    }

    this.state.counters[type] += count;
    this.broadcastState();
  }

  registerPlayerSpawn() {
    // Always reset timer and counters on spawn (even after death)
    this.state.timer.startedAt = Date.now();
    this.state.timer.endedAt = null;
    this.state.timer.endedReason = null;
    this.state.counters = {
      tnt: 0,
      mob: 0,
      foudre: 0,
      mort: 0
    };
    
    // Also reset session stats
    statsManager.resetSessionStats();
    
    this.broadcastState();
  }

  registerPlayerDeath() {
    if (!this.state.timer.startedAt || this.state.timer.endedAt) {
      return;
    }

    // Increment death counter but do NOT stop the timer
    // Timer only stops when Ender Dragon dies
    this.state.counters.mort += 1;
    statsManager.incrementStat('mort', 1);
    this.broadcastState();
  }

  registerDragonDeath() {
    if (!this.state.timer.startedAt || this.state.timer.endedAt) {
      return;
    }

    this.state.timer.endedAt = Date.now();
    this.state.timer.endedReason = 'dragon';
    const runTime = this.state.timer.endedAt - this.state.timer.startedAt;

    if (!this.state.personalBestMs || runTime < this.state.personalBestMs) {
      this.state.personalBestMs = runTime;
      this.savePersistentData();
    }
    
    // Mark run as complete in global stats
    statsManager.completeRun(runTime);

    this.broadcastState();
  }

  getState() {
    return {
      timer: { ...this.state.timer },
      personalBestMs: this.state.personalBestMs,
      counters: { ...this.state.counters }
    };
  }

  broadcastState() {
    if (!this.wss) {
      return;
    }

    const message = JSON.stringify({ type: 'state', payload: this.getState() });

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  loadPersistentData() {
    try {
      if (!fs.existsSync(this.dataPath)) {
        return;
      }

      const file = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
      if (typeof file.personalBestMs === 'number' && file.personalBestMs > 0) {
        this.state.personalBestMs = file.personalBestMs;
      }
    } catch (error) {
      console.error('⚠️ Impossible de charger le PB overlay:', error.message);
    }
  }

  savePersistentData() {
    try {
      fs.mkdirSync(path.dirname(this.dataPath), { recursive: true });
      fs.writeFileSync(
        this.dataPath,
        JSON.stringify({ personalBestMs: this.state.personalBestMs }, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('⚠️ Impossible de sauvegarder le PB overlay:', error.message);
    }
  }

  startLogMonitoring() {
    this.logPollInterval = setInterval(() => {
      this.pollLogFile().catch((error) => {
        if (error && error.code !== 'ENOENT') {
          console.error('⚠️ Erreur lecture logs Minecraft overlay:', error.message || error);
        }
      });
    }, 1000);
  }

  async pollLogFile() {
    try {
      const stats = await fs.promises.stat(this.logPath);

      if (!this.logInitialized) {
        this.logOffset = stats.size;
        this.logInode = stats.ino;
        this.logInitialized = true;
        return;
      }

      if (this.logInode !== stats.ino || stats.size < this.logOffset) {
        this.logInode = stats.ino;
        this.logOffset = 0;
      }

      if (stats.size === this.logOffset) {
        return;
      }

      const length = stats.size - this.logOffset;
      const handle = await fs.promises.open(this.logPath, 'r');

      try {
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, this.logOffset);
        this.logOffset = stats.size;
        const lines = buffer.toString('utf8').split(/\r?\n/);
        lines.forEach((line) => this.processLogLine(line));
      } finally {
        await handle.close();
      }
    } catch (error) {
      // Ignore ENOENT errors (log file doesn't exist yet)
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  processLogLine(line) {
    if (!line) {
      return;
    }

    const normalized = line.toLowerCase();

    const isSpawn = /joined the game|logged in with entity id|a rejoint la partie/.test(normalized);
    if (isSpawn && (!this.state.timer.startedAt || this.state.timer.endedAt)) {
      this.registerPlayerSpawn();
      return;
    }

    const isDragonDeath =
      /ender dragon/.test(normalized) &&
      /(was slain|was killed|died|killed|tué|a ete tue|a été tué)/.test(normalized);

    if (isDragonDeath) {
      this.registerDragonDeath();
      return;
    }

    const isPlayerDeath =
      /\b(was slain by|was shot by|was blown up by|was fireballed by|drowned|hit the ground too hard|fell from a high place|burned to death|went up in flames|tried to swim in lava|died|was killed by|est mort|a ete tue|a été tué)\b/.test(normalized);

    if (isPlayerDeath) {
      this.registerPlayerDeath();
    }
  }
}

module.exports = new OverlayServer();
