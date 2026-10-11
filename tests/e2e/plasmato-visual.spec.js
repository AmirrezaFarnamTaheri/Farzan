import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { makePdf } = require('../../scripts/dist-browser-smoke.cjs');
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
  await page.locator('[data-pdf-open]').setInputFiles({name:'visual-acceptance.pdf',mimeType:'application/pdf',buffer:makePdf()});
  await expect.poll(()=>page.locator('[data-pdf-total-pages]').textContent(),{timeout:20000}).toBe('1');
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
  await page.locator('#sidebar-search, .topbar-search input').first().fill('comprehensive internal medicine');
  await expect(page.locator('.search-result-item').first()).toBeVisible({timeout:15000});
  await shot(page,'functional','15-global-search-results');
  await page.locator('.search-result-item').first().click();
  await expect(page).toHaveURL(/#\/courses/);
  await shot(page,'functional','16-search-result-opened');
});
test('a real locally generated MP4 plays in the native course player',async({page})=>{
  const fixture=path.join(root,'fixtures','clip.mp4');
  fs.mkdirSync(path.dirname(fixture),{recursive:true});
  const ff=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',
    '-f','lavfi','-i','testsrc2=size=320x180:rate=15','-t','5','-c:v','libx264',
    '-pix_fmt','yuv420p','-movflags','+faststart',fixture],{encoding:'utf8',timeout:25000});
  expect(ff.status,'ffmpeg fixture: '+ff.stderr).toBe(0);
  const bytes=fs.readFileSync(fixture);
  await page.route('https://visual-acceptance.invalid/clip.mp4',r=>r.fulfill({status:200,contentType:'video/mp4',body:bytes,headers:{'access-control-allow-origin':'*'}}));
  await boot(page,'courses');
  await page.evaluate(async()=>{
    const lib=window.OpenCourseDeck.UserLibrary;
    await lib.upsertCourse({id:'qa-playback',title:'Visual QA Playback'});
    await lib.addRemoteLink({courseId:'qa-playback',title:'Controlled MP4 playback',kind:'video',url:'https://visual-acceptance.invalid/clip.mp4'});
  });
  await visit(page,'my-courses');await visit(page,'courses');
  await page.locator('.course-item[data-course-id="qa-playback"]').click();
  await page.locator('#course-detail [data-action="play-video"]').first().click();
  await expect.poll(()=>page.evaluate(()=>[...document.querySelectorAll('video')].some(v=>v.readyState>=2&&v.currentTime>0.5&&!v.paused)),{timeout:20000}).toBe(true);
  await shot(page,'functional','17-real-local-video-playing');
  log({group:'functional',behavior:'actual MP4 playing via native player',fixture:'local deterministic',bytes:bytes.length});
});
