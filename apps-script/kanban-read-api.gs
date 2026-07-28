const CONFIG = Object.freeze({
  spreadsheetId: '1BqRdcKQ-xLZksS-fe0zc6nD-L364JpmImtu-JmGX2YM',
  enquiriesSheet: 'Enquiries',
  apiTokenProperty: 'KANBAN_API_TOKEN',
  environment: 'TEST',
});

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    assertAuthorised_(body.token);

    if (body.action !== 'listWorkflows') {
      return json_({ ok: false, error: 'Unsupported action.' }, 400);
    }

    const records = readEnquiries_();
    return json_({
      ok: true,
      environment: CONFIG.environment,
      source: 'Occono Enquiry System — TEST',
      generatedAt: new Date().toISOString(),
      records,
    });
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

function readEnquiries_() {
  const sheet = SpreadsheetApp.openById(CONFIG.spreadsheetId).getSheetByName(CONFIG.enquiriesSheet);
  if (!sheet) throw new Error('Enquiries sheet not found.');

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values.shift();
  const column = Object.fromEntries(headers.map((header, index) => [header, index]));
  const required = ['Enquiry ID', 'Name', 'Business', 'Email', 'Original Message', 'Status', 'Owner', 'Next Action', 'Next Action Due'];
  required.forEach(name => {
    if (!(name in column)) throw new Error(`Required column missing: ${name}`);
  });

  return values
    .filter(row => row[column['Enquiry ID']])
    .map(row => {
      const ownerName = row[column['Owner']] || '';
      const ownerEmail = ownerName.toLowerCase() === 'darren' ? 'darren@occono.co.uk' : '';
      return {
        id: row[column['Enquiry ID']],
        workflow: 'enquiries',
        title: row[column['Business']] || row[column['Name']] || row[column['Enquiry ID']],
        contact: row[column['Name']] || '',
        status: row[column['Status']] || 'New',
        ownerId: ownerEmail ? `email:${ownerEmail}` : '',
        ownerEmail,
        ownerName: ownerName || 'Unassigned',
        nextAction: row[column['Next Action']] || '',
        due: normaliseDate_(row[column['Next Action Due']]),
        summary: row[column['Original Message']] || '',
      };
    });
}

function normaliseDate_(value) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function json_(payload, status) {
  return ContentService
    .createTextOutput(JSON.stringify({ ...payload, status }))
    .setMimeType(ContentService.MimeType.JSON);
}
