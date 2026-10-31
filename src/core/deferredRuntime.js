/**
 * Run independent optional startup steps without a failure in one step
 * rejecting the entire initialization group. Each result is inspectable.
 *
 * An error reporter may itself throw; reporting cannot block other features.
 * @param {Array<{name: string, run: () => unknown}>} initializers
 * @param {{onFailure?: (name: string, reason: unknown) => void}} options
 */
export async function runIndependentInitializers(initializers, {
  onFailure = (name, reason) => console.warn(`[OpenCourseDeck] deferred initializer "${name}" failed`, reason),
} = {}) {
  return Promise.all(initializers.map(async (initializer) => {
    const name = initializer?.name || 'unnamed';
    try {
      if (typeof initializer?.run !== 'function') {
        throw new TypeError(`Deferred initializer "${name}" has no run() function`);
      }
      await initializer.run();
      return { name, status: 'fulfilled' };
    } catch (reason) {
      try {
        onFailure(name, reason);
      } catch {
        // A failed logger must not abort startup of unrelated features.
      }
      return { name, status: 'rejected', reason };
    }
  }));
}
