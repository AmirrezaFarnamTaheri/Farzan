async function H(q={}){let{setView:A,createElement:l,eventTargetEl:D,safeMediaUrl:I,Router:E,Paginator:L,setPendingCourseMedia:k}=q;A(`
    <section class="view view-materials">
      <div class="page-header">
        <h1 class="page-title">Materials</h1>
        <p class="page-subtitle">All videos and PDFs in your catalog.</p>
      </div>
      <div class="card card-filled">
        <div class="card-body">
          <input class="input" id="materials-search" type="search" placeholder="Search topics..." />
          <div class="filter-row" aria-label="Material filters" style="margin-top:12px">
            <button class="filter-chip active" type="button" data-material-filter="all" aria-pressed="true">All</button>
            <button class="filter-chip" type="button" data-material-filter="video" aria-pressed="false">Video</button>
            <button class="filter-chip" type="button" data-material-filter="pdf" aria-pressed="false">PDF</button>
            <button class="filter-chip" type="button" data-material-filter="none" aria-pressed="false">No media</button>
          </div>
          <div class="grid grid-2" style="gap:10px;margin-top:12px">
            <label class="stack-xs">
              <span class="text-sm text-muted">Course</span>
              <select class="select" id="materials-course-filter" aria-label="Filter materials by course">
                <option value="all">All courses</option>
              </select>
            </label>
            <label class="stack-xs">
              <span class="text-sm text-muted">Source</span>
              <select class="select" id="materials-source-filter" aria-label="Filter materials by source">
                <option value="all">All sources</option>
              </select>
            </label>
          </div>
        </div>
      </div>
      <div id="materials-pager" style="margin-top:12px"></div>
      <div id="materials-list" class="materials-list" style="margin-top:12px"></div>
    </section>
  `),await window.DataStore?.init?.();let R=document.querySelector(".view-materials"),V=document.getElementById("materials-pager"),c=document.getElementById("materials-list"),P=document.getElementById("materials-search"),g=document.getElementById("materials-course-filter"),v=document.getElementById("materials-source-filter");if(!c)return;let x=[],y=(e,t,s,i)=>{e&&(e.addEventListener(t,s,i),x.push({target:e,type:t,handler:s,options:i}))},C=0,h=null,T=()=>{C+=1,h&&(clearTimeout(h),h=null)},w=window.DataStore?.allTopics?.()??[],$=[...new Map(w.filter(e=>e?.courseId).map(e=>[String(e.courseId),String(e.courseTitle||e.courseId)])).entries()].sort((e,t)=>e[1].localeCompare(t[1])),N=[...new Map(w.map(e=>[String(e.sourceLabel||"Source"),String(e.sourceLabel||"Source")])).entries()].sort((e,t)=>e[1].localeCompare(t[1]));$.forEach(([e,t])=>{g?.appendChild(l("option",{value:e},t))}),N.forEach(([e,t])=>{v?.appendChild(l("option",{value:e},t))});let B=e=>{let t=(e.videos?.length??0)>0,s=(e.pdfs?.length??0)>0;return t&&s?"video-pdf":t?"video":s?"pdf":"none"},a={page:1,perPage:50,query:"",filter:"all",courseId:"all",sourceLabel:"all"},z=e=>a.filter==="all"||B(e)===a.filter||a.filter==="video"&&(e.videos?.length??0)>0||a.filter==="pdf"&&(e.pdfs?.length??0)>0,S=e=>l("span",{class:"badge"},e),F=(e,t)=>l("button",{class:"btn btn-ghost btn-sm",type:"button","data-action":e},t),O=e=>{let t=e.videos?.[0],s=e.pdfs?.[0],i=l("div",{class:"topic-row","data-topic-id":e.topicId,"data-course-id":e.courseId,"data-media":B(e)}),d=l("div");d.append(l("div",{class:"topic-title"},e.title),l("div",{class:"topic-submeta"},`${e.courseTitle??""} - ${e.sourceLabel??"Source"}`));let n=l("div",{class:"topic-meta"});t&&n.appendChild(S("video")),s&&n.appendChild(S("pdf")),!t&&!s&&n.appendChild(S("no media"));let r=l("div",{class:"topic-actions"});return t&&r.appendChild(F("play-video","Play")),s&&r.appendChild(F("open-pdf","PDF")),i.append(d,n,r),i},p=(e=a.query)=>{let t=e.trim().toLowerCase(),s=w.filter(o=>{let b=!t||String(o.title??"").toLowerCase().includes(t)||String(o.courseTitle??"").toLowerCase().includes(t)||String(o.sourceLabel??"").toLowerCase().includes(t),j=a.courseId==="all"||String(o.courseId||"")===a.courseId,G=a.sourceLabel==="all"||String(o.sourceLabel||"Source")===a.sourceLabel;return b&&z(o)&&j&&G});a.query=e;let{page:i,perPage:d,pages:n,total:r,slice:u}=L.paginate(s,a);if(a.page=i,a.perPage=d,L.renderControls(V,{page:i,pages:n,total:r,perPage:d,perPageOptions:[25,50,100,200],onChange:({page:o,perPage:b})=>{a.page=o??a.page,a.perPage=b??a.perPage,p(a.query);try{c.scrollTo?.({top:0,behavior:"smooth"})}catch{c.scrollTop=0}}}),T(),c.replaceChildren(),!u.length){let o=l("div",{class:"empty-state"},l("p",{},"No materials match this filter."));c.appendChild(o);return}let Q=C,U=Math.max(1,Number(window.PlasmaDeck?.materialsRenderBatchSize)||50),m=l("div",{class:"materials-render-status text-sm","aria-live":"polite","data-materials-render-status":""}),f=0,M=()=>{if(!c.isConnected||Q!==C)return;let o=document.createDocumentFragment(),b=Math.min(u.length,f+U);for(;f<b;f+=1)o.appendChild(O(u[f]));c.insertBefore(o,m.isConnected?m:null),f<u.length?(m.textContent=`Showing ${f} of ${u.length} visible materials`,m.isConnected||c.appendChild(m),h=setTimeout(M,0)):(h=null,m.remove())};M()};return p(""),g&&(g.value=a.courseId),v&&(v.value=a.sourceLabel),y(P,"input",()=>p(P.value)),y(g,"change",()=>{a.courseId=g.value||"all",a.page=1,p(a.query)}),y(v,"change",()=>{a.sourceLabel=v.value||"all",a.page=1,p(a.query)}),y(R,"click",e=>{let t=D(e);if(!t)return;let s=t.closest("[data-material-filter]");if(s){a.filter=s.dataset.materialFilter||"all",a.page=1,document.querySelectorAll("[data-material-filter]").forEach(r=>{let u=r===s;r.classList.toggle("active",u),r.setAttribute("aria-pressed",u?"true":"false")}),p(a.query);return}let i=t.closest("[data-action]");if(!i)return;let d=t.closest("[data-topic-id]");if(!d)return;let n=w.find(r=>r.topicId===d.dataset.topicId);if(n){if(i.dataset.action==="open-pdf"){let r=I(n.pdfs?.[0]);if(!r)return;E.navigate("#/pdf"),setTimeout(()=>{try{window.PlasmaPDFViewer?.load?.(r)}catch{}},50)}if(i.dataset.action==="play-video"){if(!I(n.videos?.[0]))return;k(n.topicId),E.navigate("#/courses")}}}),{unmount(){T(),x.forEach(({target:e,type:t,handler:s,options:i})=>{try{e.removeEventListener(t,s,i)}catch{}})}}}export{H as mountMaterialsView};
//# sourceMappingURL=materialsRoute-GYFVIRCU.js.map
