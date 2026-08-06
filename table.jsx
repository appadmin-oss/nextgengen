/*
 * table.jsx — DataTable: NGG's reusable data grid, built on TanStack Table v8.
 *
 * Headless TanStack Table (vendored global window.TanstackTable, see
 * vendor/tanstack-table.min.js) wrapped in a styled, batteries-included React
 * component: column sorting, a global search box, and client-side pagination.
 * Follows the site's vendored-globals model — reuses window.React and attaches
 * window.DataTable; no imports, no second React copy.
 *
 * Usage:
 *   <DataTable
 *      columns={[
 *        { accessorKey: 'name',   header: 'Name' },
 *        { accessorKey: 'rate',   header: 'Engagement', cell: c => c.getValue() + '%' },
 *        { id: 'actions', header: '', cell: c => <button>…</button>, enableSorting: false },
 *      ]}
 *      data={rows}
 *      searchable pageSize={10} dense
 *   />
 *
 * columns: TanStack ColumnDef[] (accessorKey|accessorFn|id, header, optional
 *          cell render fn, enableSorting). data: array of row objects.
 */
(function () {
  var React = window.React;
  if (!React) { console.error('[DataTable] React global missing'); return; }
  var TT = window.TanstackTable;
  if (!TT) { console.error('[DataTable] window.TanstackTable missing — is vendor/tanstack-table.min.js loaded before the app?'); }
  var useState = React.useState;

  // Inject the component's styles once. Colours use site CSS variables with
  // safe fallbacks, so DataTable inherits light/dark theming where present.
  var STYLE_ID = 'ngg-datatable-styles';
  function ensureStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var css =
      '.ngg-dt{--dt-line:var(--line,#e7e9ee);--dt-ink:var(--ink,#15120e);--dt-muted:var(--muted,#5f6874);' +
      '--dt-card:var(--card,#fff);--dt-accent:var(--accent,#e4162b);--dt-zebra:var(--surface-2,#fafbfc);font:inherit;color:var(--dt-ink)}' +
      '.ngg-dt-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}' +
      '.ngg-dt-search{flex:1;min-width:180px;max-width:360px;border:1.5px solid var(--dt-line);border-radius:10px;padding:9px 12px;font:inherit;background:var(--dt-card);color:var(--dt-ink)}' +
      '.ngg-dt-search:focus{outline:none;border-color:var(--dt-accent)}' +
      '.ngg-dt-count{color:var(--dt-muted);font-size:.85rem;margin-left:auto}' +
      '.ngg-dt-scroll{overflow-x:auto;border:1px solid var(--dt-line);border-radius:12px}' +
      '.ngg-dt-table{width:100%;border-collapse:collapse;font-size:.9rem}' +
      '.ngg-dt-table th,.ngg-dt-table td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--dt-line);vertical-align:middle;white-space:nowrap}' +
      '.ngg-dt-table.dense th,.ngg-dt-table.dense td{padding:6px 10px}' +
      '.ngg-dt-table thead th{position:sticky;top:0;background:var(--dt-card);font-size:.74rem;text-transform:uppercase;letter-spacing:.03em;color:var(--dt-muted);z-index:1}' +
      '.ngg-dt-th-btn{display:inline-flex;align-items:center;gap:5px;background:none;border:0;font:inherit;font-weight:700;color:inherit;cursor:pointer;padding:0;text-transform:inherit;letter-spacing:inherit}' +
      '.ngg-dt-th-btn.sortable:hover{color:var(--dt-ink)}' +
      '.ngg-dt-arrow{font-size:.8em;opacity:.9}' +
      '.ngg-dt-table tbody tr:nth-child(even){background:var(--dt-zebra)}' +
      '.ngg-dt-table tbody tr:hover{background:color-mix(in srgb,var(--dt-accent) 6%,transparent)}' +
      '.ngg-dt-empty{padding:28px 12px;text-align:center;color:var(--dt-muted)}' +
      '.ngg-dt-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px;color:var(--dt-muted);font-size:.85rem}' +
      '.ngg-dt-btn{border:1.5px solid var(--dt-line);background:var(--dt-card);border-radius:9px;padding:6px 11px;font:inherit;font-weight:700;color:var(--dt-ink);cursor:pointer}' +
      '.ngg-dt-btn:disabled{opacity:.45;cursor:default}' +
      '.ngg-dt-btn:not(:disabled):hover{border-color:var(--dt-accent)}' +
      '.ngg-dt-select{border:1.5px solid var(--dt-line);border-radius:9px;padding:6px 8px;font:inherit;background:var(--dt-card);color:var(--dt-ink)}' +
      '.ngg-dt-foot .sp{flex:1}';
    var el = document.createElement('style');
    el.id = STYLE_ID; el.textContent = css;
    document.head.appendChild(el);
  }

  function Arrow(props) {
    var d = props.dir;
    return React.createElement('span', { className: 'ngg-dt-arrow' }, d === 'asc' ? '▲' : d === 'desc' ? '▼' : '↕');
  }

  function DataTable(props) {
    ensureStyles();
    var columns = props.columns || [];
    var data = props.data || [];
    var searchable = props.searchable !== false;
    var pageSizes = props.pageSizes || [10, 25, 50, 100];
    var emptyText = props.emptyText || 'Nothing to show yet.';

    var sortingState = useState([]); var sorting = sortingState[0], setSorting = sortingState[1];
    var filterState = useState(''); var globalFilter = filterState[0], setGlobalFilter = filterState[1];
    var pageState = useState({ pageIndex: 0, pageSize: props.pageSize || pageSizes[0] });
    var pagination = pageState[0], setPagination = pageState[1];

    if (!TT || !TT.useReactTable) {
      return React.createElement('div', { className: 'ngg-dt-empty' }, 'Table library not loaded.');
    }

    var table = TT.useReactTable({
      data: data,
      columns: columns,
      state: { sorting: sorting, globalFilter: globalFilter, pagination: pagination },
      onSortingChange: setSorting,
      onGlobalFilterChange: setGlobalFilter,
      onPaginationChange: setPagination,
      getCoreRowModel: TT.getCoreRowModel(),
      getSortedRowModel: TT.getSortedRowModel(),
      getFilteredRowModel: TT.getFilteredRowModel(),
      getPaginationRowModel: TT.getPaginationRowModel(),
    });

    var rows = table.getRowModel().rows;
    var totalRows = table.getFilteredRowModel().rows.length;
    var pageIndex = table.getState().pagination.pageIndex;
    var pageSize = table.getState().pagination.pageSize;
    var firstRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
    var lastRow = Math.min((pageIndex + 1) * pageSize, totalRows);
    var colCount = table.getAllLeafColumns().length || 1;

    var h = React.createElement;

    var bar = searchable ? h('div', { className: 'ngg-dt-bar' }, [
      h('input', {
        key: 'search', className: 'ngg-dt-search', type: 'search',
        placeholder: props.searchPlaceholder || 'Search…',
        value: globalFilter,
        onChange: function (e) { setGlobalFilter(e.target.value); table.setPageIndex(0); },
        'aria-label': 'Search table',
      }),
      h('span', { key: 'count', className: 'ngg-dt-count' }, totalRows + (totalRows === 1 ? ' row' : ' rows')),
    ]) : null;

    var thead = h('thead', { key: 'thead' }, table.getHeaderGroups().map(function (hg) {
      return h('tr', { key: hg.id }, hg.headers.map(function (header) {
        var canSort = header.column.getCanSort();
        var sorted = header.column.getIsSorted();
        var label = header.isPlaceholder ? null : TT.flexRender(header.column.columnDef.header, header.getContext());
        return h('th', { key: header.id, style: { width: header.getSize && header.column.columnDef.size ? header.column.columnDef.size : undefined } },
          canSort
            ? h('button', {
                className: 'ngg-dt-th-btn sortable',
                onClick: header.column.getToggleSortingHandler(),
                title: 'Sort',
              }, [h('span', { key: 'l' }, label), h(Arrow, { key: 'a', dir: sorted || null })])
            : h('span', null, label)
        );
      }));
    }));

    var tbody = h('tbody', { key: 'tbody' },
      rows.length === 0
        ? h('tr', null, h('td', { colSpan: colCount, className: 'ngg-dt-empty' }, emptyText))
        : rows.map(function (row) {
            return h('tr', { key: row.id }, row.getVisibleCells().map(function (cell) {
              return h('td', { key: cell.id }, TT.flexRender(cell.column.columnDef.cell, cell.getContext()));
            }));
          })
    );

    var tableEl = h('div', { key: 'scroll', className: 'ngg-dt-scroll' },
      h('table', { className: 'ngg-dt-table' + (props.dense ? ' dense' : '') }, [thead, tbody]));

    var showFooter = totalRows > pageSize || totalRows > pageSizes[0];
    var foot = showFooter ? h('div', { className: 'ngg-dt-foot' }, [
      h('span', { key: 'showing' }, 'Showing ' + firstRow + '–' + lastRow + ' of ' + totalRows),
      h('span', { key: 'sp', className: 'sp' }),
      h('select', {
        key: 'ps', className: 'ngg-dt-select', value: pageSize,
        onChange: function (e) { table.setPageSize(Number(e.target.value)); },
        'aria-label': 'Rows per page',
      }, Array.from(new Set(pageSizes.concat(pageSize))).sort(function (a, b) { return a - b; })
          .map(function (n) { return h('option', { key: n, value: n }, n + ' / page'); })),
      h('button', { key: 'first', className: 'ngg-dt-btn', onClick: function () { table.setPageIndex(0); }, disabled: !table.getCanPreviousPage() }, '«'),
      h('button', { key: 'prev', className: 'ngg-dt-btn', onClick: function () { table.previousPage(); }, disabled: !table.getCanPreviousPage() }, '‹ Prev'),
      h('span', { key: 'pg' }, 'Page ' + (pageIndex + 1) + ' of ' + Math.max(1, table.getPageCount())),
      h('button', { key: 'next', className: 'ngg-dt-btn', onClick: function () { table.nextPage(); }, disabled: !table.getCanNextPage() }, 'Next ›'),
      h('button', { key: 'last', className: 'ngg-dt-btn', onClick: function () { table.setPageIndex(table.getPageCount() - 1); }, disabled: !table.getCanNextPage() }, '»'),
    ]) : null;

    return h('div', { className: 'ngg-dt' + (props.className ? ' ' + props.className : '') }, [bar, tableEl, foot]);
  }

  window.DataTable = DataTable;
})();
