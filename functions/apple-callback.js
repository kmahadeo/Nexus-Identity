/**
 * Cloudflare Pages Function — Apple Sign In callback handler.
 *
 * Apple sends a POST to this endpoint with id_token in the body.
 * We extract it and redirect to the app with the token in the URL fragment.
 *
 * Route: /apple-callback (Cloudflare Pages auto-routes from functions/ directory)
 */

export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const idToken = formData.get('id_token');
    const state = formData.get('state');
    const code = formData.get('code');
    // Apple sends user info as JSON string on first authorization only
    const user = formData.get('user');

    if (!idToken && !code) {
      return new Response('Missing id_token or code', { status: 400 });
    }

    // Redirect back to the app with the token in the fragment
    // The app's existing fragment parser in App.tsx will handle it
    const baseUrl = new URL(context.request.url).origin;
    const fragment = new URLSearchParams();
    if (idToken) fragment.set('id_token', idToken);
    if (state) fragment.set('state', state);
    if (user) fragment.set('user', user);

    return Response.redirect(`${baseUrl}/#${fragment.toString()}`, 302);
  } catch (e) {
    return new Response('Apple callback error: ' + e.message, { status: 500 });
  }
}
