# Form builder — faculty cascade and conditional logic

The public forms (summer registration, volunteer, contact) are built in
**Control Room → Summer School → Intake form** (the panel used to be called
"Form builder"). This page covers the two things that are not self-evident
from the UI.

Implementation: `api/_lib/domain/registration.php` (the authority),
`page-other.jsx` (`GateRegister`, the live form), `page-admin.jsx`
(`SummerFormBuilder`, `FieldLogic`). Verified by `npm run test:api` and
`npm run test:ui`.

## Faculty → course

The registration form asks **Faculty** first, then **Course** — and Course only
offers the courses belonging to the chosen faculty. Before this it offered one
flat list spanning every faculty, so a student could be signed up for Piano
under AI & Technology.

The link is a `optionsFrom: 'faculty'` property on the Course field. It means
*"take my options from the academy catalogue entry for whatever that field
holds"*. The catalogue itself lives in one place — the `academy_catalogue`
setting, edited under Settings — and both ends read it, so the two cannot
drift.

- **With no faculty chosen** the field shows the full catalogue rather than an
  empty list, so it is never a dead end. The placeholder reads *"Choose a
  faculty first…"*.
- **Changing faculty clears a course the new faculty does not offer.** Leaving
  it would submit a course the server then rejects, on a field that still looks
  answered.
- **The server enforces it.** A cross-faculty course posted directly to the API
  is rejected with *"Pick a course from the chosen faculty."* Hiding the wrong
  options in the browser is a convenience; this is the constraint.

Both fields are `locked` — the ID pipeline, the `/v-status` breakdowns and
instructor matching read those keys — but their **options are editable**,
because they come from the catalogue.

## Conditional logic

Any field except the first can be made conditional: **Show only when
`<field>` `<operator>` `<value>`**.

| Operator | Shows the field when |
|---|---|
| `is` | the other answer equals the value |
| `is not` | it does not equal the value |
| `is any of` | it matches one of a comma-separated list (`Music, Media`) |
| `is answered` | it has any value at all |
| `is empty` | it has no value |

`is answered` and `is empty` take no operand, and the editor hides the value
box for them.

A **multi-select** answer satisfies `is` when the value is among the choices —
"show this when they picked Dance" should not require Dance to be their *only*
pick.

### A rule may only reference a field above it

The form resolves top-down in a single pass. A rule pointing at a field further
down would read an answer nobody has given yet, and two fields pointing at each
other would never settle. So:

- the editor offers only the fields **above** the one being edited;
- the server rejects anything else with `logic_forward_reference`, including a
  field referencing itself;
- **moving a field above its dependency breaks the rule.** The editor flags it
  in red and publishing fails until it is fixed or removed.

### Hidden means absent

A hidden field is not merely invisible:

- it is **not required**, even if marked required — a hidden required field can
  never block a submission;
- **its answer is dropped**, not carried through. Answer a question, then
  change the answer that hides it, and the orphaned value does not reach the
  database.

The browser and the server evaluate the same rules
(`formFieldVisible` / `form_field_visible`) and the test suite pins the two
implementations to identical behaviour.

## Compatibility

`showIf` previously stored a bare `{key, value}` meaning *is*. That shape still
loads and is normalised to `{key, op: 'is', value}` on the next publish, so
forms published before this change keep working.
