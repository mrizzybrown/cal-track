// Loaded only when you open the scanner, so the reader (about 1 MB) stays out of the main bundle.
import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

// Serve the reader from this app instead of a CDN, so it's cached for offline use.
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
  },
})

/** Food packaging barcodes: EAN-13/8 (UK and Europe) and UPC-A/E (US imports). */
export function createDetector() {
  return new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
}
