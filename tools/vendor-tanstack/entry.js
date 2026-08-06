// Self-hosted global build of @tanstack/react-table for NGG's vendored-globals model.
import * as ReactTable from '@tanstack/react-table';
if (typeof window !== 'undefined') window.TanstackTable = ReactTable;
