// WebSocket Management Module
export let ws = null;

export function connectWebSocket(onHistoryUpdate) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    console.log('🔌 Connecting to WebSocket:', wsUrl);
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('📨 WebSocket message received:', data.type);
        
        // Backend sends history_update with full history
        if (data.type === 'history_update' && onHistoryUpdate) {
            console.log('📜 Updating history, events count:', data.history?.length || 0);
            onHistoryUpdate(data.history);
        }
    };
    
    ws.onclose = () => {
        console.log('⚠️ WebSocket disconnected, reconnecting in 3s...');
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
