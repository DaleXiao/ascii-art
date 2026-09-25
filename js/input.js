// input.js — Input trio: drag & drop / file picker / clipboard paste (F-5)
// Pure event wiring, no business logic; files are handed to app.js via the onFile callback

/**
 * @param {{zone:HTMLElement, input:HTMLInputElement}} targets
 * @param {(file:File)=>void} onFile callback for valid image files
 * @param {(errKey:string)=>void} onError callback for error copy keys (i18n)
 */
export function attachInputs({ zone, input, onFile, onError }) {
  const accept = (file) => {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      onError?.('errType');
      return;
    }
    onFile(file);
  };

  // Click / keyboard (zone has tabindex+role=button) → file picker
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    accept(input.files && input.files[0]);
    input.value = ''; // allow re-selecting the same file
  });

  // Drag & drop: zone highlight + drop loading
  for (const ev of ['dragenter', 'dragover']) {
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
  }
  for (const ev of ['dragleave', 'drop']) {
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    });
  }
  zone.addEventListener('drop', (e) => accept(e.dataTransfer?.files?.[0]));
  // Drops outside the zone: prevent the browser from opening image files directly
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  // Clipboard paste (whole-page listener, Ctrl/⌘+V)
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) {
        e.preventDefault();
        accept(it.getAsFile());
        return;
      }
    }
  });
}
