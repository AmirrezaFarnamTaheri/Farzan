/**
 * Only literal loopback hosts may use cleartext HTTP for local integrations.
 * Hostnames such as `127.attacker.example` are public DNS names, not loopback.
 * Call with URL.hostname (which canonicalizes IPv4 and IPv6 syntax).
 */
export function isLoopbackHostname(hostname) {
  const value = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (value === 'localhost' || value === '::1') return true;
  const parts = value.split('.');
  return parts.length === 4
    && parts[0] === '127'
    && parts.slice(1).every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
