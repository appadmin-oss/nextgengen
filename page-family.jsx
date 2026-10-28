/* ================================================================
   NGG — Family account (/family).

   A parent's or guardian's own sign-in, holding the NGG members they look
   after. Its own cookie and its own API (api/family/*): a family session is
   never a member session, and nothing here reads one. It holds Anchor
   Circle too (the old /circle portal): a parent sees a child's Anchor week
   under Growth (domain/circle.php).

   The screens are Family Portal v3 (src/modules/family3/): Today ·
   Saturdays · Growth · Fees · Messages, a child switcher, and the account.
   What a parent sees is read from the same functions as the member's own
   dashboard, server-side; what they can DO is answer, sign, book, upload
   for a child, and tell the desk something.
   ================================================================ */

function FamilyPage() {
  return <Fp3Portal/>;
}
