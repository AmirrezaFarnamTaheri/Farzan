/**
 * RouteListeners — disposable event listener tracker for route modules.
 * Call .on() to register, .clear() to remove all on route exit.
 * @type {{ items: Array<{target:EventTarget,type:string,handler:Function,options:any}>, on(target:EventTarget, type:string, handler:Function, options?:any): void, clear(): void }}
 */
export const RouteListeners = {
  items: [],
  on(target, type, handler, options) {
    if (!target) return;
    target.addEventListener(type, handler, options);
    this.items.push({ target, type, handler, options });
  },
  clear() {
    for (const { target, type, handler, options } of this.items) {
      try { target.removeEventListener(type, handler, options); } catch { /* ignore */ }
    }
    this.items = [];
  },
};
