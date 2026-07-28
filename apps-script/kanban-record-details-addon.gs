function getRecordDetails_(body) {
  const workflow = String(body.workflow || '').trim();
  const id = String(body.id || '').trim();
  if (!(workflow in CONFIG.sources)) throw new Error('Unknown workflow.');
  if (!id) throw new Error('Record ID is required.');

  const record = findRecord_(workflow, id);
  const source = rawTable_(workflow);
  const row = findRawRow_(source, id);
  const details = {
    record,
    customer: buildCustomerDetails_(workflow, source, row),
    documents: buildRecordDocuments_(workflow, source, row, id),
    timeline: buildRecordTimeline_(workflow, source.spreadsheet, id, record)
  };

  return json_({
    ok:true,
    source:'Occono TEST and DEVELOPMENT workflow workbooks',
    details
  },200);
}

function buildCustomerDetails_(workflow, table, row) {
  const c = table.column;
  if (workflow === 'enquiries') {
    return {
      contactId:value_(row,c,'Contact ID'),
      businessId:value_(row,c,'Business ID'),
      name:value_(row,c,'Name'),
      business:value_(row,c,'Business'),
      email:value_(row,c,'Email'),
      ccEmails:value_(row,c,'CC Emails'),
      phone:value_(row,c,'Phone'),
      website:extractWebsite_(value_(row,c,'Original Message')),
      source:value_(row,c,'Source')
    };
  }
  return {
    name:value_(row,c,'Contact Name') || value_(row,c,'Business Name'),
    business:value_(row,c,'Business Name') || value_(row,c,'Project Name'),
    email:value_(row,c,'Email'),
    ccEmails:'',
    phone:value_(row,c,'Phone'),
    website:value_(row,c,'Website URL'),
    source:workflow
  };
}

function buildRecordDocuments_(workflow, table, row, id) {
  const documents = [];
  const c = table.column;
  if (workflow !== 'enquiries') return documents;

  documents.push({
    type:'Enquiry form',
    title:'Original enquiry submission',
    status:'Received',
    created:value_(row,c,'Created Timestamp'),
    summary:value_(row,c,'Original Message'),
    url:value_(row,c,'Drive Folder URL')
  });

  const spreadsheet = table.spreadsheet;
  const responseSheet = spreadsheet.getSheetByName('Discovery Responses');
  if (responseSheet && responseSheet.getLastRow() >= 2) {
    const values = responseSheet.getDataRange().getDisplayValues();
    const rc = columnMap_(values[0]);
    values.slice(1).forEach(response => {
      if (value_(response,rc,'Enquiry ID') !== id) return;
      documents.push({
        type:'Discovery response',
        title:value_(response,rc,'Response ID') || 'Discovery response',
        status:value_(response,rc,'Processed') === 'Yes' ? 'Processed' : 'Received',
        created:value_(response,rc,'Submitted Timestamp'),
        summary:'Customer discovery questionnaire response',
        url:value_(response,rc,'Brief URL')
      });
    });
  }

  const briefSheet = spreadsheet.getSheetByName('Discovery Briefs');
  if (briefSheet && briefSheet.getLastRow() >= 2) {
    const values = briefSheet.getDataRange().getDisplayValues();
    const bc = columnMap_(values[0]);
    values.slice(1).forEach(brief => {
      if (value_(brief,bc,'Enquiry ID') !== id) return;
      documents.push({
        type:'Discovery brief',
        title:value_(brief,bc,'Brief ID') || 'Discovery brief',
        status:'Created',
        created:value_(brief,bc,'Created Timestamp'),
        summary:value_(brief,bc,'Purpose') || 'Internal discovery brief',
        url:value_(brief,bc,'Brief URL')
      });
    });
  }

  return documents;
}

function buildRecordTimeline_(workflow, spreadsheet, id, record) {
  const events = [];
  if (workflow === 'enquiries') {
    const activitySheet = spreadsheet.getSheetByName(CONFIG.activitiesSheetName);
    if (activitySheet && activitySheet.getLastRow() >= 2) {
      const values = activitySheet.getDataRange().getDisplayValues();
      const ac = columnMap_(values[0]);
      values.slice(1).forEach(row => {
        if (value_(row,ac,'Enquiry ID') !== id) return;
        events.push({
          timestamp:value_(row,ac,'Timestamp'),
          title:value_(row,ac,'Activity Type') || 'Activity',
          detail:value_(row,ac,'Summary') || value_(row,ac,'Notes'),
          actor:value_(row,ac,'Actor') || 'System',
          category:'activity',
          outcome:value_(row,ac,'Outcome'),
          url:value_(row,ac,'Evidence URL')
        });
      });
    }
  }

  const auditSheet = spreadsheet.getSheetByName(CONFIG.auditSheetName);
  if (auditSheet && auditSheet.getLastRow() >= 2) {
    const values = auditSheet.getDataRange().getDisplayValues();
    const kc = columnMap_(values[0]);
    values.slice(1).forEach(row => {
      if (value_(row,kc,'Record ID') !== id) return;
      events.push({
        timestamp:value_(row,kc,'Timestamp'),
        title:value_(row,kc,'Field') + ' changed',
        detail:[value_(row,kc,'Old Value'),value_(row,kc,'New Value')].filter(Boolean).join(' → '),
        actor:value_(row,kc,'Actor Email') || 'System',
        category:'audit',
        outcome:''
      });
    });
  }

  events.push({
    timestamp:'',
    title:'Current position',
    detail:[record.status,record.nextAction].filter(Boolean).join(' · '),
    actor:record.ownerName || 'Unassigned',
    category:'current',
    outcome:record.due ? 'Due ' + record.due : ''
  });

  return events.sort((a,b) => parseDetailDate_(b.timestamp) - parseDetailDate_(a.timestamp));
}

function parseDetailDate_(value) {
  const parsed = parseDateTime_(value);
  return parsed ? parsed.getTime() : -1;
}
