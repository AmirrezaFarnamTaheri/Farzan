/**
 * Export archived note HTML to portable Markdown with the maintained Turndown
 * converter. Parsing happens in an inert <template>, never a live element:
 * rendering an imported note must not fetch remote media or execute handlers.
 *
 * Study notes continue to be stored in their original HTML schema. The
 * sanitizer intentionally removes active/media embeds from *exports only*;
 * text, links, headings, lists and code are preserved.
 */
import DOMPurify from 'dompurify';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const purifier = typeof DOMPurify.sanitize === 'function'
  ? DOMPurify
  : DOMPurify(window);

const converter = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
  codeBlockStyle: 'fenced',
  linkStyle: 'inlined',
});
// Reuse the established GFM rules instead of custom table/list rendering.
converter.use(gfm);

export function noteHtmlToMarkdown(input) {
  const source = String(input ?? '');
  if (!source) return '';

  // Parsing untrusted markup into an HTMLTemplateElement is inert even for
  // image, audio, video and iframe elements, unlike parsing into a live DIV.
  const template = document.createElement('template');
  template.innerHTML = source;

  const safeFragment = purifier.sanitize(template.content, {
    RETURN_DOM_FRAGMENT: true,
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      'script', 'style', 'link', 'iframe', 'object', 'embed', 'form',
      'img', 'picture', 'video', 'audio', 'source', 'track', 'svg',
    ],
    FORBID_ATTR: ['style', 'srcset', 'sizes', 'srcdoc', 'ping'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });

  // DocumentFragment is accepted by Turndown. Converting a sanitized DOM
  // tree, rather than HTML regexes, preserves nesting and decoded entities.
  return converter.turndown(safeFragment).trim();
}
