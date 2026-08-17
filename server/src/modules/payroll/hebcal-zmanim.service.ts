import { Injectable } from '@nestjs/common';
import { ISRAELI_CITIES } from './data/israeli-cities';

/**
 * Wraps @hebcal/core for precise, per-location Shabbat start/end
 * times — computed entirely LOCALLY (no external HTTP calls at
 * runtime, no dependency on hebcal.com's own API availability), since
 * this feeds directly into real wage calculations and shouldn't be
 * able to fail because a third-party service is slow or down. The
 * library implements the same NOAA solar-position algorithm hebcal.com
 * itself uses, plus real per-city candle-lighting customs (e.g.
 * Jerusalem's own 40-minutes-before-sunset custom vs. the common
 * 18-minute default elsewhere) — confirmed directly before relying on
 * it: Jerusalem candle-lighting for 2026-08-14 computed at 18:43
 * Israel time vs. Tel Aviv's 19:06 for the identical date, a genuine
 * 23-minute difference matching the documented custom, not just a
 * generic sunset-minus-N-minutes formula applied uniformly.
 *
 * @hebcal/core ships ESM-only (no CommonJS "exports" entry at all —
 * confirmed directly: a plain top-level `import` crashed the server
 * at STARTUP, not build time, with ERR_PACKAGE_PATH_NOT_EXPORTED,
 * since `npm run build`'s own type-checking has no way to catch a
 * runtime module-resolution mismatch like this). This server compiles
 * to CommonJS, so the module is loaded via a dynamic `import()`
 * instead of a static import — Node's standard, documented interop
 * path for a CJS module consuming an ESM-only package — cached after
 * the first call rather than re-importing on every request.
 */
@Injectable()
export class HebcalZmanimService {
  private modulePromise: Promise<typeof import('@hebcal/core')> | null = null;

  private loadModule(): Promise<typeof import('@hebcal/core')> {
    if (!this.modulePromise) {
      // Plain `import('@hebcal/core')` looks like real dynamic ESM
      // interop, but tsconfig.json's "module": "commonjs" makes the
      // TypeScript compiler statically rewrite it into a plain
      // `require(...)` call in the compiled output — confirmed
      // directly by catching the actual runtime error (a version of
      // this method without the `eval` wrapper below still threw
      // ERR_PACKAGE_PATH_NOT_EXPORTED, with `at require` right there
      // in the stack trace) — completely defeating the point, since
      // @hebcal/core has no CommonJS "exports" entry at all. Wrapping
      // in `eval(...)` hides the import specifier from TypeScript's
      // own static rewriting, so Node's REAL dynamic import actually
      // runs instead — a known, documented workaround for exactly
      // this TS/Node interop gap (microsoft/TypeScript#43329), not an
      // unusual trick invented for this file specifically.
      this.modulePromise = eval("import('@hebcal/core')") as Promise<typeof import('@hebcal/core')>;
    }
    return this.modulePromise;
  }

  /** Matches (lat, lon) back to our own curated city list's English
   * name, if it corresponds to one of the ~140 cities on it — used
   * only to unlock hebcal's own special-custom candle-lighting minutes
   * for the handful of cities that have one (see the caller's own
   * comment). An exact-equality match is deliberately used, not a
   * nearest-neighbor search: coordinates reaching this method always
   * come from EmployeeSalarySettings.cityLat/cityLon, which for the
   * normal path are copied verbatim from this exact list by the
   * Salary Settings page's own city picker — a real floating-point
   * mismatch here would mean something else went wrong upstream, not
   * a case to paper over with fuzzy matching. Returns undefined for
   * any location not on our list (including admin-entered custom
   * coordinates for a smaller settlement) — correctly falling through
   * to hebcal's generic 18-minute default, which is the right behavior
   * for a location we don't have specific knowledge about. */
  private findEnglishCityName(lat: number, lon: number): string | undefined {
    return ISRAELI_CITIES.find((c) => c.lat === lat && c.lon === lon)?.nameEn;
  }

  /** Returns the exact candle-lighting (Friday) and havdalah
   * (Saturday, tzeit hakochavim / nightfall — the most widely
   * applicable default per hebcal's own documentation) times, in
   * UTC, for the Shabbat that contains or follows `anchorDate`.
   * Returns null if the library can't produce a result for some
   * reason (should be rare — only truly extreme latitudes are
   * expected to fail, and Israel's own latitude range is nowhere
   * close to that boundary), letting the caller fall back to the
   * organization's own fixed-hour window rather than crashing a
   * payroll calculation over a geometry library edge case. */
  async getShabbatWindow(anchorDate: Date, lat: number, lon: number): Promise<{ candleLighting: Date; havdalah: Date } | null> {
    try {
      const { HebrewCalendar, Location } = await this.loadModule();
      const cityNameEn = this.findEnglishCityName(lat, lon);
      // `cityName` (5th positional param) matters beyond display: a
      // handful of Israeli cities have their own real candle-lighting
      // custom that differs from the generic 18-minutes-before-sunset
      // default (Jerusalem 40min; Haifa and Zikhron Ya'akov 30min —
      // see hebcal's own calendar.js source, which keys this off an
      // EXACT city-name STRING match, not coordinates at all) — caught
      // via a real ~20-minute discrepancy during testing when this was
      // left undefined, computing Jerusalem's candle-lighting as if it
      // were an unnamed/Diaspora location. Reverse-looked-up from our
      // own ISRAELI_CITIES list by matching coordinates, rather than
      // adding a separate database column to store it redundantly
      // alongside cityLat/cityLon (which would need to be kept in sync
      // if a city's coordinates were ever corrected).
      const location = new Location(lat, lon, true, 'Asia/Jerusalem', cityNameEn, 'IL');
      const start = new Date(anchorDate.getTime() - 3 * 24 * 3600 * 1000);
      const end = new Date(anchorDate.getTime() + 4 * 24 * 3600 * 1000);
      const events = HebrewCalendar.calendar({
        start, end, location,
        candlelighting: true,
        noHolidays: true,
        noRoshChodesh: true,
        noSpecialShabbat: true,
      });

      let candleLighting: Date | null = null;
      let havdalah: Date | null = null;
      for (const ev of events) {
        const desc = ev.getDesc();
        const t = (ev as any).eventTime as Date | undefined;
        if (!t) continue;
        if (desc.startsWith('Candle lighting') && !candleLighting) candleLighting = t;
        if (desc.startsWith('Havdalah') && !havdalah) havdalah = t;
      }
      if (!candleLighting || !havdalah) return null;
      return { candleLighting, havdalah };
    } catch {
      return null;
    }
  }
}
