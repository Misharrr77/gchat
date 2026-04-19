import { parseISO, subDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

/** Все отображаемые в интерфейсе часы — калининградское время (UTC+2, без перехода на летнее) */
export const APP_TIME_ZONE = 'Europe/Kaliningrad';

export function formatKaliningradClock(iso: string): string {
  try {
    return formatInTimeZone(parseISO(iso), APP_TIME_ZONE, 'HH:mm');
  } catch {
    return '';
  }
}

/** Список чатов: сегодня (в Калининграде) — часы, вчера — текст, иначе дд.мм */
export function formatKaliningradListTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = parseISO(iso);
    const msgDay = formatInTimeZone(d, APP_TIME_ZONE, 'yyyy-MM-dd');
    const todayDay = formatInTimeZone(new Date(), APP_TIME_ZONE, 'yyyy-MM-dd');
    if (msgDay === todayDay) return formatInTimeZone(d, APP_TIME_ZONE, 'HH:mm');

    const yesterdayDay = formatInTimeZone(subDays(new Date(), 1), APP_TIME_ZONE, 'yyyy-MM-dd');
    if (msgDay === yesterdayDay) return 'вчера';

    return formatInTimeZone(d, APP_TIME_ZONE, 'dd.MM');
  } catch {
    return '';
  }
}

export function formatKaliningradDate(iso: string): string {
  try {
    return formatInTimeZone(parseISO(iso), APP_TIME_ZONE, 'dd.MM.yyyy');
  } catch {
    return '';
  }
}
