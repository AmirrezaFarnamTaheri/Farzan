const INSTALLED = Symbol.for('opencoursedeck.endpointApprovalGuard');

function isLoopback(hostname) {
  const value = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  return value === 'localhost' || value === '::1' || value === '127.0.0.1' || value.startsWith('127.');
}

function isValidEndpoint(value) {
  const source = String(value || '').trim();
  if (!/^https?:\/\//i.test(source)) return false;
  try