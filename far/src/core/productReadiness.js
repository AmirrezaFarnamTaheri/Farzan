const UNAVAILABLE_ACTIONS = Object.freeze([
  'add-video',
  'add-pdf',
  'create-topic',
  'create-course',
  'add-url',
]);

function disableElement(element, reason) {
  if (!element) return;
  element.setAttribute('aria-disabled', 'true');
  element.setAttribute('data-capability-state', 'unavailable');
  element.setAttribute('title', reason);
  if ('disabled' in element) element.disabled = true;
}

export function enforceProductReadiness(root = document) {
  const reason = 'This workflow is not available in this release.';
  disableElement(root.getElementById?.('topbar-add-btn'), reason);

  for (const action of UNAVAILABLE_ACTIONS) {
    root.querySelectorAll?.(`[data-action="${action}"]`).forEach((element) => {
      disableElement(element, reason);
      element.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      }, { capture: true });
    });
  }

  return {
    unavailableActions: [...UNAVAILABLE_ACTIONS],
  };
}

export const unavailableProductActions = UNAVAILABLE_ACTIONS;
