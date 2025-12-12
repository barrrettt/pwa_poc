// Device Fingerprint Generation Module
export async function generateDeviceFingerprint() {
    // Detect context (web browser or installed PWA)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        window.navigator.standalone || 
                        document.referrer.includes('android-app://');
    
    const mode = isStandalone ? 'pwa' : 'web';
    const storageKey = `device_fingerprint_${mode}`;
    
    console.log('🔑 Fingerprint mode:', mode);
    
    // Check if we have a stored fingerprint for this mode
    let storedFingerprint = localStorage.getItem(storageKey);
    if (storedFingerprint) {
        console.log('✅ Using existing fingerprint for', mode);
        return storedFingerprint;
    }
    
    console.log('🆕 Generating NEW fingerprint for', mode);
    
    // Collect comprehensive device characteristics
    const characteristics = [];
    
    // Basic browser info
    characteristics.push(navigator.userAgent);
    characteristics.push(navigator.language);
    characteristics.push(navigator.languages ? navigator.languages.join(',') : '');
    characteristics.push(navigator.platform);
    characteristics.push(navigator.hardwareConcurrency || 'unknown');
    characteristics.push(navigator.deviceMemory || 'unknown');
    
    // Screen info
    characteristics.push(screen.width + 'x' + screen.height);
    characteristics.push(screen.availWidth + 'x' + screen.availHeight);
    characteristics.push(screen.colorDepth);
    characteristics.push(screen.pixelDepth);
    characteristics.push(window.devicePixelRatio || 1);
    
    // Timezone
    characteristics.push(new Date().getTimezoneOffset());
    characteristics.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
    
    // Location info
    characteristics.push(window.location.origin);
    characteristics.push(window.location.protocol);
    
    // Display mode (critical for different fingerprints)
    characteristics.push(mode); // 'web' or 'pwa'
    const displayMode = isStandalone ? 'pwa-installed' : 'web-browser';
    characteristics.push(displayMode);
    
    // Canvas fingerprint (more unique)
    
    // Canvas fingerprint (more unique)
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(0, 0, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('PWA POC 🔒', 2, 2);
        characteristics.push(canvas.toDataURL());
    } catch (e) {
        characteristics.push('canvas-blocked');
    }
    
    // WebGL fingerprint
    try {
        const gl = document.createElement('canvas').getContext('webgl');
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        characteristics.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
        characteristics.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
    } catch (e) {
        characteristics.push('webgl-blocked');
    }
    
    // Add random component if first time (to ensure absolute uniqueness)
    const randomSeed = crypto.getRandomValues(new Uint8Array(16));
    characteristics.push(Array.from(randomSeed).map(b => b.toString(16).padStart(2, '0')).join(''));
    
    // Generate hash
    const data = characteristics.join('|');
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fingerprint = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Store in localStorage with mode-specific key
    localStorage.setItem(storageKey, fingerprint);
    console.log('💾 Stored fingerprint for', mode, ':', fingerprint.substring(0, 16) + '...');
    
    return fingerprint;
}
