const OWNER_EMAILS = new Set(['darren@occono.co.uk']);

function displayName(email) {
  const local = String(email || '').split('@')[0] || 'Staff member';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export async function onRequestGet(context) {
  const email = context.request.headers.get('cf-access-authenticated-user-email');

  if (!email) {
    return Response.json(
      { error: 'Authenticated Cloudflare Access identity required.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const normalisedEmail = email.trim().toLowerCase();
  const role = OWNER_EMAILS.has(normalisedEmail) ? 'owner' : 'staff';

  return Response.json(
    {
      userId: `email:${normalisedEmail}`,
      email: normalisedEmail,
      name: role === 'owner' ? 'Darren' : displayName(normalisedEmail),
      role,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
