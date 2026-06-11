var y="plasma-my-courses";function C({setView:n,Toast:i=window.PlasmaDeck?.Toast}={}){n(`
    <section class="view view-my-courses">
      <div class="page-header">
        <h1 class="page-title">My Courses</h1>
        <p class="page-subtitle">Create and organize your own course outlines.</p>
      </div>
      <div class="card card-filled" style="margin-bottom:16px">
        <div class="card-body">
          <div data-my-course-form style="display:grid;gap:10px">
            <label style="display:grid;gap:6px">
              <span class="text-sm">Course title</span>
              <input class="input" data-my-course-title required maxlength="120" placeholder="Course title" />
            </label>
            <label style="display:grid;gap:6px">
              <span class="text-sm">Description</span>
              <textarea class="input" data-my-course-description rows="3" maxlength="600" placeholder="What this course covers"></textarea>
            </label>
            <button class="btn btn-primary" type="button" data-my-course-save>Save Course</button>
          </div>
        </div>
      </div>
      <div class="stat-grid" data-my-course-metrics></div>
      <div class="card card-filled">
        <div class="card-body">
          <div class="grid grid-3" data-my-course-list>
            <p>Loading courses...</p>
          </div>
        </div>
      </div>
    </section>
  `),document.querySelector("[data-my-course-save]")?.addEventListener("click",async e=>{e.preventDefault();let a=document.querySelector("[data-my-course-title]"),s=document.querySelector("[data-my-course-description]"),t=a?.value.trim()||"";if(!t)return;let l=await u(),o={id:`course-${Date.now().toString(36)}`,title:t,description:s?.value.trim()||"",createdAt:Date.now(),updatedAt:Date.now()};await p([o,...l]),a.value="",s&&(s.value=""),i?.success?.("Course saved"),await c()}),c();async function c(){let e=document.querySelector("[data-my-course-list]"),a=document.querySelector("[data-my-course-metrics]");if(!e||!a)return;let s=await u();if(a.replaceChildren(m("Courses",s.length),m("With descriptions",s.filter(t=>t.description).length)),e.replaceChildren(),!s.length){let t=document.createElement("p");t.textContent="No custom courses yet.",e.appendChild(t);return}s.forEach(t=>e.appendChild(d(t)))}function d(e){let a=document.createElement("article");a.className="card",a.dataset.myCourseId=e.id;let s=document.createElement("div");s.className="card-body";let t=document.createElement("h2");t.className="h3",t.textContent=e.title||"Untitled course";let l=document.createElement("p");l.textContent=e.description||"No description";let o=document.createElement("p");o.className="text-muted text-sm",o.textContent=e.updatedAt?`Updated ${new Date(e.updatedAt).toLocaleDateString()}`:"Saved course";let r=document.createElement("button");return r.className="btn btn-ghost btn-sm",r.type="button",r.textContent="Delete",r.addEventListener("click",async()=>{let v=(await u()).filter(g=>g.id!==e.id);await p(v),i?.info?.("Course deleted"),await c()}),s.append(t,l,o,r),a.appendChild(s),a}}function m(n,i){let c=document.createElement("div");c.className="stat-card";let d=document.createElement("strong");d.textContent=String(i);let e=document.createElement("span");return e.textContent=n,c.append(d,e),c}async function u(){let n=await Promise.resolve(window.DB?.getSetting?.(y)).catch(()=>[]);return Array.isArray(n)?n:[]}async function p(n){await Promise.resolve(window.DB?.saveSetting?.(y,n))}export{C as mountMyCoursesView};
//# sourceMappingURL=myCoursesRoute-VFEVUE7A.js.map
