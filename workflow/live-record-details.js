const DETAIL_ESCAPE=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const detailDate=value=>{if(!value)return'No date recorded';const date=new Date(value);if(Number.isNaN(date.getTime()))return String(value);return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);};
let activeRecordId='';
const detailId=details=>activeRecordId||details.dataset.recordId||details.textContent.match(/(?:ENQ|OUT|PRJ)-\d{4}-\d{4}|OUT-TEST-\d{4}/)?.[0]||'';
const detailWorkflow=id=>id.startsWith('ENQ-')?'enquiries':id.startsWith('OUT-')?'outreach':'delivery';

async function fetchDetails(id,workflow){const response=await fetch(`/api/workflows?id=${encodeURIComponent(id)}&workflow=${encodeURIComponent(workflow)}`,{credentials:'same-origin',headers:{Accept:'application/json'}});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||'Record details could not be loaded.');return payload.details;}

function renderCustomer(panel,customer={}){
  const website=/^https?:\/\//i.test(customer.website||'')?`<a href="${DETAIL_ESCAPE(customer.website)}" target="_blank" rel="noopener">Open website</a>`:'Not recorded';
  const related=Array.isArray(customer.relatedEnquiries)?customer.relatedEnquiries:[];
  const relatedSection=related.length
    ?`<section class="related-records"><div class="section-heading"><div><span class="document-type">Relationship history</span><h3>Other enquiries</h3></div><span class="relationship-count">${related.length}</span></div><div class="related-record-list">${related.map(item=>`<article class="related-record"><div><strong>${DETAIL_ESCAPE(item.id||'Enquiry')}</strong><p>${DETAIL_ESCAPE(item.business||'No business recorded')}</p><small>${DETAIL_ESCAPE(detailDate(item.created))}</small></div><div class="related-record-state"><span>${DETAIL_ESCAPE(item.status||'No status')}</span><small>${DETAIL_ESCAPE(item.nextAction||'No next action')}</small></div></article>`).join('')}</div></section>`
    :`<p class="panel-note">No other enquiries are linked to this contact, business or primary email address.</p>`;
  panel.innerHTML=`<section class="crm-panel"><div class="crm-grid"><div><span>Contact</span><strong>${DETAIL_ESCAPE(customer.name||'Not recorded')}</strong></div><div><span>Business</span><strong>${DETAIL_ESCAPE(customer.business||'Not recorded')}</strong></div><div><span>Primary email</span><strong>${DETAIL_ESCAPE(customer.email||'Not recorded')}</strong></div><div><span>CC recipients</span><strong>${DETAIL_ESCAPE(customer.ccEmails||'None')}</strong></div><div><span>Telephone</span><strong>${DETAIL_ESCAPE(customer.phone||'Not recorded')}</strong></div><div><span>Website</span><strong>${website}</strong></div><div><span>Contact ID</span><strong>${DETAIL_ESCAPE(customer.contactId||'Not recorded')}</strong></div><div><span>Business ID</span><strong>${DETAIL_ESCAPE(customer.businessId||'Not recorded')}</strong></div></div>${relatedSection}</section>`;
}

function renderDocuments(panel,documents=[]){if(!documents.length){panel.innerHTML='<section class="crm-panel"><p class="panel-note">No linked forms or documents are recorded for this item.</p></section>';return;}panel.innerHTML=`<section class="crm-panel">${documents.map(document=>`<article class="document-card"><div><span class="document-type">${DETAIL_ESCAPE(document.type||'Document')}</span><h3>${DETAIL_ESCAPE(document.title||'Untitled document')}</h3><p>${DETAIL_ESCAPE(document.summary||'No description recorded.')}</p><small>${DETAIL_ESCAPE(detailDate(document.created))}</small>${document.url?`<p><a class="document-open" href="${DETAIL_ESCAPE(document.url)}" target="_blank" rel="noopener">Open record</a></p>`:''}</div><span class="document-status">${DETAIL_ESCAPE(document.status||'Recorded')}</span></article>`).join('')}</section>`;}

function renderTimeline(panel,events=[]){if(!events.length){panel.innerHTML='<section class="crm-panel"><p class="panel-note">No timeline events are recorded for this item.</p></section>';return;}panel.innerHTML=`<section class="crm-panel"><ol class="timeline">${events.map(event=>`<li><span class="timeline-marker"></span><div><strong>${DETAIL_ESCAPE(event.title||'Event')}</strong><p>${DETAIL_ESCAPE(event.detail||event.outcome||'')}</p><small>${DETAIL_ESCAPE(event.actor||'System')} · ${DETAIL_ESCAPE(event.timestamp?detailDate(event.timestamp):(event.outcome||'Current'))}</small>${event.url?`<p><a href="${DETAIL_ESCAPE(event.url)}" target="_blank" rel="noopener">Open evidence</a></p>`:''}</div></li>`).join('')}</ol></section>`;}

async function loadLivePanel(button){const details=document.querySelector('#cardDetails');if(!details)return;const panel=details.querySelector(`[data-panel="${button.dataset.tab}"]`);if(!panel||panel.dataset.liveLoaded==='true'||!['customer','forms','timeline'].includes(button.dataset.tab))return;const id=detailId(details);if(!id){panel.innerHTML='<section class="crm-panel"><p class="panel-note">Record reference could not be identified.</p></section>';return;}panel.innerHTML='<section class="crm-panel"><p class="panel-note">Loading live record data…</p></section>';try{const data=await fetchDetails(id,detailWorkflow(id));if(button.dataset.tab==='customer')renderCustomer(panel,data.customer);if(button.dataset.tab==='forms')renderDocuments(panel,data.documents);if(button.dataset.tab==='timeline')renderTimeline(panel,data.timeline);panel.dataset.liveLoaded='true';}catch(error){console.error(error);panel.innerHTML=`<section class="crm-panel"><p class="panel-note">${DETAIL_ESCAPE(error.message)}</p></section>`;}}

document.addEventListener('click',event=>{
  const card=event.target.closest('.work-card');
  if(card){
    activeRecordId=String(card.dataset.id||'');
    document.querySelector('#cardDetails')?.removeAttribute('data-record-id');
  }
  const button=event.target.closest('.record-tab');
  if(button)loadLivePanel(button);
});
