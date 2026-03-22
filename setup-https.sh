#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  CyberBuddy HTTPS Setup Script
#  Run this on your AWS EC2 server to enable HTTPS
# ═══════════════════════════════════════════════════════════

echo "Setting up HTTPS for CyberBuddy..."

# 1. Install Nginx
sudo apt update -y
sudo apt install -y nginx certbot python3-certbot-nginx

# 2. Create Nginx config
sudo tee /etc/nginx/sites-available/cyberbuddy << 'NGINX'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
NGINX

# 3. Enable site
sudo ln -sf /etc/nginx/sites-available/cyberbuddy /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
sudo systemctl enable nginx

echo ""
echo "✅ Nginx is running!"
echo ""
echo "Next steps:"
echo "1. Point your domain (cyberbuddy.rw) to IP: $(curl -s ifconfig.me)"
echo "2. Wait for DNS to propagate (5-30 mins)"
echo "3. Run: sudo certbot --nginx -d cyberbuddy.rw -d www.cyberbuddy.rw"
echo "4. Update APP_URL in .env to: https://cyberbuddy.rw"
echo "5. Run: pm2 restart cyberbuddy"
echo ""
echo "For now your app runs at: http://$(curl -s ifconfig.me)"
