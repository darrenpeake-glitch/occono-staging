const OWNER_EMAILS = new Set(['darren@occono.co.uk']);

const RECORDS = [
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

export async function onRequestGet(context) {
  const identity = getIdentity(context.request);
  if (!identity) {
    return Response.json(
      { error: 'Authenticated Cloudflare Access identity required.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const visibleRecords = identity.role === 'owner'
    ? RECORDS
    : RECORDS.filter(record => record.ownerEmail === identity.email);

  return Response.json(
    { records: visibleRecords, source: 'protected-demo' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
