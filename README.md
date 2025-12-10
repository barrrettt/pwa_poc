# PWA POC

Progressive Web App proof-of-concept con FastAPI y Web Push Notifications.

## Requisitos

- Python 3.8 o superior
- Node.js (para generar las claves VAPID)

## Pasos para probar la app

### 1. Crear y activar entorno virtual

```powershell
# Crear entorno virtual
python -m venv venv

# Activar entorno virtual
.\venv\Scripts\Activate.ps1
```

### 2. Instalar dependencias

```powershell
pip install -r requirements.txt
```

### 3. Generar claves VAPID para notificaciones

Las claves VAPID son necesarias para el sistema de notificaciones push:

```powershell
npx web-push generate-vapid-keys
```

Crea un archivo `.env` en la raíz del proyecto con las claves generadas:

```
VAPID_PUBLIC_KEY=tu_clave_publica_aqui
VAPID_PRIVATE_KEY=tu_clave_privada_aqui
```

### 4. Certificados HTTPS (opcional)

Los certificados ya están incluidos en el repositorio en la carpeta `cert/`. Son válidos para desarrollo local hasta marzo de 2028.

Si necesitas generar nuevos certificados:

```powershell
# Instalar mkcert
choco install mkcert

# Instalar la CA local
mkcert -install

# Generar certificados
mkcert localhost 127.0.0.1 ::1

# Crear carpeta cert y mover archivos
New-Item -ItemType Directory -Path cert
Move-Item localhost+2.pem cert/
Move-Item localhost+2-key.pem cert/
```

### 5. Ejecutar la aplicación

```powershell
python main.py
```

La aplicación estará disponible en: **https://localhost:8000**

## Características

- ✅ PWA instalable
- ✅ Service Worker con caché offline
- ✅ Notificaciones Push Web
- ✅ Interfaz responsive con gradiente
- ✅ API REST con FastAPI
- ✅ HTTPS para desarrollo local

## Importante

**Notificaciones en Windows**: Asegúrate de que las notificaciones de Chrome estén habilitadas en la configuración de Windows:

1. Configuración de Windows → Sistema → Notificaciones
2. Busca "Google Chrome" en la lista
3. Activa las notificaciones para Chrome
