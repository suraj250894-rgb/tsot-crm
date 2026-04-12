// Browser-only — do not import in server components or API routes

let _pdfjs = null;

async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  _pdfjs = await import('pdfjs-dist');
  _pdfjs.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${_pdfjs.version}/build/pdf.worker.min.mjs`;
  return _pdfjs;
}

/**
 * Extracts courier data from every page of a label PDF.
 * Renders each page to a JPEG via canvas and sends to /api/parse-labels.
 *
 * @param {File} labelFile - The full label PDF (may contain multiple pages/labels)
 * @returns {Promise<Array<{invoice_no, courier_barcode, tracking_number, courier_name}>>}
 */
export async function extractLabelData(labelFile) {
  const pdfjsLib = await loadPdfjs();

  const arrayBuffer = await labelFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const results = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

      // Convert to base64 JPEG (0.85 quality — sharp enough for barcode reading)
      const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

      const res = await fetch('/api/parse-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.invoice_no) {
          results.push(data);
        }
      } else {
        console.warn(`parse-labels page ${i}: HTTP ${res.status}`);
      }
    } catch (err) {
      console.error(`extractLabelData page ${i} failed:`, err);
    }
  }

  return results;
}
