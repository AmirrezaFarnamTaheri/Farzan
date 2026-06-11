function y(i){return String(i??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e])}function P(i){let e=window.DOMPurify;if(e?.sanitize)return e.sanitize(String(i??""),{ADD_TAGS:["canvas"],ADD_ATTR:["tabindex","role","aria-label","aria-hidden","aria-live","aria-atomic"],FORBID_TAGS:["template"]});let p=document.createElement("template");return p.innerHTML=String(i??""),p.content.querySelectorAll("script, style, meta, link, iframe, object, embed, form, template").forEach(c=>c.remove()),p.content.querySelectorAll("*").forEach(c=>{[...c.attributes].forEach(o=>{let l=o.name.toLowerCase(),u=String(o.value||"").trim();if(l.startsWith("on")||l==="srcdoc"){c.removeAttribute(o.name);return}(l==="href"||l==="src"||l==="action")&&/^(?:javascript|vbscript|data:text\/html)/i.test(u)&&c.removeAttribute(o.name)})}),p.innerHTML}function D(i){let e=document.getElementById("view-container");return e?(e.innerHTML=P(i),e):null}function x(){D(`
    <section class="view view-pdf">
      <div class="page-header">
        <h1 class="page-title">PDF</h1>
        <p class="page-subtitle">Drop a PDF here or load via file picker.</p>
      </div>

      <div class="pdf-shell">
        <aside class="pdf-sidebar" data-pdf-thumbnails></aside>
        <div class="pdf-main">
          <div class="pdf-toolbar">
            <input class="input" data-pdf-search-input placeholder="Search..." />
            <div data-pdf-search-results class="pdf-search-results"></div>
            <div class="pdf-toolbar-row">
              <button class="btn btn-ghost" data-pdf-action="prev" data-pdf-prev>Prev</button>
              <input class="input input-sm" data-pdf-current-page value="1" style="width:80px" />
              <span>/ <span data-pdf-total-pages>0</span></span>
              <button class="btn btn-ghost" data-pdf-action="next" data-pdf-next>Next</button>
              <span class="pdf-zoom" data-pdf-zoom>100%</span>
            </div>
            <div class="pdf-toolbar-row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
              <input type="file" data-pdf-open style="display:none" />
              <button class="btn btn-ghost" data-pdf-action="open">Open</button>
              <button class="btn btn-ghost" data-pdf-action="zoom-out">-</button>
              <button class="btn btn-ghost" data-pdf-action="zoom-in">+</button>
              <button class="btn btn-ghost" data-pdf-action="fit-width">Fit width</button>
              <button class="btn btn-ghost" data-pdf-action="fit-page">Fit page</button>
              <button class="btn btn-ghost" data-pdf-action="rotate-ccw">CCW</button>
              <button class="btn btn-ghost" data-pdf-action="rotate-cw">CW</button>
              <button class="btn btn-ghost" data-pdf-action="download">Download</button>
              <button class="btn btn-ghost" type="button" data-pdf-save-selection>Save selection</button>
              <button class="btn btn-ghost" type="button" data-pdf-ai-summary hidden>Summarize PDF</button>
              <button class="btn btn-ghost" type="button" data-pdf-export-annotations>Export annotations</button>
            </div>
            <div class="pdf-page-note" data-pdf-page-note>
              <textarea class="input" data-pdf-page-note-input rows="2" placeholder="Note for this PDF page"></textarea>
              <div class="button-row">
                <button class="btn btn-primary btn-sm" type="button" data-pdf-save-page-note>Save page note</button>
                <span class="text-sm" data-pdf-page-note-status aria-live="polite"></span>
              </div>
            </div>
          </div>

          <div class="pdf-viewer-wrap">
            <div class="pdf-viewer" data-pdf-viewer tabindex="0"></div>
            <div class="pdf-loading" data-pdf-loading hidden>
              <div class="pdf-progress"><div data-pdf-progress class="pdf-progress-bar"></div></div>
            </div>
            <div class="pdf-error" data-pdf-error hidden></div>
          </div>
        </div>
      </div>
    </section>
  `);let i=window.PlasmaDeck??{},e=i.Toast??{success(){},error(){}};try{window.PlasmaPDFInit?.()}catch(t){}let p=document.querySelector("[data-pdf-save-page-note]"),c=document.querySelector("[data-pdf-save-selection]"),o=document.querySelector("[data-pdf-ai-summary]"),l=document.querySelector("[data-pdf-export-annotations]"),u=document.querySelector("[data-pdf-page-note-input]"),f=document.querySelector("[data-pdf-page-note-status]"),n=t=>{f&&(f.textContent=t)},m=async()=>{let t=String(u?.value||"").trim();if(!t){n("Add a note first");return}let r=window.PlasmaPDFViewer?.getSnapshot?.()??window.PlasmaPDFState??{},a=r.docId||r.annotationDocId||"global",s=Math.max(1,Number(r.page||r.currentPage||1)),d=Date.now();try{await window.DB?.saveNote?.({id:`pdf-note-${d}-${Math.random().toString(36).slice(2,7)}`,title:`PDF page ${s} note`,content:`<p>${y(t)}</p><p><strong>Source:</strong> PDF page ${s}</p>`,sourceType:"pdf",docId:a,pdfDocId:a,page:s,pdfPage:s,tags:["pdf","page-note"],createdAt:d,updatedAt:d}),u.value="",n(`Saved page ${s}`),e.success("PDF page note saved")}catch{n("Save failed"),e.error("PDF page note save failed")}},v=async()=>{if(typeof window.PlasmaPDFViewer?.exportAnnotationsToNotes!="function"){n("Annotation export unavailable"),e.error("PDF annotation export unavailable");return}try{let t=await window.PlasmaPDFViewer.exportAnnotationsToNotes(),r=Number(t?.created||0),a=Number(t?.errors||0);if(r>0){let s=a?`, ${a} failed`:"";n(`Exported ${r} annotations${s}`),e.success(`Exported ${r} PDF annotations`);return}n(a?`Export failed for ${a} annotations`:"No annotations to export"),a&&e.error("PDF annotation export failed")}catch{n("Annotation export failed"),e.error("PDF annotation export failed")}},b=async()=>{if(typeof window.PlasmaPDFViewer?.saveSelectionToNote!="function"){n("Selection save unavailable"),e.error("PDF selection save unavailable");return}try{let t=await window.PlasmaPDFViewer.saveSelectionToNote();if(t?.saved){n(`Saved selection from page ${t.page||1}`),e.success("PDF selection saved");return}n(t?.reason==="empty-selection"?"Select PDF text first":"Selection save unavailable")}catch{n("Selection save failed"),e.error("PDF selection save failed")}},h=async()=>{if(o)try{let t=await window.PlasmaDeck?.AI?.status?.();o.hidden=!t?.available}catch{o.hidden=!0}},g=async()=>{let t=window.PlasmaDeck?.AI;if(!t?.summarizeText||typeof window.PlasmaPDFViewer?.extractTextForSummary!="function"){n("AI summary unavailable"),e.error("PDF AI summary unavailable");return}o.disabled=!0;let r=o.textContent;o.textContent="Summarizing...";try{let a=await window.PlasmaPDFViewer.extractTextForSummary({maxPages:6,maxChars:14e3});if(!a.text){n("Open a searchable PDF first");return}let s=await t.summarizeText(a.text,{bullets:5});if(!s?.ok||!s.text){n("AI summary unavailable"),e.error("PDF AI summary unavailable");return}let d=a.docId||"global";await t.saveSummaryNote?.({summary:s.text,title:`PDF AI summary (${a.pages||1} page${a.pages===1?"":"s"})`,sourceLabel:`${d}, first ${a.pages||1} page${a.pages===1?"":"s"}`,note:{sourceType:"pdf",docId:d,pdfDocId:d,page:1,pdfPage:1,tags:["pdf","ai-summary"]}}),n(`AI summary saved from ${a.pages||1} page${a.pages===1?"":"s"}`),e.success("PDF AI summary saved")}catch{n("AI summary failed"),e.error("PDF AI summary failed")}finally{o.disabled=!1,o.textContent=r}},w=async(t={})=>{if(t.kind!=="annotation"&&t.kind!=="data")return;let r=window.PlasmaPDFViewer?.getSnapshot?.()??window.PlasmaPDFState??{},a=r.docId||r.annotationDocId||"global",s=t.record?.docId;if(!(s&&s!==a)&&typeof window.PlasmaPDFViewer?.refreshAnnotationsFromStorage=="function")try{let d=await window.PlasmaPDFViewer.refreshAnnotationsFromStorage();n(`Annotations refreshed (${d.length})`),i.bus?.emit?.("pdf:sync-refresh",{docId:a,annotations:d.length})}catch{n("Annotation refresh failed")}};return p?.addEventListener("click",m),c?.addEventListener("click",b),o?.addEventListener("click",g),l?.addEventListener("click",v),i.bus?.on?.("sync:message",w),h(),{unmount(){p?.removeEventListener("click",m),c?.removeEventListener("click",b),o?.removeEventListener("click",g),l?.removeEventListener("click",v),i.bus?.off?.("sync:message",w);try{window.PlasmaPDFDestroy?.()}catch{}}}}export{x as mountPdfView,P as sanitizePdfRouteHtml};
//# sourceMappingURL=pdfRoute-7AUORRGO.js.map
