# 🤖 RoboZap — WhatsApp Automation SaaS

Sistema de automação de WhatsApp com QR Code, upload de planilhas XLSX/CSV, fila de disparos com delay humanizado anti-spam e dashboard em tempo real.

## ✨ Features

- 📱 **Conexão via QR Code** — sem necessidade de API oficial
- 📊 **Upload de planilhas** XLSX, XLS e CSV com drag-and-drop
- 🔄 **Delay humanizado** — 15 a 45 segundos aleatórios entre mensagens + simulação de "digitando..."
- ⚡ **Dashboard em tempo real** via Socket.io
- ⏸️ **Pausar/Retomar/Cancelar** campanhas a qualquer momento
- 🎨 **Dark Mode** com design minimalista (Heurísticas de Nielsen)
- 📝 **Templates de mensagens** com variáveis personalizáveis (`{{nome}}`, `{{empresa}}`)
- 📈 **Histórico** completo de campanhas com relatório de sucesso/falha
- 🔔 **Alertas** quando WhatsApp desconectar durante disparo

## 🏗️ Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + TypeScript + Express |
| WhatsApp | Baileys v6 |
| Fila | BullMQ + Redis |
| Banco | Prisma + SQLite (dev) / PostgreSQL (prod) |
| Frontend | Next.js 14 + TailwindCSS + shadcn/ui |
| Realtime | Socket.io |
| Planilhas | SheetJS (xlsx) |

## 🚀 Setup Rápido (Desenvolvimento)

### Pré-requisitos

- Node.js 20+
- Redis (Docker recomendado)

### 1. Iniciar Redis

```bash
docker run -d --name robozap-redis -p 6379:6379 redis:7-alpine
```

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run dev
```

O backend estará disponível em: http://localhost:3001

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

O frontend estará disponível em: http://localhost:3000

### 4. Docker Compose (Produção)

```bash
docker-compose up -d
```

## 📋 Fluxo de Uso

1. **Conectar Aparelho** → Escaneie o QR Code no celular
2. **Nova Campanha** → Faça upload da planilha com colunas `telefone` e `nome`
3. **Escrever Mensagem** → Use `{{nome}}`, `{{empresa}}` para personalização
4. **Configurar Delay** → Padrão: 15–45 segundos (anti-ban)
5. **Disparar** → Acompanhe em tempo real no dashboard

## 📊 Formato da Planilha

| telefone | nome | empresa |
|---|---|---|
| 11999999999 | João Silva | ACME Corp |
| 21988887777 | Maria Santos | Tech Inc |

**Colunas aceitas para telefone:** `telefone`, `phone`, `celular`, `numero`, `whatsapp`, `tel`

## ⚙️ Variáveis de Ambiente

### Backend (.env)
```
PORT=3001
FRONTEND_URL=http://localhost:3000
REDIS_URL=redis://localhost:6379
DATABASE_URL="file:./dev.db"
SESSION_DIR=./sessions
UPLOAD_DIR=./uploads
NODE_ENV=development
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

## 🛡️ Anti-Ban Features

- Delay aleatório entre 15–45 segundos entre mensagens
- Simulação de "digitando..." (typing indicator)
- Concorrência limitada: 1 mensagem por vez
- Retry automático em caso de falha temporária
- Alertas quando WhatsApp desconectar com reconexão automática

## 📁 Estrutura

```
robozap/
├── backend/              # Node.js + TypeScript API
│   ├── src/
│   │   ├── whatsapp/     # Baileys client
│   │   ├── queue/        # BullMQ + Worker
│   │   ├── routes/       # Express routes
│   │   ├── services/     # Business logic
│   │   └── socket/       # Socket.io
│   └── prisma/           # DB schema
├── frontend/             # Next.js 14
│   ├── app/              # Pages (App Router)
│   ├── components/       # UI components
│   ├── hooks/            # React hooks
│   └── lib/              # Utilities
└── docker-compose.yml    # Production stack
```

## 📝 Licença

MIT
