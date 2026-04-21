require('dotenv').config();
const minecraftBot = require('./bots/minecraft');
const twitchBot = require('./bots/twitch');
const discordBot = require('./bots/discord');
const config = require('./config');

async function main() {
  console.log('🚀 Démarrage du Minecraft Twitch/Discord Controller...\n');

  // Vérifier la configuration
  if (!config.twitch.oauthToken || !config.discord.token || !config.rcon.password) {
    console.error('❌ ERREUR: Veuillez remplir votre fichier .env');
    console.error('Copiez .env.example vers .env et remplissez les variables');
    process.exit(1);
  }

  try {
    // 1. Connecter au serveur Minecraft
    console.log('📡 Connexion au serveur Minecraft...');
    const minecraftConnected = await minecraftBot.connect();
    if (!minecraftConnected) {
      console.error('❌ Impossible de se connecter à Minecraft RCON');
      process.exit(1);
    }

    // 2. Initialiser et connecter les bots Twitch et Discord
    console.log('\n📡 Connexion aux services...');
    twitchBot.init();
    await twitchBot.connect();

    discordBot.init();
    await discordBot.connect();

    console.log('\n✅ Tous les bots sont connectés et prêts !');
    console.log('📊 Cooldown global: ' + config.cooldown.global + 'ms');
    console.log('\n🎮 En attente de commandes...\n');

  } catch (error) {
    console.error('❌ Erreur lors du démarrage:', error);
    process.exit(1);
  }
}

// Gestion des arrêts propres
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Arrêt du bot...');
  await twitchBot.disconnect();
  await discordBot.disconnect();
  await minecraftBot.disconnect();
  process.exit(0);
});

main();
