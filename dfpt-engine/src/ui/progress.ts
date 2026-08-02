const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function showProgress(text: string): void {
  const el = $("progress");
  el.textContent = text;
  el.classList.add("show");
}

export function hideProgress(): void {
  $("progress").classList.remove("show");
}
