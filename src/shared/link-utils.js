export function matchingPageTitle(linkUrl, pageUrl, pageTitle) {
  const title = String(pageTitle || "").trim();
  const link = comparablePageUrl(linkUrl);
  const page = comparablePageUrl(pageUrl);

  return title && link && link === page ? title : "";
}

function comparablePageUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}
