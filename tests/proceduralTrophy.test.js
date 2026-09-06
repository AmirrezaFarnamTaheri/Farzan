import { describe, it, expect } from 'vitest';
import { ProceduralTrophy } from '../src/features/proceduralTrophy.js';

describe('ProceduralTrophy', () => {
  it('renders default trophy with default size 96 and aria-label', () => {
    const svg = ProceduralTrophy.renderTrophySvg();
    expect(svg).toContain('<svg class="procedural-trophy"');
    expect(svg).toContain('width="96"');
    expect(svg).toContain('height="96"');
    expect(svg).toContain('aria-label="Cornell Master Medallion"');
    expect(svg).toContain('role="img"');
  });

  it('respects custom size option', () => {
    const svg = ProceduralTrophy.renderTrophySvg('cornell-master', { size: 128 });
    expect(svg).toContain('width="128"');
    expect(svg).toContain('height="128"');
    expect(svg).toContain('aria-label="Cornell Master Medallion"');
  });

  it('renders cornell-master trophy with laurel ring and star geometry', () => {
    const svg = ProceduralTrophy.renderTrophySvg('cornell-master');
    expect(svg).toContain('gold-grad');
    expect(svg).toContain('gold-rim');
    expect(svg).toContain('lapis-specular');
    expect(svg).toContain('trophy-shadow');
    expect(svg).toContain('circle');
    expect(svg).toContain('polygon');
  });

  it('renders scholar trophy with codex pages and laurel pearls', () => {
    const svg = ProceduralTrophy.renderTrophySvg('scholar');
    expect(svg).toContain('aria-label="Scholar Laurels"');
    expect(svg).toContain('emerald-grad');
    expect(svg).toContain('page-paper');
    expect(svg).toContain('ribbon-gold');
  });

  it('renders voyager trophy with celestial astrolabe rings and star', () => {
    const svg = ProceduralTrophy.renderTrophySvg('voyager');
    expect(svg).toContain('aria-label="Deep Voyager Astrolabe"');
    expect(svg).toContain('voyager-grad');
    expect(svg).toContain('voyager-gold');
    expect(svg).toContain('ellipse');
  });

  it('renders crystal trophy with hexagonal prism facets and telemetry ring', () => {
    const svg = ProceduralTrophy.renderTrophySvg('crystal');
    expect(svg).toContain('aria-label="Memory Crystal"');
    expect(svg).toContain('crystal-grad');
    expect(svg).toContain('crystal-facet-lit');
  });

  it('renders desk trophy with isometric walnut desk and brass lamp', () => {
    const svg = ProceduralTrophy.renderTrophySvg('desk');
    expect(svg).toContain('aria-label="Cornell Study Desk"');
    expect(svg).toContain('wood-top');
    expect(svg).toContain('brass-lamp');
    expect(svg).toContain('lamp-glow');
  });

  it('renders prism trophy with chromatic spectral dispersion rays', () => {
    const svg = ProceduralTrophy.renderTrophySvg('prism');
    expect(svg).toContain('aria-label="Knowledge Prism"');
    expect(svg).toContain('prism-grad');
    expect(svg).toContain('prism-glass');
    expect(svg).toContain('#EF4444');
    expect(svg).toContain('#F59E0B');
    expect(svg).toContain('#10B981');
    expect(svg).toContain('#06B6D4');
    expect(svg).toContain('#8B5CF6');
  });
});
