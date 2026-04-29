# Minecraft Tchat Controller

Bridge Twitch + Discord -> actions Minecraft Java (Paper) via RCON.

Ce README est volontairement ecrit comme un document de passation: un autre agent doit pouvoir reprendre le developpement sans contexte externe.

## 1) Resume projet

Objectif:
- Ecouter les commandes du chat Twitch (prefixe `!`)
- Ecouter les commandes du serveur Discord (prefixe `!`)
- Declencher des commandes Minecraft via RCON sur un serveur local
- Appliquer un multiplicateur plus fort cote Discord
- Appliquer un cooldown global (5 secondes)
- Afficher un overlay OBS en temps reel (timer speedrun + stats de session)
- Permettre le reset de map via commande moderateur

Contexte utilisateur valide:
- Minecraft Java Paper
- Solo (un seul joueur sur le serveur)
- Pas de second compte Minecraft pour un bot in-game
- Choix d'architecture: RCON (pas de mineflayer)
- Serveur Discord de test deja disponible
- Twitch OAuth deja disponible
- Objectif live: speedrun Ender Dragon le plus rapide possible

## 2) Etat actuel du code

Implante:
- Bot Twitch via `tmi.js`
- Bot Discord via `discord.js`
- Client RCON via `minecraft-server-util`
- Routeur de commandes pour `!tnt`, `!mob`, `!foudre`
- Cooldown global en memoire
- Notification Minecraft via `/say`

Non implante (backlog):
- Overlay OBS (timer + stats)
- Reset de map via `!resetmap`
- Detection mort Ender Dragon
- Systeme de stats session + stats globales persistees
- Mini-boss tous les 100 commandes (desactive par defaut)
- Changement de scene OBS + effet visuel fin de run (feature future, lien: https://x.com/pixelcinna/status/2044959530677608942)
- Tests automatises
- Validation stricte des variables `.env`
- Restriction par `DISCORD_CHANNEL_ID`
- Reconnexion automatique robuste

## 3) Architecture

```text
Twitch chat ----> src/bots/twitch.js ----\
                                          > src/bots/minecraft.js -> RCON -> Minecraft server
Discord chat ---> src/bots/discord.js ---/

Overlay OBS  <--- src/overlay/server.js (HTTP local + WebSocket)
Stats        <--- src/stats/stats.js (session en memoire + persistance JSON)
Reset        <--- src/reset/reset.js (arret serveur MC, swap map, redemarrage)

Config runtime: src/config.js
Config metier : config/config.json
Entry point   : src/index.js
```

Fichiers principaux:
- `src/index.js`: bootstrap, verifications minimales, demarrage des clients
- `src/config.js`: charge `config/config.json` + fusion `.env`
- `src/bots/twitch.js`: parse messages Twitch, dispatch commandes
- `src/bots/discord.js`: parse messages Discord, dispatch commandes
- `src/bots/minecraft.js`: connexion RCON, cooldown global, execution actions
- `src/overlay/server.js`: serveur HTTP + WebSocket pour overlay OBS
- `src/overlay/index.html`: page HTML overlay (font Minecraft, icones, timer, stats)
- `src/stats/stats.js`: gestion stats session + persistance globale JSON
- `src/reset/reset.js`: logique reset map (arret MC, swap dossiers world, redemarrage)
- `config/config.json`: toute la config metier

## 4) Commandes metier

| Commande | Qui peut l'utiliser | Twitch | Discord | Implementation |
|---|---|---:|---:|---|
| `!tnt` | Tous | 1 | 2 | summon TNT au-dessus du joueur |
| `!mob` | Tous | 1 | 3 | summon mob aleatoire parmi liste config |
| `!foudre` | Tous | 1 | 2 | summon `lightning_bolt` sur le joueur |
| `!resetmap` | Moderateurs Twitch uniquement | - | - | countdown 3s puis reset map |

Cooldown:
- Global: 5000 ms
- Comportement: toute commande recue pendant le cooldown est ignoree

Mobs disponibles (configurables dans `config.json`):
- creeper, zombie, skeleton, spider, enderman, blaze, witch
- Rarete configurable (ex: 1% de chance Warden)

## 5) Systeme de stats

Stats de session (remises a zero au spawn dans le nouveau monde):
- Nombre de TNT explosees
- Nombre de mobs spawnes
- Nombre de foudres
- Nombre de morts du joueur

Stats globales (persistees dans `data/stats-global.json`, jamais remises a zero):
- Cumul de toutes les sessions
- Sauvegarde automatique a chaque evenement

## 6) Overlay OBS

Fichier: `src/overlay/index.html`
A ajouter dans OBS comme source "Navigateur" sur `http://localhost:3001`

Contenu affiche:
- Timer speedrun en police Minecraft, demarre au premier spawn dans le monde, se fige a la mort de l'Ender Dragon
- PB (personal best) affiche seulement si un PB existe (persiste entre sessions et changements de seed)
- Icone TNT + compteur
- Icone mob + compteur
- Icone foudre + compteur
- Icone mort + compteur

Mise a jour en temps reel via WebSocket.

## 7) Reset de map (!resetmap)

Reservé aux moderateurs Twitch uniquement.

Sequence:
1. Verification role moderateur
2. Annonce countdown dans Minecraft (`/say Redemarrage dans 3... 2... 1...`)
3. Arret propre du serveur Minecraft
4. Suppression des dossiers `world/`, `world_nether/`, `world_the_end/`
5. Copie des dossiers template `world-template/`, `world_nether-template/`, `world_the_end-template/`
6. Application de la seed (aleatoire ou fixe selon config)
7. Redemarrage du serveur Minecraft
8. Remise a zero des stats de session
9. Le timer redemarre au prochain spawn du joueur

Config seed dans `config.json`:
```json
{
  "reset": {
    "seedMode": "random",
    "fixedSeed": ""
  }
}
```
- `seedMode: "random"` — seed aleatoire a chaque reset
- `seedMode: "fixed"` — utilise `fixedSeed`

## 8) Detection evenements Minecraft

Via lecture des logs du serveur (`logs/latest.log`) en temps reel (tail) :
- Premier spawn joueur → demarre le timer overlay
- Mort du joueur → incremente compteur morts + stats
- Mort de l'Ender Dragon → fige le timer, sauvegarde PB si meilleur temps, envoie message Twitch

Message Twitch fin de run:
> "🎉 GG ! Ender Dragon tué en [temps] ! TNT: [n] | Mobs: [n] | Foudres: [n] | Morts: [n]"

## 9) Mini-boss (desactive par defaut)

Tous les 100 commandes executees, spawn d'un boss aleatoire parmi une liste configurable.
Activable dans `config.json`:
```json
{
  "miniboss": {
    "enabled": false,
    "interval": 100,
    "types": ["wither", "elder_guardian", "warden"]
  }
}
```

## 10) Prerequis

- Node.js 18+
- Serveur Minecraft Java Paper (local) avec RCON active
- Credentials Twitch bot (username + oauth)
- Token bot Discord
- Dossiers template de map vierge crees une fois manuellement

## 11) Configuration `.env`

```env
# Twitch
TWITCH_CHANNEL=nom_chaine
TWITCH_BOT_USERNAME=nom_du_bot
TWITCH_OAUTH_TOKEN=oauth:xxxxxxxxxxxxxxxx

# Discord
DISCORD_TOKEN=xxxxxxxxxxxxxxxx
DISCORD_CHANNEL_ID=123456789012345678

# Minecraft RCON
MINECRAFT_RCON_HOST=localhost
MINECRAFT_RCON_PORT=25575
MINECRAFT_RCON_PASSWORD=motdepasse_rcon

# Reset map
MINECRAFT_USE_TEMPLATES=true

# Minecraft server path + java
MINECRAFT_SERVER_PATH=C:/MinecraftServer
MINECRAFT_SERVER_JAR=server.jar
MINECRAFT_SERVER_JAVA_ARGS=-Xmx4G -Xms1G
JAVA_PATH=C:/Program Files/Java/jdk-21/bin/java.exe

# Minecraft serveur (pour reset)
MINECRAFT_SERVER_PATH=C:/minecraft-server
MINECRAFT_SERVER_JAR=paper.jar
MINECRAFT_SERVER_JAVA_ARGS=-Xmx4G -Xms1G

# Overlay
OVERLAY_PORT=3001

# Logs
DEBUG=false
```

## 12) Configuration metier `config/config.json`

```json
{
  "cooldown": { "global": 5000, "enabled": true },
  "commands": {
    "tnt": { "twitch": { "count": 1 }, "discord": { "count": 2 } },
    "mob": {
      "twitch": { "count": 1 },
      "discord": { "count": 3 },
      "types": ["creeper", "zombie", "skeleton", "spider", "enderman", "blaze", "witch"],
      "rare": { "warden": 1 }
    },
    "foudre": { "twitch": { "count": 1 }, "discord": { "count": 2 } }
  },
  "reset": {
    "seedMode": "random",
    "fixedSeed": ""
  },
  "miniboss": {
    "enabled": false,
    "interval": 100,
    "types": ["wither", "elder_guardian", "warden"]
  },
  "features": {
    "notifications": true,
    "overlay": true,
    "globalStats": true
  }
}
```

## 13) Configuration Minecraft RCON

Dans `server.properties`:
```properties
enable-rcon=true
rcon.port=25575
rcon.password=motdepasse_rcon
```

## 14) Lancement

```bash
npm install
npm start
```

Mode dev:
```bash
npm run dev
```

## 15) Logs attendus au demarrage

- `Connexion au serveur Minecraft...`
- `Connecte au serveur Minecraft RCON`
- `Bot Twitch connecte`
- `Bot Discord connecte`
- `Overlay OBS disponible sur http://localhost:3001`
- `Tous les bots sont connectes et prets`

## 16) Erreurs frequentes

`ECONNREFUSED` RCON: verifier `enable-rcon`, `rcon.port`, redemarrer serveur
`Authentication failed` RCON: aligner `.env` et `server.properties`
Bot Discord muet: activer Message Content Intent + verifier droits bot
Twitch ne capte pas: verifier `TWITCH_OAUTH_TOKEN`, `TWITCH_CHANNEL`
Reset echoue: verifier `MINECRAFT_SERVER_PATH`, droits fichiers, dossiers template presents

## 17) Dette technique et limites connues

1. Ciblage joueur: utilise `@p`, pas un pseudo configurable
2. Filtrage Discord: `DISCORD_CHANNEL_ID` present en config mais pas encore applique
3. Cooldown en memoire: se reset au redemarrage
4. Resilience: pas de retry/backoff centralise sur les deconnexions
5. Detection evenements: basee sur parsing logs, fragile si format de log change

## 18) Backlog priorise

P0:
1. Overlay OBS (timer + stats temps reel)
2. Reset de map `!resetmap` (moderateurs uniquement)
3. Detection mort Ender Dragon (fin de run)
4. Stats session + persistance globale

P1:
1. Detection mort joueur (compteur morts)
2. Message Twitch fin de run
3. Appliquer filtre `DISCORD_CHANNEL_ID`
4. Validation stricte `.env` au boot
5. Rendre joueur cible configurable (`TARGET_PLAYER`)

P2:
1. Mini-boss tous les 100 commandes
2. Cooldown par viewer
3. Permissions roles Discord / mod Twitch avances
4. Logs structures (info/warn/error)

P3 (future):
1. Changement scene OBS + effet visuel fin de run
   Reference: https://x.com/pixelcinna/status/2044959530677608942

## 19) Definition of Done (v2 stable)

- [ ] `!tnt` provoque 1 TNT (Twitch) / 2 TNT (Discord)
- [ ] `!mob` spawn mob aleatoire parmi liste config
- [ ] `!foudre` respecte multiplicateurs
- [ ] `!resetmap` reserve moderateurs, countdown 3s, reset effectif
- [ ] Timer OBS demarre au spawn, se fige a la mort du Dragon
- [ ] PB affiche seulement si existant
- [ ] Stats session affichees en overlay (TNT, mobs, foudres, morts)
- [ ] Stats globales persistees dans `data/stats-global.json`
- [ ] Message Twitch envoye en fin de run
- [ ] Cooldown global 5s applique toutes sources confondues

## 20) Securite

- Ne jamais commiter `.env`
- Regenerer les tokens en cas de fuite
- Utiliser un mot de passe RCON fort
- Limiter les droits Discord du bot au minimum necessaire
- `!resetmap` strictement reserve aux moderateurs Twitch

## 21) Licence

MIT
