const STYLE_ID = 'dynamic-print-page'

/**
 * Sets @page size/orientation for the next print job. Browsers only reliably
 * apply one @page rule — we inject this so matrix can use landscape.
 * @param {'matrix'|'sideboard'|null} mode
 */
export function setPrintPageLayout(mode) {
  let el = document.getElementById(STYLE_ID)
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  if (mode === 'matrix') {
    el.textContent = '@media print { @page { size: landscape; margin: 0.25in; } }'
  } else if (mode === 'sideboard') {
    el.textContent = '@media print { @page { size: portrait; margin: 0.35in; } }'
  } else {
    el.textContent = ''
  }
}
