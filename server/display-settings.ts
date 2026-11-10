import type { DB } from "./db";
import { DEFAULT_DATE_FORMAT, type DateFormat } from "../shared/date-format";
export function displaySettings(db: DB): { dateFormat: DateFormat } {
  const row = db
    .query("SELECT date_format FROM display_settings WHERE id=1")
    .get() as { date_format: DateFormat } | null;
  return { dateFormat: row?.date_format ?? DEFAULT_DATE_FORMAT };
}
