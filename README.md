# PWA POC - Background Process Analysis

Progressive Web App to analyze background process behavior across different browsers and operating systems.

## 📦 Requirements

- Python 3.8+

## 🚀 Installation

```powershell
# Clone and navigate
git clone https://github.com/barrrettt/pwa_poc.git
cd pwa_poc

# Create virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Generate VAPID keys (Option 1: with Node.js)
npx web-push generate-vapid-keys

# Or Option 2: Python only
python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print('Public:', v.public_key.saveKey('public').decode()); print('Private:', v.private_key.saveKey('private').decode())"
```

Create `.env` file with your keys:

```
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_EMAIL=mailto:your_email@example.com
```

## 🎮 Usage

```powershell
python main.py
```

Open **http://localhost:8000**

### Test on Mobile (HTTPS required)

Ngrok is the easy way:

```powershell
ngrok http 8000
```

Open the ngrok HTTPS URL on your mobile device.

## ✅ Features

- PWA with Service Worker
- Periodic Background Sync (5 min)
- Push Notifications (hourly)
- Background activity monitoring
