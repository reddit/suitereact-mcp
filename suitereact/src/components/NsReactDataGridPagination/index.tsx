import TablePagination from '@mui/material/TablePagination';
import {
  gridPageSelector,
  gridPageSizeSelector,
  useGridApiContext,
  useGridSelector,
} from '@mui/x-data-grid';
import * as React from 'react';

export default function NsReactDataGridPagination(props: {
  rowCount: number;
  rowsPerPageOptions: number[];
}) {
  const apiRef = useGridApiContext();
  const page = useGridSelector(apiRef, gridPageSelector);
  const pageSize = useGridSelector(apiRef, gridPageSizeSelector);

  return (
    <TablePagination
      rowsPerPageOptions={props.rowsPerPageOptions}
      component="div"
      count={props.rowCount}
      rowsPerPage={pageSize}
      page={page}
      onPageChange={(event, value) => {
        apiRef.current.setPage(value);
      }}
      onRowsPerPageChange={event => {
        apiRef.current.setPageSize(parseInt(event.target.value, 10));
      }}
    />
  );
}
