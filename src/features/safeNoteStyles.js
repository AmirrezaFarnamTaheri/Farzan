/**
 * Preserve only inert visual formatting in locally saved Notes HTML.
 *
 * DOMPurify removes executable markup. Inline CSS needs a second, narrower
 * policy because properties such as background-image can load remote assets.
 * Parsing occurs in a detached element; never attach untrusted CSS to the DOM.
 */
const COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgba?|hsla?)\(\s*[0-9.%+,\s-]+\s*\)|[a-z]{1,24})$/i;
const LENGTH = /^(?:\d+(?:\.\d+)?(?:px|pt|em|rem|%)|small|medium|large|x-large|xx-large|smaller|larger)$/i;
const ALIGN = /^(?:left|right|center|justify|start|end)$/i;
const FONTS = /^[\p{L}\p{N}\s,"'-]+$/u;

function allowed(name, value) {
  if (!value || /(?:url|expression|var|attr)\s*\(|[{}]|javascript\s*:/i.test(value)) return false;
  switch (name) {
    case 'color':
    case 'background-color': return COLOR.test(value);
    case 'font-size': return LENGTH.test(value);
    case 'font-family': return FONTS.test(value);
    case 'font-weight': return /^(?:normal|bold|bolder|lighter|[1-9]00)$/i.test(value);
    case 'font-style': return /^(?:normal|italic|oblique)$/i.test(value);
    case 'text-align': return ALIGN.test(value);
    case 'direction': return /^(?:ltr|rtl)$/i.test(value);
    case 'text-decoration':
    case 'text-decoration-line': return /^(?:none|underline|line-through|overline)(?:\s+(?:underline|line-through|overline))*$/i.test(value);
    case 'white-space': return /^(?:normal|pre|pre-line|pre-wrap|break-spaces)$/i.test(value);
    case 'line-height': return /^(?:normal|[1-3](?:\.\d{1,3})?)$/i.test(value);
    default: return false;
  }
}

export function filterNoteStyle(style) {
  const source = String(style ?? '');
  if (source.length > 4096) return { css: '', valid: false };
  const probe = document.createElement('span');
  probe.setAttribute('style', source);
  const result = [];
  let valid = !/(?:url|expression|var|attr)\s*\(|[{}]|@import|javascript\s*:/i.test(source);
  for (let i = 0; i < probe.style.length; i += 1) {
    const property = probe.style.item(i).toLowerCase();
    const value = probe.style.getPropertyValue(property).trim();
    const priority = probe.style.getPropertyPriority(property);
    if (priority || !allowed(property, value)) {
      valid = false;
      continue;
    }
    result.push(property + ':' + value);
  }
  if (source.trim() && !probe.style.length) valid = false;
  return { css: result.join(';'), valid };
}

export function sanitizeNoteStyles(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html ?? '');
  for (const element of template.content.querySelectorAll('[style]')) {
    const { css } = filterNoteStyle(element.getAttribute('style'));
    if (css) element.setAttribute('style', css);
    else element.removeAttribute('style');
  }
  return template.innerHTML;
}
