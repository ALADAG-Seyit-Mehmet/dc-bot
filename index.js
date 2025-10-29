import './server.js'; // Web sunucusunu başlatan kodu içeri aktar
import { Client, GatewayIntentBits, Partials, PermissionsBitField, ChannelType } from 'discord.js';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { config } from 'dotenv';
config(); // .env dosyasını yükle

// --- BOT İZİNLERİ (INTENTS) ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,      // Yeni üyeler için
    GatewayIntentBits.GuildMessages,     // Mesajları almak için
    GatewayIntentBits.MessageContent,    // Mesaj içeriğini OKUMAK için (En önemlisi)
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,    // DM göndermek için
  ],
  partials: [Partials.Channel, Partials.Message], // DM için
});

// --- GOOGLE GEMINI KURULUMU ---
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// Moderasyon için güvenlik ayarları
const moderationSafetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// Kelime oyunu için kullanılan kelimelerin hafızası
const kelimeOyunuData = {
  sonHarf: '',
  kullanilanKelimeler: new Set(),
};

// --- BOT AÇILIŞ OLAYI ---
client.once('ready', () => {
  console.log(`Bot ${client.user.tag} olarak giriş yaptı!`);
  client.user.setActivity("Sunucuyu izliyor...");
});

// --- YENİ ÜYE KARŞILAMA ---
client.on('guildMemberAdd', member => {
  const channel = member.guild.channels.cache.find(ch => ch.name === 'hoşgeldiniz'); // 'hoşgeldiniz' kanalını bul
  if (!channel) return;
  channel.send(`Sunucuya hoş geldin, ${member}! Kuralları okumayı unutma.`);
});

// --- MESAJ ALGILAMA (MODERASYON VE KELİME OYUNU) ---
client.on('messageCreate', async message => {
  if (message.author.bot) return; // Bot mesajlarını es geç

  // --- 1. KELİME OYUNU ---
  if (message.channel.name === 'kelime-oyunu') {
    const kelime = message.content.trim().toLowerCase();

    // Geçersiz giriş kontrolü
    if (kelime.includes(' ') || kelime.length < 2) return;

    // Kelime daha önce kullanılmış mı?
    if (kelimeOyunuData.kullanilanKelimeler.has(kelime)) {
      message.reply("Bu kelime daha önce kullanıldı!");
      return;
    }

    // Sıra kontrolü
    if (kelimeOyunuData.sonHarf && !kelime.startsWith(kelimeOyunuData.sonHarf)) {
      message.reply(`Kelime **${kelimeOyunuData.sonHarf}** harfi ile başlamalı!`);
      return;
    }

    // Kelimeyi ekle ve son harfi güncelle
    kelimeOyunuData.kullanilanKelimeler.add(kelime);
    const yeniSonHarf = kelime.charAt(kelime.length - 1);
    kelimeOyunuData.sonHarf = yeniSonHarf;

    // AI'dan yeni kelime iste
    try {
      const prompt = `Bana '${yeniSonHarf}' harfi ile başlayan ve daha önce kullanılmamış (örnek: ${Array.from(kelimeOyunuData.kullanilanKelimeler).slice(-5).join(', ')}) Türkçe bir kelime söyle. Sadece kelimeyi yaz.`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let aiKelime = response.text().trim().toLowerCase().split(' ')[0]; // Sadece ilk kelimeyi al, temizle

      // AI'nın kelimesini de ekle
      kelimeOyunuData.kullanilanKelimeler.add(aiKelime);
      kelimeOyunuData.sonHarf = aiKelime.charAt(aiKelime.length - 1);

      await message.channel.send(`**${aiKelime}** (Sıradaki harf: **${kelimeOyunuData.sonHarf}**)`);

    } catch (e) {
      console.error("Kelime oyunu AI hatası:", e);
      message.channel.send("Şu an kelime bulmakta zorlanıyorum, sıra sende.");
    }
    return; // Moderasyona devam etmesin
  }

  // --- 2. AI DESTEKLİ MODERASYON ---
  try {
    const chat = model.startChat({ safetySettings: moderationSafetySettings, history: [] });
    const result = await chat.sendMessage(message.content);
    const response = result.response;

    // Eğer 'finishReason' BLOCKED değilse, mesaj temizdir
    if (response.promptFeedback && response.promptFeedback.blockReason) {
      const blockReason = response.promptFeedback.blockReason; //örn: 'SAFETY'
      const blockedCategory = response.promptFeedback.safetyRatings.find(r => r.blocked)?.category; //örn: 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
      
      console.log(`[MODERASYON] Mesaj engellendi: ${blockReason} - ${blockedCategory}`);

      // 1. Mesajı sil
      await message.delete();

      // 2. Kullanıcıya DM gönder
      try {
        await message.author.send(`Merhaba! Az önce gönderdiğin mesaj, sunucu kurallarını (Yasaklı Kategori: ${blockedCategory}) ihlal ettiği için otomatik olarak silindi. Lütfen kurallara dikkat edelim.`);
      } catch (dmError) {
        console.log("Kullanıcıya DM gönderilemedi (DM'leri kapalı olabilir).");
      }

      // 3. Log kanalına bildir
      const logChannel = message.guild.channels.cache.find(ch => ch.name === 'moderasyon-kayıtları');
      if (logChannel) {
        logChannel.send(`**Otomatik Moderasyon**\n**Kullanıcı:** ${message.author.tag}\n**Sebep:** ${blockedCategory}\n**Silinen Mesaj:** ||${message.content}||`);
      }
    }
    // Siyaset ve Spam gibi konuları Gemini'nin safety-settings'i yakalamazsa,
    // Ekstra bir AI sorgusu ile 'Bu mesaj siyaset içeriyor mu?' diye kontrol edilebilir.
    // Şimdilik sadece temel güvenlik ayarları devrede.

  } catch (e) {
    console.error("Moderasyon hatası:", e);
    // Muhtemelen API hatası, şimdilik görmezden gel
  }
});


// --- SLASH KOMUTU YÖNETİMİ ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options } = interaction;

  // Yetki kontrolü (sadece Moderatör rolü olanlar)
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    return interaction.reply({ content: 'Bu komutu kullanmak için yetkin yok!', ephemeral: true });
  }

  // --- SİL KOMUTU ---
  if (commandName === 'sil') {
    const sayı = options.getInteger('sayı');
    if (sayı < 1 || sayı > 100) {
      return interaction.reply({ content: '1 ile 100 arasında bir sayı girmelisin.', ephemeral: true });
    }
    await interaction.channel.bulkDelete(sayı, true);
    return interaction.reply({ content: `${sayı} adet mesaj silindi.`, ephemeral: true });
  }

  // --- AT KOMUTU ---
  if (commandName === 'at') {
    const kullanıcı = options.getUser('kullanıcı');
    const sebep = options.getString('sebep') || 'Sebep belirtilmedi.';
    const member = interaction.guild.members.cache.get(kullanıcı.id);
    if (!member) return interaction.reply({ content: 'Kullanıcı bulunamadı.', ephemeral: true });

    try {
      await member.kick(sebep);
      return interaction.reply({ content: `${kullanıcı.tag} sunucudan atıldı. Sebep: ${sebep}`, ephemeral: false });
    } catch (e) {
      return interaction.reply({ content: 'Bu kullanıcıyı atma yetkim yok.', ephemeral: true });
    }
  }

  // --- YASAKLA KOMUTU ---
  if (commandName === 'yasakla') {
    const kullanıcı = options.getUser('kullanıcı');
    const sebep = options.getString('sebep') || 'Sebep belirtilmedi.';
    const member = interaction.guild.members.cache.get(kullanıcı.id);
    if (!member) return interaction.reply({ content: 'Kullanıcı bulunamadı.', ephemeral: true });

    try {
      await member.ban({ reason: sebep });
      return interaction.reply({ content: `${kullanıcı.tag} sunucudan yasaklandı. Sebep: ${sebep}`, ephemeral: false });
    } catch (e) {
      return interaction.reply({ content: 'Bu kullanıcıyı yasaklama yetkim yok.', ephemeral: true });
    }
  }
});

// --- BOTA GİRİŞ YAP ---
client.login(process.env.DISCORD_BOT_TOKEN);
