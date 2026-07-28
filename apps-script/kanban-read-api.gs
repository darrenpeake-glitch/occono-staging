const CONFIG = Object.freeze({
  apiTokenProperty: 'KANBAN_API_TOKEN',
  environment: 'TEST',
  sources: Object.freeze({
    enquiries: {
      spreadsheetId: '1BqRdcKQ-xLZksS-fe0zc6nD-L364JpmImtu-JmGX2YM',
      sheetName: 'Enquiries',
    },
    outreach: {
      spreadsheetId: '1OPgKuBAmISSpcEisZtkQFmsq_b8Fvj8ldmSnj8xvV1c',
      sheetName: 'Prospects',
    },
    delivery: {
      spreadsheetId: '11lUo6o86mrwhTzVwt0l72WH1wZ8NFhldPW5lCClPquE',
      sheetName: 'Projects',
    },
  }),
});

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    assertAuthorised_(body.token);

    if (body.action !== 'listWorkflows') {
      return json_({ ok: false, error: 'Unsupported action.' }, 400);
    }

    const records = []
      .concat(readEnquiries_())
      .concat(readOutreach_())
      .concat(readDelivery_());

    return json_({
      ok: true,
      environment: CONFIG.environment,
      source: 'Occono TEST and DEVELOPMENT workflow workbooks',
      generatedAt: new Date().toISOString(),
      records,
    }, 200);
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: error.message || 'Unexpected error.' }, 500);
  }
}

function assertAuthorised_(providedToken) {
  const expectedToken = PropertiesService.getScriptProperties().getProperty(CONFIG.apiTokenProperty);
  if (!expectedToken) throw new Error('KANBAN_API_TOKEN is not configured.');
  if (!providedToken || providedToken !== expectedToken) throw new Error('Unauthorised.');
}

function readTable_(sourceKey) {
  const source = CONFIG.sources[sourceKey];
  const sheet = SpreadsheetApp.openById(source.spreadsheetId).getSheetByName(source.sheetName);
  if (!sheet) throw new Error(`${source.sheetName} sheet not found.`);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return { column: {}, rows: [] };
  const headers = values.shift();
  return {
    column: Object.fromEntries(headers.map((header, index) => [header, index])),
    rows: values,
  };
}

function requireColumns_(column, names) {
  names.forEach(name => {
    if (!(name in column)) throw new Error(`Required column missing: ${name}`);
  });
}

function owner_(value) {
  const ownerName = String(value || '').trim();
  const isDarren = /\bdarren\b/i.test(ownerName);
  const ownerEmail = isDarren ? 'darren@occono.co.uk' : '';
  return {
    ownerId: ownerEmail ? `email:${ownerEmail}` : '',
    ownerEmail,
    ownerName: ownerName || 'Unassigned',
  };
}

function readEnquiries_() {
  const { column, rows } = readTable_('enquiries');
  requireColumns_(column, ['Enquiry ID', 'Name', 'Business', 'Original Message', 'Status', 'Owner', 'Next Action', 'Next Action Due']);

  return rows
    .filter(row => row[column['Enquiry ID']])
    .map(row => ({
      id: row[column['Enquiry ID']],
      workflow: 'enquiries',
      title: row[column['Business']] || row[column['Name']] || row[column['Enquiry ID']],
      contact: row[column['Name']] || '',
      status: mapEnquiryStatus_(row[column['Status']]),
      ...owner_(row[column['Owner']]),
      nextAction: row[column['Next Action']] || '',
      due: row[column['Next Action Due']] || '',
      summary: row[column['Original Message']] || '',
    }));
}

function readOutreach_() {
  const { column, rows } = readTable_('outreach');
  requireColumns_(column, ['Prospect ID', 'Business Name', 'Current Status', 'Owner', 'Next Follow-up', 'Notes']);

  return rows
    .filter(row => row[column['Prospect ID']])
    .map(row => ({
      id: row[column['Prospect ID']],
      workflow: 'outreach',
      title: row[column['Business Name']] || row[column['Prospect ID']],
      contact: row[column['Contact Name']] || row[column['Town / Area']] || '',
      status: mapOutreachStatus_(row[column['Current Status']]),
      ...owner_(row[column['Owner']]),
      nextAction: outreachNextAction_(row[column['Current Status']], row[column['Preferred Channel']]),
      due: row[column['Next Follow-up']] || '',
      summary: row[column['Notes']] || '',
    }));
}

function readDelivery_() {
  const { column, rows } = readTable_('delivery');
  requireColumns_(column, ['Project ID', 'Project Name', 'Business Name', 'Status', 'Current Phase', 'Owner', 'Target Delivery', 'Notes']);

  return rows
    .filter(row => row[column['Project ID']])
    .map(row => ({
      id: row[column['Project ID']],
      workflow: 'delivery',
      title: row[column['Project Name']] || row[column['Business Name']] || row[column['Project ID']],
      contact: row[column['Business Name']] || '',
      status: mapDeliveryStatus_(row[column['Status']], row[column['Current Phase']]),
      ...owner_(row[column['Owner']]),
      nextAction: row[column['Current Phase']] || row[column['Status']] || '',
      due: row[column['Target Delivery']] || '',
      summary: row[column['Notes']] || '',
    }));
}

function mapEnquiryStatus_(value) {
  const status = String(value || '').trim();
  return status || 'New';
}

function mapOutreachStatus_(value) {
  const status = String(value || '').toLowerCase();
  if (status.includes('converted')) return 'Converted';
  if (status.includes('engaged') || status.includes('interested')) return 'Engaged';
  if (status.includes('follow')) return 'Follow-up';
  if (status.includes('contacted') || status.includes('awaiting response')) return 'Contacted';
  if (status.includes('draft')) return 'Outreach ready';
  if (status.includes('qualified')) return 'Qualified';
  return 'Prospect found';
}

function outreachNextAction_(statusValue, channelValue) {
  const status = String(statusValue || '');
  const channel = String(channelValue || '');
  if (/awaiting response/i.test(status)) return 'Review response or follow up';
  if (/draft awaiting approval/i.test(status)) return `Review ${channel || 'outreach'} draft`;
  if (/draft blocked/i.test(status)) return 'Resolve blocked draft';
  return status || 'Review prospect';
}

function mapDeliveryStatus_(statusValue, phaseValue) {
  const combined = `${statusValue || ''} ${phaseValue || ''}`.toLowerCase();
  if (combined.includes('closed') || combined.includes('complete') || combined.includes('delivered')) return 'Complete';
  if (combined.includes('launch')) return 'Ready to launch';
  if (combined.includes('review')) return 'Review';
  if (combined.includes('waiting') || combined.includes('blocked')) return 'Waiting';
  if (combined.includes('progress') || combined.includes('build')) return 'In progress';
  return 'Ready to start';
}

function json_(payload, status) {
  return ContentService
    .createTextOutput(JSON.stringify({ ...payload, status }))
    .setMimeType(ContentService.MimeType.JSON);
}
