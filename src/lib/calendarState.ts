import type { ISODate } from '../store/types';

/*
 * El día elegido en el calendario: así el «+» de abajo añade en ese día, y al
 * volver al calendario se sigue donde se estaba.
 */
let selected: ISODate | null = null;

export const calendarDay = (): ISODate | null => selected;

export function setCalendarDay(day: ISODate | null) {
  selected = day;
}
