import {
  DEFAULT_DATE_FORMAT,
  formatDate,
  formatDateTime,
  type DateFormat,
} from "../../../../shared/date-format";
export const dateSettings = $state<{ format: DateFormat }>({
  format: DEFAULT_DATE_FORMAT,
});
export const formatDisplayDate = (
  value: string | Date | number,
  timezone?: string,
) => formatDate(value, dateSettings.format, timezone);
export const formatDisplayDateTime = (
  value: string | Date | number,
  timezone?: string,
) => formatDateTime(value, dateSettings.format, timezone);
