import React from 'react';

import {
  NsReactFormGridElementProps,
  NsReactHandleActionInputProps,
  NsReactSetElementKeyInputProps,
  NsReactUserProps,
} from '../../domain';
import NsReactFormGridElement from '../NsReactFormGridElement';

export default function NsReactFormGridRow(props: {
  rowElements: NsReactFormGridElementProps[];
  rowIndex: number;
  onChange: any;
  formElements: NsReactFormGridElementProps[];
  userProps: NsReactUserProps;
  handleAction: (props: NsReactHandleActionInputProps) => Promise<any>;
  setElementKey: (props: NsReactSetElementKeyInputProps) => React.Key;
  apiBaseUrl?: string;
  apiToken?: string;
}) {
  const {
    apiBaseUrl,
    apiToken,
    rowElements,
    rowIndex,
    formElements,
    onChange,
    userProps,
    handleAction,
  } = props;

  const getElementKey = (
    e: NsReactFormGridElementProps,
    elementIndex: number
  ) => {
    if (e.key) {
      return e.key;
    } else {
      return props.setElementKey({ rowIndex, elementIndex });
    }
  };

  return (
    <>
      {rowElements.map((e: NsReactFormGridElementProps, index: number) => (
        <NsReactFormGridElement
          key={getElementKey(e, index)}
          rowIndex={props.rowIndex}
          element={e.element}
          width={e.width}
          onChange={onChange}
          formElements={formElements}
          handleAction={handleAction}
          userProps={userProps}
          apiBaseUrl={apiBaseUrl}
          apiToken={apiToken}
        />
      ))}
    </>
  );
}
