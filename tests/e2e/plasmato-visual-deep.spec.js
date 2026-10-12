import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// The second visual pass deliberately captures NEW viewports and NEW behavior.
// No screenshot is rendered synthetically. Each PNG comes from live Chrome.
test.use({ channel: 'chrome' });
test.setTimeout(270000);
const root = path.resolve('artifacts/visual-audit');
const routes = ['home','courses','my-courses','materials','notes','pdf',
  'progress','playlists','bookmarks','tags','flashcards','studio',
  'achievements','settings','help'];
const modes = [
  { group:'medium-phone',width:480,height:880 },
  { group:'phone-landscape',width:844,height:390 },
  { group:'tablet-portrait',width:768,height:1024 },
  { group:'tablet-landscape',width:1180,height:820 },
  { group:'light-rtl-desktop',width:1440,height:900,light:true,rtl:true },
  { group:'light-rtl-phone',width:390,height:844,light:true,rtl:true },
  { group:'high-contrast',width:1280,height:800,contrast:true },
  { group:'forced-colors',width:1280,height:800,forcedColors:true },
  // At 200% browser page zoom, an unzoomed 1280x900 screen exposes only
  // 640x450 CSS layout pixels. CSS style.zoom=2 is NOT equivalent: it
  // leaves media queries at 1280px and manufactures invalid desktop grids.
  { group:'zoom-200',width:640,height:450,effectiveZoom:2 },
  { group:'scroll-bottom',width:1440,height:900,scrollBottom:true },
];
function record(payload) {
  fs.mkdirSync(root,{recursive:true});
  fs.appendFileSync(path.join(root,'observations.jsonl'),
    JSON.stringify({suite:'deep',...payload,at:new Date().toISOString()})+'\n');
}
async function screenshot(page,group,name){
  const dir=path.join(root,'screenshots',group);
  fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,name+'.png');
  await page.screenshot({path:file,animations:'disabled',caret:'hide',timeout:25000});
  const [meta,stat]=await Promise.all([sharp(file).metadata(),sharp(file).stats()]);
  const average=stat.channels.slice(0,3).reduce((sum,c)=>sum+c.mean,0)/3;
  const variation=stat.channels.slice(0,3).reduce((sum,c)=>sum+c.stdev,0)/3;
  expect(meta.width).toBe(page.viewportSize().width);
  expect(meta.height).toBe(page.viewportSize().height);
  expect(average,'Blank frame: '+group+'/'+name).toBeGreaterThan(8);
  expect(variation,'Uniform frame: '+group+'/'+name).toBeGreaterThan(7);
  expect(fs.statSync(file).size,'Suspiciously small PNG').toBeGreaterThan(12000);
  record({group,name,file:path.relative(root,file).split(path.sep).join('/'),
    viewport:page.viewportSize(),average,variation,bytes:fs.statSync(file).size});
}
async function boot(page,route='home'){
  await page.goto('/#/'+route,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#view-container')).toBeVisible();
  await page.waitForFunction(()=>Boolean(window.DataStore?.getState &&
    window.OpenCourseDeck?.Router),null,{timeout:20000});
}
async function visit(page,route){
  await page.evaluate(r=>{window.location.hash='#/'+r;},route);
  await expect.poll(()=>page.evaluate(()=>location.hash)).toBe('#/'+route);
  await expect.poll(()=>page.locator('#view-container').evaluate(
    el=>el.innerText?.trim().length||0),{timeout:15000}).toBeGreaterThan(10);
  await page.waitForTimeout(220);
}
function allScrollContainers(){
  const root=document.querySelector('#view-container');
  const main=document.querySelector('.main-content');
  const holders=[root,main,document.scrollingElement,document.body];
  let moved=false;
  for(const el of holders){
    if(el?.scrollHeight>el?.clientHeight+20){
      el.scrollTop=el.scrollHeight;
      moved=moved||el.scrollTop>0;
    }
  }
  return moved;
}
for (const cfg of modes) {
  test('15 rendered app panels at '+cfg.group,async({page})=>{
    await page.setViewportSize({width:cfg.width,height:cfg.height});
    if(cfg.contrast)await page.emulateMedia({contrast:'more'});
    if(cfg.forcedColors)await page.emulateMedia({forcedColors:'active'});
    const exceptions=[];page.on('pageerror',e=>exceptions.push(e.message));
    await boot(page,'settings');
    if(cfg.light) {
      await page.locator('#btn-theme-toggle').click();
      await expect.poll(()=>page.locator('html').getAttribute('data-theme')).not.toBe('dark');
    }
    if(cfg.effectiveZoom) {
      // Exercise the effective layout viewport after browser 200% zoom,
      // rather than injecting CSS zoom and bypassing media-query reflow.
      expect(page.viewportSize()).toEqual({ width: 640, height: 450 });
    }
    let scrolled=0;
    const errors=[];
    for(let i=0;i<routes.length;i++){
      const route=routes[i],name=String(i+1).padStart(2,'0')+'-'+route;
      try{
        await visit(page,route);
        if(cfg.rtl)await page.evaluate(()=>{document.documentElement.dir='rtl';});
        // The route's finite 420ms entrance and a live RTL direction switch
        // can overlap. DOM text exists even when the view is visually still
        // opacity:0; waiting only for innerText allowed a blank screenshot to
        // pass. Require completed paint before recording a visual frame.
        await expect.poll(() => page.locator('#view-container .view').first()
          .evaluate(el => {
            const opacity = Number(getComputedStyle(el).opacity);
            const animating = el.getAnimations({ subtree: false }).some(a =>
              a.playState === 'running' && Number(a.effect?.getComputedTiming()?.endTime) > 0);
            return Number.isFinite(opacity) && opacity >= 0.995 && !animating;
          }), { timeout: 7000, message: 'Route must finish entrance before screenshot' }).toBe(true);
        if (cfg.rtl && route === 'home') {
          // The shell can be RTL, but English sentence punctuation must stay
          // with the English text instead of appearing at the leading edge.
          const sentence = page.locator('.home-title bdi');
          await expect(sentence).toHaveText('Back to your studies.');
          expect(await sentence.evaluate(el => getComputedStyle(el).direction)).toBe('ltr');
          await expect(page.locator('[data-home-focus-detail]')).toHaveAttribute('dir', 'auto');
          expect(await page.locator('[data-home-focus-detail]').evaluate(el => getComputedStyle(el).direction)).toBe('ltr');
          await expect(page.locator('#home-focus-title')).toHaveAttribute('dir', 'auto');
        }
        if (cfg.rtl && route === 'courses') {
          await expect(page.locator('#courses-search')).toHaveAttribute('dir', 'auto');
          const courseMeta = page.locator('.course-item-meta bdi').first();
          await expect(courseMeta).toHaveAttribute('dir', 'ltr');
          await expect(courseMeta).toContainText(/\\d+ topics - \\d+ source\\(s\\)/);
        }
        if (cfg.rtl && route === 'materials') {
          await expect(page.locator('#materials-search')).toHaveAttribute('dir', 'auto');
          await expect(page.locator('#materials-pager .text-sm').first()).toHaveAttribute('dir', 'ltr');
        }
        if (cfg.rtl && route === 'notes') {
          const titleState = await page.locator('[data-note-title-input]').evaluate(el => {
            const computed = getComputedStyle(el);
            return {
              directionMode: el.getAttribute('dir'),
              inlinePadding: parseFloat(computed.paddingInlineStart),
              alignment: computed.textAlign,
            };
          });
          expect(titleState.directionMode).toBe('auto');
          expect(titleState.inlinePadding).toBeGreaterThanOrEqual(6);
          expect(titleState.alignment).toBe('start');
          await expect(page.locator('[data-notes-editor]')).toHaveAttribute('dir', 'auto');
          await expect(page.locator('[data-notes-search]')).toHaveAttribute('dir', 'auto');
          const subtitle = page.locator('.notes-page-header .page-subtitle bdi');
          await expect(subtitle).toContainText('link them to courses.');
          expect(await subtitle.evaluate(el => getComputedStyle(el).direction)).toBe('ltr');
        }
        if (route === 'notes' && (cfg.group === 'phone-landscape' || cfg.group === 'zoom-200')) {
          // Restoring a saved note must not scroll the short viewport past
          // the document heading before the user can see its controls.
          await expect(page.locator('.notes-page-header .page-title')).toBeInViewport({ ratio: 0.8 });
        }
        if (route === 'pdf' && !cfg.scrollBottom) {
          await expect(page.locator('[data-pdf-current-page]')).toBeDisabled();
          await expect(page.locator('[data-pdf-current-page]')).toHaveValue('—');
          await expect(page.locator('[data-pdf-save-page-note]')).toBeDisabled();
          await expect(page.locator('[data-pdf-empty-hint]')).toBeVisible();
        }
        if(cfg.scrollBottom) {
          if(await page.evaluate(allScrollContainers))scrolled++;
        }
        const health=await page.evaluate(()=>{
          const main=document.querySelector('#view-container');
          const visibleView = main?.querySelector('.view');
          const viewOpacity = Number(visibleView ? getComputedStyle(visibleView).opacity : 0);
          const rect=main?.getBoundingClientRect();
          return {visible:!!rect&&rect.width>0&&rect.height>0,
            viewOpacity,
            textLength:main?.innerText?.trim().length||0,
            overflow:Math.max(document.body.scrollWidth,
              document.documentElement.scrollWidth)-innerWidth,
            brokenImages:[...document.images].filter(img=>
              img.complete && img.naturalWidth===0 && img.getAttribute('src')).length,
            routeErrors:main?.querySelectorAll('.route-error,.view-error,[data-route-error]').length||0};
        });
        record({group:cfg.group,route,health});
        if(!health.visible||health.viewOpacity<0.995||
          health.textLength<10||health.overflow>28||
          health.brokenImages||health.routeErrors)errors.push({route,health});
        if(cfg.group === 'small-mobile' && route === 'notes') {
          const title = page.locator('[data-note-title-input]');
          await expect(title).toBeVisible();
          const box = await title.boundingBox();
          expect(box.y, 'Phone note editor title must be visible before scrolling')
            .toBeLessThan(cfg.height - 95);
          const state = await page.locator('.notes-sidebar').evaluate(el => ({
            overflow: getComputedStyle(el).overflowY,
            height: el.clientHeight,
          }));
          expect(state.overflow).toBe('auto');
          expect(state.height).toBeLessThanOrEqual(295);
        }
        await screenshot(page,cfg.group,name);
      }catch(e){errors.push({route,error:e.message});record({group:cfg.group,route,error:e.message});}
    }
    if(cfg.scrollBottom) expect(scrolled,'No independently scrolled application views').toBeGreaterThan(0);
    expect(errors,'Layout or route regression in '+cfg.group).toEqual([]);
    expect(exceptions,'Uncaught browser errors in '+cfg.group).toEqual([]);
  });
}
test('mobile navigation and global chrome reveal real live controls',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await boot(page);
  await page.locator('#mobile-menu-btn').click();
  await expect(page.locator('#mobile-menu-btn')).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('#sidebar')).toHaveClass(/sidebar-mobile-open/);
  await expect.poll(() => page.evaluate(() => {
    const drawer = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    return Boolean(drawer && overlay && overlay.parentElement === drawer.parentElement);
  })).toBe(true);
  // aria-expanded changes immediately, but the drawer transitions from
  // offscreen. Do not screenshot a uniformly darkened backdrop mid-animation.
  await expect.poll(() => page.locator('#sidebar').evaluate(el => {
    const box = el.getBoundingClientRect();
    return Math.max(0, Math.min(box.right, innerWidth) - Math.max(box.left, 0));
  })).toBeGreaterThan(220);
  await expect.poll(() => page.evaluate(() => {
    const link = document.querySelector('#sidebar a[href="#/notes"]');
    if (!link) return false;
    const rect = link.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const node = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return Boolean(node && (node === link || link.contains(node)));
  })).toBe(true);
  // On mobile the drawer cannot trade useful search text for a keyboard-only
  // Ctrl+K badge. Keep the field readable and all navigation links operable.
  await expect(page.locator('#sidebar .sidebar-search-kbd')).toBeHidden();
  await screenshot(page,'deep-actions','01-mobile-navigation-open');
  await page.locator('#sidebar a[href="#/notes"]').first().click();
  await expect(page).toHaveURL(/#\/notes/);
  await expect(page.locator('#mobile-menu-btn')).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('#sidebar')).not.toHaveClass(/sidebar-mobile-open/);
  await screenshot(page,'deep-actions','02-mobile-navigation-complete');
  await page.setViewportSize({width:1280,height:800});
  await visit(page,'home');
  await page.locator('#topbar-add-btn').click();
  await expect(page.locator('#topbar-add-btn')).toHaveAttribute('aria-expanded','true');
  await screenshot(page,'deep-actions','03-add-content-menu');
  await page.keyboard.press('Escape');
  await page.locator('#topbar-notifications-btn').click();
  await expect(page.locator('#notifications-panel')).toBeVisible();
  await screenshot(page,'deep-actions','04-notifications-panel');
  await page.locator('#notif-close').click();
  await page.locator('#command-palette-btn').click();
  await expect(page.locator('#command-palette-overlay')).toHaveAttribute('aria-hidden','false');
  await screenshot(page,'deep-actions','05-command-palette-open');
  await page.locator('#cp-input').fill('courses');
  await expect(page.locator('#cp-results')).toContainText('Courses');
  await screenshot(page,'deep-actions','06-command-palette-filtered');
});
test('Plasmato course and Materials filters visibly change correct records',async({page})=>{
  await page.setViewportSize({width:1280,height:800});
  await boot(page,'courses');
  await page.locator('.course-item[data-course-id="comprehensive-internal-medicine-course"]').click();
  await expect(page.locator('#course-detail')).toContainText('385 topics');
  await screenshot(page,'deep-actions','07-plasmato-course-open');
  await page.locator('[data-course-filter="video"]').click();
  await screenshot(page,'deep-actions','08-course-video-filter');
  await page.locator('[data-course-filter="pdf"]').click();
  await screenshot(page,'deep-actions','09-course-pdf-filter');
  await page.locator('#courses-search').fill('unlikely-visual-audit-topic-27182');
  await expect(page.locator('#courses-list')).toContainText('No courses match');
  await screenshot(page,'deep-actions','10-course-no-results');
  await page.locator('#courses-search').fill('');
  await page.locator('[data-course-filter="all"]').click();
  await page.locator('.course-item[data-course-id="comprehensive-internal-medicine-course"]').click();
  await screenshot(page,'deep-actions','11-course-restored');
});
test('real note writing autosaves, reloads and exposes usable export',async({page})=>{
  await page.setViewportSize({width:1280,height:800});
  await boot(page,'notes');
  await page.locator('[data-action="new-note"]').first().click();
  await page.locator('[data-note-title-input]').fill('Deep Visual Audit Plasmato Notes');
  await screenshot(page,'deep-actions','12-new-note-titled');
  await page.locator('[data-notes-editor]').fill('Clinical note written in real Chrome. Verify source material and revisit lesson.');
  await expect.poll(()=>page.evaluate(async()=>(
    await window.DB.getAllNotes()).some(n=>n.title==='Deep Visual Audit Plasmato Notes'&&
      String(n.content).includes('Clinical note written'))),{timeout:15000}).toBe(true);
  await screenshot(page,'deep-actions','13-note-content-autosaved');
  await visit(page,'home');
  await visit(page,'notes');
  await expect(page.locator('[data-notes-list]')).toContainText('Deep Visual Audit Plasmato Notes');
  await screenshot(page,'deep-actions','14-note-reopened');
  await page.locator('.notes-export-menu summary').click();
  await expect(page.locator('.notes-export-menu')).toHaveAttribute('open','');
  await screenshot(page,'deep-actions','15-note-export-menu');
});
test('small-screen standalone library reaches searchable resources without oversized metrics',async({page})=>{
  await page.setViewportSize({width:320,height:740});
  await page.goto('/editions/plasmato-emergency/index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#statCourses')).toHaveText('31',{timeout:15000});
  const metrics=await page.locator('.stats-grid').evaluate(el=>el.getBoundingClientRect());
  expect(metrics.height,'Stacked statistics crowd mobile course navigation').toBeLessThan(420);
  await screenshot(page,'deep-actions','16-mobile-standalone-compact-metrics');
  await page.locator('#searchInput').fill('anemia');
  await expect(page.locator('#resourceList button').first()).toBeVisible({timeout:15000});
  await screenshot(page,'deep-actions','17-mobile-standalone-search');
  await page.locator('#focusToggle').click();
  await expect(page.locator('#focusToggle')).toHaveAttribute('aria-pressed','true');
  await screenshot(page,'deep-actions','18-mobile-standalone-focus');
});
