/**
 * The Japanese fonts' stylesheet is large, so index.html only loads it when the first page is Japanese or the admin.
 * This loads it later: on switching to 日本語, or on opening the admin from the site.
 */
export function loadJapaneseFonts() {
  const link = document.getElementById('fonts-ja') as HTMLLinkElement | null;
  if (link?.dataset.href && !link.getAttribute('href')) link.href = link.dataset.href;
}
