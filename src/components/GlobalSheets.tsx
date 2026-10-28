import { BirthdaySheet } from '../sheets/BirthdaySheet';
import { EntrySheet } from '../sheets/EntrySheet';
import { GoogleEventSheet } from '../sheets/GoogleEventSheet';
import { ImportSheet } from '../sheets/ImportSheet';
import { QuickAddSheet } from '../sheets/QuickAdd';
import { closeSheet, useCurrentSheet } from './sheets';

export function GlobalSheets() {
  const req = useCurrentSheet();
  if (!req) return null;
  switch (req.type) {
    case 'quick':
      return <QuickAddSheet date={req.date} time={req.time} categoryId={req.categoryId} kind={req.kind} text={req.text} onClose={closeSheet} />;
    case 'entry':
      return <EntrySheet key={`${req.id}:${req.date ?? ''}`} id={req.id} date={req.date} onClose={closeSheet} />;
    case 'birthday':
      return <BirthdaySheet key={req.id ?? 'new'} id={req.id} onClose={closeSheet} />;
    case 'google':
      return <GoogleEventSheet event={req.event} onClose={closeSheet} />;
    case 'import':
      return <ImportSheet text={req.text} onClose={closeSheet} />;
  }
}
