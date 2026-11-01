import { describe, expect, it } from 'vitest';
import { isStablePdfDocumentId } from '../src/core/pdfDocumentIdentity.js';

describe('content-addressed PDF handoff authority (#174)', () => {
  it.each([
    'fingerprint:0a6a66a9', 'fingerprint:part-one:part-two',
    'sha256:' + 'a1'.repeat(32),
  ])('accepts canonical content identities: %s', id => {
    expect(isStablePdfDocumentId(id)).toBe(true);
  });

  it.each([
    '', 'global', 'renal.pdf', 'file:renal.pdf:103:4',
    'url:https://example.org/renal.pdf', 'arraybuffer:90128',
    'fingerprint:', 'fingerprint:hello world', 'sha256:not-a-hash',
    'sha256:' + 'a'.repeat(63), '../something.pdf', null, undefined,
  ])('rejects unbound or transport-based PDF identities: %s', id => {
    expect(isStablePdfDocumentId(id)).toBe(false);
  });
});
