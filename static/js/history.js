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

export function renderHistory(historyData) {
    if (!historyList) return;
    
    // If list is empty (first load), load first page
    if (historyList.children.length === 0 || 
        (historyList.children.length === 1 && historyList.querySelector('.empty-message'))) {
        currentPage = 1;
        hasMoreHistory = true;
        historyList.innerHTML = '';
        loadedEventIds.clear();
        loadHistoryPage();
        return;
    }
    
    // Otherwise, check for new events and prepend them
    if (!historyData || historyData.length === 0) return;
    
    // Get the most recent events (reversed order - newest first)
    const reversedHistory = historyData.slice().reverse();
    
    // Find new events (those not in our loaded set)
    const newEvents = reversedHistory.filter(event => {
        const eventId = `${event.timestamp}-${event.type}`;
        return !loadedEventIds.has(eventId);
    });
    
    // Prepend new events at the top (before loading indicator if it exists)
    const loadingIndicator = document.getElementById('loadingIndicator');
    const insertPosition = loadingIndicator || null;
    
    newEvents.forEach((event, index) => {
        const eventId = `${event.timestamp}-${event.type}`;
        loadedEventIds.add(eventId);
        
        const historyItem = document.createElement('li');
        historyItem.className = 'history-item';
        historyItem.style.animation = 'slideIn 0.3s ease-out';
        
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
        
        if (insertPosition) {
            historyList.insertBefore(historyItem, insertPosition);
        } else {
            historyList.insertBefore(historyItem, historyList.firstChild);
        }
    });
    
    totalEvents = historyData.length;
    updateHistoryTitle();
}

async function loadHistoryPage() {
    if (isLoadingHistory || !hasMoreHistory || !historyList) return;
    
    isLoadingHistory = true;
    
    try {
        const response = await fetch(`/api/history?page=${currentPage}&limit=5`);
        const data = await response.json();
        
        totalEvents = data.total;
        hasMoreHistory = data.hasMore;
        
        updateHistoryTitle();
        
        if (currentPage === 1 && data.history.length === 0) {
            historyList.innerHTML = '<li class="empty-message">No hay eventos todavía. ¡Pulsa el botón!</li>';
            isLoadingHistory = false;
            return;
        }
        
        const emptyMessage = historyList.querySelector('.empty-message');
        if (emptyMessage) {
            emptyMessage.remove();
        }
        
        data.history.forEach((event, index) => {
            const eventId = `${event.timestamp}-${event.type}`;
            loadedEventIds.add(eventId);
            
            const historyItem = document.createElement('li');
            historyItem.className = 'history-item';
            
            const date = new Date(event.timestamp * 1000);
            const timestamp = date.toLocaleString('es-ES');
            const eventNumber = (currentPage - 1) * 5 + index + 1;
            
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
        
        let loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
        
        if (hasMoreHistory) {
            loadingIndicator = document.createElement('li');
            loadingIndicator.id = 'loadingIndicator';
            loadingIndicator.className = 'loading-indicator';
            loadingIndicator.textContent = 'Cargando más eventos...';
            historyList.appendChild(loadingIndicator);
            
            if (scrollObserver && loadingIndicator) {
                scrollObserver.observe(loadingIndicator);
            }
        }
        
        currentPage++;
    } catch (error) {
        console.error('Error loading history page:', error);
    } finally {
        isLoadingHistory = false;
    }
}

function updateHistoryTitle() {
    const historyTitle = document.querySelector('.history-title');
    if (historyTitle) {
        historyTitle.textContent = `📝 Histórico de Eventos (${totalEvents})`;
    }
}

export function setupInfiniteScroll() {
    scrollObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && hasMoreHistory && !isLoadingHistory) {
                    loadHistoryPage();
                }
            });
        },
        {
            root: null,
            rootMargin: '200px',
            threshold: 0.1
        }
    );
    
    const checkAndObserve = () => {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            scrollObserver.observe(loadingIndicator);
        } else if (hasMoreHistory) {
            setTimeout(checkAndObserve, 100);
        }
    };
    
    checkAndObserve();
}

export function clearHistory() {
    if (!historyList) return;
    
    console.log('🗑️ Clearing history from DOM...');
    currentPage = 1;
    hasMoreHistory = true;
    loadedEventIds.clear();
    historyList.innerHTML = '<li class="empty-message">No hay eventos todavía. ¡Pulsa el botón!</li>';
    
    // Force reload from server after a short delay
    setTimeout(() => {
        console.log('🔄 Reloading history from server...');
        renderHistory();
    }, 500);
}
