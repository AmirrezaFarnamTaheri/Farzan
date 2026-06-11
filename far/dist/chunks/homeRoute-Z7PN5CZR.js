function C(o={}){let{setView:c,Router:s,setPendingCourseMedia:n}=o;c(`
    <section class="view view-home">
      <div class="home-hero card card-filled">
        <div class="home-hero-copy">
          <span class="eyebrow">Local-first learning studio</span>
          <h1 class="home-title">Your study command deck is ready.</h1>
          <p class="home-subtitle">Open a course, capture notes, mark progress, and keep backups close. PlasmaDeck stores your work on this device unless you export it.</p>
          <div class="home-actions">
            <a class="btn btn-primary" href="#/courses">
              <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
              Browse courses
            </a>
            <a class="btn btn-ghost" href="#/notes">
              <i class="fa-solid fa-note-sticky" aria-hidden="true"></i>
              Write notes
            </a>
            <a class="btn btn-ghost" href="#/help">
              <i class="fa-solid fa-circle-question" aria-hidden="true"></i>
              First-run guide
            </a>
          </div>
        </div>
        <div class="home-orbit" aria-hidden="true">
          <div class="home-orbit-core">PD</div>
          <span style="--i:0">Notes</span>
          <span style="--i:1">PDF</span>
          <span style="--i:2">Video</span>
          <span style="--i:3">Canvas</span>
        </div>
      </div>

      <div class="home-grid">
        <section class="card card-filled home-card home-card-wide">
          <div class="card-body">
            <div class="home-card-head">
              <div>
                <span class="eyebrow">Next best steps</span>
                <h2 class="home-card-title">Start strong in three clicks</h2>
              </div>
              <kbd>Ctrl+K</kbd>
            </div>
            <div class="home-steps">
              <a href="#/courses">
                <span>1</span>
                <strong>Choose a course</strong>
                <small>Browse the catalog and open the first lesson.</small>
              </a>
              <a href="#/notes">
                <span>2</span>
                <strong>Create a note</strong>
                <small>Capture ideas, links, code blocks, and tags.</small>
              </a>
              <a href="#/progress">
                <span>3</span>
                <strong>Review progress</strong>
                <small>Export backups before changing browser or port.</small>
              </a>
            </div>
          </div>
        </section>

        <section class="card card-filled home-card">
          <div class="card-body">
            <span class="eyebrow">Library snapshot</span>
            <div class="home-stat"><strong id="home-course-count">-</strong><span>Courses</span></div>
            <div class="home-stat"><strong id="home-topic-count">-</strong><span>Topics</span></div>
            <p class="home-card-note">Counts load from the active catalog selected in <code>data/catalog.json</code>.</p>
          </div>
        </section>

        <section class="card card-filled home-card">
          <div class="card-body">
            <span class="eyebrow">Daily tools</span>
            <div class="home-tool-list">
              <a href="#/pdf"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i><span>Read PDFs</span></a>
              <a href="#/studio"><i class="fa-solid fa-pen-ruler" aria-hidden="true"></i><span>Sketch in Studio</span></a>
              <a href="#/settings"><i class="fa-solid fa-sliders" aria-hidden="true"></i><span>Tune preferences</span></a>
            </div>
          </div>
        </section>

        <section class="card card-filled home-card home-card-wide">
          <div class="card-body">
            <div class="home-card-head">
              <div>
                <span class="eyebrow">Study dashboard</span>
                <h2 class="home-card-title">Continue, review, and reuse</h2>
              </div>
              <a class="btn btn-ghost btn-sm" href="#/achievements">Review queue</a>
            </div>
            <div class="home-widget-list" data-home-widgets>
              <p class="text-muted">Loading study widgets...</p>
            </div>
          </div>
        </section>
      </div>
    </section>
  `),w(),A({Router:s,setPendingCourseMedia:n})}async function w(){try{await window.DataStore?.init?.();let o=window.DataStore?.allCourses?.()??[],c=window.DataStore?.allTopics?.()??[],s=document.getElementById("home-course-count"),n=document.getElementById("home-topic-count");s&&(s.textContent=String(o.length)),n&&(n.textContent=String(c.length))}catch{let o=document.querySelector(".home-card-note");o&&(o.textContent="Catalog counts are unavailable right now. Try rebuilding or checking data/catalog.json.")}}function I(o){let c=Math.max(0,Math.floor(Number(o)||0)),s=Math.floor(c/3600),n=Math.floor(c%3600/60),l=c%60;return s?`${s}:${String(n).padStart(2,"0")}:${String(l).padStart(2,"0")}`:`${n}:${String(l).padStart(2,"0")}`}async function A({Router:o,setPendingCourseMedia:c}){let s=document.querySelector("[data-home-widgets]");if(!s)return;let[n,l,h,f]=await Promise.all([(async()=>{try{return await window.DB?.getAllProgress?.()??[]}catch{return[]}})(),(async()=>{try{return await window.DB?.getAllNotes?.()??[]}catch{return[]}})(),(async()=>{try{return await window.DB?.getAllTimestamps?.()??[]}catch{return[]}})(),(async()=>{try{return await window.DataStore?.init?.(),window.DataStore?.allTopics?.()??[]}catch{return[]}})()]);if(!document.body.contains(s))return;let v=new Map(f.map(t=>[t.topicId,t])),p=[...n].filter(t=>t?.topicId&&(Number(t.percent)>0||Number(t.position)>0||t.status)).sort((t,e)=>Number(e.updatedAt||e.completedAt||0)-Number(t.updatedAt||t.completedAt||0))[0],i=[...h].filter(t=>t?.topicId).sort((t,e)=>Number(e.updatedAt||e.createdAt||0)-Number(t.updatedAt||t.createdAt||0))[0],r=[...l].sort((t,e)=>Number(e.updatedAt||e.createdAt||0)-Number(t.updatedAt||t.createdAt||0))[0],g=Date.now(),y=720*60*60*1e3,d=[...n].filter(t=>t?.topicId&&(t.status==="done"||Number(t.percent)>=100)).map(t=>{let e=v.get(t.topicId),u=[t.reviewedAt,t.updatedAt,t.completedAt,...h.filter(a=>a?.topicId===t.topicId).map(a=>a.updatedAt||a.createdAt),...l.filter(a=>a?.topicId===t.topicId).map(a=>a.updatedAt||a.createdAt)].map(a=>Number(a)||0),m=Math.max(...u,0);return{record:t,topic:e,lastActivity:m}}).filter(t=>!t.lastActivity||g-t.lastActivity>=y).sort((t,e)=>(t.lastActivity||0)-(e.lastActivity||0))[0],b=[{id:"continue",label:"Continue studying",title:v.get(p?.topicId)?.title||p?.topicTitle||i?.title||i?.topicId||"Open a course",detail:p?`${Math.round(Number(p.percent)||0)}% complete`:i?`Saved at ${I(i.position)}`:"Start with the catalog.",action:"courses",topicId:p?.topicId||i?.topicId,position:i?.position},{id:"review",label:"Due review",title:d?.topic?.title||d?.record?.topicTitle||d?.record?.topicId||"Nothing due",detail:d?"Revisit a completed topic.":"Completed topics are still fresh.",action:d?"review":"achievements",topicId:d?.record?.topicId},{id:"recent",label:"Recent insight",title:r?.title||i?.title||"No notes yet",detail:r?.sourceType==="pdf"?`PDF page ${r.pdfPage||r.page||1}`:r?.topicId?`Linked to ${r.topicId}`:i?"Saved timestamp":"Capture a note or timestamp.",action:r?"notes":i?"courses":"notes",topicId:i?.topicId,position:i?.position}];s.replaceChildren(),b.forEach(t=>{let e=document.createElement("button");e.type="button",e.className="home-widget",e.dataset.homeWidget=t.id,t.topicId&&(e.dataset.topicId=t.topicId);let u=document.createElement("span");u.className="eyebrow",u.textContent=t.label;let m=document.createElement("strong");m.textContent=t.title;let a=document.createElement("small");a.textContent=t.detail,e.append(u,m,a),e.addEventListener("click",()=>{if((t.action==="courses"||t.action==="review")&&t.topicId){c(t.topicId,t.position),o.navigate("#/courses");return}o.navigate(t.action==="achievements"?"#/achievements":"#/notes")}),s.appendChild(e)})}export{C as mountHomeView};
//# sourceMappingURL=homeRoute-Z7PN5CZR.js.map
