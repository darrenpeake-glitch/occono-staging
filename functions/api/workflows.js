const OWNER_EMAILS = new Set(['darren@occono.co.uk']);

const FALLBACK_RECORDS = [
  { id:'ENQ-2026-0001', workflow:'enquiries', title:'Occono Test Business', contact:'Test Contact', status:'New', ownerId:'email:darren@occono.co.uk', ownerEmail:'darren@occono.co.uk', ownerName:'Darren', nextAction:'Review test record', due:'2026-07-27T09:00:00+01:00', summary:'Build a small service website.' },
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

function normaliseDate(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (uk) {
    const [, day, month, year, hour = '00', minute = '00'] = uk;
    return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${hour.padStart(2,'0')}:${minute}:00+01:00`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function normaliseRecord(record) {
  const ownerEmail = String(record.ownerEmail || '').trim().toLowerCase();
  return {
    ...record,
    workflow: record.workflow || 'enquiries',
    ownerEmail,
    ownerId: record.ownerId || (ownerEmail ? `email:${ownerEmail}` : ''),
    due: normaliseDate(record.due),
  };
}

async function callTestApi(env, payload) {
  if (!env.KANBAN_API_URL || !env.KANBAN_API_TOKEN) {
    throw new Error('TEST API is not configured.');
  }
  const response = await fetch(env.KANBAN_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, token: env.KANBAN_API_TOKEN }),
  });
  if (!response.ok) throw new Error(`TEST API returned HTTP ${response.status}.`);
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || 'TEST API request failed.');
  return result;
}

async function fetchTestRecords(env) {
  const payload = await callTestApi(env, { action: 'listWorkflows' });
  if (!Array.isArray(payload.records)) throw new Error('TEST API returned an invalid record list.');
  return { records: payload.records.map(normaliseRecord), source: payload.source || 'test-workbook' };
}

export async function onRequestGet(context) {
  const identity = getIdentity(context.request);
  if (!identity) return Response.json({ error: 'Authenticated Cloudflare Access identity required.' }, { status: 401 });

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

export async function onRequestPatch(context) {
  const identity = getIdentity(context.request);
  if (!identity) return Response.json({ error: 'Authenticated Cloudflare Access identity required.' }, { status: 401 });
  if (identity.role !== 'owner') return Response.json({ error: 'Owner permission required.' }, { status: 403 });

  try {
    const body = await context.request.json();
    const id = String(body.id || '').trim();
    const workflow = String(body.workflow || '').trim();
    const status = String(body.status || '').trim();
    if (!id || !workflow || !status) return Response.json({ error: 'id, workflow and status are required.' }, { status: 400 });

    const result = await callTestApi(context.env, {
      action: 'updateStatus', id, workflow, status, actorEmail: identity.email,
    });
    return Response.json({ ok: true, record: normaliseRecord(result.record), source: result.source }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('TEST workflow update failure', error);
    return Response.json({ error: error.message || 'Status update failed.' }, { status: 502 });
  }
}
