/** Prefix a site-local URL with Vite's configured deployment base. */
export function sitePath(path: string) {
  return import.meta.env.BASE_URL + path.replace(/^\//, "");
}
