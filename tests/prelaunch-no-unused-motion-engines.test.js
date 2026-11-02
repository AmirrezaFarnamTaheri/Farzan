import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('pre-release animation and zoom entry footprint', () => {
  it('does not ship unused custom Timeline and CanvasZoom constructors', () => {
    expect(fs.existsSync('src/lib/timeline.js')).toBe(false);
    expect(fs.existsSync('src/features/canvasZoom.js')).toBe(false);
    const entry = fs.readFileSync('src/index.js', 'utf8');
    const shell = fs.readFileSync('app.js', 'utf8');
    const route = fs.readFileSync('canvas.js', 'utf8');
    expect(entry).not.toMatch(/Timeline|lib\/timeline/);
    expect(shell).not.toMatch(/CanvasZoom|features\/canvasZoom/);
    expect(route).toContain('screenToWorld');
  });
  it('excludes unconsumed chart, graph and custom CanvasTools engines from the prelaunch app', () => {
    const obsolete = [
      'src/features/courseGraph.js',
      'src/features/knowledgeGraph.js',
      'src/features/canvasCharts/area.js',
      'src/features/canvasCharts/gauge.js',
      'src/features/canvasCharts/heatmap.js',
      'src/features/canvasCharts/treemap.js',
      'src/features/chartPlugins/arc.js',
      'src/features/chartPlugins/calendarGrid.js',
      'src/features/chartPlugins/gauge.js',
      'src/features/chartPlugins/heatmap.js',
      'src/features/chartPlugins/sparkline.js',
      'src/features/canvasTools/index.js',
      'src/features/canvasTools/registry.js',
      'src/features/canvasTools/toolBase.js',
    ];
    for (const path of obsolete) {
      expect(fs.existsSync(path), path + ' must not be shipped').toBe(false);
    }
    const shell = fs.readFileSync('app.js', 'utf8');
    const canvas = fs.readFileSync('canvas.js', 'utf8');
    expect(shell).not.toMatch(/CanvasCharts|ChartPlugins|CourseGraph|KnowledgeGraph|\bCharts\.init\(|\bHeatmap\s*=\s*\{/);
    expect(canvas).not.toContain('CanvasTools');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
    expect(pkg.dependencies).not.toHaveProperty('d3-force');
    expect(lock.packages[''].dependencies).not.toHaveProperty('d3-force');
    for (const name of ['d3-force', 'd3-quadtree', 'd3-timer', 'd3-dispatch']) {
      expect(lock.packages).not.toHaveProperty('node_modules/' + name);
    }
  });
  it('does not expose unused loading and pagination compatibility facades', () => {
    const shell = fs.readFileSync('app.js', 'utf8');
    for (const obsolete of [
      'const Skeleton = {',
      'const InfiniteScroll = {',
      'OpenCourseDeck.Skeleton',
      'OpenCourseDeck.InfiniteScroll',
      'OpenCourseDeck.plugins =',
    ]) {
      expect(shell, obsolete + ' is unused public code').not.toContain(obsolete);
    }
    // Native route skeleton HTML and the active study scrolling CSS stay
    // independently owned; this removes only their unconsumed JS facade.
    const html = fs.readFileSync('index.html', 'utf8');
    expect(html).toContain('id="app-loading"');
  });


});
