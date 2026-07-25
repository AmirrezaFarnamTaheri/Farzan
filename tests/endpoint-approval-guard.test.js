import { afterEach, describe, expect, it } from 'vitest';
import { initEndpointApprovalGuard, isValidEndpoint } from '../src/core/endpointApprovalGuard.js';

function mount(endpointValue) {
  document.body.innerHTML = `
    <input data-ai-endpoint value="${endpointValue}">
    <input type="checkbox" data-ai-approve-endpoint>
  `;
  return document.querySelector('[data-ai-approve-endpoint]');
}

describe('endpoint approval guard', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('preserves explicit approval for a secure endpoint after downstream validation', () => {
    initEndpointApprovalGuard(document);
    const approval = mount('https://api.example.test/v1/chat/completions');
    approval.addEventListener('change', () => { approval.checked = false; });

    approval.checked = true;
    approval.dispatchEvent(new Event('change', { bubbles: true }));

    expect(approval.checked).toBe(true);
  });

  it('does not preserve approval for insecure remote endpoints', () => {
    initEndpointApprovalGuard(document);
    const approval = mount('http://api.example.test/v1/chat/completions');
    approval.addEventListener('change', () => { approval.checked = false; });

    approval.checked = true;
    approval.dispatchEvent(new Event('change', { bubbles: true }));

    expect(approval.checked).toBe(false);
    expect(isValidEndpoint('http://api.example.test/v1/chat/completions')).toBe(false);
    expect(isValidEndpoint('http://127.0.0.1:8080/v1/chat/completions')).toBe(true);
  });

  it('rejects endpoints containing embedded credentials', () => {
    expect(isValidEndpoint('https://user:secret@api.example.test/v1/chat/completions')).toBe(false);
  });
});
