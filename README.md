# Minecraft Tchat Controller

Bridge Twitch + Discord -> actions Minecraft Java (vanilla) via RCON.

Ce README est volontairement ecrit comme un document de passation: un autre agent doit pouvoir reprendre le developpement sans contexte externe.

## 1) Resume projet

Objectif:
- Ecouter les commandes du chat Twitch (prefixe `!`)
- Ecouter les commandes du serveur Discord (prefixe `!`)
- Declencher des commandes Minecraft via RCON sur un serveur local
- Appliquer un multiplicateur plus fort cote Discord
- Appliquer un cooldown global (5 secondes)

Contexte utilisateur valide:
- Minecraft Java vanilla
- Pas de second compte Minecraft pour un bot in-game
- Choix d'architecture: RCON (pas de mineflayer)
- Serveur Discord de test deja disponible
- Twitch OAuth deja disponible

## 2) Etat actuel du code

Implante:
- Bot Twitch via `tmi.js`
- Bot Discord via `discord.js`
- Client RCON via `minecraft-server-util`
- Routeur de commandes pour `!tnt`, `!mob`, `!foudre`
- Cooldown global en memoire
- Notification Minecraft via `/say`

Non implante (important):
- Tests automatises
- Validation stricte des variables `.env`
- Restriction par `DISCORD_CHANNEL_ID`
- Ciblage d'un joueur configurable (actuellement `@p`)
- Reconnexion automatique robuste en cas de deconnexion reseau

## 3) Architecture

```text
Twitch chat ----> src/bots/twitch.js ----\
                                                               > src/bots/minecraft.js -> RCON -> Minecraft server
Discord chat ---> src/bots/discord.js ---/

Config runtime: src/config.js
Config metier : config/config.json
Entry point   : src/index.js
```

Fichiers principaux:
- `src/index.js`: bootstrap, verifications minimales, demarrage des 3 clients
- `src/config.js`: charge `config/config.json` + fusion `.env`
- `src/bots/twitch.js`: parse des messages Twitch et dispatch des commandes
- `src/bots/discord.js`: parse des messages Discord et dispatch des commandes
- `src/bots/minecraft.js`: connexion RCON, cooldown global, execution des actions Minecraft
- `config/config.json`: multiplicateurs Twitch/Discord et options metier

## 4) Commandes metier v1

| Commande | Twitch | Discord | Implementation |
|---|---:|---:|---|
| `!tnt` | 1 | 2 | summon TNT au-dessus du joueur cible |
| `!mob` | 1 | 3 | summon mob aleatoire `creeper/zombie/skeleton` |
| `!foudre` | 1 | 2 | summon `lightning_bolt` sur le joueur cible |

Cooldown:
- Global: 5000 ms
- Comportement: toute commande recue pendant le cooldown est ignoree

## 5) Prerequis

- Node.js 18+ recommande
- Serveur Minecraft Java (local) avec RCON active
- Credentials Twitch bot (username + oauth)
- Token bot Discord

## 6) Installation

```bash
npm install
```

## 7) Configuration `.env`

Le projet lit automatiquement `.env` via `dotenv`.

Exemple:

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

# Logs
DEBUG=false
```

## 8) Configuration metier `config/config.json`

Points principaux:
- `cooldown.global`: delai global en millisecondes
- `commands.<nom>.twitch.count`: intensite Twitch
- `commands.<nom>.discord.count`: intensite Discord
- `features.notifications`: active `/say` dans Minecraft

Extrait courant:

```json
{
   "cooldown": { "global": 5000, "enabled": true },
   "commands": {
      "tnt": { "twitch": { "count": 1 }, "discord": { "count": 2 } },
      "mob": {
         "twitch": { "count": 1, "types": ["creeper", "zombie", "skeleton"] },
         "discord": { "count": 3, "types": ["creeper", "zombie", "skeleton"] }
      },
      "foudre": { "twitch": { "count": 1 }, "discord": { "count": 2 } }
   }
}
```

## 9) Configuration Minecraft RCON

Dans `server.properties`:

```properties
enable-rcon=true
rcon.port=25575
rcon.password=motdepasse_rcon
```

Puis redemarrer le serveur Minecraft.

Notes:
- Le mot de passe doit correspondre a `MINECRAFT_RCON_PASSWORD`
- Le bot envoie des commandes serveur, il ne se connecte pas comme joueur

## 10) Lancement

Mode normal:

```bash
npm start
```

Mode dev (watch):

```bash
npm run dev
```

## 11) Logs attendus au demarrage

Sequence nominale:
- `Connexion au serveur Minecraft...`
- `Connecte au serveur Minecraft RCON`
- `Bot Twitch connecte`
- `Bot Discord connecte`
- `Tous les bots sont connectes et prets`

## 12) Erreurs frequentes et correction

`ECONNREFUSED` cote RCON:
- Cause: serveur Minecraft arrete, mauvais port, RCON desactive
- Fix: verifier `enable-rcon`, `rcon.port`, redemarrer serveur

`Authentication failed` RCON:
- Cause: mauvais `MINECRAFT_RCON_PASSWORD`
- Fix: aligner `.env` et `server.properties`

Bot Discord connecte mais n'agit pas:
- Cause probable: bot sans intent Message Content ou mauvais salon
- Fix: activer Message Content Intent dans le portal Discord + verifier droits du bot

Twitch ne capte pas les commandes:
- Cause probable: token OAuth invalide / channel incorrect
- Fix: verifier `TWITCH_OAUTH_TOKEN`, `TWITCH_CHANNEL`, username bot

## 13) Dette technique et limites connues

1. Ciblage joueur
- Le code utilise `@p`, pas un pseudo configurable.
- Effet: si plusieurs joueurs sont proches, la cible peut etre ambiguë.

2. Filtrage Discord
- `DISCORD_CHANNEL_ID` est present en config mais pas encore applique.
- Effet: tout salon ou le bot lit les messages peut declencher des commandes.

3. Cooldown en memoire
- Le cooldown se reset au redemarrage.
- Pas de stats, pas de queue, pas de feedback explicite cote Twitch/Discord.

4. Resilience
- Pas de strategie de retry/backoff centralisee sur les deconnexions.

## 14) Backlog priorise (pour le prochain agent)

P0 (important avant usage intensif):
1. Appliquer le filtre `DISCORD_CHANNEL_ID` dans `src/bots/discord.js`
2. Ajouter validation stricte de `.env` au boot (valeurs manquantes + format)
3. Rendre le joueur cible configurable (`TARGET_PLAYER`) au lieu de `@p`

P1:
1. Ajouter tests unitaires du routeur de commandes
2. Ajouter logs structures (niveau info/warn/error)
3. Ajouter message de retour (commande ignoree pour cooldown)

P2:
1. Ajouter commandes dynamiques depuis `config/config.json`
2. Ajouter permissions (roles Discord, mod Twitch)
3. Ajouter anti-spam par utilisateur en plus du cooldown global

## 15) Definition of Done (v1 stable)

Checklist reprise:
- [ ] Twitch `!tnt` provoque 1 TNT
- [ ] Discord `!tnt` provoque 2 TNT
- [ ] `!mob` respecte les multiplicateurs Twitch/Discord
- [ ] `!foudre` respecte les multiplicateurs Twitch/Discord
- [ ] Cooldown global 5s applique entre toutes sources confondues
- [ ] Notification `/say` affiche la source
- [ ] Le bot redemarre proprement sans fuite de connexion

## 16) Securite

- Ne jamais commiter `.env`
- Regenerer les tokens en cas de fuite
- Utiliser un mot de passe RCON fort
- Limiter les droits Discord du bot au minimum necessaire

## 17) Licence

MIT
