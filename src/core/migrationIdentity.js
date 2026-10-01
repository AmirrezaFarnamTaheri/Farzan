function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}

async function digestText(text, cryptoRoot) {
  const encoded = new TextEncoder().encode(text);
  if (cryptoRoot?.subtle?.digest) {
    const digest = await cryptoRoot.subtle.digest('SHA-256', encoded);
    return [...new Uint8Array(digest)]
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  // Four independently seeded FNV-1a lanes provide a wide deterministic
  // fallback for environments where Web Crypto is unavailable.
  const lanes = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  for (let lane = 0; lane < lanes.length; lane += 1) {
    let hash = lanes[lane];
    for (const byte of encoded) {
      hash ^= (byte + lane * 17) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    lanes[lane] = hash;
  }
  return `fnv1a-${lanes.map(hash => hash.toString(16).padStart(8, '0')).join('')}`;
}

export async function buildLegacyRecords(kind, records, version, cryptoRoot = globalThis.crypto) {
  const output = [];
  const seenIds = new Map();
  const collisionError = (kind, id) => {
    const error = new Error(`Migration identity collision for ${kind}:${id}`);
    error.code = 'MIGRATION_IDENTITY_COLLISION';
    return error;
  };
  for (const record of records.filter(Boolean)) {
    let id = record.id;
    if (!id) {
      const identity = { ...record };
      delete identity.id;
      const canonical = stableStringify(identity);
      const digest = await digestText(
        `opencoursedeck:migration:v${version}:${kind}\0${canonical}`,
        cryptoRoot,
      );
      id = `${kind}-migrated-v${version}-${digest.slice(0, 24)}`;
      const prior = seenIds.get(id);
      if (prior && (prior.explicit || prior.canonical !== canonical)) {
        throw collisionError(kind, id);
      }
      seenIds.set(id, { explicit: false, canonical });
    } else {
      if (seenIds.has(id)) throw collisionError(kind, id);
      seenIds.set(id, { explicit: true, canonical: null });
    }
    output.push([record, id]);
  }
  return output;
}