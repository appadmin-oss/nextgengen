/* ============================================================================
   The NGG shop — souvenirs and merchandise (owner, 17 Nov 2026: "Create a shop
   for NGG. To sell souvenirs and mercs"). The server side is domain/shop.php;
   this file is the two public pages:

     /shop                  ShopPage       the catalogue, the cart, checkout
     /shop/order/<token>    ShopOrderPage  the buyer's order, after Paystack

   The rules this page keeps, each from the server's own:
   - The server prices everything. The page shows the catalogue's unit price on
     a card, but every amount that is charged — the lines, delivery, Paystack's
     charge, the total — is the quote's (public.shop.quote), shown BEFORE Pay.
   - The buyer bears Paystack's charge, and is told so before pressing Pay.
   - Paid is Paystack's word, read by the server when the buyer comes back
     (?reference=…) — never the browser's.
   - The cart is the buyer's own convenience: it lives in this browser
     (localStorage, every access guarded) and survives a refresh. The chosen
     category is in the URL (?cat=).
   ========================================================================== */

const SHOP_CART_KEY = "ngg.shop.cart.v1";
const SHOP_PENDING_KEY = "ngg.shop.pending.v1";
/* Only for a server that predates maxLines/maxQty in its checkout terms; the
   server refuses beyond its own limits whatever this says. */
const SHOP_LIMIT_FALLBACK = 20;

function shopStoreGet(key) { try { return window.localStorage.getItem(key); } catch (_) { return null; } }
function shopStoreSet(key, v) { try { if (v == null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, v); } catch (_) {} }
/** The cart: [{ productId, option, qty }] — ids and counts only, never a price. */
function shopCartRead() {
  try {
    const a = JSON.parse(shopStoreGet(SHOP_CART_KEY) || "[]");
    return Array.isArray(a) ? a.filter(l => l && typeof l.productId === "string" && l.productId).map(l => ({ productId: l.productId, option: String(l.option || ""), qty: Math.max(1, Math.floor(Number(l.qty) || 1)) })) : [];
  } catch (_) { return []; }
}
function shopCartWrite(lines) { shopStoreSet(SHOP_CART_KEY, lines && lines.length ? JSON.stringify(lines) : null); }
function shopMoney(n) { return fmtMoney(Number(n) || 0); }
function shopToast(kind, text) { try { if (typeof toast !== "undefined" && toast[kind]) toast[kind](text, "Cart"); } catch (_) {} }
function shopLineKey(l) { return l.productId + "\u001f" + (l.option || ""); }
/** What is left of one option, or Infinity when the product has no limit. */
function shopLeft(p, option) { return p && p.left && !p.preorderUntil ? Math.max(0, Number(p.left[option || ""]) || 0) : Infinity; }
function shopCatFromUrl() { try { return new URLSearchParams(window.location.search).get("cat") || ""; } catch (_) { return ""; } }

/* What the server's refusals mean to a buyer. A refusal that carries its own
   sentence (out_of_stock: "Only 2 left of NGG T-shirt (S).") is shown as is. */
const SHOP_ERRORS = {
  shop_closed: "The shop has just closed. Nothing was charged.",
  empty_cart: "Your cart is empty.",
  no_delivery: "Delivery isn’t offered right now. Choose collection at a centre.",
  bad_fulfil: "Choose collection at a centre or delivery.",
  payments_unavailable: "Online payment isn’t set up yet, so the shop can’t take orders. Nothing was charged.",
  init_failed: "Paystack didn’t respond. Nothing was charged — try again in a moment.",
  rate_limited: "Too many tries from this connection. Wait a minute, then try again.",
  network: "Couldn’t reach the shop. Check your connection and try again.",
  timeout: "The shop took too long to answer. Try again.",
};
const SHOP_FIELD_ERRORS = {
  bad_name: ["name", "Write your full name."],
  bad_email: ["email", "That email doesn’t look right."],
  bad_phone: ["phone", "Write a phone number we can call, 7 to 16 digits."],
  bad_centre: ["centre", "Choose the centre where you will collect it."],
  bad_address: ["address", "Write the full delivery address."],
};
function shopErrText(e, fallback) {
  const det = e && (e.detail || (e.data && e.data.detail));
  if (typeof det === "string" && /\s/.test(det.trim())) return det;
  return SHOP_ERRORS[e && e.code] || fallback || "Something went wrong. Try again.";
}

/* ── /shop ─────────────────────────────────────────────────────────────── */
function ShopPage({ setPage }) {
  const [list, setList] = React.useState({ state: "loading", data: null, error: null });
  const [cat, setCat] = React.useState(shopCatFromUrl);
  const [cart, setCart] = React.useState(shopCartRead);
  const [pruned, setPruned] = React.useState(0);
  const [fulfil, setFulfil] = React.useState("collect");
  const [buyer, setBuyer] = React.useState({ name: "", email: "", phone: "", centre: "", address: "" });
  const [fe, setFe] = React.useState({});
  const [quote, setQuote] = React.useState({ state: "idle", q: null, error: "" });
  const [busy, setBusy] = React.useState(false);
  const [payErr, setPayErr] = React.useState("");
  /* A discount code: typed, then applied with a button (never on every keystroke), and priced by the quote. */
  const [codeIn, setCodeIn] = React.useState("");
  const [code, setCode] = React.useState("");
  const qSeq = React.useRef(0);

  const load = React.useCallback(() => {
    setList(s => ({ state: "loading", data: s.data, error: null }));
    NGGApi.public.shop.list().then(
      r => setList({ state: "ready", data: r, error: null }),
      e => setList(s => ({ state: "error", data: s.data, error: e })));
  }, []);
  React.useEffect(load, [load]);

  const d = list.data || {};
  const products = d.products || [];
  const terms = d.checkout || {};
  const maxLines = terms.maxLines || SHOP_LIMIT_FALLBACK;
  const maxQty = terms.maxQty || SHOP_LIMIT_FALLBACK;
  const byId = React.useMemo(() => { const m = {}; products.forEach(p => { m[p.productId] = p; }); return m; }, [products]);

  /* A product taken off sale since the cart was filled leaves the cart, and
     the buyer is told — never a silent disappearance. */
  React.useEffect(() => {
    if (list.state !== "ready" || !d.open) return;
    const keep = cart.filter(l => byId[l.productId] && (byId[l.productId].options.length ? byId[l.productId].options.includes(l.option) : l.option === ""));
    if (keep.length !== cart.length) { setPruned(cart.length - keep.length); setCart(keep); }
    // eslint-disable-next-line
  }, [list.state, byId]);
  React.useEffect(() => { shopCartWrite(cart); }, [cart]);
  /* Delivery switched off while the page was open: back to collection. */
  React.useEffect(() => { if (list.state === "ready" && !terms.deliveryOn && fulfil === "deliver") setFulfil("collect"); }, [list.state, terms.deliveryOn]);

  /* The quote: the server's price for this cart, now. Asked again whenever the
     cart or the way it reaches the buyer changes. */
  const cartSig = JSON.stringify(cart) + "|" + fulfil + "|" + code + "|" + (code ? buyer.email.trim().toLowerCase() : "");
  React.useEffect(() => {
    if (list.state !== "ready" || !d.open || !cart.length) { setQuote({ state: "idle", q: null, error: "" }); return; }
    const n = ++qSeq.current;
    setQuote(s => ({ state: "loading", q: s.q, error: "" }));
    const t = setTimeout(() => {
      NGGApi.public.shop.quote(cart.map(l => ({ productId: l.productId, option: l.option, qty: l.qty })), fulfil, code, buyer.email.trim()).then(
        r => { if (n === qSeq.current) setQuote({ state: "ready", q: r, error: "" }); },
        e => { if (n === qSeq.current) setQuote({ state: "error", q: null, error: shopErrText(e, "Couldn’t price your cart. Try again.") }); });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [cartSig, list.state, d.open]);

  const pickCat = c => {
    setCat(c);
    try { const u = new URL(window.location.href); if (c) u.searchParams.set("cat", c); else u.searchParams.delete("cat"); history.replaceState(history.state, "", u.pathname + u.search); } catch (_) {}
  };
  const inCart = (pid, opt) => cart.filter(l => l.productId === pid && l.option === (opt || "")).reduce((n, l) => n + l.qty, 0);
  const add = (p, option, qty) => {
    setPayErr("");
    const k = shopLineKey({ productId: p.productId, option });
    const i = cart.findIndex(l => shopLineKey(l) === k);
    if (i < 0 && cart.length >= maxLines) { shopToast("error", "At most " + maxLines + " different items in one order."); return; }
    const cap = Math.min(maxQty, shopLeft(p, option));
    const have = i >= 0 ? cart[i].qty : 0;
    const next = Math.min(cap, have + qty);
    if (next <= have) { shopToast("error", cap <= 0 ? "That is sold out." : "You have all we can sell of that in your cart."); return; }
    setCart(i < 0 ? cart.concat([{ productId: p.productId, option, qty: next }]) : cart.map((l, j) => j === i ? Object.assign({}, l, { qty: next }) : l));
    shopToast("success", p.name + (option ? " (" + option + ")" : "") + " is in your cart.");
  };
  const setQty = (k, qty) => setCart(c => c.map(l => shopLineKey(l) === k ? Object.assign({}, l, { qty }) : l));
  const remove = k => setCart(c => c.filter(l => shopLineKey(l) !== k));

  const setB = (k, v) => { setBuyer(b => Object.assign({}, b, { [k]: v })); setFe(f => { const n = Object.assign({}, f); delete n[k]; return n; }); };
  const check = () => {
    const e = {};
    if (buyer.name.trim().replace(/\s+/g, " ").length < 2) e.name = "Write your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email.trim())) e.email = "That email doesn’t look right.";
    const ph = buyer.phone.replace(/[^0-9+]/g, "");
    if (ph.length < 7 || ph.length > 16) e.phone = "Write a phone number we can call, 7 to 16 digits.";
    if (fulfil === "collect" && !buyer.centre) e.centre = "Choose the centre where you will collect it.";
    if (fulfil === "deliver" && buyer.address.trim().length < 10) e.address = "Write the full delivery address.";
    return e;
  };
  const pay = async ev => {
    if (ev) ev.preventDefault();
    setPayErr("");
    const e = check();
    setFe(e);
    if (Object.keys(e).length) { setTimeout(() => { const el = document.getElementById("shop-f-" + Object.keys(e)[0]); if (el) el.focus(); }, 30); return; }
    setBusy(true);
    try {
      const r = await NGGApi.public.shop.order({
        items: cart.map(l => ({ productId: l.productId, option: l.option, qty: l.qty })), fulfil,
        buyer: { name: buyer.name.trim(), email: buyer.email.trim(), phone: buyer.phone.trim() },
        centre: fulfil === "collect" ? buyer.centre : "", address: fulfil === "deliver" ? buyer.address.trim() : "", code,
      });
      /* Only ever to Paystack's own checkout (nggPaystackUrlOk, page-other.jsx). */
      if (!nggPaystackUrlOk(r.authorizationUrl)) throw Object.assign(new Error("bad_checkout"), { code: "init_failed" });
      shopStoreSet(SHOP_PENDING_KEY, r.token || null);
      window.location.assign(r.authorizationUrl);
    } catch (err) {
      setBusy(false);
      const f = SHOP_FIELD_ERRORS[err && err.code];
      if (err && /^(bad_code|code_)/.test(err.code || "")) { setCode(""); setFe({ code: shopErrText(err, "That code can’t be used.") }); return; }
      if (f) { setFe({ [f[0]]: shopErrText(err, f[1]) }); setTimeout(() => { const el = document.getElementById("shop-f-" + f[0]); if (el) el.focus(); }, 30); return; }
      setPayErr(shopErrText(err, "Couldn’t place the order. Nothing was charged — try again."));
      /* The catalogue moved under the buyer (sold out, taken off sale, closed): read it again. */
      if (["out_of_stock", "not_available", "bad_option", "shop_closed", "no_delivery"].includes(err && err.code)) load();
    }
  };

  const cats = [];
  products.forEach(p => { if (p.category && cats.indexOf(p.category) < 0) cats.push(p.category); });
  const shown = cat && cats.includes(cat) ? products.filter(p => p.category === cat) : products;
  const q = quote.q;
  const centres = terms.centres || [];
  const canCollect = centres.length > 0;
  const canOrder = !!terms.paystack && (canCollect || terms.deliveryOn);

  let body;
  if (list.state === "loading" && !list.data) {
    body = <div className="shop-wait" role="status"><span className="shop-spin" aria-hidden="true"/>Opening the shop…</div>;
  } else if (list.state === "error" && !list.data) {
    body = (
      <div className="shop-msg" role="alert">
        <h2>We couldn’t open the shop</h2>
        <p>{shopErrText(list.error, "Check your connection and try again.")}</p>
        <button type="button" className="btn btn-primary" onClick={load}>Try again</button>
      </div>);
  } else if (!d.open) {
    body = (
      <div className="shop-msg">
        <h2>The shop is closed right now</h2>
        <p>Nothing is on sale at the moment. Come back soon, or ask at your centre’s desk.</p>
        <button type="button" className="btn btn-ghost" onClick={() => setPage("home")}>Back to home</button>
      </div>);
  } else {
    body = (
      <div className="shop-layout">
        <section className="shop-catalogue" aria-labelledby="shop-cat-h">
          <h2 id="shop-cat-h" className="sr-only">What’s on sale</h2>
          {cats.length > 1 && (
            <div className="shop-cats" role="group" aria-label="Show a category">
              <button type="button" className="shop-cat" aria-pressed={!cat || !cats.includes(cat)} onClick={() => pickCat("")}>All</button>
              {cats.map(c => <button key={c} type="button" className="shop-cat" aria-pressed={cat === c} onClick={() => pickCat(c)}>{c}</button>)}
            </div>
          )}
          {list.state === "error" && <div className="shop-err" role="alert">{shopErrText(list.error, "Couldn’t refresh the shop.")} <button type="button" className="shop-link" onClick={load}>Try again</button></div>}
          {!shown.length
            ? <p className="shop-empty">Nothing is on sale here yet. Come back soon.</p>
            : <ul className="shop-grid">{shown.map(p => <li key={p.productId}><ShopProductCard p={p} maxQty={maxQty} inCart={inCart} onAdd={add}/></li>)}</ul>}
        </section>

        <aside className="shop-side" aria-labelledby="shop-cart-h">
          <div className="shop-panel">
            <h2 id="shop-cart-h" className="shop-panel-h">Your cart</h2>
            {pruned > 0 && <p className="shop-note" role="status">{pruned === 1 ? "One item in your cart is" : pruned + " items in your cart are"} no longer for sale and came out of it.</p>}
            {!cart.length ? <p className="shop-empty">Your cart is empty. Choose something from the shop.</p> : (
              <ul className="shop-lines">
                {cart.map(l => {
                  const p = byId[l.productId]; if (!p) return null;
                  const k = shopLineKey(l);
                  const cap = Math.min(maxQty, shopLeft(p, l.option));
                  const ql = q && q.lines ? q.lines.find(x => x.productId === l.productId && x.option === l.option) : null;
                  return (
                    <li key={k} className="shop-line">
                      <div className="shop-line-t"><b>{p.name}</b>{l.option && <span>{l.option}</span>}</div>
                      <label className="shop-line-q"><span className="sr-only">How many {p.name}{l.option ? ", " + l.option : ""}</span>
                        <select value={l.qty} onChange={e => setQty(k, Number(e.target.value))}>
                          {Array.from({ length: Math.max(l.qty, Math.min(cap, maxQty)) }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                      <span className="shop-line-a">{ql ? shopMoney(ql.amount) : "…"}</span>
                      <button type="button" className="shop-x" aria-label={"Remove " + p.name + (l.option ? " (" + l.option + ")" : "") + " from the cart"} onClick={() => remove(k)}>×</button>
                    </li>);
                })}
              </ul>
            )}
          </div>

          {cart.length > 0 && (
            <form className="shop-panel shop-checkout" onSubmit={pay} noValidate aria-labelledby="shop-co-h">
              <h2 id="shop-co-h" className="shop-panel-h">Checkout</h2>
              <ShopField id="name" label="Your full name" value={buyer.name} err={fe.name} onChange={v => setB("name", v)} ac="name"/>
              <ShopField id="email" label="Email" type="email" value={buyer.email} err={fe.email} onChange={v => setB("email", v)} ac="email" help="Your receipt and the order’s news come here."/>
              <ShopField id="phone" label="Phone" type="tel" value={buyer.phone} err={fe.phone} onChange={v => setB("phone", v)} ac="tel"/>
              <fieldset className="shop-how">
                <legend>How you get it</legend>
                {canCollect && <label className="shop-radio"><input type="radio" name="shop-fulfil" value="collect" checked={fulfil === "collect"} onChange={() => setFulfil("collect")}/><span><b>Collect at a centre</b><em>No charge</em></span></label>}
                {terms.deliveryOn && <label className="shop-radio"><input type="radio" name="shop-fulfil" value="deliver" checked={fulfil === "deliver"} onChange={() => setFulfil("deliver")}/><span><b>Delivery</b><em>{shopMoney(terms.deliveryFee)}</em></span></label>}
                {!canCollect && !terms.deliveryOn && <p className="shop-note">No centre takes collections yet, and delivery is off. Orders can’t be taken until one is.</p>}
              </fieldset>
              {fulfil === "collect" && canCollect && (
                <div className="shop-field">
                  <label htmlFor="shop-f-centre">Centre</label>
                  <select id="shop-f-centre" value={buyer.centre} onChange={e => setB("centre", e.target.value)} aria-invalid={fe.centre ? true : undefined} aria-describedby={fe.centre ? "shop-f-centre-err" : "shop-f-centre-help"}>
                    <option value="">Choose a centre</option>
                    {centres.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {fe.centre ? <span className="shop-ferr" id="shop-f-centre-err">{fe.centre}</span> : <span className="shop-help" id="shop-f-centre-help">{terms.collectNote}</span>}
                </div>
              )}
              {fulfil === "deliver" && <ShopField id="address" label="Delivery address" type="textarea" value={buyer.address} err={fe.address} onChange={v => setB("address", v)} ac="street-address" help={terms.deliveryNote}/>}

              <div className="shop-field">
                <label htmlFor="shop-f-code">Discount code <span className="shop-opt">(if you have one)</span></label>
                <div className="shop-code">
                  <input id="shop-f-code" value={codeIn} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={24}
                    aria-invalid={fe.code ? true : undefined} aria-describedby={fe.code ? "shop-f-code-err" : undefined}
                    onChange={e => { setCodeIn(e.target.value); setFe(f => { const n = Object.assign({}, f); delete n.code; return n; }); }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); setCode(codeIn.trim().toUpperCase()); } }}/>
                  {code && code === codeIn.trim().toUpperCase()
                    ? <button type="button" className="btn btn-ghost" onClick={() => { setCode(""); setCodeIn(""); }}>Remove</button>
                    : <button type="button" className="btn btn-ghost" disabled={!codeIn.trim()} onClick={() => setCode(codeIn.trim().toUpperCase())}>Apply</button>}
                </div>
                {fe.code && <span className="shop-ferr" id="shop-f-code-err">{fe.code}</span>}
              </div>

              <div className="shop-quote" aria-live="polite">
                <h3 className="shop-quote-h">What you pay</h3>
                {quote.state === "loading" && !q && <p className="shop-help" role="status">Working out the price…</p>}
                {quote.state === "error" && <p className="shop-ferr" role="alert">{quote.error}{code && <> <button type="button" className="shop-linkbtn" onClick={() => { setCode(""); setCodeIn(""); }}>Remove the code</button></>}</p>}
                {q && (
                  <table className={"shop-sum" + (quote.state === "loading" ? " is-stale" : "")}>
                    <tbody>
                      <tr><th scope="row">Items</th><td>{shopMoney(q.subtotal)}</td></tr>
                      {q.discount > 0 && <tr><th scope="row">Code {q.code}</th><td>−{shopMoney(q.discount)}</td></tr>}
                      {q.delivery > 0 && <tr><th scope="row">Delivery</th><td>{shopMoney(q.delivery)}</td></tr>}
                      {q.onlineFee > 0 && <tr><th scope="row">Payment processing fee<span>Charged by our payment provider</span></th><td>{shopMoney(q.onlineFee)}</td></tr>}
                    </tbody>
                    <tfoot><tr><th scope="row">Total</th><td>{shopMoney(q.total + (q.onlineFee || 0))}</td></tr></tfoot>
                  </table>
                )}
              </div>
              {!terms.paystack && <p className="shop-note" role="note">Online payment isn’t set up yet, so the shop can’t take orders. Nothing you choose is charged.</p>}
              {payErr && <div className="shop-err" role="alert">{payErr}</div>}
              <button type="submit" className="btn btn-primary btn-lg shop-pay" disabled={busy || !canOrder || quote.state !== "ready" || !q}>
                {busy ? "Opening Paystack…" : q && quote.state === "ready" ? "Pay " + shopMoney(q.total + (q.onlineFee || 0)) : "Pay"}
              </button>
              <p className="shop-fine">Card, bank transfer or USSD through Paystack. We never see card details. You come back here when it is done.</p>
            </form>
          )}
        </aside>
      </div>
    );
  }

  return (
    <div className="page shop" data-screen-label="Shop">
      <section className="shop-hero">
        <div className="container">
          <span className="chip chip-navy">NGG shop</span>
          <h1 className="shop-title">Souvenirs and merchandise</h1>
          <p className="shop-lede">T-shirts, caps, mugs and more from Next Generation Genius. Pay online and collect at your centre{terms.deliveryOn ? ", or have it delivered" : ""}.</p>
        </div>
      </section>
      <div className="container shop-body">{body}</div>
    </div>
  );
}

function ShopField({ id, label, value, err, onChange, type, ac, help }) {
  const fid = "shop-f-" + id;
  const desc = err ? fid + "-err" : help ? fid + "-help" : undefined;
  return (
    <div className="shop-field">
      <label htmlFor={fid}>{label}</label>
      {type === "textarea"
        ? <textarea id={fid} rows={3} maxLength={400} value={value} autoComplete={ac} aria-invalid={err ? true : undefined} aria-describedby={desc} onChange={e => onChange(e.target.value)}/>
        : <input id={fid} type={type || "text"} value={value} autoComplete={ac} maxLength={type === "email" ? 200 : 120} aria-invalid={err ? true : undefined} aria-describedby={desc} onChange={e => onChange(e.target.value)}/>}
      {err ? <span className="shop-ferr" id={fid + "-err"}>{err}</span> : help ? <span className="shop-help" id={fid + "-help"}>{help}</span> : null}
    </div>
  );
}

/** One product: its picture, price, options, what is left, and Add. */
function ShopProductCard({ p, maxQty, inCart, onAdd }) {
  const opts = p.options || [];
  const firstOpen = opts.find(o => shopLeft(p, o) > 0);
  const [opt, setOpt] = React.useState(opts.length ? (firstOpen || opts[0]) : "");
  const [qty, setQty] = React.useState(1);
  const left = shopLeft(p, opt);
  const room = Math.max(0, Math.min(maxQty, left) - inCart(p.productId, opt));
  const out = p.soldOut || left <= 0;
  React.useEffect(() => { if (qty > Math.max(1, room)) setQty(Math.max(1, room)); }, [room]);
  const oid = "shop-o-" + p.productId, qid = "shop-q-" + p.productId;
  return (
    <article className={"shop-card" + (p.soldOut ? " is-out" : "")} aria-labelledby={"shop-n-" + p.productId}>
      <div className="shop-img">
        {p.imageUrl ? <img src={p.imageUrl} alt={p.name} loading="lazy"/> : <span className="shop-img-none" aria-hidden="true">{(p.name || "?").slice(0, 1)}</span>}
        {p.soldOut && <span className="shop-badge">Sold out</span>}
      </div>
      <div className="shop-card-b">
        <span className="shop-card-cat">{p.category}</span>
        <h3 id={"shop-n-" + p.productId} className="shop-card-n">{p.name}</h3>
        <p className="shop-price">{shopMoney(p.price)}</p>
        {p.preorderUntil && <p className="shop-pre">Pre-order until {new Date(p.preorderUntil + "T12:00:00Z").toLocaleDateString(NGG_LOCALE, { day: "numeric", month: "long" })}. Made to order; we tell you when it is ready.</p>}
        {p.description && <p className="shop-desc">{p.description}</p>}
        {!p.soldOut && (
          <div className="shop-pick">
            {opts.length > 0 && (
              <label className="shop-pick-f" htmlFor={oid}><span>{p.category === "Clothing" ? "Size" : "Option"}</span>
                <select id={oid} value={opt} onChange={e => { setOpt(e.target.value); setQty(1); }}>
                  {opts.map(o => <option key={o} value={o} disabled={shopLeft(p, o) <= 0}>{o}{shopLeft(p, o) <= 0 ? " — sold out" : ""}</option>)}
                </select>
              </label>
            )}
            <label className="shop-pick-f" htmlFor={qid}><span>How many</span>
              <select id={qid} value={qty} disabled={out || room <= 0} onChange={e => setQty(Number(e.target.value))}>
                {Array.from({ length: Math.max(1, room) }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        )}
        {!out && left !== Infinity && left <= 5 && <p className="shop-left">Only {left} left{opt ? " in " + opt : ""}.</p>}
        {!p.soldOut && (
          <button type="button" className="btn btn-primary shop-add" disabled={out || room <= 0} onClick={() => onAdd(p, opt, qty)}>
            {out ? "Sold out" : room <= 0 ? "All in your cart" : "Add to cart"}
          </button>
        )}
      </div>
    </article>
  );
}

/* ── /shop/order/<token> ───────────────────────────────────────────────────
   Where Paystack sends the buyer back (?reference=…), and the link in every
   email about the order. With a reference the server asks Paystack itself;
   the page never decides that anything is paid. */
const SHOP_STEPS = [["paid", "Paid"], ["ready", "Ready"], ["completed", "Done"]];
const SHOP_STATUS_TEXT = {
  pending: ["Waiting for payment", "We haven’t received the payment for this order. If you paid, refresh this page in a minute — do not pay again. If you didn’t finish, pay now below. An unpaid order holds nothing back, and it is cancelled if it stays unpaid."],
  paid: ["Paid — thank you", "We are getting your order ready, and we will email you when it is."],
  ready: ["Ready", ""],
  completed: ["Done", ""],
  cancelled: ["Cancelled", ""],
};
function ShopOrderPage({ setPage }) {
  const token = decodeURIComponent(((window.location.pathname || "").split("/").filter(Boolean)[2]) || "");
  const [st, setSt] = React.useState({ state: "loading", o: null, e: null });
  const [warn, setWarn] = React.useState("");
  const [paying, setPaying] = React.useState(false);
  /* Pay a pending order later: the server checks the stock again and opens a fresh Paystack checkout. */
  const payNow = async () => {
    setWarn(""); setPaying(true);
    try {
      const r = await NGGApi.public.shop.pay(token);
      if (!nggPaystackUrlOk(r.authorizationUrl)) throw Object.assign(new Error("bad_checkout"), { code: "init_failed" });
      window.location.assign(r.authorizationUrl);
    } catch (e) { setPaying(false); setWarn(shopErrText(e, "Couldn’t open the payment. Try again.")); }
  };
  const load = React.useCallback(() => {
    let ref = "";
    try { const q = new URLSearchParams(window.location.search); ref = q.get("reference") || q.get("trxref") || ""; } catch (_) {}
    setWarn("");
    setSt(s => ({ state: ref ? "confirming" : "loading", o: s.o, e: null }));
    NGGApi.public.shop.get(token, ref).then(r => {
      setSt({ state: "ready", o: r.order, e: null });
      if (ref) { try { history.replaceState({ page: "shop-order" }, "", "/shop/order/" + encodeURIComponent(token)); } catch (_) {} }
    }).catch(e => {
      if (ref && e.code !== "not_found") {
        setWarn(e.code === "payment_mismatch"
          ? "Paystack reported a payment that does not match this order. Nothing was recorded. Contact NGG before paying again."
          : "We couldn’t confirm the payment yet. If money left your account, do not pay again — refresh this page in a minute.");
        try { history.replaceState({ page: "shop-order" }, "", "/shop/order/" + encodeURIComponent(token)); } catch (_) {}
        return NGGApi.public.shop.get(token, "").then(r => setSt({ state: "ready", o: r.order, e: null }), e2 => setSt({ state: "error", o: null, e: e2 }));
      }
      setSt({ state: e.code === "not_found" ? "missing" : "error", o: null, e });
    });
  }, [token]);
  React.useEffect(load, [load]);
  const o = st.o;
  /* The cart that became this order is done with once the order is paid. */
  React.useEffect(() => {
    if (o && o.status !== "pending" && shopStoreGet(SHOP_PENDING_KEY) === token) { shopCartWrite([]); shopStoreSet(SHOP_PENDING_KEY, null); }
  }, [o && o.status]);

  let inner;
  if (st.state === "loading" || st.state === "confirming") {
    inner = <div className="shop-wait" role="status"><span className="shop-spin" aria-hidden="true"/>{st.state === "confirming" ? "Confirming your payment with Paystack…" : "Loading your order…"}</div>;
  } else if (st.state === "missing") {
    inner = <div className="shop-msg"><h1>This link isn’t valid</h1><p>It may have been typed wrongly. Use the link in your email from NGG, or contact us.</p><button type="button" className="btn btn-ghost" onClick={() => setPage("shop")}>Go to the shop</button></div>;
  } else if (st.state === "error") {
    inner = <div className="shop-msg" role="alert"><h1>We couldn’t load your order</h1><p>{shopErrText(st.e, "Check your connection and try again.")}</p><button type="button" className="btn btn-primary" onClick={load}>Try again</button></div>;
  } else {
    const collect = o.fulfil !== "deliver";
    const head = SHOP_STATUS_TEXT[o.status] || [o.status, ""];
    const idx = SHOP_STEPS.findIndex(s => s[0] === o.status);
    const next = o.status === "ready"
      ? (collect ? "Your order is ready to collect at " + o.centre + ". Bring the order number to the desk." : "Your order is on its way to you.")
      : o.status === "completed" ? (collect ? "You collected this order. Enjoy it." : "This order was delivered. Enjoy it.")
      : o.status === "cancelled" ? (o.expired && !o.paidAt ? "This order was cancelled because it was not paid in time. Nothing was charged; order again from the shop." : "This order was cancelled." + (o.paidAt
          ? (o.refundState === "full" ? " Your payment has been refunded." : o.refundState === "pending" ? " Your refund has been started; it reaches you within 10 working days." : " Your payment will be refunded, and NGG will contact you about it.")
          : " Nothing was charged."))
      : head[1];
    const when = v => v ? new Date(v).toLocaleDateString(NGG_LOCALE, { day: "numeric", month: "long", year: "numeric" }) : "";
    inner = (
      <>
        <p className="shop-eyebrow">Your order</p>
        <h1 className="shop-otitle">{head[0]}</h1>
        <div className="shop-onum">
          <span>Order number</span>
          <b className="shop-mono">{o.orderId}</b>
          {collect && o.status !== "cancelled" && o.status !== "completed" && <em>Bring this number to the desk at {o.centre}.</em>}
        </div>
        {o.pickupCode && collect && (
          <div className="shop-onum shop-pickup">
            <span>Pickup code</span>
            <b className="shop-mono">{o.pickupCode}</b>
            <em>The desk asks for it when you collect. Keep it to yourself.</em>
          </div>
        )}
        {o.status !== "pending" && o.status !== "cancelled" && (
          <ol className="shop-steps" aria-label="Where your order is">
            {SHOP_STEPS.map((s, i) => <li key={s[0]} className={i <= idx ? "is-done" : ""} aria-current={i === idx ? "step" : undefined}>{s[0] === "completed" ? (collect ? "Collected" : "Delivered") : s[0] === "ready" ? (collect ? "Ready to collect" : "On its way") : s[1]}</li>)}
          </ol>
        )}
        {warn && <div className="shop-err" role="alert">{warn}</div>}
        <p className="shop-next" role="status">{next}</p>
        {o.note && o.status !== "cancelled" && o.status !== "completed" && <p className="shop-help">{o.note}</p>}
        {o.tracking && o.status === "ready" && !collect && <p className="shop-help">{o.tracking}</p>}
        <table className="shop-sum shop-olines">
          <tbody>
            {o.lines.map((l, i) => <tr key={i}><th scope="row">{l.name}{l.option ? " (" + l.option + ")" : ""} × {l.qty}</th><td>{shopMoney(l.amount)}</td></tr>)}
            {o.discount > 0 && <tr><th scope="row">Code {o.discountCode}</th><td>−{shopMoney(o.discount)}</td></tr>}
            {o.delivery > 0 && <tr><th scope="row">Delivery</th><td>{shopMoney(o.delivery)}</td></tr>}
            {o.refunded > 0 && <tr><th scope="row">Refunded</th><td>−{shopMoney(o.refunded)}</td></tr>}
            {o.processingFee > 0 && <tr><th scope="row">Payment processing fee<span>Charged by our payment provider</span></th><td>{shopMoney(o.processingFee)}</td></tr>}
          </tbody>
          <tfoot><tr><th scope="row">{o.paidAt ? "Total paid" : "Total"}</th><td>{shopMoney(o.total + (o.processingFee || 0))}</td></tr></tfoot>
        </table>
        <dl className="shop-dl">
          <div><dt>Name</dt><dd>{o.buyerName}</dd></div>
          <div><dt>{collect ? "Collect at" : "Delivery"}</dt><dd>{collect ? o.centre : "To the address you gave"}</dd></div>
          {o.paidAt && <div><dt>Paid</dt><dd>{when(o.paidAt)}</dd></div>}
          {o.readyAt && <div><dt>Ready</dt><dd>{when(o.readyAt)}</dd></div>}
          {o.completedAt && <div><dt>{collect ? "Collected" : "Delivered"}</dt><dd>{when(o.completedAt)}</dd></div>}
        </dl>
        <div className="shop-oacts">
          {o.payable && <button type="button" className="btn btn-primary" disabled={paying} onClick={payNow}>{paying ? "Opening Paystack…" : "Pay now"}</button>}
          {o.status === "pending" && <button type="button" className="btn btn-ghost" onClick={load}>Refresh</button>}
          <button type="button" className="btn btn-ghost" onClick={() => setPage("shop")}>Back to the shop</button>
        </div>
      </>
    );
  }
  return (
    <div className="page shop" data-screen-label="Shop order">
      <div className="container shop-body"><div className="shop-order">{inner}</div></div>
    </div>
  );
}
