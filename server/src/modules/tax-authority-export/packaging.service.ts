import * as iconv from 'iconv-lite';
import AdmZip from 'adm-zip';

/** Section 2.2 of horaot_131.pdf: the exact directory-naming
 * convention every registered software must follow when writing
 * these files to a drive —
 *   OPENFRMT/{first 8 chars of the VAT id, check digit excluded}.{2-digit production year}/{MMDDhhmm}/
 * A desktop-software concept translated for a web product: rather
 * than writing to a local drive path, this returns the same folder
 * structure as entries inside one downloadable zip, which is the
 * closest practical equivalent — the person downloading it can point
 * the Tax Authority's own simulator at the extracted folder exactly
 * as if a desktop program had written it there directly. */
export function buildOutputDirectoryName(vatId: string, productionDate: Date): string {
  const first8OfVatId = vatId.replace(/\D/g, '').slice(0, 8).padEnd(8, '0');
  const twoDigitYear = String(productionDate.getFullYear()).slice(-2);
  return `${first8OfVatId}.${twoDigitYear}`;
}

export function buildOutputSubfolderName(productionDate: Date): string {
  const mm = String(productionDate.getMonth() + 1).padStart(2, '0');
  const dd = String(productionDate.getDate()).padStart(2, '0');
  const hh = String(productionDate.getHours()).padStart(2, '0');
  const min = String(productionDate.getMinutes()).padStart(2, '0');
  return `${mm}${dd}${hh}${min}`;
}

/** The Tax Authority's own file-review simulator (misim.gov.il /
 * secapp.taxes.gov.il — see gov.il/he/service/file-review-simulator)
 * rejects anything but a bare BKMVDATA.TXT — its own upload page says
 * so explicitly in red text ("יש לבחור קבצים עם סיומות txt בלבד") and
 * caps it at 4MB. An earlier version of this module compressed
 * BKMVDATA into a nested zip archive based on one reading of section
 * 2.2.ד's "compress to an archive named BKMVDATA" wording — corrected
 * after actually seeing the simulator's real upload form, which is
 * more authoritative for what the file needs to look like in
 * practice than a possibly-ambiguous instruction read in isolation. */
export const BKMVDATA_MAX_BYTES = 4 * 1024 * 1024;

export interface PackagedExport {
  /** One downloadable zip for convenience — OPENFRMT/{vatid}.{yy}/
   * {MMDDhhmm}/ containing two PLAIN .txt files (TXT.INI and
   * BKMVDATA.TXT, both ISO-8859-8), ready to extract and upload
   * directly to the simulator's two file-picker fields. */
  outerZipBuffer: Buffer;
  outputPath: string; // for display/logging — the OPENFRMT/... path this export corresponds to
  bkmvdataSizeBytes: number;
  exceedsSimulatorLimit: boolean;
}

/**
 * Encodes both files as ISO-8859-8 (logical Hebrew, spec section
 * 2.4.ח for Windows-produced files, and confirmed directly by the
 * simulator's own upload page defaulting its charset picker to
 * "Windows (ANSI) ISO-8859-8-I" — the encoding EVERY field-width
 * calculation in this whole module implicitly assumes, since
 * ISO-8859-8 is single-byte-per-character: encoding as UTF-8 instead
 * would silently double the byte-width of every Hebrew character and
 * break the fixed-width alignment the Tax Authority's own reader
 * depends on), and wraps both plain-text files in the exact
 * OPENFRMT/{vatid}.{yy}/{MMDDhhmm}/ directory structure as one outer
 * downloadable zip (a convenience for a single-file download from
 * the browser — Victor extracts it once, then uploads the two plain
 * .txt files inside directly to the simulator).
 */
export function packageExport(iniContent: string, bkmvdataContent: string, vatId: string, productionDate: Date): PackagedExport {
  const iniBuffer = iconv.encode(iniContent, 'iso-8859-8');
  const bkmvdataBuffer = iconv.encode(bkmvdataContent, 'iso-8859-8');

  const dirName = buildOutputDirectoryName(vatId, productionDate);
  const subfolderName = buildOutputSubfolderName(productionDate);
  const outputPath = `OPENFRMT/${dirName}/${subfolderName}`;

  const outerZip = new AdmZip();
  outerZip.addFile(`${outputPath}/TXT.INI`, iniBuffer);
  outerZip.addFile(`${outputPath}/BKMVDATA.TXT`, bkmvdataBuffer);

  return {
    outerZipBuffer: outerZip.toBuffer(),
    outputPath,
    bkmvdataSizeBytes: bkmvdataBuffer.length,
    exceedsSimulatorLimit: bkmvdataBuffer.length > BKMVDATA_MAX_BYTES,
  };
}
