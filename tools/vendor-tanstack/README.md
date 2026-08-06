# Vendored TanStack Table (global build)

`vendor/tanstack-table.min.js` is a self-hosted IIFE build of
[`@tanstack/react-table`](https://tanstack.com/table) that exposes
`window.TanstackTable`, matching NGG's vendored-globals model (React is loaded
from `vendor/react*.js`, not bundled here — the shims reuse `window.React`).

## Rebuild

```
npm install            # brings in esbuild + @tanstack/react-table (devDeps)
npm run vendor:tanstack # regenerates vendor/tanstack-table.min.js
```

Then commit the regenerated `vendor/tanstack-table.min.js`. The reusable
`DataTable` component that wraps it lives in `table.jsx` (global `window.DataTable`).
