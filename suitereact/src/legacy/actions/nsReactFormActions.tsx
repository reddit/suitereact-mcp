import {
  isNsReactButton,
  isNsReactChatbot,
  isNsReactField,
  isNsReactTable,
  NsReactButtonProps,
  NsReactChatbotProps,
  NsReactFieldProps,
  NsReactFormGridElementProps,
  NsReactTableProps,
  NsReactTableRowProps,
} from '../domain';

// Helper function to get the appropriate ID based on element type
const getElementId = (
  element:
    | NsReactButtonProps
    | NsReactFieldProps
    | NsReactTableProps
    | NsReactChatbotProps
): string => {
  if (isNsReactButton(element)) {
    return element.buttonId;
  } else if (isNsReactField(element)) {
    return element.fieldId;
  } else if (isNsReactTable(element)) {
    return element.tableId;
  } else if (isNsReactChatbot(element)) {
    return element.chatbotId;
  }
  return '';
};

/**
 * Adds a new NsReactFormGridElement to the end of a NsReactFormGridRow
 *
 * @param rows - Array of NsReactFormGridRows that will have the element added
 * @param rowIndex - Index of row to append the element to
 * @param newElements - Array of NsReactFormGridElements to append
 * @returns NsReactFormGridRows with new elements included
 */
export const appendElementsToGridRow = async (
  rows: NsReactFormGridElementProps[][],
  rowIndex: number,
  newElements: NsReactFormGridElementProps[]
): Promise<NsReactFormGridElementProps[][]> => {
  if (rows[rowIndex] && rows[rowIndex].length) {
    const lastElementIndex = rows[rowIndex]
      .slice()
      .reverse()
      .findIndex(e => e.element === null);
    const newRow: NsReactFormGridElementProps[] = rows[rowIndex].slice(
      0,
      lastElementIndex
    );
    newElements.forEach(e => {
      newRow.push(e);
    });
    rows[rowIndex] = newRow;
  } else {
    rows[rowIndex] = newElements;
  }

  return rows;
};

/**
 * Gets an element from an array of NsReactFormGridElements
 *
 * @param id - id of the NsReactFormGridElement to return
 * @param elements - Array of NsReactFormGridElements to search
 * @returns - NsReactFormGridElement
 */
export const getElement = async (
  id: string,
  elements: NsReactFormGridElementProps[]
): Promise<NsReactFormGridElementProps | undefined> => {
  const elementMatch = (e: NsReactFormGridElementProps) =>
    e.element && getElementId(e.element) === id;
  return elements.find(elementMatch);
};

/**
 * Flattens an two-dimensional NsReactFormGridElementProps array (i.e. NsReactFormGridRows)
 * into a one-dimensional NsReactFormGridElementProps array (i.e. NsReactFormGridElements)
 *
 * @param rows - Array of NsReactFormGridRows
 * @returns Array of NsReactFormGridElements
 */
export const getElementsFromRows = (
  rows: NsReactFormGridElementProps[][]
): NsReactFormGridElementProps[] => {
  const elements: NsReactFormGridElementProps[] = [];
  if (rows && rows.length) {
    rows.forEach((row, rowIndex) => {
      row.forEach((e, elementIndex) => {
        if (e.element) {
          elements.push({
            element: e.element,
            width: e.width,
            rowIndex,
            elementIndex,
          });
        }
      });
    });
  }

  return elements;
};

/**
 * If rows contain thisElement, the element in the rows will be replaced by thisElement
 * Else, appends thisElement to rows as its own row
 *
 * @param rows - Array of NsReactFormGridRows to be checked for add/update
 * @param thisElement - NsReactFormGridElement to be added/updated
 * @returns NsReactFormGridRows with thisElement added/updated
 */
export const upsertElement = async (
  rows: NsReactFormGridElementProps[][],
  thisElement: NsReactFormGridElementProps
): Promise<NsReactFormGridElementProps[][]> => {
  if (thisElement.element) {
    const existingElement: NsReactFormGridElementProps | undefined =
      await getElement(
        getElementId(thisElement.element),
        getElementsFromRows(rows)
      );
    if (
      existingElement &&
      existingElement.rowIndex !== undefined &&
      existingElement.elementIndex !== undefined
    ) {
      rows[existingElement.rowIndex][existingElement.elementIndex] =
        thisElement;
      return rows;
    } else {
      rows.push([thisElement]);
      return rows;
    }
  }
  return rows;
};

/**
 * Adds data rows to a NsReactTable
 *
 * @param table - NsReactTable that rows will be added to
 * @param rows - NsReactTableRows that will be added
 * @returns
 */
export const upsertTableRows = async (
  table: NsReactTableProps,
  rows: NsReactTableRowProps[]
): Promise<NsReactTableProps> => {
  // Push new rows to table
  if (!table.value) {
    table.value = [];
  }

  for (const row of rows) {
    if (row.id) {
      table.value.push(row);
    }
  }

  return table;
};
