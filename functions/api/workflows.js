const OWNER_EMAILS = new Set(['darren@occono.co.uk']);

const FALLBACK_RECORDS = [
  { id:'ENQ-2026-0001', workflow:'enquiries', title:'Occono Test Business', contact:'Test Contact', status:'New', ownerId:'email:darren@occono.co.uk', ownerEmail:'darren@occono.co.uk', ownerName:'Darren', nextAction:'Review test record', due:'2026-07-27T09:00:00+01:00', summary:'Build a small service website.' },
  { id:'ENQ-2026-0002', workflow:'enquiries', title:'No Business Test', contact:'No Business Test', status:'Under review', ownerId:'email:darren@occono.co.uk', ownerEmail:'darren@occono.co.uk', ownerName:'Darren', nextAction:'Confirm business details', due:'2026-07-28T09:00:00+01:00', summary:'Enquiry without a business record.' },
  { id:'ENQ-2026-0004', workflow:'enquiries', title:'Occono Deployed Test', contact:'Deployed HTTP Test', status:'Awaiting Occono', ownerId:'email:darren@occono.co.uk', ownerEmail:'darren@occono.co.uk', ownerName:'Darren', nextAction:'Review and reply to prospect', due:'2026-07-27T09:00:00+01:00', summary:'Validate the deployed HTTP endpoint.' },
  { id:'OUT-2026-0001', workflow:'outreach', title:'Devon Independent Café', contact:'Owner unknown', status:'Qualified', ownerId:'email:darren@occono.co.uk', ownerEmail:'darren@occono.co.uk', ownerName:'Darren', nextAction:'Prepare first-touch email', due:'2026-07-30T10:00:00+01:00', summary:'Local café with an outdated mobile website.' },
  { id:'PRJ-2026-0001', workflow:'delivery', title:'Occono Live Pilot', contact:'Internal', status:'Review', ownerId:'email:darren@occono.co.uk', ownerEmail:'darren@occono.co.uk', ownerName:'Darren', nextAction:'Complete final workflow review', due:'2026-07-29T12:00:00+01:00', summary:'Controlled build and delivery pilot.' },
];

function getIdentity(request) {
  const email = request.headers.get('cf-access-authenticated-user-email');
  if (!email) return null;
  const normalisedEmail = email.trim().toLowerCase();
  return {
    email: normalisedEmail,
    userId: `email:${normalisedEmail}`,
    role: OWNER_EMAILS.has(normalisedEmail) ? 'owner' : 'staff',
  };
}

async function fetchTestRecords(env) {
  if (!env.KANBAN_API_URL || !env.KANBAN_API_TOKEN) {
    return { records: FALLBACK_RECORDS, source: 'protected-demo', warning: 'TEST API not configured.' };
  }

  const response = await fetch(env.KANBAN_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'listWorkflows', token: env.KANBAN_API_TOKEN }),
  });

  if (!response.ok) throw new Error(`TEST API returned HTTP ${response.status}.`);
  const payload = await response.json();
  if (!payload.ok || !Array.isArray(payload.records)) {
    throw new Error(payload.error || 'TEST API returned an invalid payload.');
  }

  return { records: payload.records, source: payload.source || 'test-workbook' };
}

export async function onRequestGet(context) {
  const identity = getIdentity(context.request);
  if (!identity) {
    return Response.json(
      { error: 'Authenticated Cloudflare Access identity required.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let result;
  try {
    result = await fetchTestRecords(context.env);
  } catch (error) {
    console.error('TEST workflow API failure', error);
    result = { records: FALLBACK_RECORDS, source: 'protected-demo', warning: error.message };
  }

  const visibleRecords = identity.role === 'owner'
    ? result.records
    : result.records.filter(record => record.ownerEmail === identity.email);

  return Response.json(
    { records: visibleRecords, source: result.source, warning: result.warning || null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
