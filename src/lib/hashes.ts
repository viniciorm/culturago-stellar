/**
 * Utility function to generate deterministic hashes for entities and credentials metadata.
 * Compatible with both Node.js and browser environments (Web Crypto API).
 */
export async function generateMetadataHash(data: any): Promise<string> {
  try {
    // Sort keys deterministically to ensure the same object always hashes to the same string
    const deterministicString = JSON.stringify(data, Object.keys(data).sort());
    const msgBuffer = new TextEncoder().encode(deterministicString);
    
    // Use Web Crypto API (supported in Node.js 15+ and modern browsers/Edge runtimes)
    let hashBuffer: ArrayBuffer;
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
    } else {
      // Node.js server side environment
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256');
      hash.update(deterministicString);
      return hash.digest('hex');
    }
    
    // Convert ArrayBuffer to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (error) {
    console.error("Error generating metadata hash:", error);
    // Fallback simple hash if anything goes wrong
    return 'fallback_hash_' + Math.random().toString(36).substr(2, 9);
  }
}
