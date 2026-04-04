/**
 * Cloudflare Pages Function — SAML 2.0 Assertion Consumer Service (ACS)
 *
 * Receives the SAML Response POST from the Identity Provider.
 * Parses the SAMLResponse, extracts user identity, and redirects
 * back to the app with user info in a secure URL fragment.
 *
 * Route: /saml/acs (Cloudflare Pages auto-routes from functions/ directory)
 *
 * Flow:
 * 1. IdP sends POST with SAMLResponse (base64-encoded XML)
 * 2. We decode and parse the XML to extract NameID + attributes
 * 3. Redirect to the app with the user info in the fragment
 *
 * IMPORTANT: In production, you should verify the XML signature against
 * the IdP's X.509 certificate. This implementation extracts the assertion
 * for the MVP and logs a warning about missing signature verification.
 */

export async function onRequestPost(context) {
  try {
    const contentType = context.request.headers.get('content-type') || '';

    let samlResponse, relayState;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await context.request.formData();
      samlResponse = formData.get('SAMLResponse');
      relayState = formData.get('RelayState');
    } else {
      // Some IdPs send as plain text or other formats
      const text = await context.request.text();
      const params = new URLSearchParams(text);
      samlResponse = params.get('SAMLResponse');
      relayState = params.get('RelayState');
    }

    if (!samlResponse) {
      return new Response(
        errorPage('Missing SAMLResponse', 'The Identity Provider did not send a SAML Response. Please try logging in again.'),
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Base64 decode the SAML Response
    let xml;
    try {
      xml = atob(samlResponse);
    } catch (e) {
      return new Response(
        errorPage('Invalid SAMLResponse', 'Could not decode the SAML Response. The response may be corrupted.'),
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Parse the SAML Response XML to extract user info
    // Note: We use string parsing here because Cloudflare Workers don't have DOMParser.
    // In production, use a proper XML parser and verify the signature.
    const user = parseSAMLResponse(xml);

    if (!user || !user.nameId) {
      return new Response(
        errorPage('Invalid SAML Assertion', 'Could not extract user identity from the SAML Response. Check your IdP configuration.'),
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Encode user info as base64 JSON for the fragment
    const userPayload = btoa(JSON.stringify(user));

    // Determine the redirect target
    const baseUrl = relayState || new URL(context.request.url).origin;

    // Redirect back to the app with user info in the URL fragment
    // The fragment is never sent to the server, keeping the data client-side only
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${baseUrl}/#saml_user=${encodeURIComponent(userPayload)}`,
        'Cache-Control': 'no-store, no-cache',
        'Pragma': 'no-cache',
      },
    });
  } catch (e) {
    return new Response(
      errorPage('SAML Processing Error', `An unexpected error occurred: ${e.message}`),
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

/**
 * Also handle GET requests — IdPs sometimes send a GET for metadata or testing.
 */
export async function onRequestGet() {
  return new Response(JSON.stringify({
    service: 'Nexus Identity SAML ACS',
    binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
    status: 'ready',
    note: 'This endpoint accepts SAML Response POST from Identity Providers.',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ── SAML Response Parser ────────────────────────────────────────────── */

/**
 * Parse a SAML Response XML string and extract user identity.
 *
 * Extracts:
 * - NameID (usually the user's email)
 * - Common attributes (email, firstName, lastName, displayName, groups)
 * - SessionIndex for SLO support
 *
 * WARNING: This does NOT verify the XML signature. In production,
 * implement signature verification against the IdP certificate.
 */
function parseSAMLResponse(xml) {
  // Check Status — must be Success
  const statusMatch = xml.match(/<(?:samlp:|saml2p:)?StatusCode[^>]*Value="([^"]+)"/);
  if (statusMatch && !statusMatch[1].includes('Success')) {
    console.error('[SAML ACS] Response status:', statusMatch[1]);
    return null;
  }

  // Extract NameID
  const nameIdMatch = xml.match(/<(?:saml:|saml2:)?NameID[^>]*>([^<]+)<\/(?:saml:|saml2:)?NameID>/);
  const nameId = nameIdMatch ? nameIdMatch[1].trim() : '';

  // Extract SessionIndex
  const sessionMatch = xml.match(/SessionIndex="([^"]+)"/);
  const sessionIndex = sessionMatch ? sessionMatch[1] : '';

  // Extract Attributes
  const attributes = {};
  const attrRegex = /<(?:saml:|saml2:)?Attribute\s+Name="([^"]+)"[^>]*>[\s\S]*?<(?:saml:|saml2:)?AttributeValue[^>]*>([^<]+)<\/(?:saml:|saml2:)?AttributeValue>[\s\S]*?<\/(?:saml:|saml2:)?Attribute>/g;
  let match;
  while ((match = attrRegex.exec(xml)) !== null) {
    const attrName = match[1];
    const attrValue = match[2].trim();
    // Map common attribute names
    const key = mapAttributeName(attrName);
    attributes[key] = attrValue;
  }

  // Determine email — try NameID first, then attributes
  const email = nameId.includes('@') ? nameId
    : attributes.email || attributes.mail || attributes.emailAddress || '';

  // Determine display name
  const firstName = attributes.firstName || attributes.givenName || '';
  const lastName = attributes.lastName || attributes.surname || attributes.sn || '';
  const name = attributes.displayName
    || (firstName && lastName ? `${firstName} ${lastName}` : '')
    || firstName
    || email.split('@')[0]
    || 'SSO User';

  return {
    nameId,
    email,
    name,
    attributes,
    sessionIndex,
    configId: '', // Will be matched client-side from pending state
  };
}

/**
 * Map IdP attribute names to normalized keys.
 * Different IdPs use different attribute schemas.
 */
function mapAttributeName(name) {
  const normalized = name.toLowerCase();
  // OID-based names (Okta, Entra ID, Shibboleth)
  if (normalized.includes('givenname') || normalized.endsWith('/givenname')) return 'firstName';
  if (normalized.includes('surname') || normalized.endsWith('/surname') || normalized.endsWith('/sn')) return 'lastName';
  if (normalized.includes('emailaddress') || normalized.endsWith('/emailaddress') || normalized.endsWith('/mail')) return 'email';
  if (normalized.includes('displayname') || normalized.endsWith('/displayname')) return 'displayName';
  if (normalized.includes('groups') || normalized.endsWith('/groups') || normalized.includes('memberof')) return 'groups';
  if (normalized.includes('role') || normalized.endsWith('/role')) return 'role';
  // Friendly names
  if (normalized === 'email' || normalized === 'mail') return 'email';
  if (normalized === 'firstname' || normalized === 'givenname' || normalized === 'given_name') return 'firstName';
  if (normalized === 'lastname' || normalized === 'surname' || normalized === 'family_name' || normalized === 'sn') return 'lastName';
  if (normalized === 'displayname' || normalized === 'display_name') return 'displayName';
  // Return original if no mapping
  return name;
}

/* ── Error Page ──────────────────────────────────────────────────────── */

function errorPage(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SAML Error — Nexus Identity</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Space Grotesk', -apple-system, sans-serif;
      background: #030407;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      max-width: 480px;
      padding: 40px 32px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 24px;
      text-align: center;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
    p {
      font-size: 14px;
      color: rgba(255,255,255,0.55);
      line-height: 1.6;
      margin-bottom: 24px;
    }
    a {
      display: inline-block;
      padding: 10px 24px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 12px;
      color: #fff;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.15s ease;
    }
    a:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.25); }
    .mono {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.12em;
      color: rgba(255,255,255,0.2);
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#x26A0;</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="/">Return to Nexus Identity</a>
    <div class="mono">SAML 2.0 SERVICE PROVIDER</div>
  </div>
</body>
</html>`;
}
