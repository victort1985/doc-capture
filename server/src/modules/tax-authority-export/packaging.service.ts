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

export interface PackagedExport {
  /** The complete downloadable zip — OPENFRMT/{vatid}.{yy}/{MMDDhhmm}/
   * containing TXT.INI (plain) and BKMVDATA (itself a zip containing
   * TXT.BKMVDATA, per section 2.2.ד's own "compress to an archive
   * named BKMVDATA" instruction). */
  outerZipBuffer: Buffer;
  outputPath: string; // for display/logging — the OPENFRMT/... path this export corresponds to
}

/**
 * Encodes both files as ISO-8859-8 (logical Hebrew, spec section
 * 2.4.ח for Windows-produced files — the encoding EVERY field-width
 * calculation in this whole module implicitly assumes, since
 * ISO-8859-8 is single-byte-per-character: encoding as UTF-8 instead
 * would silently double the byte-width of every Hebrew character and
 * break the fixed-width alignment the Tax Authority's own reader
 * depends on), compresses TXT.BKMVDATA into an archive literally
 * named BKMVDATA (no extension — matches the spec's own filename
 * instruction exactly), and wraps both files in the exact
 * OPENFRMT/{vatid}.{yy}/{MMDDhhmm}/ directory structure as one outer
 * downloadable zip.
 */
export function packageExport(iniContent: string, bkmvdataContent: string, vatId: string, productionDate: Date): PackagedExport {
  const iniBuffer = iconv.encode(iniContent, 'iso-8859-8');
  const bkmvdataBuffer = iconv.encode(bkmvdataContent, 'iso-8859-8');

  const innerZip = new AdmZip();
  innerZip.addFile('BKMVDATA.TXT', bkmvdataBuffer);
  const compressedBkmvdata = innerZip.toBuffer();

  const dirName = buildOutputDirectoryName(vatId, productionDate);
  const subfolderName = buildOutputSubfolderName(productionDate);
  const outputPath = `OPENFRMT/${dirName}/${subfolderName}`;

  const outerZip = new AdmZip();
  outerZip.addFile(`${outputPath}/TXT.INI`, iniBuffer);
  outerZip.addFile(`${outputPath}/BKMVDATA`, compressedBkmvdata);

  return { outerZipBuffer: outerZip.toBuffer(), outputPath };
}
