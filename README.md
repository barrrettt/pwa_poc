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

### 4. Ejecutar la aplicación

```powershell
python main.py
```

La aplicación estará disponible en: **http://localhost:8000**

### 5. Probar en móvil con ngrok (recomendado)

Para probar la PWA en tu móvil con HTTPS real (necesario para Service Workers):

1. Instala ngrok: https://ngrok.com/download

2. En otra terminal, ejecuta:
```powershell
ngrok http 8000
```

3. Ngrok te dará una URL HTTPS pública (ej: `https://abc123.ngrok.io`)

4. Abre esa URL en tu móvil

5. Ahora podrás:
   - Instalar la PWA
   - Usar Service Workers
   - Probar notificaciones push

**Ventajas de ngrok:**
- ✅ HTTPS real (certificado válido)
- ✅ Accesible desde cualquier dispositivo
- ✅ No requiere configuración de firewall
- ✅ Funciona con Service Workers sin problemas

## Características

- ✅ PWA instalable
- ✅ Service Worker con caché offline
- ✅ Notificaciones Push Web
- ✅ Interfaz responsive con gradiente
- ✅ API REST con FastAPI
- ✅ Desarrollo con ngrok para HTTPS real

## Importante

**Notificaciones en Windows**: Asegúrate de que las notificaciones de Chrome estén habilitadas en la configuración de Windows:

1. Configuración de Windows → Sistema → Notificaciones
2. Busca "Google Chrome" en la lista
3. Activa las notificaciones para Chrome
