import { isLoopbackHostname } from './networkSafety.js';

const INSTALLED = Symbol.for('opencoursedeck.endpointApprovalGuard');

function isValidEndpoint(value) {
  const source = String(value || '').trim();
  if (!/^https?:\/\//i.test(source)) return false;
  try {
    const parsed = new URL(source);
    if (parsed.username || parsed.password) return false;
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname));
  } catch {
    return false;
  }
}

export function initEndpointApprovalGuard(root = document) {
  if (!root?.addEventListener || root[INSTALLED]) return root?.[INSTALLED] || null;

  const pending = new WeakMap();
  const capture = (event) => {
    const checkbox = event.target?.closest?.('[data-ai-approve-endpoint]');
    if (!checkbox) return;
    const endpoint = root.querySelector?.('[data-ai-endpoint]');
    pending.set(checkbox, Boolean(checkbox.checked && isValidEndpoint(endpoint?.value)));
  };
  const restore = (event) => {
    const checkbox = event.target?.closest?.('[data-ai-approve-endpoint]');
    if (!checkbox || !pending.has(checkbox)) return;
    const approved = pending.get(checkbox);
    pending.delete(checkbox);
    if (approved && !checkbox.disabled) checkbox.checked = true;
  };

  root.addEventListener('change', capture, true);
  root.addEventListener('change', restore);

  const controller = {
    dispose() {
      root.removeEventListener('change', capture, true);
      root.removeEventListener('change', restore);
      try { delete root[INSTALLED]; } catch {}
    },
  };
  Object.defineProperty(root, INSTALLED, { configurable: true, value: controller });
  return controller;
}

export { isValidEndpoint };
