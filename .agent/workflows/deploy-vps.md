---
description: Como implantar a aplicação Next.js em um VPS com HTTPS (SSL)
---

# Guia de Implantação em Produção (VPS + HTTPS)

Este guia descreve os passos para colocar a aplicação **Cooperação Digital** em produção em um servidor Linux (Ubuntu/Debian) usando Nginx como proxy reverso e Let's Encrypt para SSL.

## 1. Preparação do Servidor

No seu VPS, instale as dependências básicas:

```bash
# Atualizar o sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js (v18+)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar Nginx e Certbot
sudo apt install -y nginx certbot python3-certbot-nginx
```

## 2. Configuração do Projeto

Clone o repositório e instale as dependências:

```bash
git clone <URL_DO_REPOSITORIO> app
cd app
npm install
```

Crie o arquivo `.env.local` com as credenciais do Firebase e outras configurações:

```bash
nano .env.local
```

> [!IMPORTANT]
> Certifique-se de incluir todas as variáveis `NEXT_PUBLIC_FIREBASE_*` e o `FIREBASE_PRIVATE_KEY`.

## 3. Build e Gerenciamento de Processos (PM2)

Instale o PM2 para manter a aplicação rodando:

```bash
sudo npm install -g pm2

# Build da aplicação
npm run build

# Iniciar com PM2
pm2 start npm --name "coopedu-app" -- start

# Garantir que inicie no boot
pm2 startup
pm2 save
```

## 4. Configuração do Nginx (HTTPS)

Crie uma configuração para o seu domínio:

```bash
sudo nano /etc/nginx/sites-available/coopedu
```

Cole o conteúdo abaixo (substitua `seu-dominio.com.br`):

```nginx
server {
    listen 80;
    server_name seu-dominio.com.br;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Ative o site e reinicie o Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/coopedu /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 5. Ativar SSL (HTTPS)

Execute o Certbot para gerar os certificados:

```bash
sudo certbot --nginx -d seu-dominio.com.br
```

Siga as instruções para redirecionar todo o tráfego para HTTPS.

---
**A aplicação agora está segura e online!**
