import { JWT } from "google-auth-library";
import { google } from "googleapis";

const { SITE_URL, SITEMAP_URL, GSC_SERVICE_ACCOUNT_JSON } = process.env;

if (!(SITE_URL && SITEMAP_URL && GSC_SERVICE_ACCOUNT_JSON)) {
  throw new Error("Missing required environment variables");
}

// The service account's key file as plain JSON, the same secret the
// notify-search-engines workflow and the app's Growth page read.
const keys = JSON.parse(GSC_SERVICE_ACCOUNT_JSON);

const client = new JWT({
  email: keys.client_email,
  key: keys.private_key,
  scopes: [
    "https://www.googleapis.com/auth/webmasters",
    "https://www.googleapis.com/auth/webmasters.readonly",
  ],
});

google.options({ auth: client });

const searchconsole = google.searchconsole("v1");

(async () => {
  try {
    const { status } = await searchconsole.sitemaps.submit({
      feedpath: SITEMAP_URL,
      siteUrl: SITE_URL,
    });
    console.log(`Submitted ${SITEMAP_URL} to ${SITE_URL}: HTTP ${status}`);
  } catch (e) {
    console.log(e);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
