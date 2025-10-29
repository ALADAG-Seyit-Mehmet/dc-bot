import express from 'express';
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Bot ayakta ve çalışıyor!');
});

app.listen(port, () => {
  console.log(`[Sunucu] Web sunucusu ${port} portunda başlatıldı.`);
});