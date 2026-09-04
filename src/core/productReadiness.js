const UNAVAILABLE_ACTIONS = Object.freeze([]);

function disableElement(element, reason) {
  if (!element) return;
  element.setAttribute('aria-disabled', 'true');
  element.setAttribute('data-capability-state', 'unavailable');
  element.setAttribute('title', reason);
  if ('disabled' in element) element.disabled = true;
}

export function enforceProductReadiness(root = document) {
  // Library creation (add video/PDF/topic/course/URL) is a shipped product
  // surface. Keep the gate so callers still receive a receipt, but do not
  // disable the add-content chrome.
  void root;
  void disableElement;
  return {
    unavailableActions: [...UNAVAILABLE_ACTIONS],
  };
}

export const unavailableProductActions = UNAVAILABLE_ACTIONS;
