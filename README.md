# PWA POC - Análisis de Procesos en Segundo Plano

Progressive Web App (PWA) para analizar el comportamiento de procesos en segundo plano en diferentes navegadores y sistemas operativos.

## 🎯 Objetivo del Proyecto

Este POC permite analizar y comparar cómo distintos navegadores y sistemas operativos gestionan los procesos en segundo plano de las PWAs, específicamente:

- **Periodic Background Sync API**: Tareas periódicas automáticas
- **Push Notifications**: Notificaciones desde el servidor
- **Service Workers**: Persistencia y actividad en segundo plano
- **Fallback mechanisms**: Alternativas cuando las APIs no están disponibles

## 📊 Qué se Analiza

### 1. **Heartbeat System (Señales de Vida)**
El sistema envía "heartbeats" periódicos al servidor para determinar si los procesos en segundo plano siguen activos:

- **Periodic Background Sync** (Ideal): Se ejecuta cada 5 minutos incluso con la app cerrada
- **Frontend setInterval** (Fallback): Se ejecuta cada 5 minutos solo con la app abierta
- **Push Notifications**: El servidor envía notificaciones cada 30 minutos que despiertan el SW

### 2. **Monitor de Actividad en Segundo Plano**
La app incluye un panel que muestra:
- **Última actividad**: Cuándo fue el último heartbeat recibido
- **Estado del SW**: 
  - ✅ Activo (< 10 min desde último heartbeat)
  - ⚠️ Inactivo (10-30 min)
  - ❌ Probablemente muerto (> 30 min)

### 3. **Diagnóstico PWA**
Panel en tiempo real que verifica:
- 🔒 HTTPS: Contexto seguro requerido
- 📱 Modo: Browser vs PWA instalada
- 🔔 Notificaciones: Permisos otorgados/denegados
- ⚙️ Service Worker: Estado de registro
- ⏰ Periodic Sync: Disponibilidad y permisos

### 4. **Persistencia de Datos**
- `data/background_activity.json`: Log de actividad (se reinicia con el servidor)
- `data/subscriptions.json`: Suscripciones a push notifications
- `data/history.json`: Histórico de eventos (máximo 50)

## 🏗️ Arquitectura

### Backend (FastAPI)
- **WebSocket**: Sincronización en tiempo real del histórico entre dispositivos
- **REST API**: 
  - `/api/heartbeat` (POST): Registra actividad del dispositivo
  - `/api/activity/{fingerprint}` (GET): Consulta última actividad
  - `/api/test` (POST): Endpoint de prueba
  - `/api/subscribe` (POST): Registra suscripción push
  - `/api/send-notification` (POST): Envía notificación manual
- **Background Thread**: Envía notificaciones automáticas cada 30 min

### Frontend (JavaScript)
- **Device Fingerprinting**: Identifica dispositivos de forma única (canvas, WebGL, características del navegador)
- **WebSocket Client**: Recibe actualizaciones en tiempo real
- **Heartbeat Manager**: Elige entre Periodic Sync o setInterval según disponibilidad
- **Activity Monitor**: Consulta y muestra estado del SW cada 60 segundos

### Service Worker
- **Cache Strategy**: Network-first para HTML, cache-first para assets
- **Periodic Background Sync**: Envía heartbeats cada 5 min (solo PWA instalada)
- **Push Event Handler**: Muestra notificaciones y registra actividad
- **Fingerprint Sharing**: Comunica el fingerprint entre frontend y SW

## 📱 Diferencias: Browser vs PWA Instalada

### Modo Browser (No Instalada)
- ❌ Periodic Background Sync no funciona
- ✅ setInterval funciona (solo con app abierta)
- ✅ Push notifications funcionan (si hay permisos)
- ❌ Procesos se detienen al cerrar la pestaña

### Modo PWA (Instalada)
- ✅ Periodic Background Sync funciona (cada 5 min, app cerrada)
- ✅ Push notifications funcionan mejor
- ✅ Procesos pueden sobrevivir al cierre
- ✅ Engagement score mejora con el uso

## 🧪 Cómo Probar

### Caso 1: Modo Browser
1. Abre la app en Chrome (sin instalar)
2. Verifica diagnóstico: "📱 Modo: ⚠️ Browser"
3. Verifica: "⏰ Periodic Sync: ❌ Denegado"
4. Observa en consola: "🔄 Starting frontend heartbeat fallback"
5. El monitor mostrará actividad cada 5 min (solo mientras está abierta)

### Caso 2: PWA Instalada (Android)
1. Abre la app con ngrok HTTPS
2. Click en "Instalar" → Agregar a pantalla de inicio
3. Abre desde el ícono en home screen
4. Verifica diagnóstico: "📱 Modo: ✅ PWA"
5. Verifica: "⏰ Periodic Sync: ✅ Activo (5 min)" (si el navegador lo soporta)
6. Cierra la app completamente
7. Espera 10-15 minutos
8. Reabre y verifica si el último heartbeat fue reciente

### Caso 3: Notificaciones Automáticas
1. Suscríbete a notificaciones (botón "🔔 Suscribirse")
2. Cierra la app
3. Cada X minutos recibirás: "⏰ Prueba de Inactividad"
4. Estas notificaciones también registran actividad

## 🔧 Endpoints del Backend

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/heartbeat` | POST | Registra actividad con fingerprint |
| `/api/activity/{fingerprint}` | GET | Consulta última actividad |
| `/api/test` | POST | Prueba con fingerprint |
| `/api/subscribe` | POST | Registra suscripción push |
| `/api/unsubscribe` | POST | Elimina suscripción |
| `/api/clear-subscriptions` | POST | Borra todas las suscripciones |
| `/api/send-notification` | POST | Envía notificación manual |
| `/api/vapid-public-key` | GET | Obtiene clave pública VAPID |
| `/ws` | WebSocket | Sincronización en tiempo real |

## 📦 Requisitos

- Python 3.8 o superior
- Node.js (para generar las claves VAPID)

## 🚀 Instalación

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
VAPID_EMAIL=mailto:tu_email@ejemplo.com
```

### 4. Ejecutar la aplicación

```powershell
python main.py
```

La aplicación estará disponible en: **http://localhost:8000**

### 5. Probar en móvil con ngrok (recomendado)

Para probar la PWA en tu móvil con HTTPS real (necesario para Service Workers):

1. Instala ngrok: https://ngrok.com/download o `choco install ngrok`

2. En otra terminal, ejecuta:
```powershell
ngrok http 8000
```

3. Ngrok te dará una URL HTTPS pública (ej: `https://abc123.ngrok-free.app`)

4. Abre esa URL en tu móvil

5. Ahora podrás:
   - Instalar la PWA
   - Usar Service Workers
   - Probar notificaciones push
   - Testear Periodic Background Sync

**Ventajas de ngrok:**
- ✅ HTTPS real (certificado válido)
- ✅ Accesible desde cualquier dispositivo
- ✅ No requiere configuración de firewall
- ✅ Funciona con Service Workers sin problemas

## ✅ Características Implementadas

- ✅ PWA instalable
- ✅ Service Worker con caché offline
- ✅ Notificaciones Push Web (manual y automáticas cada 30 min)
- ✅ Periodic Background Sync API (con fallback)
- ✅ Heartbeat system con múltiples estrategias
- ✅ Monitor de actividad en segundo plano
- ✅ Panel de diagnóstico PWA en tiempo real
- ✅ Device fingerprinting único
- ✅ WebSocket para sincronización multi-dispositivo
- ✅ Interfaz responsive con gradientes
- ✅ API REST con FastAPI
- ✅ Logs detallados en consola
- ✅ Eruda DevTools para debugging móvil

## 🔍 Debugging

### Consola del Navegador
- Prefijo **"💓 Frontend:"** = Heartbeats desde el frontend
- Prefijo **"💓 SW:"** = Heartbeats desde el Service Worker
- Prefijo **"⏰ SW:"** = Periodic sync events

### Terminal del Servidor
- **"💓 Heartbeat from..."** = Recepción de heartbeat
- **"📬 Send notification endpoint called"** = Envío de notificación
- **"⏰ Sending inactivity notifications"** = Notificaciones automáticas cada 30 min

### Eruda DevTools (Móvil)
- Botón flotante en esquina inferior derecha
- Console: Ver todos los logs
- Network: Inspeccionar requests
- Elements: Inspeccionar DOM

## ⚠️ Notas Importantes

### Notificaciones en Windows
Asegúrate de que las notificaciones de Chrome estén habilitadas:
1. Configuración de Windows → Sistema → Notificaciones
2. Busca "Google Chrome" en la lista
3. Activa las notificaciones para Chrome

### Periodic Background Sync
Esta API tiene limitaciones:
- Solo funciona en **Chrome/Edge Android** con PWA instalada
- Requiere "engagement" del usuario (uso frecuente)
- El intervalo mínimo es una sugerencia, no una garantía
- Safari/Firefox no lo soportan (usa el fallback automático)

### Device Fingerprinting
El fingerprint incluye:
- User Agent, idioma, plataforma
- Resolución y características de pantalla
- Canvas y WebGL fingerprinting
- Timezone y ubicación
- Modo PWA vs Browser
- Se almacena en localStorage para persistencia

## 📈 Resultados Esperados

Dependiendo del navegador/SO verás diferentes comportamientos:

| Navegador | SO | Periodic Sync | setInterval | Push | Supervivencia |
|-----------|----|--------------:|------------:|-----:|--------------:|
| Chrome | Android PWA | ✅ 5 min | ✅ | ✅ | Alta |
| Chrome | Android Browser | ❌ | ✅ | ✅ | Media |
| Safari | iOS PWA | ❌ | ✅ | ⚠️ | Baja |
| Chrome | Desktop | ❌ | ✅ | ✅ | Media |

## 🤝 Contribuciones

Este es un proyecto de análisis y experimentación. Pull requests y issues son bienvenidos.

## 📄 Licencia

MIT
