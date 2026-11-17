# Shop management upgrade — research, audit and plan (17 Nov 2026)

The owner asked, on 17 Nov 2026: *"Upgrade the shop massively. Add the Africa GATES repo latest branch and
also massively upgrade its shop for better and effective management. Research!"* Work stopped at the
owner's request ("Create a handoff for a new agent to continue. Stop!") after the research and the
Africa GATES audit were done, and before any upgrade code was written in either repository.

This file is the brief for whoever continues. The research applies to **both** shops.

---

## 1. Research: what effective management needs for a tiny volunteer team

The sources are primary where possible: the Shopify, Square and WooCommerce help centres, and Paystack's
docs mirrors. paystack.com itself sits behind a Cloudflare check.

### Inventory

1. **Stock per variant** (product × size/colour = SKU). Square's help article 5228; Shopify's guide to
   selling when out of stock.
2. **Every stock change is a reason-coded ledger entry, with who and when.** The reasons are sale,
   refund/return, received, damaged, given away, recount and POS. Totals derive from the ledger, which
   makes it the audit trail.
   - help.shopify.com/en/manual/products/inventory/managing-inventory-quantities/adjustment-history
3. **A low-stock threshold per variant, settable in bulk**, and **one daily digest email**, as Square
   does it.
   - square.com/help/us/en/article/6142
4. **No stock hold in the browser.** Expire unpaid orders on the server instead. WooCommerce's "Hold
   stock" setting defaults to 60 minutes. On shared hosting, release lazily or from the cron hit.
5. **A "continue selling when out of stock" switch.** This one switch gives pre-orders and back-orders.
6. **A stock-take screen.** It shows the expected count, takes the counted count, and posts the
   difference as "recount".

### Fulfilment

1. **Few plain statuses:** pending payment, paid, ready / shipped, collected / delivered, cancelled,
   refunded (full or partial).
2. **Pickup as its own flow.**
   - "Mark ready" notifies the buyer, and "Collected" is verified by a short **pickup code or QR**.
   - help.shopify.com/en/manual/sell-in-person/shopify-pos/order-management/local-pickup-for-online-orders
3. **Bulk actions, a printable pick list** (totals per product and variant), and **packing slips**
   printed in bulk.
4. **Refunds through the Paystack Refund API.**
   - Request: `POST https://api.paystack.co/refund {transaction, amount?}`. The amount is in kobo; leave
     it out for a full refund. Total refunds cannot exceed the charge.
   - Refunds are asynchronous, reported by the webhooks `refund.pending` → `refund.processing` →
     `refund.processed` or `refund.failed`. Mark an order refunded **only on `refund.processed`**, and
     dedupe repeated deliveries. Money reaches the customer in up to 10 business days.
   - docs-v2.paystack.com/docs/payments/refunds/ and /docs/api/refund/
   - **Unconfirmed:** whether bank-transfer and USSD payments can be refunded automatically. Verify
     before promising it.
5. **Exchanges** (the wrong T-shirt size) are a return plus a replacement: stock comes in and goes out,
   and no money moves at the same price.
6. **A tracking note** per shipment, free text. Partial fulfilment only once volume justifies it.

### In-person sales (POS) at events and centres

- **One stock pool**, shared with the online shop.
- A **quick-sale screen** recording how each sale was paid: cash, transfer or POS terminal.
- A **cash session** per event or day: opening float, cash sales, expected cash, counted cash and the
  difference, as Square's cash drawer does it.
  - square.com/help/us/en/article/5152
- Allow selling below zero, with a warning. A queue at a table must not stall.

### Reporting

- **A "today" view with the four numbers that drive action:**
  - orders to prepare
  - orders ready, or shipped and not yet collected or delivered
  - variants low or out of stock
  - sales today and this week, net of fees
- **Sales by product and variant** over a date range, with best sellers.
- **Gross vs Paystack fees vs net.** Store the fee Paystack actually reports; don't recompute it.
- **CSV export** for accounting.
- **Stock value and sell-through** per product or drop, to size the next print run.

### Pricing

- **Discount codes:** percent or fixed, a use cap, one per customer, a minimum spend, start and end
  dates. Africa GATES already has these.
- **Pre-order campaigns with a deadline.** Collect paid orders, close the campaign, then export the
  counts per size as the print order.
- **A member price.**
- **Simple fixed bundles.**

### Unpaid orders

- Expire them automatically and release what they hold.
- Send **at most one** reminder carrying the pay link.
- The biggest causes of abandoned carts are unexpected costs and forced sign-up (Baymard). Show the
  delivery fee early and allow guest checkout.

### Nigeria

- **Paystack fees, local:** 1.5% + ₦100. The ₦100 is waived under ₦2,500, and the fee is capped at
  ₦2,000.
- **Paystack fees, international cards:** 3.9% + ₦100.
  - support.paystack.com/hc/en-us/articles/360009881920
  - Re-check the live page; better, store each transaction's actual `fees`.
- **Delivery:** use flat zone rates (Lagos, South-West, other states, abroad). Don't integrate courier
  APIs (GIG, Kwik) yet.
- **VAT:** 7.5% is unchanged under the 2026 tax reform. Small businesses are reported exempt, but the
  threshold is uncertain. Make VAT a configurable line that defaults off, and have the accountant
  confirm.
- **WhatsApp** is a channel for sharing a pay link or order link and for staff notices. It is not a
  second store.

### Do not build

- multi-warehouse stock
- live courier rates or label printing
- purchase orders or forecasting
- abandoned-cart sequences or loyalty points
- chatbots or catalogue sync
- automatic multi-currency pricing
- stock-reservation timers in the browser

---

## 2. NGG shop: where it stands and what to build

### What exists

- **Server:** `api/_lib/domain/shop.php`, migration 237, and the routes `api/public/shop.php` and
  `api/admin/shop.php`. Paystack payments arrive with references prefixed `NGGS-` through
  `api/hooks/paystack.php`.
- **Pages:** `page-shop.jsx` (`/shop` and `/shop/order/<token>`) and
  `src/modules/control/cr-tab-shop.jsx` (Money → Shop).
- **Tests:** `tests/shop.test.js` (26/0) and the `shop ·` checks in `api/tests/run.php`.
- **What it does today:**
  - products with options (sizes) and stock per option, or no limit
  - server-priced quotes; the buyer bears the Paystack charge
  - collection at a building centre, or flat-fee delivery
  - paid only on Paystack's verified answer; one writer wins
  - stock taken at payment; mismatched money goes to `unapplied_payments`
  - orders move paid → ready → completed; a paid order is cancelled only with a reason, its stock goes
    back, and it is marked "Refund due"
  - the buyer is emailed at paid, ready and cancelled
  - settings
  - catalogue = `content` permission; orders and settings = `fees`

### Build next, in this order

Each is a migration plus ops plus Control Room work plus tests.

1. **Stock ledger.**
   - A `shop_stock_moves` table: productId, option, delta, reason, note, orderId, by, at.
   - Write to it from: sale (paid), cancel/restock, product-form edits (as "correction"), POS and
     stock-take.
   - Add a stock-take op and screen, and a history view per product.
2. **Low stock.**
   - A per-product `lowStock` threshold, with a default in shop settings.
   - A low-stock panel.
   - A daily digest to the fees holders through the existing webcron (`api/_lib/webcron.php`).
3. **Refunds through the Paystack Refund API.**
   - Full or partial, with an optional restock.
   - A `shop_refunds` table (status pending → processed or failed).
   - Route `refund.*` webhook events in `api/hooks/paystack.php` and dedupe them.
   - Email the buyer.
   - Replace "Refund due" with a real refund, keeping a manual "refunded outside" record for transfers.
4. **Pickup code.**
   - Generate 6 digits when the order is paid.
   - Show it on the order page and in the email.
   - "Collected" requires the code, or an override with a reason.
5. **Unpaid orders.**
   - Expire pending orders after 24 hours, lazily and from cron.
   - Staff can cancel a pending order and resend its pay link.
6. **Bulk "mark ready"** using the admin action layer (`components.jsx` /
   `runAdminAction` conventions, CLAUDE.md §6), plus a printable pick list and packing slips.
7. **POS quick sale** (cash, transfer or POS terminal) from the same stock, and a **cash session** with
   an end-of-day summary.
8. **Reports.**
   - The "today" view (the four numbers above).
   - Sales by product and variant for a date range.
   - Gross, fees and net.
   - CSV export of orders.
9. **Discount codes** and a **pre-order with cutoff** (a per-product "pre-order until <date>" that
   sells past stock until the cutoff; a size-count export).
10. **Paginate and date-filter the orders list.** It is capped at `SHOP_LIST_MAX` 300 today. Add an order
    detail view with a timeline and staff notes.

Respect CLAUDE.md throughout:

- migrations: three edits; the MySQL mirror; the `centre` / `centreId` naming lists
- capability rules: money is `fees`
- no `!important`, no native `confirm()`
- the three states (loading, empty, error with retry)
- tests: `php api/tests/run.php` and `node tests/shop.test.js`; add new suites to `test:all`

---

## 3. Africa GATES shop: audit (branch `claude/ai-assistance-judges-features-1ka4oz`, e00e9551)

Repository: `appadmin-oss/Africa-GATES`. Its latest branch was `claude/ai-assistance-judges-features-1ka4oz`
(pushed 17 Nov 2026 17:39). The stack is PHP 8.4, Slim 4, Twig and Capsule. **Read its CLAUDE.md**; the
MySQL/SQLite traps there have each shipped a bug.

### What exists

**Tables:**

- `gates_products` (stock NULL = untracked)
- `gates_product_variants` (sku, price delta, stock, swatches)
- `gates_product_images`
- `gates_orders`: status pending / paid / failed / refunded; a separate `fulfilment` column (unfulfilled,
  packed, shipped, delivered, cancelled); tracking_note, stock_short, discount and referral columns,
  refunded_at / refund_note
- `gates_shop_codes`: discount codes, complete
- `gates_stock_alerts`: back-in-stock requests
- Shipping rates are settings JSON.

**Services (`src/Services/`):**

- ShopCatalogue, ShopPricing (regional multipliers), ShopDiscount, ShopShipping
- ShopOrderService:
  - `confirm()` is idempotent
  - `fulfil()` draws stock at payment, with compare-and-set
  - `reverse()` handles gateway refunds and chargebacks
- ShopAdvisor (the AI assistant's shop lookups) and StockAlert

**Routes and controllers:**

- Routes: `src/routes.php` lines 2396–2412 (public) and 4435–4449 (admin).
- Controllers: `src/Admin/Controllers/ShopController.php` (orders, codes, shipping) and
  `ProductsController.php`.

**Verification** runs through three paths: the callback, the signed webhook (`PaymentController`), and the
cron sweep (`PaymentReconciler`, which expires pending orders after 3 days).

**Tests:** about 200 shop test methods. The main files are ShopCatalogueTest, ShopCheckoutTest,
ShopEventPaymentCoverageTest, RefundReversalTest, StockAlertTest and ShopAdvisorTest.
`docs/SHOP-EVENT-PAYMENT-AUDIT.md` says all its findings are fixed; what remains is operational
(the webhook URL and key in the Paystack dashboard).

### Gaps

**Refunds**
- Staff cannot start a refund (`RefundService` covers donations only).
- "Cancelled" fulfilment moves no money and no stock.

**Stock**
- No low-stock threshold or alert.
- No stock-adjustment log: stock is overwritten in the product form, with a generic audit entry only.

**Fulfilment**
- No pick list or packing slips.
- No collection/pickup option or verification.

**In-person sales**
- No POS and no manual order entry.

**Lists and orders**
- No bulk actions.
- The orders list stops at 300 rows: no pagination, no date range, no detail page, no staff notes.
- The products list has no search or filter.

**Reports**
- No shop reports or CSV beyond the generic data export.

**Pending orders**
- Staff can't cancel a pending order or resend its link.

**Notifications**
- The buyer is not told when an order is delivered or cancelled.

**Permissions**
- Products, shop and codes all sit under `content`: any content editor can change prices, codes and
  orders.

**Products**
- Products are hard-deleted; there is no archive or duplicate.

### Build, in this order

Commit and push after each green phase.

1. Console refunds (full or partial) through the existing payment gateway layer, with refund records
   updated by `refund.*` webhooks and an optional restock. Cancelling a paid order goes through a
   refund; cancelling a pending one releases its discount use.
2. A stock ledger table with reason codes and the actor, a stock-take screen, a low-stock threshold per
   variant with a default, a low-stock panel, and a daily digest from the maintenance run.
3. An order detail page (timeline and notes), bulk actions, pagination and a date range on orders,
   printable pick list and packing slips, and buyer emails on delivered and cancelled.
4. Collection points as a fulfilment option, with a pickup code verified at "Collected".
5. POS quick sale and a cash session.
6. A shop dashboard ("today"), reports by product and variant, and CSV.
7. Product search and filter, archive (when a product has orders) and duplicate, and a separate shop-money
   permission. Say what you chose; never silently remove anyone's access.

### Environment notes for the Africa GATES work

- Clone it with `add_repo` (appadmin-oss/Africa-GATES), then
  `git clone --depth 1 https://github.com/appadmin-oss/africa-gates /home/user/africa-gates`. Fetch the
  latest branch by name with a depth.
- The work branch is **`claude/shop-management-upgrade`**. It was created from e00e9551 in the last
  session, but **never pushed and holds no commits**, so recreate it from the newest branch at the time.
  Push with `git -c push.negotiate=true push -u origin claude/shop-management-upgrade`. No pull request.
- **This container had PHP 8.3; the lockfile wants 8.4.** `composer install --ignore-platform-req=php`
  works. Run the suite with `./vendor/bin/phpunit --no-coverage` after
  `rm -f var/data/.gates-maintenance.lock var/data/.maintenance_tick`, with no `.env`.
  - Record a baseline first. Failures caused by PHP 8.3 are environmental: report them, don't "fix"
    them.
  - Never commit `vendor/`.
- JS minified twins need esbuild: run `php scripts/build-min.php`, and commit `public/assets/min`.
