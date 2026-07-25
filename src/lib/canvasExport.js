/**
 * Canvas Export — PNG, JPEG, PDF export from canvas.
 * Based on canvas2image pattern.
 * Supports HiDPI scaling, multi-page PDF, download-via-anchor.
 */

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(data);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}

/**
 * Scale a canvas for HiDPI export.
 * @param {HTMLCanvasElement} source
 * @param {number} scale
 * @returns {HTMLCanvasElement}
 */
export function scaleCanvas(source, scale = 2) {
  const w = source.width;
  const h = source.height;
  const copy = document.createElement('canvas');
  copy.width = w * scale;
  copy.height = h * scale;
  const ctx = copy.getContext('2d');
  ctx.scale(scale, scale);
  ctx.drawImage(source, 0, 0, w, h);
  return copy;
}

/**
 * Export canvas as PNG data URL.
 * @param {HTMLCanvasElement} canvas
 * @param {string} [filename='export.png']
 * @returns {string} data URL
 */
export function exportToPNG(canvas) {
  return canvas.toDataURL('image/png');
}

/**
 * Export canvas as JPEG data URL.
 * @param {HTMLCanvasElement} canvas
 * @param {number} [quality=0.92]
 * @param {string} [filename='export.jpg']
 * @returns {string} data URL
 */
export function exportToJPEG(canvas, quality = 0.92) {
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Trigger download of canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {'png'|'jpeg'|'jpg'} format
 * @param {string} filename
 * @param {number} [quality=0.92]
 */
export function downloadCanvas(canvas, format = 'png', filename = 'export.png', quality = 0.92) {
  let dataUrl;
  if (format === 'jpeg' || format === 'jpg') {
    dataUrl = exportToJPEG(canvas, quality, filename);
  } else {
    dataUrl = exportToPNG(canvas, filename);
  }
  const blob = dataUrlToBlob(dataUrl);
  downloadBlob(blob, filename);
}

/**
 * Export multiple canvases as a multi-page PDF.
 * Manual PDF construction without external dependencies.
 * @param {HTMLCanvasElement[]} canvases
 * @param {string} [filename='export.pdf']
 * @param {Object} [options]
 * @param {number} [options.quality=0.92]
 */
export function exportToPDF(canvases, filename = 'export.pdf', options = {}) {
  const quality = options.quality || 0.92;
  const usePNG = options.format === 'png';
  const pages = canvases.map((canvas) => {
    const w = canvas.width;
    const h = canvas.height;
    let dataUrl, filter, colorSpace, bitsPerComponent;
    if (usePNG) {
      dataUrl = canvas.toDataURL('image/png');
      filter = 'FlateDecode';
      colorSpace = 'DeviceRGB';
      bitsPerComponent = 8;
    } else {
      dataUrl = canvas.toDataURL('image/jpeg', quality);
      filter = 'DCTDecode';
      colorSpace = 'DeviceRGB';
      bitsPerComponent = 8;
    }
    const binary = atob(dataUrl.split(',')[1]);
    return { w, h, binary, filter, colorSpace, bitsPerComponent };
  });

  const objects = [];
  let offset = 0;

  const write = (str) => {
    const bytes = new TextEncoder().encode(str);
    objects.push(bytes);
    const start = offset;
    offset += bytes.length;
    return start;
  };

  const offsets = [];
  const header = '%PDF-1.4\n';
  const headerBytes = new TextEncoder().encode(header);
  objects.push(headerBytes);
  offset += headerBytes.length;

  // Catalog
  offsets.push(offset);
  write('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Pages
  offsets.push(offset);
  const pageRefs = [];
  for (let i = 0; i < pages.length; i++) {
    pageRefs.push(3 + i * 2);
  }
  write(`2 0 obj\n<< /Type /Pages /Kids [${pageRefs.map(r => `${r} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`);

  // Page objects + image XObjects
  const imgStartObj = 3 + pages.length * 2;
  for (let i = 0; i < pages.length; i++) {
    const pageObj = 3 + i * 2;
    const contentObj = pageObj + 1;
    const imgObj = imgStartObj + i;
    const { w, h } = pages[i];

    offsets.push(offset);
    write(`${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${contentObj} 0 R /Resources << /XObject << /Img${i} ${imgObj} 0 R >> >> >>\nendobj\n`);

    const stream = `q ${w} 0 0 ${h} 0 0 /Img${i} Do Q`;
    offsets.push(offset);
    write(`${contentObj} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
  }

  // Image XObjects
  for (let i = 0; i < pages.length; i++) {
    const imgObj = imgStartObj + i;
    const { w, h, binary } = pages[i];
    offsets.push(offset);
    const imgHeader = `${imgObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace ${pages[i].colorSpace} /BitsPerComponent ${pages[i].bitsPerComponent} /Filter /${pages[i].filter} /Length ${binary.length} >>\nstream\n`;
    write(imgHeader);
    const imgBytes = new Uint8Array(binary.length);
    for (let j = 0; j < binary.length; j++) imgBytes[j] = binary.charCodeAt(j);
    objects.push(imgBytes);
    offset += imgBytes.length;
    const endStream = new TextEncoder().encode('\nendstream\nendobj\n');
    objects.push(endStream);
    offset += endStream.length;
  }

  // Cross-reference table
  const xrefOffset = offset;
  const objectCount = offsets.length;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  const xrefBytes = new TextEncoder().encode(xref);
  objects.push(xrefBytes);
  offset += xrefBytes.length;

  // Trailer
  const trailer = `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const trailerBytes = new TextEncoder().encode(trailer);
  objects.push(trailerBytes);

  const totalSize = objects.reduce((s, b) => s + b.length, 0);
  const pdfBytes = new Uint8Array(totalSize);
  let pos = 0;
  for (const bytes of objects) {
    pdfBytes.set(bytes, pos);
    pos += bytes.length;
  }

  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  downloadBlob(blob, filename);
}

/**
 * Capture a video element's current frame as a canvas.
 * @param {HTMLVideoElement} video
 * @returns {HTMLCanvasElement|null}
 */
export function videoFrameToCanvas(video) {
  if (!video || !video.videoWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Copy video frame to system clipboard.
 * @param {HTMLVideoElement} video
 * @returns {Promise<boolean>}
 */
export async function videoFrameToClipboard(video) {
  const canvas = videoFrameToCanvas(video);
  if (!canvas) return false;
  try {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return false;
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
    return true;
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined') {
  window.OpenCourseDeck = window.OpenCourseDeck ?? {};
  window.OpenCourseDeck.CanvasExport = { scaleCanvas, exportToPNG, exportToJPEG, downloadCanvas, exportToPDF, videoFrameToCanvas, videoFrameToClipboard };
}
