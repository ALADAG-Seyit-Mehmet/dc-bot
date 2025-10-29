import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
config(); // .env dosyasını yükle

const commands = [
  {
    name: 'sil',
    description: 'Belirtilen sayıda mesajı siler.',
    options: [
      {
        name: 'sayı',
        type: 4, // 4 = INTEGER
        description: 'Silinecek mesaj sayısı (1-100)',
        required: true,
      },
    ],
  },
  {
    name: 'at',
    description: 'Bir kullanıcıyı sunucudan atar.',
    options: [
      {
        name: 'kullanıcı',
        type: 6, // 6 = USER
        description: 'Atılacak kullanıcı',
        required: true,
      },
      {
        name: 'sebep',
        type: 3, // 3 = STRING
        description: 'Atılma sebebi',
        required: false,
      },
    ],
  },
  {
    name: 'yasakla',
    description: 'Bir kullanıcıyı sunucudan yasaklar.',
    options: [
      {
        name: 'kullanıcı',
        type: 6, // 6 = USER
        description: 'Yasaklanacak kullanıcı',
        required: true,
      },
      {
        name: 'sebep',
        type: 3, // 3 = STRING
        description: 'Yasaklanma sebebi',
        required: false,
      },
    ],
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('Slash komutları kaydediliyor...');

    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), // CLIENT_ID'nizi .env'ye ekleyin!
      { body: commands },
    );

    console.log('Slash komutları başarıyla kaydedildi.');
  } catch (error) {
    console.error(error);
  }
})();
