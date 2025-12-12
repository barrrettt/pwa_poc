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
        
        // Backend sends history_update with single event (not full array)
        if (data.type === 'history_update' && onHistoryUpdate) {
            console.log('📜 New event received:', data.event ? 'single event' : 'empty');
            onHistoryUpdate(data.event);  // Pass single event, not array
        }
        
        // Backend sends history_clear when someone clears history
        if (data.type === 'history_clear' && onHistoryUpdate) {
            console.log('🗑️ History cleared by another user');
            onHistoryUpdate(null);  // Signal to clear
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
