import * as pdfjsLib from 'pdfjs-dist/build/pdf.min.mjs';
import workerSrc from './gen/pdfworker.txt';

let ready = false;
export async function load(buf) {
  if (!ready) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' }));
    ready = true;
  }
  return pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true }).promise;
}
