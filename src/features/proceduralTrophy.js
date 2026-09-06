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
                <stop offset="35%" stop-color="#F59E0B" />
                <stop offset="70%" stop-color="#D97706" />
                <stop offset="100%" stop-color="#78350F" />
              </linearGradient>
              <linearGradient id="gold-rim" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#FEF08A" />
                <stop offset="50%" stop-color="#B45309" />
                <stop offset="100%" stop-color="#FFFBEB" />
              </linearGradient>
              <linearGradient id="lapis-specular" x1="15%" y1="15%" x2="85%" y2="85%">
                <stop offset="0%" stop-color="#93C5FD" />
                <stop offset="40%" stop-color="#3B82F6" />
                <stop offset="80%" stop-color="#1D4ED8" />
                <stop offset="100%" stop-color="#0F172A" />
              </linearGradient>
              <filter id="trophy-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="0.4" />
              </filter>
            </defs>
            <g filter="url(#trophy-shadow)">
              <!-- Outer Golden Laurel Ring with Coin Edge -->
              <circle cx="50" cy="50" r="44" fill="none" stroke="url(#gold-grad)" stroke-width="2.5" />
              <circle cx="50" cy="50" r="40" fill="#0B132B" stroke="url(#gold-rim)" stroke-width="1.5" stroke-dasharray="4 2" />
              <circle cx="50" cy="50" r="36" fill="#131C31" stroke="url(#gold-grad)" stroke-width="1" />
              
              <!-- 3D Laurel Leaf Sprigs -->
              <path d="M14,48 Q20,38 30,42 Q22,48 14,48 Z" fill="url(#gold-grad)" opacity="0.9" />
              <path d="M86,48 Q80,38 70,42 Q78,48 86,48 Z" fill="url(#gold-grad)" opacity="0.9" />
              <path d="M18,62 Q26,56 34,64 Q24,68 18,62 Z" fill="url(#gold-grad)" opacity="0.85" />
              <path d="M82,62 Q74,56 66,64 Q76,68 82,62 Z" fill="url(#gold-grad)" opacity="0.85" />

              <!-- Geometric 3D Facet Star -->
              <polygon points="50,18 57,34 74,36 61,48 66,66 50,57 34,66 39,48 26,36 43,34" fill="url(#gold-grad)" opacity="0.92" />
              <polygon points="50,18 57,34 50,44 43,34" fill="#FEF3C7" opacity="0.75" />
              <polygon points="74,36 61,48 50,44 57,34" fill="#F59E0B" opacity="0.8" />
              <polygon points="66,66 50,57 50,44 61,48" fill="#B45309" opacity="0.9" />
              <polygon points="34,66 50,57 50,44 39,48" fill="#78350F" opacity="0.95" />
              <polygon points="26,36 39,48 50,44 43,34" fill="#D97706" opacity="0.85" />
              
              <!-- Central 3D Refractive Lapis Octahedron -->
              <polygon points="50,30 63,47 50,64 37,47" fill="url(#lapis-specular)" />
              <polygon points="50,30 63,47 50,47" fill="#BFDBFE" opacity="0.7" />
              <polygon points="50,47 63,47 50,64" fill="#1D4ED8" opacity="0.85" />
              <polygon points="37,47 50,47 50,64" fill="#1E3A8A" opacity="0.95" />
              <polygon points="37,47 50,30 50,47" fill="#60A5FA" opacity="0.8" />
              
              <!-- Core Diamond Flare -->
              <polygon points="50,43 51.5,47 55,47 52,49 53,52 50,50 47,52 48,49 45,47 48.5,47" fill="#FFFFFF" />
              <circle cx="50" cy="47" r="1.5" fill="#FFFFFF" />
            </g>
          </svg>
        `;

      case 'scholar':
        return `
          <svg class="procedural-trophy" viewBox="0 0 100 100" width="${size}" height="${size}" aria-label="Scholar Laurels" role="img">
            <defs>
              <linearGradient id="emerald-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#6EE7B7" />
                <stop offset="40%" stop-color="#10B981" />
                <stop offset="80%" stop-color="#059669" />
                <stop offset="100%" stop-color="#064E3B" />
              </linearGradient>
              <linearGradient id="page-paper" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#FFFFFF" />
                <stop offset="70%" stop-color="#F1F5F9" />
                <stop offset="100%" stop-color="#CBD5E1" />
              </linearGradient>
              <linearGradient id="ribbon-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#FDE047" />
                <stop offset="100%" stop-color="#B45309" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="42" fill="#0A1612" stroke="url(#emerald-grad)" stroke-width="2" />
            
            <!-- Open Codex 3D Perspective Pages -->
            <!-- Hardcover wings -->
            <path d="M20,68 Q50,58 50,38 Q50,58 80,68 L82,42 Q50,32 50,18 Q50,32 18,42 Z" fill="url(#emerald-grad)" opacity="0.95" />
            <!-- Left page deck -->
            <path d="M22,65 Q50,55 50,36 L50,19 Q50,33 21,39 Z" fill="url(#page-paper)" />
            <!-- Right page deck -->
            <path d="M78,65 Q50,55 50,36 L50,19 Q50,33 79,39 Z" fill="#E2E8F0" />
            <!-- Center spine crease shadow -->
            <line x1="50" y1="19" x2="50" y2="68" stroke="#064E3B" stroke-width="2" stroke-linecap="round" />
            
            <!-- Page Text Rule Indications in 3D perspective -->
            <line x1="28" y1="38" x2="44" y2="34" stroke="#94A3B8" stroke-width="1.2" stroke-linecap="round" />
            <line x1="27" y1="44" x2="45" y2="40" stroke="#94A3B8" stroke-width="1.2" stroke-linecap="round" />
            <line x1="26" y1="50" x2="45" y2="46" stroke="#94A3B8" stroke-width="1.2" stroke-linecap="round" />
            
            <line x1="55" y1="34" x2="72" y2="38" stroke="#94A3B8" stroke-width="1.2" stroke-linecap="round" />
            <line x1="55" y1="40" x2="73" y2="44" stroke="#94A3B8" stroke-width="1.2" stroke-linecap="round" />
            <line x1="55" y1="46" x2="74" y2="50" stroke="#94A3B8" stroke-width="1.2" stroke-linecap="round" />

            <!-- Golden Ribbon Bookmark with Hanging End -->
            <path d="M50,22 Q52,48 56,76 L52,73 L48,76 Q49,48 50,22 Z" fill="url(#ribbon-gold)" />

            <!-- Wisdom Aura Crest (5 Golden Laurel Pearls) -->
            <circle cx="50" cy="12" r="3.5" fill="#FBBF24" />
            <circle cx="38" cy="15" r="2.5" fill="#FDE047" />
            <circle cx="62" cy="15" r="2.5" fill="#FDE047" />
            <circle cx="28" cy="22" r="2" fill="#FDE68A" />
            <circle cx="72" cy="22" r="2" fill="#FDE68A" />
          </svg>
        `;

      case 'voyager':
        return `
          <svg class="procedural-trophy" viewBox="0 0 100 100" width="${size}" height="${size}" aria-label="Deep Voyager Astrolabe" role="img">
            <defs>
              <linearGradient id="voyager-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#38BDF8" />
                <stop offset="40%" stop-color="#6366F1" />
                <stop offset="80%" stop-color="#4338CA" />
                <stop offset="100%" stop-color="#1E1B4B" />
              </linearGradient>
              <linearGradient id="voyager-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#FEF08A" />
                <stop offset="50%" stop-color="#F59E0B" />
                <stop offset="100%" stop-color="#92400E" />
              </linearGradient>
              <filter id="voyager-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.35" />
              </filter>
            </defs>
            <g filter="url(#voyager-glow)">
              <!-- Cosmic Void Base Disk -->
              <circle cx="50" cy="50" r="42" fill="#080C1A" stroke="url(#voyager-grad)" stroke-width="2.5" />
              <circle cx="50" cy="50" r="39" fill="none" stroke="#6366F1" stroke-width="0.8" stroke-dasharray="2 3" opacity="0.6" />
              
              <!-- Outer Astrolabe Gimbal Ring (Gold Brass) -->
              <ellipse cx="50" cy="50" rx="34" ry="14" fill="none" stroke="url(#voyager-gold)" stroke-width="2.2" transform="rotate(-30 50 50)" />
              
              <!-- Polar Meridian Ring (Indigo Cosmic) -->
              <ellipse cx="50" cy="50" rx="34" ry="14" fill="none" stroke="url(#voyager-grad)" stroke-width="2.2" transform="rotate(30 50 50)" />
              
              <!-- Oblique Coordinate Ring (Cyan dashed) -->
              <ellipse cx="50" cy="50" rx="32" ry="8" fill="none" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.85" />
              
              <!-- Horizon Ring with Azimuth Ticks -->
              <line x1="16" y1="50" x2="84" y2="50" stroke="#FFFFFF" stroke-width="1.2" opacity="0.75" />
              <line x1="50" y1="16" x2="50" y2="84" stroke="#FFFFFF" stroke-width="1.2" opacity="0.75" />

              <!-- Central 8-Point Navigational Celestial Star -->
              <polygon points="50,34 53,46 66,50 53,54 50,66 47,54 34,50 47,46" fill="url(#voyager-gold)" />
              <polygon points="50,38 52,47 62,50 52,53 50,62 48,53 38,50 48,47" fill="#FEF9C3" opacity="0.8" />
              <circle cx="50" cy="50" r="3.5" fill="#FFFFFF" />
            </g>
          </svg>
        `;

      case 'crystal':
        return `
          <svg class="procedural-trophy" viewBox="0 0 100 100" width="${size}" height="${size}" aria-label="Memory Crystal" role="img">
            <defs>
              <linearGradient id="crystal-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#A7F3D0" />
                <stop offset="30%" stop-color="#06B6D4" />
                <stop offset="70%" stop-color="#3B82F6" />
                <stop offset="100%" stop-color="#1E1B4B" />
              </linearGradient>
              <linearGradient id="crystal-facet-lit" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#67E8F9" />
                <stop offset="100%" stop-color="#0284C7" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="42" fill="#07121F" stroke="url(#crystal-grad)" stroke-width="2" />
            
            <!-- Floating 3D Telemetry Ring -->
            <ellipse cx="50" cy="52" rx="36" ry="11" fill="none" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.7" transform="rotate(-15 50 52)" />
            <circle cx="20" cy="46" r="2" fill="#67E8F9" />
            <circle cx="80" cy="58" r="2" fill="#67E8F9" />

            <!-- 3D Hexagonal Prism Crystal Body in Isometric Projection -->
            <!-- Left body face -->
            <polygon points="34,36 50,42 50,78 34,70" fill="url(#crystal-facet-lit)" opacity="0.85" />
            <!-- Center body face (specular lit) -->
            <polygon points="50,42 66,36 66,70 50,78" fill="#0284C7" opacity="0.95" />
            
            <!-- Top Apex Facets -->
            <polygon points="50,16 34,36 50,42" fill="#A7F3D0" opacity="0.95" />
            <polygon points="50,16 50,42 66,36" fill="#38BDF8" opacity="0.9" />
            <polygon points="50,16 66,36 60,22" fill="#0369A1" opacity="0.8" />
            
            <!-- Internal Luminous Energy Inclusions -->
            <line x1="50" y1="26" x2="50" y2="70" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" opacity="0.9" />
            <line x1="42" y1="46" x2="50" y2="52" stroke="#E0F2FE" stroke-width="1.2" opacity="0.75" />
            <line x1="50" y1="58" x2="58" y2="52" stroke="#E0F2FE" stroke-width="1.2" opacity="0.75" />
            
            <!-- Floating Quantum Particle Sparks -->
            <circle cx="28" cy="24" r="1.5" fill="#67E8F9" />
            <circle cx="74" cy="28" r="2" fill="#A7F3D0" />
            <circle cx="50" cy="14" r="2" fill="#FFFFFF" />
          </svg>
        `;

      case 'desk':
        return `
          <svg class="procedural-trophy" viewBox="0 0 100 100" width="${size}" height="${size}" aria-label="Cornell Study Desk" role="img">
            <defs>
              <linearGradient id="wood-top" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#B45309" />
                <stop offset="50%" stop-color="#78350F" />
                <stop offset="100%" stop-color="#451A03" />
              </linearGradient>
              <linearGradient id="brass-lamp" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#FEF08A" />
                <stop offset="60%" stop-color="#D97706" />
                <stop offset="100%" stop-color="#78350F" />
              </linearGradient>
              <radialGradient id="lamp-glow" cx="32%" cy="40%" r="60%">
                <stop offset="0%" stop-color="#FEF08A" stop-opacity="0.5" />
                <stop offset="100%" stop-color="#FEF08A" stop-opacity="0" />
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="42" fill="#140F0B" stroke="url(#wood-top)" stroke-width="2" />
            
            <!-- Volumetric Light Beam from Desk Lamp -->
            <polygon points="32,32 10,78 68,78" fill="url(#lamp-glow)" />

            <!-- 3D Isometric Walnut Desk Top -->
            <polygon points="50,44 82,56 50,68 18,56" fill="url(#wood-top)" stroke="#D97706" stroke-width="0.8" />
            <!-- Desk Front Bevel Edge -->
            <polygon points="18,56 50,68 50,74 18,62" fill="#451A03" />
            <polygon points="50,68 82,56 82,62 50,74" fill="#290E02" />

            <!-- Open Cornell Notebook Resting on Desk -->
            <polygon points="46,53 66,59 58,64 38,58" fill="#F8FAFC" />
            <line x1="45" y1="56" x2="52" y2="61" stroke="#94A3B8" stroke-width="0.8" />
            <line x1="53" y1="56" x2="62" y2="60" stroke="#CBD5E1" stroke-width="0.8" />

            <!-- Brass Desk Reading Lamp -->
            <!-- Base on desk -->
            <ellipse cx="28" cy="50" rx="5" ry="2.5" fill="url(#brass-lamp)" />
            <!-- Curved Gooseneck Arm -->
            <path d="M28,50 Q24,34 32,30" fill="none" stroke="url(#brass-lamp)" stroke-width="2" stroke-linecap="round" />
            <!-- Lamp Dome Shade -->
            <path d="M27,29 Q32,23 37,29 L39,32 L25,32 Z" fill="url(#brass-lamp)" />
            <ellipse cx="32" cy="32" rx="6" ry="2" fill="#FEF08A" />
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
              <linearGradient id="prism-glass" x1="20%" y1="0%" x2="80%" y2="100%">
                <stop offset="0%" stop-color="rgba(255,255,255,0.7)" />
                <stop offset="50%" stop-color="rgba(139,92,246,0.25)" />
                <stop offset="100%" stop-color="rgba(6,182,212,0.4)" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="42" fill="#0F111E" stroke="url(#prism-grad)" stroke-width="2" />
            
            <!-- 3D Refractive Triangular Prism in Isometric Perspective -->
            <!-- Back shadow plane -->
            <polygon points="50,18 78,70 22,70" fill="none" stroke="url(#prism-grad)" stroke-width="2.5" stroke-linejoin="round" />
            <!-- Left front facet -->
            <polygon points="50,18 50,70 22,70" fill="rgba(244,63,94,0.35)" />
            <!-- Right front facet -->
            <polygon points="50,18 78,70 50,70" fill="url(#prism-glass)" />
            <!-- Specular edge highlight -->
            <line x1="50" y1="18" x2="50" y2="70" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" opacity="0.9" />

            <!-- Incident White Light Beam & Point of Entry Spark -->
            <line x1="8" y1="46" x2="38" y2="46" stroke="#FFFFFF" stroke-width="2.8" stroke-linecap="round" />
            <circle cx="38" cy="46" r="2.5" fill="#FFFFFF" />

            <!-- Internal Refraction Splitting Ray -->
            <line x1="38" y1="46" x2="62" y2="50" stroke="rgba(255,255,255,0.85)" stroke-width="2" />

            <!-- Spectral Chromatic Dispersion (Red, Amber, Emerald, Cyan, Violet) -->
            <line x1="62" y1="44" x2="94" y2="34" stroke="#EF4444" stroke-width="2" stroke-linecap="round" />
            <line x1="63" y1="47" x2="95" y2="42" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" />
            <line x1="64" y1="50" x2="95" y2="50" stroke="#10B981" stroke-width="2" stroke-linecap="round" />
            <line x1="63" y1="53" x2="94" y2="58" stroke="#06B6D4" stroke-width="2" stroke-linecap="round" />
            <line x1="62" y1="56" x2="92" y2="66" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" />
          </svg>
        `;
    }
  }
};
