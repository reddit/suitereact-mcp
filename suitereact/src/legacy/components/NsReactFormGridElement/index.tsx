import Box from '@mui/material/Box';
import React from 'react';

import {
  isNsReactButton,
  isNsReactChatbot,
  isNsReactField,
  isNsReactTable,
  NsReactButtonProps,
  NsReactChatbotProps,
  NsReactFieldProps,
  NsReactFormGridElementProps,
  NsReactHandleActionInputProps,
  NsReactHandleChangeInputProps,
  NsReactTableProps,
  NsReactUserProps,
} from '../../domain';
import NsReactButton from '../NsReactButton';
import NsReactChatbot from '../NsReactChatbot';
import NsReactDataGrid from '../NsReactDataGrid';
import NsReactField from '../NsReactField';

export default function NsReactGridElement(props: {
  element?:
    | NsReactButtonProps
    | NsReactFieldProps
    | NsReactTableProps
    | NsReactChatbotProps;
  rowIndex: number;
  width: number;
  onChange: (props: NsReactHandleChangeInputProps) => void;
  formElements: NsReactFormGridElementProps[];
  userProps: NsReactUserProps;
  handleAction: (props: NsReactHandleActionInputProps) => Promise<any>;
  apiBaseUrl?: string;
  apiToken?: string;
}) {
  return (
    <Box
      sx={{
        gridRow: props.rowIndex,
        gridColumn: 'span ' + props.width,
      }}
    >
      {props.element &&
        isNsReactButton(props.element) &&
        props.element.hidden !== true && (
          <NsReactButton
            id={props.element.buttonId}
            label={props.element.label}
            onClick={props.element.onClick}
            formElements={props.formElements}
            handleAction={props.handleAction}
            params={props.element.params}
            customStyle={props.element.customStyle}
          />
        )}
      {props.element &&
        isNsReactField(props.element) &&
        props.element.hidden !== true && (
          <NsReactField
            id={props.element.fieldId}
            label={props.element.label}
            fieldType={props.element.fieldType}
            onChange={props.onChange}
            source={props.element.source}
            sourceStr={props.element.sourceStr}
            value={props.element.value}
            displayType={props.element.displayType}
            multiSelectType={props.element.multiSelectType}
            customStyle={props.element.customStyle}
            inputStyle={props.element.inputStyle}
            variantType={props.element.variantType}
            apiBaseUrl={props.apiBaseUrl}
            apiToken={props.apiToken}
          />
        )}
      {props.element &&
        isNsReactTable(props.element) &&
        props.element.hidden !== true && (
          <NsReactDataGrid
            id={props.element.tableId}
            title={props.element.title}
            source={props.element.source}
            headerCells={props.element.headerCells}
            value={props.element.value}
            pageSize={props.element.pageSize ? props.element.pageSize : 100}
            hideToolbar={props.element.hideToolbar === true ? true : false}
            actionButtons={props.element.actionButtons}
            checkboxSelection={
              props.element.checkboxSelection
                ? props.element.checkboxSelection
                : false
            }
            userProps={props.userProps}
            loading={props.element.loading === true ? true : false}
            onChange={props.onChange}
            formElements={props.formElements}
            handleAction={props.handleAction}
            exportFileNameTemplate={
              props.element.exportFileNameTemplate ||
              "suitereact-table-export-${dayjs().format('YYYY-MM-DDTHH:mm:ss')}"
            }
            apiBaseUrl={props.apiBaseUrl}
            apiToken={props.apiToken}
          />
        )}
      {props.element &&
        isNsReactChatbot(props.element) &&
        props.element.hidden !== true && (
          <NsReactChatbot
            id={props.element.chatbotId}
            clientConfig={props.element.clientConfig}
            availableModels={props.element.availableModels}
            defaultModelId={props.element.defaultModelId}
            title={props.element.title}
            placeholder={props.element.placeholder}
            height={props.element.height}
            customStyle={props.element.customStyle}
            value={props.element.value}
            structuredOutput={props.element.structuredOutput}
            onResponse={props.element.onResponse}
            handleAction={props.handleAction}
            onChange={props.onChange}
            allowHtml={props.element.allowHtml}
            apiBaseUrl={props.apiBaseUrl}
            apiToken={props.apiToken}
          />
        )}
    </Box>
  );
}
