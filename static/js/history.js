// History Management Module
let currentPage = 1;
let isLoadingHistory = false;
let hasMoreHistory = true;
let totalEvents = 0;
let loadedEventIds = new Set();
let scrollObserver = null;
let historyList = null;

export function initHistory(historyListElement) {
    historyList = historyListElement;
}

// Main render function - loads from API
export async function renderHistory() {
    if (!historyList) return;
    
    console.log('📜 Loading history from API...');
    
    try {
        const response = await fetch('/api/history?page=1&limit=5');
        const data = await response.json();
        
        totalEvents = data.total;
        hasMoreHistory = data.hasMore;
        currentPage = 1;
        loadedEventIds.clear();
        
        console.log('📊 Received', data.history.length, 'events, total:', totalEvents);
        
        // Clear list
        historyList.innerHTML = '';
        
        if (data.history.length === 0) {
            historyList.innerHTML = '<li class="empty-message">No hay eventos todavía. ¡Pulsa el botón!</li>';
            updateHistoryTitle();
            return;
        }
        
        // Render events
        data.history.forEach((event, index) => {
            const eventId = `${event.timestamp}-${event.type}`;
            loadedEventIds.add(eventId);
            
            const historyItem = document.createElement('li');
            historyItem.className = 'history-item';
            
            const date = new Date(event.timestamp * 1000);
            const timestamp = date.toLocaleString('es-ES');
            const eventNumber = index + 1;
            
            historyItem.innerHTML = `
                <div class="event-content">
                    <div class="event-name">${eventNumber}. ${event.type}</div>
                    <div class="event-details">
                        ${event.message}<br>
                        ${Object.keys(event.details).length > 0 ? `<strong>Detalles:</strong> ${JSON.stringify(event.details)}<br>` : ''}
                        <strong>Timestamp:</strong> ${timestamp}
                    </div>
                </div>
            `;
            
            historyList.appendChild(historyItem);
        });
        
        updateHistoryTitle();
        
        // Setup infinite scroll after initial load
        setupInfiniteScroll();
        
    } catch (error) {
        console.error('❌ Error loading history:', error);
    }
}

// WebSocket update - only adds NEW events at the top
export function updateHistoryFromWebSocket(historyData) {
    if (!historyList) return;
    
    console.log('📨 WebSocket update received:', historyData ? historyData.length + ' events' : 'empty');
    console.log('📋 Currently loaded events:', loadedEventIds.size);
    
    // If empty, clear everything
    if (!historyData || historyData.length === 0) {
        console.log('🗑️ Clearing history (empty from server)');
        historyList.innerHTML = '<li class="empty-message">No hay eventos todavía. ¡Pulsa el botón!</li>';
        loadedEventIds.clear();
        totalEvents = 0;
        updateHistoryTitle();
        return;
    }
    
    // Find new events not in our set
    const reversedHistory = historyData.slice().reverse();
    
    console.log('🔍 Checking for new events...');
    reversedHistory.forEach((event, idx) => {
        const eventId = `${event.timestamp}-${event.type}`;
        const isNew = !loadedEventIds.has(eventId);
        if (idx < 3) { // Log first 3 for debugging
            console.log(`  Event ${idx}: ${eventId.substring(0, 30)}... - ${isNew ? 'NEW' : 'already loaded'}`);
        }
    });
    
    const newEvents = reversedHistory.filter(event => {
        const eventId = `${event.timestamp}-${event.type}`;
        return !loadedEventIds.has(eventId);
    });
    
    console.log('📥 Found', newEvents.length, 'new events to add');
    
    if (newEvents.length === 0) return;
    
    // Remove empty message if exists
    const emptyMessage = historyList.querySelector('.empty-message');
    if (emptyMessage) {
        emptyMessage.remove();
    }
    
    // Prepend new events at the top
    newEvents.forEach(event => {
        const eventId = `${event.timestamp}-${event.type}`;
        loadedEventIds.add(eventId);
        
        const historyItem = document.createElement('li');
        historyItem.className = 'history-item';
        historyItem.style.animation = 'slideIn 0.3s ease-out';
        
        const date = new Date(event.timestamp * 1000);
        const timestamp = date.toLocaleString('es-ES');
        
        historyItem.innerHTML = `
            <div class="event-content">
                <div class="event-name">${event.type}</div>
                <div class="event-details">
                    ${event.message}<br>
                    ${Object.keys(event.details).length > 0 ? `<strong>Detalles:</strong> ${JSON.stringify(event.details)}<br>` : ''}
                    <strong>Timestamp:</strong> ${timestamp}
                </div>
            </div>
        `;
        
        historyList.insertBefore(historyItem, historyList.firstChild);
    });
    
    totalEvents = historyData.length;
    updateHistoryTitle();
}

function updateHistoryTitle() {
    const historyTitle = document.querySelector('.history-title');
    if (historyTitle) {
        historyTitle.textContent = `📝 Histórico de Eventos (${totalEvents})`;
    }
}

export function setupInfiniteScroll() {
    if (!historyList) return;
    
    // Remove existing observer if any
    if (scrollObserver) {
        scrollObserver.disconnect();
    }
    
    // Create sentinel element at the bottom
    let sentinel = document.getElementById('history-sentinel');
    if (!sentinel) {
        sentinel = document.createElement('li');
        sentinel.id = 'history-sentinel';
        sentinel.style.height = '1px';
        sentinel.style.visibility = 'hidden';
    }
    
    // Setup intersection observer
    scrollObserver = new IntersectionObserver(async (entries) => {
        const entry = entries[0];
        
        if (entry.isIntersecting && hasMoreHistory && !isLoadingHistory) {
            await loadMoreHistory();
        }
    }, {
        root: null,
        threshold: 0.1
    });
    
    // Append sentinel to history list
    if (hasMoreHistory) {
        historyList.appendChild(sentinel);
        scrollObserver.observe(sentinel);
    }
}

async function loadMoreHistory() {
    if (isLoadingHistory || !hasMoreHistory) return;
    
    isLoadingHistory = true;
    currentPage++;
    
    console.log(`📜 Loading page ${currentPage}...`);
    
    try {
        const response = await fetch(`/api/history?page=${currentPage}&limit=5`);
        const data = await response.json();
        
        hasMoreHistory = data.hasMore;
        
        // Remove sentinel temporarily
        const sentinel = document.getElementById('history-sentinel');
        if (sentinel) {
            sentinel.remove();
        }
        
        // Append new events
        data.history.forEach((event) => {
            const eventId = `${event.timestamp}-${event.type}`;
            
            // Skip if already loaded
            if (loadedEventIds.has(eventId)) return;
            
            loadedEventIds.add(eventId);
            
            const historyItem = document.createElement('li');
            historyItem.className = 'history-item';
            
            const date = new Date(event.timestamp * 1000);
            const timestamp = date.toLocaleString('es-ES');
            
            historyItem.innerHTML = `
                <div class="event-content">
                    <div class="event-name">${event.type}</div>
                    <div class="event-details">
                        ${event.message}<br>
                        ${Object.keys(event.details).length > 0 ? `<strong>Detalles:</strong> ${JSON.stringify(event.details)}<br>` : ''}
                        <strong>Timestamp:</strong> ${timestamp}
                    </div>
                </div>
            `;
            
            historyList.appendChild(historyItem);
        });
        
        // Re-attach sentinel if there's more
        if (hasMoreHistory && sentinel) {
            historyList.appendChild(sentinel);
        }
        
        console.log(`✅ Loaded page ${currentPage}, hasMore: ${hasMoreHistory}`);
        
    } catch (error) {
        console.error('❌ Error loading more history:', error);
        currentPage--; // Revert page increment on error
    } finally {
        isLoadingHistory = false;
    }
}

export function clearHistory() {
    if (!historyList) return;
    
    console.log('🗑️ Clearing history locally');
    currentPage = 1;
    hasMoreHistory = true;
    loadedEventIds.clear();
    totalEvents = 0;
    historyList.innerHTML = '<li class="empty-message">No hay eventos todavía. ¡Pulsa el botón!</li>';
    updateHistoryTitle();
}
