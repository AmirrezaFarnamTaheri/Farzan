/**
 * pdConfirm — unified confirmation dialog.
 * Tries OpenCourseDeck.UI.confirm → OpenCourseDeck.Modal.confirmAsync → window.confirm.
 * @param {string|{message:string}} input
 * @returns {Promise<boolean>}
 */
export async function pdConfirm(input) {
  const pd = window.OpenCourseDeck;
  const fn = pd?.UI?.confirm ?? pd?.Modal?.confirmAsync;
  if (typeof fn === 'function') return fn(input);
  const message = input && typeof input === 'object' ? input.message : input;
  return window.confirm(String(message ?? 'Are you sure?'));
}
