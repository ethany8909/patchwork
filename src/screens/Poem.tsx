// The weekly POEM questionnaire, one question per screen, then the score and its band.

import { useState } from "preact/hooks";
import { notify, poems, savePoem } from "../state";
import { answerLabel, describeChange, POEM_BANDS, POEM_MAX, POEM_QUESTIONS, poemBand, poemScore, poemTrend } from "../lib/poem";
import { today } from "../lib/date";
import { back, go } from "../router";
import { Icon } from "../components/Icon";
import { Sheet, useStepStart } from "../components/ui";

export function Poem() {
  const [answers, setAnswers] = useState<(number | null)[]>(() => POEM_QUESTIONS.map(() => null));
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<{ score: number; change: number | null } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const q = POEM_QUESTIONS[step];
  const last = step === POEM_QUESTIONS.length - 1;
  const started = answers.some((a) => a !== null);
  useStepStart(result ? -1 : step);

  const answer = (v: number) => {
    const next = answers.map((a, i) => (i === step ? v : a));
    setAnswers(next);
    if (!last) setTimeout(() => setStep((s) => Math.min(s + 1, POEM_QUESTIONS.length - 1)), 180);
  };

  const finish = async () => {
    if (answers.some((a) => a === null)) return;
    const before = poemTrend(poems.value, today()).latest;
    const rec = await savePoem(answers as number[]);
    const score = poemScore(rec.answers);
    setResult({ score, change: before && before.record.id !== rec.id ? score - before.score : null });
    notify("Weekly score saved.");
  };

  if (result) return <Result score={result.score} change={result.change} />;

  return (
    <div class="flow">
      <header class="flow__head">
        <button class="icon-btn" aria-label="Close questionnaire" onClick={() => (started ? setConfirmClose(true) : back())}><Icon name="close" /></button>
        <div class="flow__title">
          <p class="muted small">Weekly eczema score (POEM)</p>
          <h1 tabIndex={-1} data-autofocus>Question {step + 1} of {POEM_QUESTIONS.length}</h1>
        </div>
        <span class="flow__count" aria-hidden="true">{step + 1}/{POEM_QUESTIONS.length}</span>
      </header>
      <div class="flow__bar" aria-hidden="true"><span style={{ width: `${((step + 1) / POEM_QUESTIONS.length) * 100}%` }} /></div>

      <div class="flow__body">
        <h2 class="poem-q">Over the last week, {q.text}</h2>
        <div class="radio-cards radio-cards--stack" role="radiogroup" aria-label={`Over the last week, ${q.text}`}>
          {[0, 1, 2, 3, 4].map((v) => (
            <button type="button" role="radio" aria-checked={answers[step] === v} onClick={() => answer(v)}>
              {answerLabel(v, q.unit)}
            </button>
          ))}
        </div>
        {step === 0 && (
          <p class="muted small">
            These seven questions are the same ones dermatologists use in research. None of them asks about redness,
            so your score means the same thing on every skin tone.
          </p>
        )}
      </div>

      <footer class="flow__foot">
        {step > 0 ? (
          <button class="btn btn--ghost" onClick={() => setStep(step - 1)}><Icon name="back" size={18} /> Back</button>
        ) : <span />}
        {last ? (
          <button class="btn btn--primary" disabled={answers.some((a) => a === null)} onClick={finish}>
            <Icon name="check" size={18} /> See my score
          </button>
        ) : (
          <button class="btn btn--primary" disabled={answers[step] === null} onClick={() => setStep(step + 1)}>
            Next <Icon name="chevron" size={18} />
          </button>
        )}
      </footer>

      <Sheet open={confirmClose} onClose={() => setConfirmClose(false)} title="Leave without saving?">
        <p>Your answers won't be saved.</p>
        <div class="btn-row">
          <button class="btn btn--secondary" onClick={() => setConfirmClose(false)}>Keep going</button>
          <button class="btn btn--danger" onClick={() => { setConfirmClose(false); back(); }}>Discard</button>
        </div>
      </Sheet>
    </div>
  );
}

function Result({ score, change }: { score: number; change: number | null }) {
  const band = poemBand(score);
  return (
    <div class="flow">
      <div class="flow__body poem-result">
        <p class="eyebrow">This week's POEM score</p>
        <p class="poem-score"><span>{score}</span><small> / {POEM_MAX}</small></p>
        <h1 tabIndex={-1} data-autofocus>{band.label}</h1>
        {change !== null && <p class="big">{describeChange(change)}</p>}
        <BandScale score={score} />
        <p class="muted small">
          Higher scores mean more days with symptoms. Changes of about 3 points or less are within normal week-to-week
          variation. Your score goes on your visit report, so your dermatologist can see the trend.
        </p>
        <button class="btn btn--primary btn--block" onClick={() => go("/today", { replace: true })}>Done</button>
        <button class="link-btn center" onClick={() => go("/learn/poem")}>What does this score mean?</button>
      </div>
    </div>
  );
}

/** The five severity bands with the score marked; each band is labeled in text. */
export function BandScale({ score }: { score: number }) {
  return (
    <ol class="band-scale" aria-label="POEM severity bands">
      {POEM_BANDS.map((b) => {
        const here = score >= b.min && score <= b.max;
        return (
          <li class={here ? "on" : ""} aria-current={here ? "true" : undefined}>
            <span class="band-scale__range">{b.min}–{b.max}</span>
            <span class="band-scale__label">{b.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
