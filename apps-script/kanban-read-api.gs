const CONFIG = Object.freeze({
  apiTokenProperty: 'KANBAN_API_TOKEN',
  environment: 'TEST',
  auditSheetName: 'Kanban Audit',
  overrideSheetName: 'Kanban Overrides',
  handoffSheetName: 'Workflow Handoffs',
  activitiesSheetName: 'Activities',
  sources: Object.freeze({
    enquiries: {spreadsheetId:'1BqRdcKQ-xLZksS-fe0zc6nD-L364JpmImtu-JmGX2YM',sheetName:'Enquiries',idColumn:'Enquiry ID'},
    outreach: {spreadsheetId:'1OPgKuBAmISSpcEisZtkQFmsq_b8Fvj8ldmSnj8xvV1c',sheetName:'Prospects',idColumn:'Prospect ID'},
    delivery: {spreadsheetId:'11lUo6o86mrwhTzVwt0l72WH1wZ8NFhldPW5lCClPquE',sheetName:'Projects',idColumn:'Project ID'},
  }),
  stages: Object.freeze({
    enquiries:['New','Under review','Awaiting Occono','Proposal preparation','Proposal sent','Waiting on customer','Accepted','Closed'],
    outreach:['Prospect found','Qualified','Outreach ready','Contacted','Follow-up','Engaged','Converted'],
    delivery:['Ready to start','In progress','Waiting','Review','Ready to launch','Complete'],
  }),
});

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    assertAuthorised_(body.token);
    if (body.action === 'listWorkflows') return listWorkflows_();
    if (body.action === 'updateRecord') return updateRecord_(body);
    if (body.action === 'promoteRecord') return promoteRecord_(body);
    if (body.action === 'recordContactOutcome') return recordContactOutcome_(body);
    return json_({ok:false,error:'Unsupported action.'},400);
  } catch (error) {
    console.error(error);
    return json_({ok:false,error:error.message || 'Unexpected error.'},500);
  }
}

function listWorkflows_() {
  const promoted = promotedSourceIds_();
  return json_({
    ok:true,
    environment:CONFIG.environment,
    source:'Occono TEST and DEVELOPMENT workflow workbooks',
    generatedAt:new Date().toISOString(),
    records:[].concat(
      readEnquiries_().filter(r => !promoted.has(r.id)),
      readOutreach_().filter(r => !promoted.has(r.id)),
      readDelivery_()
    )
  },200);
}

function updateRecord_(body) {
  const workflow=String(body.workflow||'').trim(), id=String(body.id||'').trim();
  const actorEmail=String(body.actorEmail||'').trim().toLowerCase(), changes=body.changes||{};
  if (!(workflow in CONFIG.sources)) throw new Error('Unknown workflow.');
  if (!id || !actorEmail) throw new Error('Record ID and actor email are required.');
  const allowed=['status','ownerName','ownerEmail','nextAction','due'];
  const keys=Object.keys(changes).filter(k=>allowed.includes(k));
  if (!keys.length) throw new Error('No supported changes supplied.');
  if ('status' in changes && !CONFIG.stages[workflow].includes(String(changes.status))) throw new Error('Invalid workflow stage.');
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const source=CONFIG.sources[workflow], spreadsheet=SpreadsheetApp.openById(source.spreadsheetId), sheet=spreadsheet.getSheetByName(source.sheetName);
    if (!sheet) throw new Error(`${source.sheetName} sheet not found.`);
    const values=sheet.getDataRange().getDisplayValues(), headers=values[0]||[], column=columnMap_(headers);
    const rowIndex=values.findIndex((row,index)=>index>0 && row[column[source.idColumn]]===id);
    if (rowIndex<1) throw new Error(`Record not found: ${id}`);
    const before=findRecord_(workflow,id);
    if ('status' in changes) applyStatus_(workflow,sheet,rowIndex+1,column,String(changes.status));
    const overrideChanges={};
    ['ownerName','ownerEmail','nextAction','due'].forEach(k=>{if(k in changes) overrideChanges[k]=String(changes[k]||'').trim();});
    if (Object.keys(overrideChanges).length) upsertOverrides_(spreadsheet,id,overrideChanges);
    SpreadsheetApp.flush();
    const after=findRecord_(workflow,id);
    keys.forEach(key=>appendAudit_(spreadsheet,{actorEmail,id,workflow,field:key,oldValue:before[key]||'',newValue:after[key]||''}));
    return json_({ok:true,source:'Occono TEST and DEVELOPMENT workflow workbooks',record:after},200);
  } finally { lock.releaseLock(); }
}

function recordContactOutcome_(body) {
  const id=String(body.id||'').trim(), actorEmail=String(body.actorEmail||'').trim().toLowerCase();
  const outcomeKey=String(body.outcome||'').trim();
  if (!id || !actorEmail || !outcomeKey) throw new Error('Record ID, actor email and outcome are required.');
  const outcomes={
    spoke:{label:'Spoke to customer',status:'Under review',nextAction:'Complete qualification notes',workingDays:1,channel:'Phone'},
    no_answer:{label:'No answer',status:'Under review',nextAction:'Try customer again',workingDays:2,channel:'Phone'},
    left_voicemail:{label:'Left voicemail',status:'Waiting on customer',nextAction:'Follow up after voicemail',workingDays:2,channel:'Phone'},
    awaiting_information:{label:'Awaiting information',status:'Waiting on customer',nextAction:'Review customer information when received',workingDays:3,channel:'Phone / email'},
    not_suitable:{label:'Not suitable',status:'Closed',nextAction:'No further action',workingDays:null,channel:'Internal'},
    ready_discovery:{label:'Ready for discovery',status:'Under review',nextAction:'Send discovery questionnaire',workingDays:1,channel:'Internal'},
  };
  const definition=outcomes[outcomeKey];
  if (!definition) throw new Error('Unsupported contact outcome.');
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const table=rawTable_('enquiries'), rowIndex=table.rows.findIndex(r=>r[table.column['Enquiry ID']]===id);
    if (rowIndex<0) throw new Error(`Enquiry not found: ${id}`);
    const row=table.rows[rowIndex], rowNumber=rowIndex+2, before=findRecord_('enquiries',id);
    requireColumns_(table.column,['Status','Last Contact Timestamp','Follow-up Count']);
    table.sheet.getRange(rowNumber,table.column['Status']+1).setValue(definition.status);
    table.sheet.getRange(rowNumber,table.column['Last Contact Timestamp']+1).setValue(new Date());
    if ('Last Outbound Timestamp' in table.column) table.sheet.getRange(rowNumber,table.column['Last Outbound Timestamp']+1).setValue(new Date());
    const currentCount=Number(value_(row,table.column,'Follow-up Count'))||0;
    table.sheet.getRange(rowNumber,table.column['Follow-up Count']+1).setValue(currentCount+1);
    const due=definition.workingDays===null?'':workingDayDue_(definition.workingDays);
    upsertOverrides_(table.spreadsheet,id,{nextAction:definition.nextAction,due:due});
    appendActivity_(table.spreadsheet,{
      enquiryId:id,
      contactId:value_(row,table.column,'Contact ID'),
      businessId:value_(row,table.column,'Business ID'),
      direction:definition.channel==='Internal'?'Internal':'Outbound',
      channel:definition.channel,
      activityType:'Contact outcome',
      summary:definition.label,
      outcome:definition.label,
      actor:actorEmail,
      notes:`Recorded from Workflow Kanban. Next action: ${definition.nextAction}.`,
    });
    appendAudit_(table.spreadsheet,{actorEmail,id,workflow:'enquiries',field:'Contact outcome',oldValue:before.status||'',newValue:definition.label});
    SpreadsheetApp.flush();
    return json_({ok:true,source:'Occono TEST and DEVELOPMENT workflow workbooks',outcome:definition.label,record:findRecord_('enquiries',id)},200);
  } finally { lock.releaseLock(); }
}

function appendActivity_(spreadsheet,entry) {
  let sheet=spreadsheet.getSheetByName(CONFIG.activitiesSheetName);
  const headers=['Activity ID','Timestamp','Enquiry ID','Contact ID','Business ID','Direction','Channel','Activity Type','Summary','Outcome','Actor','External Reference','Notes','Evidence URL'];
  if (!sheet) { sheet=spreadsheet.insertSheet(CONFIG.activitiesSheetName); sheet.appendRow(headers); sheet.setFrozenRows(1); }
  ensureHeaders_(sheet,headers);
  const values=sheet.getDataRange().getDisplayValues(), column=columnMap_(values[0]);
  const id=nextId_(values.slice(1).map(r=>r[column['Activity ID']]),'ACT');
  appendMappedRow_(sheet,values[0],{
    'Activity ID':id,'Timestamp':new Date(),'Enquiry ID':entry.enquiryId,'Contact ID':entry.contactId||'','Business ID':entry.businessId||'',
    'Direction':entry.direction,'Channel':entry.channel,'Activity Type':entry.activityType,'Summary':entry.summary,'Outcome':entry.outcome,
    'Actor':entry.actor,'External Reference':'','Notes':entry.notes||'','Evidence URL':''
  });
}

function workingDayDue_(days) {
  const date=new Date(); let added=0;
  while (added<days) { date.setDate(date.getDate()+1); if (date.getDay()!==0 && date.getDay()!==6) added++; }
  date.setHours(9,0,0,0);
  return Utilities.formatDate(date,Session.getScriptTimeZone()||'Europe/London','yyyy-MM-dd HH:mm');
}

function promoteRecord_(body) {
  const workflow=String(body.workflow||'').trim(), id=String(body.id||'').trim();
  const actorEmail=String(body.actorEmail||'').trim().toLowerCase();
  if (!id || !actorEmail) throw new Error('Record ID and actor email are required.');
  const sourceRecord=findRecord_(workflow,id);
  let targetKey;
  if (workflow==='outreach' && sourceRecord.status==='Converted') targetKey='enquiries';
  else if (workflow==='enquiries' && sourceRecord.status==='Accepted') targetKey='delivery';
  else throw new Error('This record is not eligible for promotion.');
  const lock=LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const targetSpreadsheet=SpreadsheetApp.openById(CONFIG.sources[targetKey].spreadsheetId);
    const handoff=ensureHandoff_(targetSpreadsheet,workflow,id,targetKey,sourceRecord,actorEmail);
    if (handoff.status==='Promoted' && handoff.destinationId) return json_({ok:true,source:'Occono TEST and DEVELOPMENT workflow workbooks',promotion:{handoffId:handoff.id,destinationId:handoff.destinationId,targetWorkflow:targetKey,record:findRecord_(targetKey,handoff.destinationId)}},200);
    const destinationId=targetKey==='enquiries'?createEnquiryFromOutreach_(id,sourceRecord):createProjectFromEnquiry_(id,sourceRecord);
    markHandoffPromoted_(targetSpreadsheet,handoff.rowNumber,destinationId);
    updateSourceLink_(workflow,id,destinationId);
    appendAudit_(targetSpreadsheet,{actorEmail,id,workflow,field:'Promotion',oldValue:'',newValue:`${destinationId} → ${targetKey}`});
    SpreadsheetApp.flush();
    return json_({ok:true,source:'Occono TEST and DEVELOPMENT workflow workbooks',promotion:{handoffId:handoff.id,destinationId,targetWorkflow:targetKey,record:findRecord_(targetKey,destinationId)}},200);
  } finally { lock.releaseLock(); }
}

function createEnquiryFromOutreach_(sourceId,sourceRecord) {
  const sourceTable=rawTable_('outreach'),sourceRow=findRawRow_(sourceTable,sourceId),targetTable=rawTable_('enquiries');
  const newId=nextId_(targetTable.rows.map(r=>r[targetTable.column['Enquiry ID']]),'ENQ');
  appendMappedRow_(targetTable.sheet,targetTable.headers,{
    'Enquiry ID':newId,'Created Timestamp':new Date(),'Source':`Outreach promotion: ${sourceId}`,
    'Name':value_(sourceRow,sourceTable.column,'Contact Name')||sourceRecord.contact||'','Business':value_(sourceRow,sourceTable.column,'Business Name')||sourceRecord.title||'',
    'Email':value_(sourceRow,sourceTable.column,'Email'),'Phone':value_(sourceRow,sourceTable.column,'Phone'),'Website Type':'Not sure yet','Guide Budget':'Not sure yet',
    'Original Message':promotionSummary_(sourceId,sourceRecord,value_(sourceRow,sourceTable.column,'Website URL')),'Status':'New','Qualification':'Not assessed','Approved Route':'Manual handling',
    'Owner':normaliseOwnerName_(sourceRecord.ownerName),'Next Action':'Review promoted outreach enquiry','Automation Mode':'Manual','Record Lock':'No','Reminder Stage':`Promoted from ${sourceId}`
  });
  return newId;
}

function createProjectFromEnquiry_(sourceId,sourceRecord) {
  const targetTable=rawTable_('delivery'),newId=nextId_(targetTable.rows.map(r=>r[targetTable.column['Project ID']]),'PRJ');
  appendMappedRow_(targetTable.sheet,targetTable.headers,{'Project ID':newId,'Project Name':sourceRecord.title||sourceId,'Business Name':sourceRecord.title||'','Status':'Ready to start','Current Phase':'Ready to start','Owner':normaliseOwnerName_(sourceRecord.ownerName),'Start Gate':'Pending project setup','Created Timestamp':new Date(),'Record Lock':'No','Environment':'DEVELOPMENT','Notes':`Promoted from accepted enquiry ${sourceId}. ${sourceRecord.summary||''}`});
  return newId;
}

function ensureHandoff_(spreadsheet,sourceWorkflow,sourceId,targetWorkflow,record,actorEmail) {
  let sheet=spreadsheet.getSheetByName(CONFIG.handoffSheetName);
  const required=['Handoff ID','Created Timestamp','Source Workflow','Source Record ID','Target Workflow','Business / Project','Contact','Summary','Owner Name','Owner Email','Status','Actor Email','Environment','Destination Record ID','Promoted Timestamp'];
  if (!sheet) { sheet=spreadsheet.insertSheet(CONFIG.handoffSheetName); sheet.appendRow(required); sheet.setFrozenRows(1); }
  ensureHeaders_(sheet,required);
  const values=sheet.getDataRange().getDisplayValues(),column=columnMap_(values[0]);
  const rowIndex=values.findIndex((row,index)=>index>0&&row[column['Source Workflow']]===sourceWorkflow&&row[column['Source Record ID']]===sourceId&&row[column['Target Workflow']]===targetWorkflow&&row[column['Status']]!=='Cancelled');
  if (rowIndex>0) return {id:values[rowIndex][column['Handoff ID']],status:values[rowIndex][column['Status']],destinationId:values[rowIndex][column['Destination Record ID']]||'',rowNumber:rowIndex+1};
  const handoffId=nextId_(values.slice(1).map(r=>r[column['Handoff ID']]),'HOF');
  appendMappedRow_(sheet,required,{'Handoff ID':handoffId,'Created Timestamp':new Date(),'Source Workflow':sourceWorkflow,'Source Record ID':sourceId,'Target Workflow':targetWorkflow,'Business / Project':record.title||'','Contact':record.contact||'','Summary':record.summary||'','Owner Name':record.ownerName||'','Owner Email':record.ownerEmail||'','Status':'Pending review','Actor Email':actorEmail,'Environment':CONFIG.environment});
  return {id:handoffId,status:'Pending review',destinationId:'',rowNumber:sheet.getLastRow()};
}

function markHandoffPromoted_(spreadsheet,rowNumber,destinationId) {const sheet=spreadsheet.getSheetByName(CONFIG.handoffSheetName),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0],column=columnMap_(headers);sheet.getRange(rowNumber,column['Status']+1).setValue('Promoted');sheet.getRange(rowNumber,column['Destination Record ID']+1).setValue(destinationId);sheet.getRange(rowNumber,column['Promoted Timestamp']+1).setValue(new Date());}
function updateSourceLink_(workflow,sourceId,destinationId){if(workflow!=='outreach')return;const table=rawTable_('outreach'),rowIndex=table.rows.findIndex(r=>r[table.column['Prospect ID']]===sourceId);if(rowIndex<0)return;if('Enquiry Handoff Status'in table.column)table.sheet.getRange(rowIndex+2,table.column['Enquiry Handoff Status']+1).setValue('Promoted');if('Enquiry ID'in table.column)table.sheet.getRange(rowIndex+2,table.column['Enquiry ID']+1).setValue(destinationId);if('Updated Timestamp'in table.column)table.sheet.getRange(rowIndex+2,table.column['Updated Timestamp']+1).setValue(new Date());}
function promotedSourceIds_(){const ids=new Set();['enquiries','delivery'].forEach(key=>{const spreadsheet=SpreadsheetApp.openById(CONFIG.sources[key].spreadsheetId),sheet=spreadsheet.getSheetByName(CONFIG.handoffSheetName);if(!sheet||sheet.getLastRow()<2)return;const values=sheet.getDataRange().getDisplayValues(),column=columnMap_(values[0]);if(!('Status'in column)||!('Source Record ID'in column))return;values.slice(1).forEach(row=>{if(row[column['Status']]==='Promoted')ids.add(row[column['Source Record ID']]);});});return ids;}
function applyStatus_(workflow,sheet,rowNumber,column,status){if(workflow==='enquiries'){requireColumns_(column,['Status']);sheet.getRange(rowNumber,column['Status']+1).setValue(status);return;}if(workflow==='outreach'){requireColumns_(column,['Current Status']);const values={'Prospect found':'Prospect found','Qualified':'Qualified','Outreach ready':'Qualified — draft awaiting approval','Contacted':'Contacted — awaiting response','Follow-up':'Follow-up due','Engaged':'Engaged','Converted':'Converted'};sheet.getRange(rowNumber,column['Current Status']+1).setValue(values[status]);return;}requireColumns_(column,['Status','Current Phase']);const values={'Ready to start':['Ready to start','Ready to start'],'In progress':['Active','In progress'],'Waiting':['Active','Waiting'],'Review':['Active','Review'],'Ready to launch':['Active','Ready to launch'],'Complete':['Complete','Delivered']},pair=values[status];sheet.getRange(rowNumber,column['Status']+1).setValue(pair[0]);sheet.getRange(rowNumber,column['Current Phase']+1).setValue(pair[1]);}
function overrides_(spreadsheet){const sheet=spreadsheet.getSheetByName(CONFIG.overrideSheetName);if(!sheet)return{};const values=sheet.getDataRange().getDisplayValues();if(values.length<2)return{};const headers=values[0],rows=values.slice(1),column=columnMap_(headers);return Object.fromEntries(rows.filter(r=>r[column['Record ID']]).map(r=>[r[column['Record ID']],{ownerName:r[column['Owner Name']]||'',ownerEmail:(r[column['Owner Email']]||'').toLowerCase(),nextAction:r[column['Next Action']]||'',due:r[column['Due']]||''}]));}
function upsertOverrides_(spreadsheet,id,changes){let sheet=spreadsheet.getSheetByName(CONFIG.overrideSheetName);if(!sheet){sheet=spreadsheet.insertSheet(CONFIG.overrideSheetName);sheet.appendRow(['Record ID','Owner Name','Owner Email','Next Action','Due','Updated Timestamp']);sheet.setFrozenRows(1);}const values=sheet.getDataRange().getDisplayValues(),rowIndex=values.findIndex((r,i)=>i>0&&r[0]===id),current=rowIndex>0?values[rowIndex]:[id,'','','','',''];const merged=[id,changes.ownerName!==undefined?changes.ownerName:current[1],changes.ownerEmail!==undefined?changes.ownerEmail:current[2],changes.nextAction!==undefined?changes.nextAction:current[3],changes.due!==undefined?changes.due:current[4],new Date()];if(rowIndex>0)sheet.getRange(rowIndex+1,1,1,6).setValues([merged]);else sheet.appendRow(merged);}
function appendAudit_(spreadsheet,entry){let sheet=spreadsheet.getSheetByName(CONFIG.auditSheetName);if(!sheet){sheet=spreadsheet.insertSheet(CONFIG.auditSheetName);sheet.appendRow(['Timestamp','Actor Email','Record ID','Workflow','Field','Old Value','New Value','Environment','Source']);sheet.setFrozenRows(1);}sheet.appendRow([new Date(),entry.actorEmail,entry.id,entry.workflow,entry.field,entry.oldValue,entry.newValue,CONFIG.environment,'Workflow Kanban']);}
function assertAuthorised_(providedToken){const expected=PropertiesService.getScriptProperties().getProperty(CONFIG.apiTokenProperty);if(!expected)throw new Error('KANBAN_API_TOKEN is not configured.');if(!providedToken||providedToken!==expected)throw new Error('Unauthorised.');}
function rawTable_(key){const source=CONFIG.sources[key],spreadsheet=SpreadsheetApp.openById(source.spreadsheetId),sheet=spreadsheet.getSheetByName(source.sheetName);if(!sheet)throw new Error(`${source.sheetName} sheet not found.`);const values=sheet.getDataRange().getDisplayValues(),headers=values.shift()||[];return{spreadsheet,sheet,headers,column:columnMap_(headers),rows:values};}
function readTable_(key){return rawTable_(key);}
function findRawRow_(table,id){const source=Object.values(CONFIG.sources).find(s=>s.sheetName===table.sheet.getName()),row=table.rows.find(r=>r[table.column[source.idColumn]]===id);if(!row)throw new Error(`Source record not found: ${id}`);return row;}
function requireColumns_(column,names){names.forEach(name=>{if(!(name in column))throw new Error(`Required column missing: ${name}`);});}
function columnMap_(headers){return Object.fromEntries(headers.map((h,i)=>[h,i]));}
function value_(row,column,name){return name in column?row[column[name]]||'':'';}
function appendMappedRow_(sheet,headers,values){sheet.appendRow(headers.map(h=>Object.prototype.hasOwnProperty.call(values,h)?values[h]:''));}
function ensureHeaders_(sheet,required){const current=sheet.getRange(1,1,1,Math.max(1,sheet.getLastColumn())).getDisplayValues()[0];required.forEach(header=>{if(!current.includes(header)){sheet.getRange(1,current.length+1).setValue(header);current.push(header);}});}
function nextId_(existing,prefix){const year=new Date().getFullYear(),regex=new RegExp(`^${prefix}-(\\d{4})-(\\d+)$`),max=existing.map(String).map(v=>{const m=v.match(regex);return m&&Number(m[1])===year?Number(m[2]):0;}).reduce((a,b)=>Math.max(a,b),0);return`${prefix}-${year}-${String(max+1).padStart(4,'0')}`;}
function promotionSummary_(sourceId,record,url){return[`Promoted from outreach ${sourceId}.`,record.summary||'',url?`Website: ${url}`:''].filter(Boolean).join(' ');}
function extractWebsite_(text){const match=String(text||'').match(/https?:\/\/[^\s]+/i);return match?match[0].replace(/[),.;]+$/,''):'';}
function normaliseOwnerName_(value){return/darren/i.test(String(value||''))?'Darren':String(value||'').replace(/\s*\/\s*System/i,'').trim();}
function owner_(value){const ownerName=String(value||'').trim(),ownerEmail=/\bdarren\b/i.test(ownerName)?'darren@occono.co.uk':'';return{ownerId:ownerEmail?`email:${ownerEmail}`:'',ownerEmail,ownerName:ownerName||'Unassigned'};}
function applyOverride_(record,override){if(!override)return record;const ownerEmail=override.ownerEmail||record.ownerEmail||'',ownerName=override.ownerName||record.ownerName||'Unassigned';return{...record,ownerEmail,ownerName,ownerId:ownerEmail?`email:${ownerEmail}`:'',nextAction:override.nextAction!==''?override.nextAction:record.nextAction,due:override.due!==''?override.due:record.due};}
function readEnquiries_(){const table=readTable_('enquiries'),over=overrides_(table.spreadsheet),c=table.column;requireColumns_(c,['Enquiry ID','Name','Business','Original Message','Status','Owner','Next Action','Next Action Due']);return table.rows.filter(r=>r[c['Enquiry ID']]).map(r=>applyOverride_({id:r[c['Enquiry ID']],workflow:'enquiries',title:r[c['Business']]||r[c['Name']]||r[c['Enquiry ID']],contact:r[c['Name']]||'',email:value_(r,c,'Email'),phone:value_(r,c,'Phone'),website:extractWebsite_(r[c['Original Message']]),status:mapEnquiryStatus_(r[c['Status']]),...owner_(r[c['Owner']]),nextAction:r[c['Next Action']]||'',due:r[c['Next Action Due']]||'',summary:r[c['Original Message']]||'',followUpCount:Number(value_(r,c,'Follow-up Count'))||0},over[r[c['Enquiry ID']]]));}
function readOutreach_(){const table=readTable_('outreach'),over=overrides_(table.spreadsheet),c=table.column;requireColumns_(c,['Prospect ID','Business Name','Current Status','Owner','Next Follow-up','Notes']);return table.rows.filter(r=>r[c['Prospect ID']]).map(r=>applyOverride_({id:r[c['Prospect ID']],workflow:'outreach',title:r[c['Business Name']]||r[c['Prospect ID']],contact:r[c['Contact Name']]||r[c['Town / Area']]||'',email:value_(r,c,'Email'),phone:value_(r,c,'Phone'),website:value_(r,c,'Website URL'),status:mapOutreachStatus_(r[c['Current Status']]),...owner_(r[c['Owner']]),nextAction:outreachNextAction_(r[c['Current Status']],r[c['Preferred Channel']]),due:r[c['Next Follow-up']]||'',summary:r[c['Notes']]||''},over[r[c['Prospect ID']]]));}
function readDelivery_(){const table=readTable_('delivery'),over=overrides_(table.spreadsheet),c=table.column;requireColumns_(c,['Project ID','Project Name','Business Name','Status','Current Phase','Owner','Target Delivery','Notes']);return table.rows.filter(r=>r[c['Project ID']]).map(r=>applyOverride_({id:r[c['Project ID']],workflow:'delivery',title:r[c['Project Name']]||r[c['Business Name']]||r[c['Project ID']],contact:r[c['Business Name']]||'',status:mapDeliveryStatus_(r[c['Status']],r[c['Current Phase']]),...owner_(r[c['Owner']]),nextAction:r[c['Current Phase']]||r[c['Status']]||'',due:r[c['Target Delivery']]||'',summary:r[c['Notes']]||''},over[r[c['Project ID']]]));}
function findRecord_(workflow,id){const readers={enquiries:readEnquiries_,outreach:readOutreach_,delivery:readDelivery_},record=readers[workflow]&&readers[workflow]().find(item=>item.id===id);if(!record)throw new Error('Record could not be found.');return record;}
function mapEnquiryStatus_(v){return String(v||'').trim()||'New';}
function mapOutreachStatus_(v){const s=String(v||'').toLowerCase();if(s.includes('converted'))return'Converted';if(s.includes('engaged')||s.includes('interested'))return'Engaged';if(s.includes('follow'))return'Follow-up';if(s.includes('contacted')||s.includes('awaiting response'))return'Contacted';if(s.includes('draft'))return'Outreach ready';if(s.includes('qualified'))return'Qualified';return'Prospect found';}
function outreachNextAction_(s,c){s=String(s||'');c=String(c||'');if(/awaiting response/i.test(s))return'Review response or follow up';if(/draft awaiting approval/i.test(s))return`Review ${c||'outreach'} draft`;if(/draft blocked/i.test(s))return'Resolve blocked draft';return s||'Review prospect';}
function mapDeliveryStatus_(s,p){const c=`${s||''} ${p||''}`.toLowerCase();if(c.includes('closed')||c.includes('complete')||c.includes('delivered'))return'Complete';if(c.includes('launch'))return'Ready to launch';if(c.includes('review'))return'Review';if(c.includes('waiting')||c.includes('blocked'))return'Waiting';if(c.includes('progress')||c.includes('build'))return'In progress';return'Ready to start';}
function json_(payload,status){return ContentService.createTextOutput(JSON.stringify({...payload,status})).setMimeType(ContentService.MimeType.JSON);}
