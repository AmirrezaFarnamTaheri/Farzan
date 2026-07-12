import * as pdfjsModule from './vendor/pdf.min.mjs';

// ES module namespace objects are immutable. The security installer wraps
// getDocument, so expose a shallow, mutable runtime facade instead.
const pdfjsLib = { ...pdfjsModule };
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
window.pdfjsLib = pdfjsLib;
window.dispatchEvent(new CustomEvent('opencoursedeck:pdfjs-ready'));
