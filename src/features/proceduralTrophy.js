/**
 * OpenCourseDeck — proceduralTrophy.js
 * Procedural 3D Milestone & Trophy Engine
 *
 * Implements code-only procedural 3D vectors and geometric models
 * for milestone badges (Cornell Master, Scholar Laurels, Knowledge Prism, Deep Voyager)
 * without external images or glTF art packs.
 */

export const ProceduralTrophy = {
  /**
   * Generates a procedural SVG/3D badge markup for achievement milestones
   * @param {string} type Trophy type ('cornell-master' | 'scholar' | 'prism' | 'voyager')
   * @param {object} [options]
   * @returns {string} SVG vector markup
   */
  renderTrophySvg(type = 'cornell-master', options = {}) {
    const size = options.size || 96;

    switch (type) {
      case 'cornell-master':
        return `
          <svg class="procedural-trophy" viewBox="0 0 100 100" width="${size}" height="${size}" aria-label="Cornell Master Medallion" role="img">
            <defs>
              <linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#FDE68A" />
                <stop offset="50%" stop-color="#D97706" />
                <stop offset="100%" stop-color="#78350F" />
              </linearGradient>
              <linearGradient id="lapis-gem" x1="20%" y1="20%" x2="80%" y2="80%">
                <stop offset="0%" stop-color="#60A5FA" />
                <stop offset="60%" stop-color="#2563EB" />
                <stop offset="100%" stop-color="#1E3A8A" />
              </linearGradient>
              <filter id="trophy-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="0.35" />
              </filter>
            </defs>
            <g filter="url(#trophy-shadow)">
              <!-- Outer Golden Laurel Ring -->
              <circle cx="50" cy="50" r="42" fill="none" stroke="url(#gold-grad)" stroke-width="4" stroke-dasharray="4 2" />
              <circle cx="50" cy="50" r="36" fill="#18212E" stroke="url(#gold-grad)" stroke-width="1.5" />
              
              <!-- Geometric 3D Facet Star -->
              <polygon points="50,22 58,38 76,42 62,54 66,72 50,62 34,72 38,54 24,42 42,38" fill="url(#gold-grad)" opacity="0.85" />
              
              <!-- Central Refractive Lapis Octahedron -->
              <polygon points="50,34 62,50 50,66 38,50" fill="url(#lapis-gem)" />
              <polygon points="50,34 62,50 50,50" fill="#93C5FD" opacity="0.6" />
              <polygon points="50,50 62,50 50,66" fill="#1D4ED8" opacity="0.8" />
              <polygon points="38,50 50,50 50,66" fill="#1E3A8A" opacity="0.9" />
              <polygon points="38,50 50,34 50,50" fill="#60A5FA" opacity="0.7" />
              
              <!-- Core Sparkle -->
              <circle cx="50" cy="50" r="2.5" fill="#FFFFFF" />
            </g>
          </svg>
        `;

      case 'scholar':
        return `
          <svg class="procedural-trophy" viewBox="0 0 100 100" width="${size}" height="${size}" aria-label="Scholar Laurels" role="img">
            <defs>
              <linearGradient id="emerald-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#34D399" />
                <stop offset="60%" stop-color="#059669" />
                <stop offset="100%" stop-color="#064E3B" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="40" fill="#0F172A" stroke="url(#emerald-grad)" stroke-width="2" />
            <!-- Open Codex Book Geometric Wings -->
            <path d="M25,65 Q50,55 50,35 Q50,55 75,65 L75,40 Q50,30 50,18 Q50,30 25,40 Z" fill="url(#emerald-grad)" opacity="0.9" />
            <path d="M50,18 L50,68" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" />
            <circle cx="50" cy="30" r="5" fill="#FBBF24" />
          </svg>
        `;

      case 'voyager':
        return `
          <svg class="procedural-trophy" viewBox="0 0 100 100" width="${size}" height="${size}" aria-label="Deep Voyager Astrolabe" role="img">
            <defs>
              <linearGradient id="voyager-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#38BDF8" />
                <stop offset="50%" stop-color="#6366F1" />
                <stop offset="100%" stop-color="#4338CA" />
              </linearGradient>
              <linearGradient id="voyager-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#FDE047" />
                <stop offset="100%" stop-color="#CA8A04" />
              </linearGradient>
              <filter id="voyager-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.3" />
              </filter>
            </defs>
            <g filter="url(#voyager-glow)">
              <circle cx="50" cy="50" r="40" fill="#0b0f19" stroke="url(#voyager-grad)" stroke-width="2" />
              <!-- Outer Astrolabe Gimbal Ring -->
              <ellipse cx="50" cy="50" rx="32" ry="14" fill="none" stroke="url(#voyager-gold)" stroke-width="1.8" transform="rotate(-30 50 50)" />
              <ellipse cx="50" cy="50" rx="32" ry="14" fill="none" stroke="url(#voyager-grad)" stroke-width="1.8" transform="rotate(30 50 50)" />
              <!-- Horizon Ring -->
              <ellipse cx="50" cy="50" rx="30" ry="8" fill="none" stroke="#FFFFFF" stroke-width="1" stroke-dasharray="3 2" opacity="0.75" />
              <!-- Celestial Core Star -->
              <polygon points="50,38 53,47 62,50 53,53 50,62 47,53 38,50 47,47" fill="url(#voyager-gold)" />
              <circle cx="50" cy="50" r="3" fill="#FFFFFF" />
            </g>
          </svg>
        `;

      case 'prism':
      default:
        return `
          <svg class="procedural-trophy" viewBox="0 0 100 100" width="${size}" height="${size}" aria-label="Knowledge Prism" role="img">
            <defs>
              <linearGradient id="prism-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#F43F5E" />
                <stop offset="50%" stop-color="#8B5CF6" />
                <stop offset="100%" stop-color="#06B6D4" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="38" fill="#18212E" stroke="url(#prism-grad)" stroke-width="2" />
            <!-- 3D Refractive Triangular Prism -->
            <polygon points="50,22 78,72 22,72" fill="none" stroke="url(#prism-grad)" stroke-width="3" stroke-linejoin="round" />
            <polygon points="50,22 50,72 22,72" fill="rgba(244,63,94,0.3)" />
            <polygon points="50,22 78,72 50,72" fill="rgba(6,182,212,0.35)" />
            <!-- Incident Ray & Dispersion -->
            <line x1="12" y1="48" x2="38" y2="48" stroke="#FFFFFF" stroke-width="2.5" />
            <line x1="62" y1="44" x2="88" y2="36" stroke="#F43F5E" stroke-width="1.8" />
            <line x1="64" y1="50" x2="90" y2="50" stroke="#FBBF24" stroke-width="1.8" />
            <line x1="62" y1="56" x2="88" y2="64" stroke="#06B6D4" stroke-width="1.8" />
          </svg>
        `;
    }
  }
};
