import { BirthdaySheet } from '../sheets/BirthdaySheet';
import { EntrySheet } from '../sheets/EntrySheet';
import { GoogleEventSheet } from '../sheets/GoogleEventSheet';
import { PlanItemSheet } from '../sheets/PlanItemSheet';
import { QuickAddSheet } from '../sheets/QuickAdd';
import { MovementSheet } from '../sheets/MovementSheet';
import { useApp } from '../store/store';
import { closeSheet, useCurrentSheet, type SheetRequest } from './sheets';

export function GlobalSheets() {
  const req = useCurrentSheet();
  if (!req) return null;
  switch (req.type) {
    case 'quick':
      return <QuickAddSheet date={req.date} time={req.time} areaId={req.areaId} kind={req.kind} text={req.text} onClose={closeSheet} />;
    case 'entry':
      return <EntrySheet key={`${req.id}:${req.date ?? ''}`} id={req.id} date={req.date} onClose={closeSheet} />;
    case 'birthday':
      return <BirthdaySheet key={req.id ?? 'new'} id={req.id} onClose={closeSheet} />;
    case 'plan':
      return <PlanItemSheet key={req.id} id={req.id} onClose={closeSheet} />;
    case 'google':
      return <GoogleEventSheet event={req.event} onClose={closeSheet} />;
    case 'movement':
      return <MovementFromStore key={req.id ?? 'new'} req={req} />;
  }
}

/** Un gasto o ingreso (nuevo, o uno ya apuntado si llega su id). */
function MovementFromStore({ req }: { req: Extract<SheetRequest, { type: 'movement' }> }) {
  const state = useApp();
  const movement = req.id ? state.finance.movements.find((m) => m.id === req.id && !m.deleted) : undefined;
  if (req.id && !movement) return null;
  return <MovementSheet scope={movement?.scope ?? req.scope ?? 'personal'} kind={req.kind} movement={movement} onClose={closeSheet} />;
}
