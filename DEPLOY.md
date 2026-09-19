# 🚀 Guia de Deploy RoboZap: Vercel (Frontend) + Render/Railway (Backend)

Este projeto é estruturado em duas partes:
1. **Frontend (Next.js):** Hospedado na **Vercel** (rápido, CDN global, 100% gratuito).
2. **Backend (Node.js + Baileys WhatsApp):** Hospedado em um serviço com suporte a WebSocket persistente e disco (ex: **Render**, **Railway** ou **VPS**).

---

## 1. Deploy do Frontend na Vercel

1. Acesse [vercel.com](https://vercel.com) e conecte sua conta GitHub.
2. Clique em **Add New... -> Project** e selecione o repositório obozap.
3. Na tela de configuração:
   - **Framework Preset:** Next.js
   - **Root Directory:** Clique em **Edit** e selecione a pasta rontend.
4. Em **Environment Variables**, adicione:
   - NEXT_PUBLIC_API_URL: URL do seu backend (ex: https://robozap-backend.onrender.com ou https://backend-production.up.railway.app)
5. Clique em **Deploy**! 🚀

---

## 2. Deploy do Backend (Render ou Railway)

### Opção A: Render (Web Service)
1. Crie um novo **Web Service** no Render conectando o repositório obozap.
2. Configure:
   - **Root Directory:** ackend
   - **Environment:** Node
   - **Build Command:** 
pm install && npm run build
   - **Start Command:** 
pm start
3. Em **Environment Variables**:
   - NODE_ENV: production
   - PORT: 3001
   - FRONTEND_URL: URL do seu app na Vercel (ex: https://robozap.vercel.app)
4. Em **Disks** (Plano Starter):
   - Adicione um disco persistente montado em /app/sessions para manter o QR Code conectado mesmo após reinicializações.

### Opção B: Railway
1. Crie um novo projeto no Railway a partir do GitHub.
2. Defina o Root Directory como ackend.
3. Adicione um **Volume** montado em /app/sessions e /app/prisma.
4. Configure as variáveis de ambiente e faça o deploy.
