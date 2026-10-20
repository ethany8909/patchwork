// Product check: photograph (or paste) an ingredient list and see which ingredients often
// bother eczema-prone skin. The photo is read on the device and never saved.

import { useMemo, useRef, useState } from "preact/hooks";
import { deleteProduct, notify, products, saveProduct } from "../state";
import { checkLabel, type GroupResult } from "../lib/ingredients";
import { readLabel, type OcrProgress } from "../lib/ocr";
import { formatDate, today, toISODate, uid } from "../lib/date";
import { AAD_PRODUCTS, DERMNET_PARABENS, type Source } from "../data/sources";
import type { Product } from "../lib/types";
import { back, go, route } from "../router";
import { Icon } from "../components/Icon";
import { Card, Empty, ScreenHeader, Sheet } from "../components/ui";

export function Products() {
  const sub = route.value.parts[1];
  if (sub === "new") return <CheckLabel />;
  const product = products.value.find((p) => p.id === sub);
  if (sub && product) return <ProductDetail product={product} />;
  return <ProductList />;
}

const flaggedCount = (text: string) => checkLabel(text).results.length;

function ProductList() {
  const list = products.value;
  return (
    <>
      <ScreenHeader title="Product check" onBack={() => back("/today")} action={
        <button class="btn btn--primary" onClick={() => go("/products/new")}><Icon name="camera" size={18} /> Check a label</button>
      } />
      <button class="tip tip--link" onClick={() => go("/learn/labels")}>
        <Icon name="info" />
        <p>Spot ingredients that often bother eczema-prone skin before you buy or try a product. <strong>Reading labels</strong></p>
        <Icon name="chevron" size={18} />
      </button>
      {list.length === 0 ? (
        <Empty icon="bottle" title="No products checked yet">
          <p class="muted">Photograph the ingredient list on a lotion, soap, shampoo or sunscreen. The photo is read on your phone and never uploaded or saved.</p>
          <button class="btn btn--primary" onClick={() => go("/products/new")}>Check your first label</button>
        </Empty>
      ) : (
        <Card title="Your products" icon="bottle">
          <ul class="entry-list">
            {list.map((p) => {
              const n = flaggedCount(p.text);
              return (
                <li>
                  <button class="entry-row" onClick={() => go(`/products/${p.id}`)}>
                    <span class="entry-row__body">
                      <strong>{p.name}</strong>
                      <span class="muted small">Checked {formatDate(toISODate(new Date(p.createdAt)))}</span>
                    </span>
                    <span class={`badge ${n ? "badge--possible" : "badge--strong"}`}>{n ? `${n} flagged` : "Nothing flagged"}</span>
                    <Icon name="chevron" size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

function CheckLabel() {
  const [text, setText] = useState<string | null>(null);
  const [reading, setReading] = useState<OcrProgress | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const pick = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = "";
    if (!f) return;
    setErr(null);
    setReading({ stage: "loading", progress: 0 });
    try {
      const t = await readLabel(f, setReading);
      if (t.replace(/\s/g, "").length < 4) {
        setErr("Couldn't find any words in that photo. Try again closer to the ingredient list, in good light, or type it in.");
      } else {
        setText(t);
      }
    } catch {
      setErr("Couldn't read that photo. Try another photo, or type the ingredients instead.");
    } finally {
      setReading(null);
    }
  };

  const save = async () => {
    if (!text?.trim()) return;
    setSaving(true);
    try {
      const p: Product = { id: uid(), name: name.trim().slice(0, 60) || "Unnamed product", text: text.trim().slice(0, 5000), createdAt: Date.now() };
      await saveProduct(p);
      notify("Saved to your products.");
      go(`/products/${p.id}`, { replace: true });
    } catch {
      notify("Couldn't save. Please try again.", "error");
      setSaving(false);
    }
  };

  return (
    <>
      <ScreenHeader title="Check a label" onBack={() => back("/products")} />
      {reading ? (
        <div class="ocr-progress" role="status">
          <p>{reading.stage === "loading" ? "Getting the label reader ready… (the first time takes longer)" : `Reading the label… ${Math.round(reading.progress * 100)}%`}</p>
          <div class="meter"><span style={{ width: `${Math.round((reading.stage === "loading" ? reading.progress * 0.3 : 0.3 + reading.progress * 0.7) * 100)}%` }} /></div>
        </div>
      ) : text === null ? (
        <>
          <div class="photo-tips" role="note">
            <p class="photo-tips__title"><Icon name="camera" size={18} /> For the best reading</p>
            <ul>
              <li>Photograph <strong>just the ingredient list</strong>, filling the frame.</li>
              <li>Hold the bottle flat to the camera, in good light, without glare.</li>
            </ul>
          </div>
          <button class="btn btn--primary btn--block" onClick={() => fileInput.current?.click()}>
            <Icon name="camera" /> Photograph the label
          </button>
          <button class="btn btn--secondary btn--block" onClick={() => setText("")}>
            <Icon name="edit" /> Type or paste the ingredients
          </button>
          <p class="field-msg field-msg--error" role="alert">{err}</p>
          <p class="muted small">
            The photo is read on this phone. It's never uploaded or saved. Tip: iPhone and Android can also copy text straight
            from a photo, which you can paste here.
          </p>
          <input ref={fileInput} type="file" accept="image/*" class="hidden" onChange={(e) => void pick(e)} />
        </>
      ) : (
        <>
          <div class="field">
            <label for="ingredients">Ingredients {text ? <span class="muted">(fix any words that were misread)</span> : null}</label>
            <textarea id="ingredients" rows={6} maxLength={5000} value={text} placeholder="Water, Glycerin, …"
              onInput={(e) => setText(e.currentTarget.value)} />
          </div>
          {text.trim() && <LabelResults text={text} />}
          {text.trim() && (
            <Card title="Save it" icon="bottle">
              <div class="field">
                <label for="pname">Product name</label>
                <input id="pname" value={name} maxLength={60} placeholder="e.g. Body wash from school" onInput={(e) => setName(e.currentTarget.value)} />
              </div>
              <button class="btn btn--primary btn--block" disabled={saving} onClick={() => void save()}>
                <Icon name="check" /> Save to my products
              </button>
              <p class="muted small">Saved products are encrypted with your journal, and flagged ingredients appear on your visit report.</p>
            </Card>
          )}
          <button class="link-btn" onClick={() => { setText(null); setErr(null); }}><Icon name="camera" size={18} /> Start over</button>
        </>
      )}
    </>
  );
}

/** Flagged ingredients, grouped, each with why it matters and where that comes from. */
export function LabelResults({ text }: { text: string }) {
  const check = useMemo(() => checkLabel(text), [text]);
  const nea = check.results.filter((r) => r.group.tier === "nea");
  const some = check.results.filter((r) => r.group.tier === "some");
  return (
    <section class="label-results" aria-live="polite">
      {check.results.length === 0 ? (
        <div class="banner banner--info">
          <Icon name="check" size={18} />
          <span>Nothing from Patchwork's list was found. That's a good sign, but no product is right for everyone's skin.</span>
        </div>
      ) : (
        <p><strong>{check.results.length} {check.results.length === 1 ? "ingredient group" : "ingredient groups"} flagged</strong></p>
      )}
      {nea.length > 0 && <h2 class="q">On the National Eczema Association's avoid list</h2>}
      {nea.map((r) => <GroupCard r={r} />)}
      {some.length > 0 && <h2 class="q">Can bother some people</h2>}
      {some.map((r) => <GroupCard r={r} />)}
      {check.notes.includes("unscented") && (
        <p class="hint">
          This says "unscented". Unscented products can still contain a fragrance that hides other smells; dermatologists
          suggest "fragrance-free" instead. <a href={AAD_PRODUCTS.url} target="_blank" rel="noopener noreferrer">Source</a>
        </p>
      )}
      {check.notes.includes("parabens") && (
        <p class="hint">
          This contains parabens. Skin allergy to them is uncommon, so Patchwork doesn't flag them.{" "}
          <a href={DERMNET_PARABENS.url} target="_blank" rel="noopener noreferrer">Source</a>
        </p>
      )}
      <p class="muted small">
        Patchwork looks for ingredients that often irritate eczema-prone skin or cause allergy. It can't promise a product
        will suit you. If you think you're reacting to something, stop using it and ask your clinician about allergy testing.
      </p>
    </section>
  );
}

function GroupCard({ r }: { r: GroupResult }) {
  return (
    <div class="ingredient-card">
      <p class="ingredient-card__name"><Icon name="alert" size={16} /> {r.group.name}</p>
      <p class="flag-row">
        {r.found.map((f) => (
          <span class="badge badge--possible" title={f.seen ? `Read as "${f.seen}"` : undefined}>
            {f.term}{f.seen ? " (close match)" : ""}
          </span>
        ))}
      </p>
      <p class="small">{r.group.why}</p>
      <p class="muted small">
        Source: {r.group.sources.map((s: Source, i: number) => (
          <>{i > 0 && "; "}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></>
        ))}
      </p>
    </div>
  );
}

function ProductDetail({ product }: { product: Product }) {
  const [confirm, setConfirm] = useState(false);
  const checked = toISODate(new Date(product.createdAt));
  return (
    <>
      <ScreenHeader title={product.name} sub={`Checked ${checked === today() ? "today" : formatDate(checked, { month: "long", day: "numeric", year: "numeric" })}`} onBack={() => back("/products")} />
      <LabelResults text={product.text} />
      <details class="explainer">
        <summary>Ingredient list</summary>
        <p>{product.text}</p>
      </details>
      <button class="link-btn link-btn--danger" onClick={() => setConfirm(true)}><Icon name="trash" size={16} /> Delete</button>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Delete this product?">
        <p>This removes {product.name} from your products and your visit report.</p>
        <div class="btn-row">
          <button class="btn btn--secondary" onClick={() => setConfirm(false)}>Cancel</button>
          <button class="btn btn--danger" onClick={async () => { await deleteProduct(product.id); notify("Product deleted."); go("/products", { replace: true }); }}>Delete</button>
        </div>
      </Sheet>
    </>
  );
}
