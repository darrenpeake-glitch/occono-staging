const EMAIL_PATTERN=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitCc(value){
  return [...new Set(String(value||'').split(/[;,\n]+/).map(item=>item.trim().toLowerCase()).filter(Boolean))];
}

function enquiryIdFrom(details){
  const match=details.textContent.match(/ENQ-\d{4}-\d{4}/);
  return match?match[0]:'';
}

async function loadRecord(id){
  const response=await fetch('/api/workflows',{credentials:'same-origin',headers:{Accept:'application/json'}});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error||'Could not load enquiry recipients.');
  return (payload.records||[]).find(record=>record.id===id);
}

function mailtoHref(record,cc){
  if(!record.email)return'';
  const query=cc.length?`?cc=${encodeURIComponent(cc.join(','))}`:'';
  return `mailto:${encodeURIComponent(record.email)}${query}`;
}

async function enhanceCard(){
  const details=document.querySelector('#cardDetails');
  const form=details?.querySelector('#cardEditForm');
  if(!details||!form||form.dataset.ccEnhanced==='true')return;
  const id=enquiryIdFrom(details);
  if(!id)return;
  form.dataset.ccEnhanced='true';

  let record;
  try{record=await loadRecord(id)}catch(error){console.error(error);form.dataset.ccEnhanced='error';return;}
  if(!record||record.workflow!=='enquiries')return;

  const nextAction=form.querySelector('input[name="nextAction"]')?.closest('label');
  const label=document.createElement('label');
  label.innerHTML=`CC recipients<input name="ccEmails" type="text" autocomplete="off" placeholder="name@example.com, another@example.com" value="${String(record.ccEmails||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"><small>Separate multiple addresses with commas or semicolons.</small>`;
  form.insertBefore(label,nextAction||form.lastElementChild);

  const cc=splitCc(record.ccEmails);
  const emailLink=details.querySelector('a[href^="mailto:"]');
  if(emailLink)emailLink.href=mailtoHref(record,cc);
  const contactDetails=details.querySelector('.contact-details');
  if(contactDetails&&cc.length){
    const ccLine=document.createElement('span');
    ccLine.className='cc-recipient-summary';
    ccLine.textContent=`CC: ${cc.join(', ')}`;
    contactDetails.appendChild(ccLine);
  }

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    event.stopImmediatePropagation();
    const data=new FormData(form);
    const ccEmails=splitCc(data.get('ccEmails'));
    const invalid=ccEmails.filter(address=>!EMAIL_PATTERN.test(address));
    if(invalid.length){
      form.querySelector('input[name="ccEmails"]').setCustomValidity(`Invalid email: ${invalid.join(', ')}`);
      form.querySelector('input[name="ccEmails"]').reportValidity();
      return;
    }
    const button=form.querySelector('button[type="submit"]');
    if(button){button.disabled=true;button.textContent='Saving…';}
    try{
      const response=await fetch('/api/workflows',{
        method:'PATCH',credentials:'same-origin',headers:{Accept:'application/json','Content-Type':'application/json'},
        body:JSON.stringify({id,workflow:'enquiries',changes:{
          status:String(data.get('status')||''),
          ownerName:String(data.get('ownerName')||'').trim(),
          ownerEmail:String(data.get('ownerEmail')||'').trim().toLowerCase(),
          nextAction:String(data.get('nextAction')||'').trim(),
          due:String(data.get('due')||''),
          ccEmails:ccEmails.join(', ')
        }})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'Recipients could not be saved.');
      document.querySelector('#cardDialog')?.close();
      location.reload();
    }catch(error){
      console.error(error);
      if(button){button.disabled=false;button.textContent='Save changes';}
      alert(error.message||'Recipients could not be saved.');
    }
  },true);
}

const observer=new MutationObserver(()=>enhanceCard());
observer.observe(document.querySelector('#cardDetails'),{childList:true,subtree:true});
enhanceCard();
