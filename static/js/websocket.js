// WebSocket Management Module
export let ws = null;

export function connectWebSocket(onHistoryUpdate) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('🔌 WebSocket connected - waiting for history from server...');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Backend sends history_update with full history
        if (data.type === 'history_update' && onHistoryUpdate) {
            onHistoryUpdate(data.history);
        }
    };
    
    ws.onclose = () => {
        setTimeout(() => connectWebSocket(onHistoryUpdate), 3000);
    };
    
    ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
    };
}

export function sendWebSocketMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}
