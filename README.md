# 🎭 Mafiya O'yini — O'zbek tilida

Professional Mafia o'yini — Socket.io asosida real-vaqt multiplayer o'yin.

## 🚀 Imkoniyatlar

- ✅ Real-vaqt multiplayer (Socket.io)
- ✅ 4 ta rank tizimi (VIP, PRO, MAX, ULTIMATE)
- ✅ Admin panel (`/admin`)
- ✅ Do'stlar tizimi
- ✅ Online xonalar
- ✅ To'liq o'yin logikasi (Mafiya, Detektiv, Doktor, Don)
- ✅ Ovoz berish tizimi
- ✅ Kecha/Kun fazalari
- ✅ O'zbek tilida

## 📦 Local o'rnatish

```bash
npm install
npm start
# http://localhost:3000
# Admin: http://localhost:3000/admin (parol: admin123)
```

## 🌐 GitHub + Render.com ga joylash

### 1. GitHub

```bash
git init
git add .
git commit -m "Mafia o'yini - birinchi versiya"
git branch -M main
git remote add origin https://github.com/SIZNING_USERNAME/mafia-game.git
git push -u origin main
```

### 2. Render.com

1. [render.com](https://render.com) ga kiring (GitHub bilan)
2. "New +" → "Web Service"
3. GitHub reponi tanlang
4. Sozlamalar:
   - **Name**: `mafia-game-uz`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Environment Variables:
   - `ADMIN_PASSWORD` = (xohlagan parol)
   - `JWT_SECRET` = (uzun tasodifiy satr)
6. "Create Web Service" bosing

Bir necha daqiqadan so'ng `https://mafia-game-uz.onrender.com` da ishlaydi!

## 🔐 Admin Panel

- URL: `https://sizning-url.onrender.com/admin`
- Default parol: `admin123`
- **Render.com da ADMIN_PASSWORD ni albatta o'zgartiring!**

## 👑 Rank Narxlari

| Rank | Narx | Davr |
|------|------|------|
| ⭐ VIP | 5,000 so'm | Oylik |
| 💎 PRO | 15,000 so'm | Oylik |
| 🔥 MAX | 35,000 so'm | Oylik |
| 👑 ULTIMATE | 75,000 so'm | Oylik |

## 🎮 O'yin Rollari

- **👤 Fuqaro** — Mafiachini toping
- **🔫 Mafiya** — Fuqarolarni yo'q qiling
- **💀 Don** — Mafiya boshlig'i
- **🔍 Detektiv** — Kechasi birini tekshiring
- **💊 Doktor** — Kechasi birini davolang

## 🛠️ Texnologiyalar

- **Backend**: Node.js, Express, Socket.io
- **Auth**: JWT + bcrypt
- **Frontend**: HTML5, CSS3, Vanilla JS
- **Deploy**: Render.com
