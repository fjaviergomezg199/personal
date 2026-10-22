import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Sheet, toast } from '../components/ui';
import { closeDayQuestions, closeDayReminderOn, closeDaySummary, mealFoods, nextDayWord, type CloseQuestion } from '../lib/closeDay';
import { addDays, capitalize, todayISO } from '../lib/dates';
import { macrosFor } from '../lib/foods';
import { appBaseUrl } from '../lib/google';
import { countOn } from '../lib/habits';
import { notificationPermission, requestNotificationPermission } from '../lib/notify';
import {
  addFoodLog,
  deleteFoodLog,
  getState,
  markDayClosed,
  setCloseDayReminder,
  setHabitCount,
  toggleEntryDone,
  updateEntry,
  updatePlanItem,
  updateSettings,
  useApp,
} from '../store/store';
import type { HHMM, ISODate } from '../store/types';

interface Answer {
  revert: () => void;
  done?: boolean;
  moved?: boolean;
}

const NOTHING: Answer = { revert: () => undefined };

export const closeDayLink = () => `${appBaseUrl()}#/hoy?cerrar=1`;

/** Enciende el aviso de cada noche y, si aún no se ha pedido, el permiso para avisar. */
export async function turnOnCloseReminder(time: HHMM) {
  setCloseDayReminder(true, time, closeDayLink());
  if (notificationPermission() === 'default' && (await requestNotificationPermission()) === 'granted') updateSettings({ notifications: true });
}

/** Un minuto por la noche: lo que falta del día, pregunta a pregunta, con sí o no. */
export function CloseDaySheet({ day, onClose }: { day: ISODate; onClose: () => void }) {
  // Las preguntas se fijan al abrir (lo que se contesta no las cambia por el camino).
  const [questions] = useState(() => closeDayQuestions(getState(), day, new Date()));
  const [next] = useState(() => nextDayWord(day, new Date()));
  const [answers, setAnswers] = useState<Answer[]>([]);
  const step = answers.length;
  const finished = step >= questions.length;
  const q = questions[step];

  useEffect(() => {
    if (finished) markDayClosed(day);
  }, [finished, day]);

  const reply = (a: Answer | null) => setAnswers((prev) => [...prev, a ?? NOTHING]);
  const back = () => {
    answers[answers.length - 1]?.revert();
    setAnswers(answers.slice(0, -1));
  };

  const yes = (question: CloseQuestion, option?: string): Answer | null => {
    if (question.kind === 'habit') {
      const h = question.habit;
      const before = countOn(getState().habitLog[h.id], day);
      setHabitCount(h.id, day, h.target);
      return { revert: () => setHabitCount(h.id, day, before) };
    }
    if (question.kind === 'meal') {
      const items = mealFoods(option ?? question.menuText, getState().customFoods);
      if (!items.length) return null;
      const ids = addFoodLog(items.map(({ food, grams }) => ({ date: day, meal: question.meal, name: food.name, grams: Math.round(grams), foodId: food.key, ...macrosFor(food, grams) })));
      return { revert: () => deleteFoodLog(ids) };
    }
    const i = question.item;
    if (i.kind === 'plan') {
      updatePlanItem(i.item.id, { done: true });
      return { done: true, revert: () => updatePlanItem(i.item.id, { done: false }) };
    }
    toggleEntryDone(i.entry.id, day);
    return { done: true, revert: () => toggleEntryDone(i.entry.id, day) };
  };

  const no = (question: CloseQuestion): Answer | null => {
    if (question.kind !== 'task' || !question.moveIfNo || question.item.kind !== 'entry') return null;
    const id = question.item.entry.id;
    updateEntry(id, { date: addDays(day, 1) });
    return { moved: true, revert: () => updateEntry(id, { date: day }) };
  };

  const progress = questions.length ? Math.min(step, questions.length) / questions.length : 1;

  return (
    <Sheet open onClose={onClose} title={day === todayISO() ? '🌙 Cerrar el día' : '🌙 Cerrar el día de ayer'}>
      {questions.length > 0 && (
        <div className="close-progress" role="progressbar" aria-valuenow={Math.min(step, questions.length)} aria-valuemax={questions.length}>
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      {!finished && q ? (
        <div className="close-q">
          <div className="close-count">
            {step + 1} de {questions.length}
          </div>
          <div className="close-emoji" aria-hidden>
            {q.kind === 'habit' ? q.habit.emoji : q.kind === 'meal' ? '🍽️' : '✅'}
          </div>
          <div className="close-text">{q.text}</div>
          {q.kind === 'meal' && !q.options.length && <div className="close-detail">{q.menuText}</div>}
          {q.kind === 'task' && q.moveIfNo && <div className="close-detail">Si no, lo paso a {next}.</div>}

          {q.kind === 'meal' && q.options.length > 0 ? (
            <div className="stack mt16">
              {q.options.map((o) => (
                <button key={o} className="btn secondary block close-option" onClick={() => reply(yes(q, o))}>
                  {o}
                </button>
              ))}
              <button className="btn ghost block" onClick={() => reply(null)}>
                No, otra cosa
              </button>
            </div>
          ) : (
            <div className="close-answers">
              <button className="btn secondary" onClick={() => reply(no(q))}>
                No
              </button>
              <button className="btn" onClick={() => reply(yes(q))}>
                Sí
              </button>
            </div>
          )}

          <div className="hstack mt16" style={{ justifyContent: 'space-between' }}>
            {step > 0 ? (
              <button className="link-btn" style={{ padding: 0 }} onClick={back}>
                <ChevronLeft size={16} style={{ verticalAlign: -3 }} /> Atrás
              </button>
            ) : (
              <span />
            )}
            <button className="link-btn" style={{ padding: 0 }} onClick={() => setAnswers((prev) => [...prev, ...questions.slice(prev.length).map(() => NOTHING)])}>
              Terminar ya
            </button>
          </div>
        </div>
      ) : (
        <Summary day={day} next={next} answers={answers} empty={!questions.length} onClose={onClose} />
      )}
    </Sheet>
  );
}

function Summary({ day, next, answers, empty, onClose }: { day: ISODate; next: string; answers: Answer[]; empty: boolean; onClose: () => void }) {
  const state = useApp();
  const time = state.settings.closeDay?.time ?? '22:00';
  const s = closeDaySummary(state, day, { done: answers.filter((a) => a.done).length, moved: answers.filter((a) => a.moved).length });
  const lines: string[] = [];
  if (s.habits.due) lines.push(`✅ ${s.habits.done} de ${s.habits.due} ${s.habits.due === 1 ? 'hábito' : 'hábitos'}`);
  if (s.kcal) lines.push(`🔥 ${s.kcal.eaten.toLocaleString('es-ES')}${s.kcal.target ? ` de ${s.kcal.target.toLocaleString('es-ES')}` : ''} kcal`);
  if (s.done || s.moved) lines.push(`📋 ${[s.done ? `${s.done} ${s.done === 1 ? 'hecha' : 'hechas'}` : '', s.moved ? `${s.moved} a ${next}` : ''].filter(Boolean).join(' · ')}`);
  if (s.best) lines.push(`${s.best.emoji} ${s.best.name}: ${s.best.days} días seguidos`);
  return (
    <div className="close-done">
      <div className="close-emoji" aria-hidden>
        🌙
      </div>
      <div className="close-text">{empty ? 'Todo al día' : 'Día cerrado'}</div>
      {lines.length > 0 && (
        <div className="close-lines">
          {lines.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      )}
      {s.tomorrow.length > 0 && (
        <div className="close-tomorrow">
          <div className="label">{capitalize(next)}</div>
          {s.tomorrow.map((t) => (
            <div key={t}>{t}</div>
          ))}
        </div>
      )}
      {!closeDayReminderOn(state) && (
        <button
          className="btn secondary block mt16"
          onClick={() => {
            void turnOnCloseReminder(time);
            toast(`🔔 Te aviso cada noche a las ${time}. La hora se cambia en Ajustes → Avisos.`, { duration: 5000 });
          }}
        >
          🔔 Avísame cada noche a las {time}
        </button>
      )}
      <button className="btn block mt12" onClick={onClose}>
        Buenas noches
      </button>
    </div>
  );
}
