import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
function makeVisualPdf() {
  // A contentful portrait PDF, not the blank 200 x 200 parser test fixture.
  const drawing = [
    '0.94 0.97 0.99 rg 45 555 522 190 re f',
    '0.10 0.31 0.48 rg 45 660 522 85 re f',
    '1 1 1 rg BT /F1 22 Tf 64 700 Td (Plasmato Visual Acceptance) Tj ET',
    '0.14 0.21 0.31 rg BT /F1 16 Tf 64 626 Td (Rendered in the actual PDF viewer.) Tj ET',
    'BT /F1 14 Tf 64 599 Td (A source page with visible, searchable text.) Tj ET',
    '0.12 0.53 0.74 rg 65 567 400 8 re f',
  ].join('\n') + '\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + Buffer.byteLength(drawing,'latin1') + ' >>\nstream\n' + drawing + 'endstream',
  ];
  let pdf='%PDF-1.4\n';
  const offsets=[0];
  for (let i=0;i<objects.length;i++) {
    offsets.push(Buffer.byteLength(pdf,'latin1'));
    pdf += (i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';
  }
  const xref=Buffer.byteLength(pdf,'latin1');
  pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
  for (const n of offsets.slice(1)) pdf+=String(n).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
  return Buffer.from(pdf,'latin1');
}

const root = path.resolve('artifacts/visual-audit');
const routes = ['home','courses','my-courses','materials','notes','pdf','progress','playlists','bookmarks','tags','flashcards','studio','achievements','settings','help'];
test.use({channel:'chrome'});
test.setTimeout(240000);
function log(object){fs.mkdirSync(root,{recursive:true});fs.appendFileSync(path.join(root,'observations.jsonl'),JSON.stringify(object)+'\n');}
async function shot(page,group,name){
  const folder=path.join(root,'screenshots',group);fs.mkdirSync(folder,{recursive:true});
  const file=path.join(folder,name.replace(/[^a-z0-9-]/gi,'-')+'.png');
  await page.screenshot({path:file,animations:'disabled',caret:'hide',timeout:20000});
  log({group,name,file:path.relative(root,file),viewport:page.viewportSize(),at:new Date().toISOString()});
}
async function boot(page,route='home'){
  await page.goto('/#/'+route,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#view-container')).toBeVisible();
  await page.waitForFunction(()=>Boolean(window.OpenCourseDeck?.Router&&window.DataStore?.getState),null,{timeout:20000});
}
async function visit(page,route){
  await page.evaluate(r=>{window.location.hash='#/'+r;},route);
  await expect.poll(()=>page.evaluate(()=>window.location.hash)).toBe('#/'+route);
  await page.waitForTimeout(400);
}
async function health(page){return page.evaluate(()=>{
  const body=document.body,root=document.documentElement,main=document.querySelector('#view-container');
  const rect=main?.getBoundingClientRect();
  return {hash:location.hash,title:document.title,textLength:main?.innerText?.trim().length||0,
    visible:!!rect&&rect.width>0&&rect.height>0,
    overflow:Math.max(body.scrollWidth,root.scrollWidth)-innerWidth,
    viewErrors:document.querySelectorAll('.view-error,.route-error').length,
    brokenImages:[...document.images].filter(i=>i.complete&&i.naturalWidth===0&&i.src).length,
    brokenImageSources:[...document.images].filter(i=>i.complete&&i.naturalWidth===0&&i.src).map(i=>i.src).slice(0,8),
    buttons:[...main.querySelectorAll('button,a[href],input,textarea,select')].filter(e=>e.getBoundingClientRect().width>0).length};
});}
for(const [device,width,height] of [['desktop',1440,900],['tablet',900,1080],['mobile',390,844]]){
  test('all 15 application panels at '+device,async({page})=>{
    await page.setViewportSize({width,height});await boot(page);
    const failures=[],exceptions=[];page.on('pageerror',e=>exceptions.push(e.message));
    for(let i=0;i<routes.length;i++){
      const route=routes[i],name=String(i+1).padStart(2,'0')+'-'+route;
      try{
        await visit(page,route);
        const state=await health(page);await shot(page,device,name);
        log({group:device,route,health:state});
        if(!state.visible||state.textLength<10||state.viewErrors||state.overflow>24)failures.push({route,state});
      }catch(error){failures.push({route,error:error.message});try{await shot(page,device,name+'-failed');}catch{}}
    }
    log({group:device,failures,exceptions});
    expect(failures,'Unhealthy or horizontally clipped routes').toEqual([]);
    expect(exceptions,'Unexpected JS errors').toEqual([]);
  });
}
test('Plasmato courses, actual topic progress, and Materials',async({page})=>{
  await boot(page,'courses');
  await page.waitForFunction(()=>window.DataStore?.allCourses?.().length===32,null,{timeout:25000});
  await page.locator('.course-item[data-course-id="comprehensive-internal-medicine-course"]').click();
  await expect(page.locator('#course-detail')).toContainText('385 topics');
  const topic=page.locator('#course-detail .topic-row[data-topic-id]').first();
  await expect(topic).toBeVisible();await shot(page,'functional','01-plasmato-lecture-selected');
  const id=await topic.getAttribute('data-topic-id');
  await topic.locator('[data-action="toggle-done"]').click();
  await expect.poll(()=>page.evaluate(async id=>(await window.DB.getProgress(id))?.status,id)).toBe('done');
  await shot(page,'functional','02-real-completion-saved');
  await visit(page,'materials');
  await expect(page.locator('#materials-course-filter option[value="comprehensive-internal-medicine-course"]')).toHaveCount(1);
  await page.locator('#materials-course-filter').selectOption('comprehensive-internal-medicine-course');
  await shot(page,'functional','03-filtered-plasmato-materials');
});
test('a written rich-text note autosaves and reopens',async({page})=>{
  await boot(page,'notes');await page.locator('[data-action="new-note"]').first().click();
  await page.locator('[data-note-title-input]').fill('Visual QA saved Plasmato note');
  const editor=page.locator('[data-notes-editor]');
  await expect(editor).toHaveAttribute('contenteditable','true');
  await editor.fill('I reviewed a Plasmato course lecture. This note was written and saved by a real browser.');
  await expect.poll(()=>page.evaluate(async()=>{const notes=await window.DB.getAllNotes();return notes.some(n=>n.title==='Visual QA saved Plasmato note'&&String(n.content).includes('course lecture'));}),{timeout:15000}).toBe(true);
  const editorTitleFont = await page.locator('[data-note-title-input]').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(editorTitleFont, 'Long note title should not obscure editor or saved indicator').toBeLessThanOrEqual(30);
  await shot(page,'functional','04-written-note-persisted');
  await visit(page,'home');await visit(page,'notes');
  await expect(page.locator('[data-notes-list]')).toContainText('Visual QA saved Plasmato note');
  await shot(page,'functional','05-saved-note-reopened');
});
test('a user course is created through the My Courses form',async({page})=>{
  await boot(page,'my-courses');
  await page.locator('[data-my-course-title]').fill('Visual QA Study Plan');
  await page.locator('[data-my-course-description]').fill('Functional screenshot of a genuinely saved course.');
  await page.locator('[data-my-course-save]').click();
  await expect(page.locator('[data-my-course-list]')).toContainText('Visual QA Study Plan');
  await expect.poll(()=>page.evaluate(()=>window.DataStore.allCourses().some(c=>c.title==='Visual QA Study Plan'))).toBe(true);
  await shot(page,'functional','06-my-course-created');
});
test('flashcard is created, flipped, and reviewed',async({page})=>{
  await boot(page,'flashcards');
  await page.locator('#fc-add-btn').click();
  await page.locator('#fc-new-front').fill('Which protein carries oxygen?');
  await page.locator('#fc-new-back').fill('Hemoglobin');
  await page.locator('#fc-new-deck').fill('Visual QA');
  await shot(page,'functional','07-flashcard-editor');
  await page.locator('#fc-new-save').click();
  await expect(page.locator('#fc-card-front')).toContainText('Which protein carries oxygen');
  await page.locator('#fc-flip-btn').click();
  await expect(page.locator('#fc-card-back')).toBeVisible();
  await expect(page.locator('#fc-card-back')).toContainText('Hemoglobin');
  await shot(page,'functional','08-flashcard-flipped');
  await page.locator('#fc-grade-btns [data-grade="4"]').click();
  await shot(page,'functional','09-flashcard-graded');
});
test('PDF genuinely loads and a page note persists',async({page})=>{
  await boot(page,'pdf');
  await page.locator('[data-pdf-open]').setInputFiles({name:'visual-acceptance.pdf',mimeType:'application/pdf',buffer:makeVisualPdf()});
  await expect.poll(()=>page.locator('[data-pdf-total-pages]').textContent(),{timeout:20000}).toBe('1');
  await expect(page.locator('[data-pdf-viewer] canvas').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const c=document.querySelector('[data-pdf-viewer] canvas');
    if (!c || !c.width || !c.height) return false;
    const ctx=c.getContext('2d',{willReadFrequently:true});
    const pixels=ctx.getImageData(0,0,c.width,c.height).data;
    let nonWhite=0;
    for(let i=0;i<pixels.length;i+=4*40){if(pixels[i]<220||pixels[i+1]<220||pixels[i+2]<220)nonWhite++;}
    return nonWhite>50;
  })).toBe(true);
  await shot(page,'functional','10-pdf-rendered');
  await page.locator('[data-pdf-page-note-input]').fill('PDF visual QA linked page annotation');
  await page.locator('[data-pdf-save-page-note]').click();
  await expect(page.locator('[data-pdf-page-note-status]')).toContainText('Saved page 1');
  await expect.poll(()=>page.evaluate(async()=>(await window.DB.getAllNotes()).some(n=>String(n.content).includes('PDF visual QA linked')))).toBe(true);
  await shot(page,'functional','11-pdf-page-note-saved');
});
test('playlist gets saved, displayed, and read back',async({page})=>{
  await boot(page,'playlists');
  await expect(page.locator('[data-save-playlist]')).toBeEnabled();
  await page.locator('[data-playlist-name]').fill('Visual QA Plasmato review');
  await page.locator('[data-save-playlist]').click();
  await expect(page.locator('[data-playlist-list]')).toContainText('Visual QA Plasmato review');
  await expect.poll(()=>page.evaluate(async()=>(await window.DB.getSetting('ocd_playlists')||[]).some(p=>p.title==='Visual QA Plasmato review'))).toBe(true);
  await shot(page,'functional','12-playlist-created');
});
test('theme and font settings change the actual UI',async({page})=>{
  await boot(page,'settings');
  const before=await page.locator('html').getAttribute('data-theme');
  await page.locator('#btn-theme-toggle').click();
  await expect.poll(()=>page.locator('html').getAttribute('data-theme')).not.toBe(before);
  await shot(page,'functional','13-theme-switched');
  const font=await page.locator('#font-scale-label').textContent();
  await page.locator('#btn-font-inc').click();
  await expect(page.locator('#font-scale-label')).not.toHaveText(font);
  await shot(page,'functional','14-type-scale-increased');
});
test('global search displays Plasmato results and navigates',async({page})=>{
  await boot(page);
  await page.waitForFunction(()=>Boolean(window.OpenCourseDeck?.TopbarSearch?.input && window.OpenCourseDeck?.TopbarSearch?.resultsBox),null,{timeout:15000});
  await page.locator('#sidebar-search').fill('comprehensive internal medicine');
  await page.waitForTimeout(1100);
  const searchState=await page.evaluate(()=>{
    const search=window.OpenCourseDeck.TopbarSearch;
    return {field:search.input?.value,visible:search.resultsBox?.className,
      count:search.resultsBox?.querySelectorAll('.search-result-item').length||0,
      indexed:search._universalData?.length||0,
      searchMessage:search.resultsBox?.innerText?.slice(0,350)};
  });
  log({group:'functional',behavior:'search query diagnostic',searchState});
  await shot(page,'functional','15-search-query-entered');
  await expect(page.locator('.search-result-item').first()).toBeVisible({timeout:15000});
  await shot(page,'functional','15b-global-search-results');
  await page.locator('.search-result-item').first().click();
  await expect(page).toHaveURL(/#\/courses/);
  await shot(page,'functional','16-search-result-opened');
});
test('a real browser-recorded WebM plays in the native course player',async({page})=>{
  await boot(page,'courses');
  const recorded=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');
    canvas.width=320;canvas.height=180;
    const ctx=canvas.getContext('2d');
    let frame=0;
    const draw=()=>{ctx.fillStyle='#173857';ctx.fillRect(0,0,320,180);
      ctx.fillStyle='#f59e0b';ctx.fillRect((frame++*4)%290,60,30,50);
      ctx.fillStyle='white';ctx.font='bold 21px sans-serif';ctx.fillText('VISUAL QA PLAYING',20,33);};
    draw();
    const stream=canvas.captureStream(20);
    const mime='video/webm;codecs=vp8';
    if(!MediaRecorder.isTypeSupported(mime))throw new Error('Chromium WebM video recording unavailable');
    const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:250000});
    const parts=[];rec.ondataavailable=e=>{if(e.data?.size)parts.push(e.data);};
    const stopped=new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=reject;});
    const timer=setInterval(draw,45);rec.start(300);
    await new Promise(resolve=>setTimeout(resolve,3200));
    rec.stop();await stopped;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());
    const bytes=new Uint8Array(await new Blob(parts,{type:'video/webm'}).arrayBuffer());
    return Array.from(bytes);
  });
  const bytes=Buffer.from(recorded);
  expect(bytes.length).toBeGreaterThan(3000);
  await page.route('https://visual-acceptance.invalid/clip.webm',r=>r.fulfill({status:200,contentType:'video/webm',body:bytes,headers:{'access-control-allow-origin':'*'}}));
  await boot(page,'courses');
  await page.evaluate(async()=>{
    const lib=window.OpenCourseDeck.UserLibrary;
    await lib.upsertCourse({id:'qa-playback',title:'Visual QA Playback'});
    await lib.addRemoteLink({courseId:'qa-playback',title:'Controlled WebM playback',kind:'video',url:'https://visual-acceptance.invalid/clip.webm'});
  });
  await visit(page,'my-courses');await visit(page,'courses');
  await page.locator('.course-item[data-course-id="qa-playback"]').click();
  await page.locator('#course-detail [data-action="play-video"]').first().click();
  await expect.poll(()=>page.evaluate(()=>[...document.querySelectorAll('video')].some(v=>v.readyState>=2&&v.currentTime>0.5&&!v.paused)),{timeout:20000}).toBe(true);
  await shot(page,'functional','17-real-local-video-playing');
  await page.locator('[data-save-timestamp]').click();
  await expect.poll(()=>page.evaluate(async()=>(await window.DB.getAllTimestamps()).some(item=>item.courseId==='qa-playback'))).toBe(true);
  await shot(page,'functional','18-video-timestamp-bookmarked');
  await visit(page,'bookmarks');
  await expect(page.locator('[data-bookmark-list]')).toContainText('Controlled WebM playback');
  await shot(page,'functional','19-bookmark-visible-after-video');
  log({group:'functional',behavior:'actual WebM playing via native player + timestamp bookmark saved',fixture:'recorded in Chrome',bytes:bytes.length});
});

for (const [device,width,height] of [['desktop',1440,900],['mobile',390,844]]) {
  test('all 15 routes in light theme at '+device, async ({page}) => {
    await page.setViewportSize({width,height});
    await boot(page,'settings');
    await page.locator('#btn-theme-toggle').click();
    await expect.poll(()=>page.locator('html').getAttribute('data-theme')).not.toBe('dark');
    const bad=[];
    for (let i=0;i<routes.length;i++) {
      const route=routes[i],name=String(i+1).padStart(2,'0')+'-'+route;
      try {
        await visit(page,route);
        const state=await health(page);
        await shot(page,'light-'+device,name);
        log({group:'light-'+device,route,health:state});
        if(!state.visible||state.textLength<10||state.viewErrors||state.overflow>24||state.brokenImages)bad.push({route,state});
      } catch(e) {bad.push({route,error:e.message});try{await shot(page,'light-'+device,name+'-failed');}catch{}}
    }
    expect(bad,'Light UI regression or broken assets').toEqual([]);
  });
}
test('standalone Plasmato emergency player navigates, saves resource, filters and enters focus mode',async({page})=>{
  await page.goto('/editions/plasmato-emergency/index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#statCourses')).toHaveText('31',{timeout:15000});
  await expect(page.locator('#statTopics')).toContainText('6,418');
  await shot(page,'standalone','01-standalone-course-summary');
  await page.locator('#courseList button').first().click();
  await expect(page.locator('#sourceList button').first()).toBeVisible();
  await page.locator('#sourceList button').first().click();
  await expect(page.locator('#topicList button').first()).toBeVisible();
  await page.locator('#topicList button').first().click();
  await shot(page,'standalone','02-hierarchy-drilldown');
  await page.locator('#scopeSelect').selectOption('all');
  await page.locator('#mediaSelect').selectOption('pdf');
  await expect(page.locator('#resourceList button').first()).toBeVisible();
  await page.locator('#resourceList button').first().click();
  await expect(page.locator('#favoriteButton')).toBeEnabled();
  await page.locator('#favoriteButton').click();
  await expect(page.locator('#favoriteButton')).toHaveAttribute('aria-pressed','true');
  await shot(page,'standalone','03-pdf-resource-saved');
  await page.locator('#favoritesOnlyButton').click();
  await expect(page.locator('#favoritesOnlyButton')).toHaveAttribute('aria-pressed','true');
  await page.locator('#focusToggle').click();
  await expect(page.locator('#focusToggle')).toHaveAttribute('aria-pressed','true');
  await shot(page,'standalone','04-saved-only-focus-mode');
});
test('standalone emergency viewer remains usable on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/editions/plasmato-emergency/index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#statCourses')).toHaveText('31',{timeout:15000});
  await shot(page,'standalone','05-mobile-standalone');
  await page.locator('#searchInput').fill('anemia');
  await expect(page.locator('#resourceList button').first()).toBeVisible({timeout:15000});
  await shot(page,'standalone','06-mobile-search-results');
  const overflow=await page.evaluate(()=>Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-innerWidth);
  expect(overflow).toBeLessThanOrEqual(24);
});
test('Studio adds real text and shapes and persists the resulting board',async({page})=>{
  await boot(page,'studio');
  await page.locator('[data-studio-text]').fill('Clinical decision diagram for visual QA');
  await page.locator('[data-studio-add-text]').click();
  await expect(page.locator('[data-studio-status]')).toContainText('Note added');
  await shot(page,'functional','20-studio-note-added');
  await page.locator('[data-studio-add-rect]').click();
  await expect(page.locator('[data-studio-status]')).toContainText('Rectangle added');
  await page.locator('[data-studio-add-circle]').click();
  await expect(page.locator('[data-studio-status]')).toContainText('Circle added');
  await shot(page,'functional','21-studio-shapes-added');
  const board=await page.evaluate(()=>window.DB.getSetting('ocd_studio_board'));
  expect(JSON.stringify(board)).toContain('Clinical decision diagram');
  await visit(page,'home');await visit(page,'studio');
  await expect(page.locator('[data-studio-elements]')).toContainText('Clinical decision diagram');
  await shot(page,'functional','22-studio-reopened');
});
test('Settings secondary configuration panels and PDF controls have screenshot evidence',async({page})=>{
  await boot(page,'settings');
  await page.locator('[data-ai-mode]').scrollIntoViewIfNeeded();
  await shot(page,'functional','23-settings-ai-panel');
  await page.locator('#select-clear-scope').scrollIntoViewIfNeeded();
  await shot(page,'functional','24-settings-storage-panel');
  await visit(page,'pdf');
  const input=page.locator('[data-pdf-open]');
  await input.setInputFiles({name:'visual-controls.pdf',mimeType:'application/pdf',buffer:makeVisualPdf()});
  await expect(page.locator('[data-pdf-total-pages]')).toHaveText('1');
  const before=await page.locator('[data-pdf-zoom]').textContent();
  await page.locator('[data-pdf-action="zoom-in"]').click();
  await expect(page.locator('[data-pdf-zoom]')).not.toHaveText(before);
  await shot(page,'functional','25-pdf-zoom-in-working');
});
