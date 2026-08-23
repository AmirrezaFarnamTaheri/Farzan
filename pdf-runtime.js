import * as pdfjsModule from './vendor/pdf.min.mjs';

// ES module namespace objects are immutable. The security installer wraps
// getDocument, so expose a shallow, mutable runtime facade instead.
const pdfjsLib = { ...pdfjsModule };
const getDocument = pdfjsLib.getDocument.bind(pdfjsLib);

// PDF.js 6 moved document teardown to PDFDocumentLoadingTask. Preserve the
// established legacy document-proxy contract while delegating cleanup to the
// owning task, so callers do not leak workers or depend on a removed method.
pdfjsLib.getDocument = (...args) => {
  const loadingTask = getDocument(...args);
  let documentPromise;
  return new Proxy(loadingTask, {
    get(target, property, receiver) {
      if (property === 'promise') {
        documentPromise ||= target.promise.then((documentProxy) => new Proxy(documentProxy, {
          get(documentTarget, documentProperty, documentReceiver) {
            if (documentProperty === 'destroy' && typeof documentTarget.destroy !== 'function') {
              return () => target.destroy();
            }
            const value = Reflect.get(documentTarget, documentProperty, documentReceiver);
            return typeof value === 'function' ? value.bind(documentTarget) : value;
          },
        }));
        return documentPromise;
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, property, value) {
      return Reflect.set(target, property, value, target);
    },
  });
};

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
window.pdfjsLib = pdfjsLib;
window.dispatchEvent(new CustomEvent('opencoursedeck:pdfjs-ready'));
