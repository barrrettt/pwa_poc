// Device Fingerprint Generation Module
export async function generateDeviceFingerprint() {
    // Check if we have a stored fingerprint in localStorage
    let storedFingerprint = localStorage.getItem('device_fingerprint');
    if (storedFingerprint) {
        return storedFingerprint;
    }
    
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
    
    // Display mode
    characteristics.push(window.matchMedia('(display-mode: standalone)').matches ? 'pwa' : 'browser');
    
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
    
    // Store in localStorage for consistency
    localStorage.setItem('device_fingerprint', fingerprint);
    console.log('Generated new fingerprint:', fingerprint.substring(0, 16) + '...');
    
    return fingerprint;
}
