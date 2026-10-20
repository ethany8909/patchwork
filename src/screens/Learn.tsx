import { ARTICLES, RESEARCH_NOTE, type Article } from "../data/learn";
import { back, go, route } from "../router";
import { Icon } from "../components/Icon";
import { ScreenHeader } from "../components/ui";
import { phase } from "../state";
import { ToneGuide } from "../components/ToneGuide";

export function Learn() {
  const id = route.value.parts[1];
  const article = ARTICLES.find((a) => a.id === id);
  return article ? <ArticleView a={article} /> : <Index />;
}

function Index() {
  return (
    <>
      <ScreenHeader title="Learn" sub="Short, sourced, and written for people living with it." />
      {phase.value === "unlocked" && (
        <div class="tool-row">
          <button class="article-card" onClick={() => go("/weather")}>
            <Icon name="sun" />
            <span><strong>Skin weather</strong><span class="muted small">Today's conditions for your skin</span></span>
          </button>
          <button class="article-card" onClick={() => go("/products")}>
            <Icon name="bottle" />
            <span><strong>Product check</strong><span class="muted small">Scan an ingredient label</span></span>
          </button>
        </div>
      )}
      <ul class="article-list">
        {ARTICLES.map((a) => (
          <li>
            <button class={`article-card ${a.id === "urgent" ? "article-card--urgent" : ""}`} onClick={() => go(`/learn/${a.id}`)}>
              <span>
                <strong>{a.title}</strong>
                <span class="muted small">{a.summary}</span>
              </span>
              <Icon name="chevron" />
            </button>
          </li>
        ))}
      </ul>
      <p class="disclaimer">
        Patchwork is a journal, not a medical device. It doesn't diagnose or recommend treatment. Always follow
        the advice of your own clinician.
      </p>
    </>
  );
}

function ArticleView({ a }: { a: Article }) {
  return (
    <article class="article">
      {/* Before unlocking, the app shell provides its own "Back" link instead. */}
      <ScreenHeader title={a.title} onBack={phase.value === "unlocked" ? () => back("/learn") : undefined} />
      {a.body.map((block) => {
        if (typeof block === "string") {
          // One-line blocks without a period act as subheadings ("Eczema", "Psoriasis").
          return /[.:!?]$/.test(block) ? <p>{block}</p> : <h2>{block}</h2>;
        }
        if ("list" in block) return <ul>{block.list.map((x) => <li>{x}</li>)}</ul>;
        if ("figure" in block) return <ToneGuide />;
        return <p class="callout">{block.callout}</p>;
      })}
      {a.id === "why-no-ai" && <p class="muted small">{RESEARCH_NOTE}</p>}
      {a.sources.length > 0 && (
        <section class="sources">
          <h2>Sources</h2>
          <ul>
            {a.sources.map((s) => (
              <li><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
