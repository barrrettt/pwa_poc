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

// WebSocket update - updates counter and adds event ONLY if on first page
export function updateHistoryFromWebSocket(eventData) {
    if (!historyList) return;
    
    console.log('📨 WebSocket update received:', eventData ? 'single event' : 'empty');
    
    // If null/empty, do nothing (history cleared is handled by API)
    if (!eventData) {
        return;
    }
    
    // Check if this event is already loaded
    const eventId = `${eventData.timestamp}-${eventData.type}`;
    
    if (loadedEventIds.has(eventId)) {
        console.log('⏭️ Event already loaded, skipping:', eventId);
        return;
    }
    
    console.log('✅ New event detected:', eventId);
    
    // Always increment total count
    totalEvents++;
    updateHistoryTitle();
    
    // Only add to DOM if we're on the first page
    if (currentPage !== 1) {
        console.log('📄 Not on first page (page ' + currentPage + '), only updating counter');
        return;
    }
    
    console.log('➕ Adding event to DOM (on first page)');
    
    // Remove empty message if exists
    const emptyMessage = historyList.querySelector('.empty-message');
    if (emptyMessage) {
        emptyMessage.remove();
    }
    
    // Add event to loaded set
    loadedEventIds.add(eventId);
    
    // Create history item
    const historyItem = document.createElement('li');
    historyItem.className = 'history-item';
    historyItem.style.animation = 'slideIn 0.3s ease-out';
    
    const date = new Date(eventData.timestamp * 1000);
    const timestamp = date.toLocaleString('es-ES');
    
    historyItem.innerHTML = `
        <div class="event-content">
            <div class="event-name">${eventData.type}</div>
            <div class="event-details">
                ${eventData.message}<br>
                ${Object.keys(eventData.details).length > 0 ? `<strong>Detalles:</strong> ${JSON.stringify(eventData.details)}<br>` : ''}
                <strong>Timestamp:</strong> ${timestamp}
            </div>
        </div>
    `;
    
    // Insert at the top
    historyList.insertBefore(historyItem, historyList.firstChild);
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
