# SuiteReact

suitereact component library packaged for npm using [Vite](https://vitejs.dev/).

The package supports ESM and CommonJS imports, with declarations for TypeScript's
NodeNext and Bundler resolution modes:

```js
import { REST } from 'suitereact';
// CommonJS: const { REST } = require('suitereact');
```

Components use MUI/Emotion styling. There is no separate `dist/style.css` import.
Release checks exercise the packed package's runtime and TypeScript entry points.

**This library provides a framework for building React SPAs that can run in NetSuite _without writing any frontend code_**

## Table of Contents

**[Overview](#overview)**<br />
**[Component Architecture](#component-architecture)**<br />
**[Component API Docs](#component-api-docs)**<br />
\--**[NsReactFormGridRow](#nsreactformgridrow)**<br />
\--**[NsReactFormGridElement](#nsreactformgridelement)**<br />
\--**[NsReactButton](#nsreactbutton)**<br />
\--**[NsReactField](#nsreactfield)**<br />
\--**[NsReactDataGrid](#nsreactdatagrid)**<br />
\--**[NsReactChatbot](#nsreactchatbot)**<br />

## Overview

suitereact is based on a **fully-responsive 12 by &#8734; component grid.** Components can be added, removed, and manipulated on the grid to create unique user experiences within NetSuite.

Primary component types are:

- <b>Fields</b> &#8212; Match the <a href='https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4332671056.html'>ui/serverWidget FieldType</a> options, but are faster, more modern, and have some helpful features to boot.
- <b>Tables</b> &#8212; Allow users to quickly view, filter, and act on large groups of data.
- <b>Buttons</b> &#8212; Trigger <b>Client (Browser)</b> or <b>Server (SuiteCloud)</b> functions that can be strung together endlessly.
- <b>Chatbot</b> &#8212; AI-powered chat interface supporting multiple LLM providers with structured output capabilities.

**suitereact relies on the <a href="https://mui.com/material-ui/getting-started/overview/">Material UI (MUI) Open Source React Component library</a> as the basis for the component style. _This library adapts and augments these components for the SuiteCloud Platform._**

Using this package, the steps to creating a new app are simple:

1. Use **create-suitereact-app** to create a new app scaffold.
2. Define **suitereact form components** using TypeScript properties.
3. Create any **Client or Server functions** to be executed by buttons.

## Component Architecture

suitereact's base grid can be filled with **[NsReactFormGridRows](https://github.com/reddit/suitereact-mcp/tree/main/suitereact#nsreactformgridrow)**, which are comprised of:

- **[NsReactFormGridElements](https://github.com/reddit/suitereact-mcp/tree/main/suitereact#nsreactformgridelement)**, which are either:
  - **[NsReactButton](https://github.com/reddit/suitereact-mcp/tree/main/suitereact#nsreactbuttonprops)**
  - **[NsReactField](https://github.com/reddit/suitereact-mcp/tree/main/suitereact#nsreactfieldprops)**
  - **NsReactDataGrid**
  - **NsReactChatbot**

## Component API Docs

### NsReactFormGridRow

A NsReactFormGridRow is passed an array of NsReactFormGridElementProps and maps that array to NsReactFormGridElement components.

Each `NsReactFormGridElementProps` object passed to the `NsReactFormGridRow` must define a width from 1-12. **Each NsReactFormGridRow must contain elements with a total width of 12. If total element width !=12, the app's layout may not render as expected.**

### NsReactFormGridElement

Each `NsReactFormGridElement` must have a width. It can optionally contain a button, field, or table element. If no element is defined, the result will be a blank space of the defined width.

#### NsReactFormGridElementProps

|   Name    |                                                                                             Type                                                                                              | Mandatory | Default | Description                                                                       |
| :-------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-------: | :-----: | :-------------------------------------------------------------------------------- |
|  `width`  |                                                                                           `number`                                                                                            |  `true`   |         | Width of the grid element. Total width of elements in a single row must equal 12. |
| `element` | [NsReactButtonProps](#nsreactbuttonprops)<br />\| [NsReactFieldProps](#nsreactfieldprops)<br />\| [NsReactTableProps](#nsreacttableprops)<br />\| [NsReactChatbotProps](#nsreactchatbotprops) |  `false`  |         | Props defining the component to be added to the form                              |

### NsReactButton

The `NsReactButton` component is designed to trigger actions. Actions are functions that can be executed on the client or server.

- <b>Client</b> actions typically involve user interaction or adding/removing/updating app components.
- <b>Server</b> actions run via <a href='https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4387799403.html'>RESTlet</a> in your NetSuite environment, meaning you can easily leverage the full power of the SuiteCloud Platform.

Buttons can be added as a standalone component or embedded in a [NsReactDataGrid](#nsreactdatagrid) toolbar via the `actionButtons` prop.

#### NsReactButtonProps

|     Name      |                                                            Type                                                             | Mandatory | Default | Description                                                  |
| :-----------: | :-------------------------------------------------------------------------------------------------------------------------: | :-------: | :-----: | :----------------------------------------------------------- |
|  `buttonId`   |                                                          `string`                                                           |  `true`   |         | ID used to identify the element in functions.                |
|    `label`    |                                                          `string`                                                           |  `true`   |         | Label that will be displayed on the button.                  |
|   `onClick`   |                                          [NsReactActionProps](#nsreactactionprops)                                          |  `true`   |         | Action to be executed when the button is clicked             |
|   `hidden`    |                                                          `boolean`                                                          |  `false`  | `false` | If true, the button will be hidden.                          |
| `customStyle` | [React.CssProperties](https://use-form.netlify.app/interfaces/_node_modules__types_react_index_d_.react.cssproperties.html) |  `false`  |         | Custom CSS Properties to be applied to the button component. |

#### NsReactActionProps

|     Name     |                   Type                    | Mandatory | Default | Description                                                                                                                                                                                                                               |
| :----------: | :---------------------------------------: | :-------: | :-----: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   `action`   |                 `string`                  |  `true`   |         | Name of the function to be executed.                                                                                                                                                                                                      |
|  `paramIds`  |                `string[]`                 |  `false`  |         | Values of the elements matching these ids will be passed to the action function. If left blank, all element values will be passed.                                                                                                        |
| `onResponse` | [NsReactActionProps](#nsreactactionprops) |  `false`  |         | Action to be executed after this function is completed.<br /><br />Data returned by this function will be passed to the new action under the `inputData` property. <b>This provides the ability to string actions together endlessly.</b> |

### NsReactField

`NsReactField` components are designed to be similar to the SuiteScript 2.x [serverWidget.Field](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4325837128.html) object.

**_Select & Multiselect type fields support more dynamic search functionality and can be populated via:_**

- **`sourceStr` property** - Pass a [NetSuite Record Type ID](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4273205732.html) or Saved Search Internal ID, or by
- **`source` property** - Pass an array of NsReactSelectOption objects for predefined options.

**_HTML type fields combined with CSS `customStyle` properties can be used to completely customize the user experience._**

#### NsReactFieldProps

|       Name        |                                                            Type                                                             | Mandatory |  Default   | Description                                                                                                                                                                                                                                                                                             |
| :---------------: | :-------------------------------------------------------------------------------------------------------------------------: | :-------: | :--------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|     `fieldId`     |                                                          `string`                                                           |  `true`   |            | ID used to identify the element in functions.                                                                                                                                                                                                                                                           |
|      `label`      |                                                          `string`                                                           |  `true`   |            | Label displayed with the field. **For HTML type fields the Label should be the HTML markup**                                                                                                                                                                                                            |
|    `fieldType`    |                                            [NsReactFieldType](#nsreactfieldtype)                                            |  `true`   |            | NsReactFieldType enum dictates which component is rendered by the NsReactField component.                                                                                                                                                                                                               |
|     `source`      |                                                    NsReactSelectOption[]                                                    |  `false`  |            | Array of NsReactSelectOption objects for `SELECT`/`MULTISELECT` fields.<br /><br />This is used when you want to provide a predefined list of options.                                                                                                                                                  |
|    `sourceStr`    |                                                          `string`                                                           |  `false`  |            | String identifier for `SELECT`/`MULTISELECT` fields.<br /><br />Can be a [NetSuite Record Type ID](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4273205732.html) or Saved Search Internal ID. The system will automatically populate the select options using this identifier. |
|      `value`      |            `boolean`<br />\| `string`<br />\| `number`<br />\| NsReactSelectOption<br />\| NsReactSelectOption[]            |  `false`  |            | Value of the field. Type corresponds with the [NsReactFieldType](#nsreactfieldtype) Value Type.<br /><br />If a `value` prop is passed to a field, that will be the field's default value.                                                                                                              |
|     `hidden`      |                                                          `boolean`                                                          |  `false`  |  `false`   | If true, the field will be hidden.                                                                                                                                                                                                                                                                      |
|   `displayType`   |                                     [NsReactFieldDisplayType](#nsreactfielddisplaytype)                                     |  `false`  |  `NORMAL`  | Display type for the field.                                                                                                                                                                                                                                                                             |
| `multiSelectType` |                                                   NsReactMultiSelectType                                                    |  `false`  | `CLASSIC`  | Type of multiselect field to use.<br /><br />`CLASSIC` closely resembles the serverWidget multiselect field and is good for selecting large groups of options.<br /><br />`CHIP` has a more modern look and clearly displays selected options as they're picked.                                        |
|   `customStyle`   | [React.CssProperties](https://use-form.netlify.app/interfaces/_node_modules__types_react_index_d_.react.cssproperties.html) |  `false`  |            | Custom CSS Properties to be applied to the field component.                                                                                                                                                                                                                                             |
|   `inputStyle`    | [React.CssProperties](https://use-form.netlify.app/interfaces/_node_modules__types_react_index_d_.react.cssproperties.html) |  `false`  |            | Props applied to the Input element.<br /><br />It will be a FilledInput, OutlinedInput or Input component depending on the `variantType` prop value.                                                                                                                                                    |
|   `variantType`   |                                                   NsReactFieldVariantType                                                   |  `false`  | `OUTLINED` | [MUI TextField Variant](https://mui.com/material-ui/react-text-field/) to use as the base for the field.                                                                                                                                                                                                |

#### NsReactFieldType

|  Field Type   |     Value Type      | Description                                                                                                                                                                                                                                                                                                        |
| :-----------: | :-----------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  `CHECKBOX`   |      `boolean`      | Checkbox field to represent boolean values.                                                                                                                                                                                                                                                                        |
|  `CURRENCY`   |      `number`       | Currency field.                                                                                                                                                                                                                                                                                                    |
|    `DATE`     |      `string`       | Date field with the value returned in a `MM/DD/YYYY` formatted string.                                                                                                                                                                                                                                             |
|  `DATE_TIME`  |      `string`       | Date/Time field with the value returned in a `MM/DD/YYYY hh:mm A` formatted string.                                                                                                                                                                                                                                |
|    `EMAIL`    |      `string`       | Email field that uses the [validator.js module](https://www.npmjs.com/package/validator) to validate input on update.                                                                                                                                                                                              |
|    `FLOAT`    |      `number`       | Float field                                                                                                                                                                                                                                                                                                        |
|  `HELP_TEXT`  |      `string`       | [MUI Typography](https://mui.com/material-ui/react-typography/) component that uses the `body1` variant.<br /><br />The display can be updated by changing this variant's styling in the App's `ThemeProvider`.                                                                                                    |
|    `HTML`     |       `null`        | Use this field type to render HTML code within suitereact apps. Use the `label` prop to provide the HTML code and the `customStyle` prop to provide the CSS.                                                                                                                                                       |
|   `INTEGER`   |      `number`       | Integer field                                                                                                                                                                                                                                                                                                      |
| `MULTISELECT` |     `string[]`      | Multi-select field **- TO-DO**                                                                                                                                                                                                                                                                                     |
|    `PHONE`    |      `string`       | Phone number field. Input is validated by the [mui-tel-input](https://www.npmjs.com/package/mui-tel-input) module.<br /><br />Country defaults to US. **_Currently the following locales are supported:_ US**. **- TO-DO**                                                                                         |
|   `SELECT`    | NsReactSelectOption | Select type fields can be populated by passing an array of `NsReactSelectOption` objects to the `source` prop when defining the field or by setting `sourceStr` to a [NetSuite Record Type ID](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4273205732.html) or Saved Search Internal ID. |
|    `TEXT`     |      `string`       | Text field. **- TO-DO**                                                                                                                                                                                                                                                                                            |
| `TIME_OF_DAY` |      `string`       | Time field with the value returned in a `h:m A` formatted string.                                                                                                                                                                                                                                                  |

#### NsReactFieldDisplayType

| Display Type | Description                               |
| :----------: | :---------------------------------------- |
|  `DISABLED`  | Prevents a user from changing the field   |
|   `INLINE`   | The field appears as inline text          |
|   `NORMAL`   | The field appears as a normal input field |

### NsReactDataGrid

The Data Grid can be used to **view/filter/select data**, **export it to CSV or XSLX** files, and **perform actions** on that data.

Tables can be **populated by Saved Search, SuiteAnalytics Dataset ID, or SuiteQL query string**. You can also supply your own data or populate the table as the user interacts with your app

**Data Grid Source Types:**

The Data Grid supports three different source types for auto-populating data:

```typescript
// Saved Search Source
source: {
  type: NsReactTableSourceType.SEARCH,
  id: 'customsearch_my_search' // or numeric ID like '123'
}

// SuiteAnalytics Dataset Source
source: {
  type: NsReactTableSourceType.QUERY,
  id: 'my_dataset_id' // or numeric ID
}

// SuiteQL Query Source
source: {
  type: NsReactTableSourceType.SUITEQL,
  id: 'SELECT id, tranid, entity FROM transaction WHERE type = \'SalesOrd\''
}
```

Use the table toolbar to manipulate tables:

- <b>Density</b> &#8212; Changes the spacing between table rows.
- <b>Columns</b> &#8212; Can be hidden or made visible. These changes are reflected in export files.
- <b>Filter</b> &#8212; Operators are dynamic based on the column data type. <b>Multi-filter functionality is not yet supported</b>.
- <b>Export</b> &#8212; Table values via csv, xlsx, or print.
- <b>Quick Search</b> &#8212; For a string anywhere in the data grid.
- <b>Rows Per Page</b> &#8212; Defaults to 100, which is currently the maximum. This can be defined when creating the table.
- <b>Action Buttons</b> &#8212; Can be passed to the table, so the user can interact with its data.
- <b>Checkbox Selection</b> &#8212; Can be added to the data grid so you can act on user-selected data.

#### NsReactTableProps

|           Name           |                        Type                         | Mandatory | Default | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| :----------------------: | :-------------------------------------------------: | :-------: | :-----: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|        `tableId`         |                      `string`                       |  `true`   |         | ID used to identify the element in functions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
|         `title`          |                      `string`                       |  `false`  |         | Title to display at the top of the table.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
|   `checkboxSelection`    |                      `boolean`                      |  `false`  | `false` | If true, the first column will be for checkbox selection.<br /><br />When a row is selected by the user, the `selected` property on that [NsReactTableRowProps](#nsreacttablerowprops) object is set to `true`.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
|        `loading`         |                      `boolean`                      |  `false`  | `false` | If set to true, a loading overlay is displayed over the table and the user cannot interact with it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
|      `headerCells`       | [NsReactTableHeaderProps](#nsreacttableheaderprops) |  `false`  |  `[]`   | Array of `NsReactTableHeaderProps` objects that define the columns to be included in the Data Grid.<br /><br />These objects are mapped to [MUI Data Grid Column](https://mui.com/x/react-data-grid/column-definition/) objects.<br /><br />Type is automatically determined by table data, but defaults to `string` if there are any issues.                                                                                                                                                                                                                                                                                                                   |
|         `source`         |                 NsReactTableSource                  |  `false`  |         | Passing a `source` property allows you to auto-populate the Data Grid with rows from multiple sources:<br /><br />• **Saved Search** - Use `type: NsReactTableSourceType.SEARCH` with the search ID<br />• **SuiteAnalytics Dataset** - Use `type: NsReactTableSourceType.QUERY` with the dataset ID<br />• **SuiteQL Query** - Use `type: NsReactTableSourceType.SUITEQL` with the raw SuiteQL query string<br /><br />When setting the `id` of the `NsReactTableSource`, you can use either the character-based id (e.g. `customsearch_po_daily`) or numeric NetSuite Internal ID for searches/datasets, or the actual SuiteQL query string for SUITEQL type. |
|         `value`          |   [NsReactTableRowProps[]](#nsreacttablerowprops)   |  `false`  |  `[]`   | Array of `NsReactTableRowProps` objects that populates the Data Grid rows.<br />When supplying your own values, the custom `NsReactTableRowProps` keys must match the `id` prop of a `headerCells` to map correctly.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|     `actionButtons`      |     [NsReactButtonProps[]](#nsreactbuttonprops)     |  `false`  |         | Array of `NsReactButtonProps` objects to embed in the NsReactDataGridToolbar<br /><br />These work no differently than the normal [NsReactButton](#nsreactbutton) component, they just show up in the Data Grid, to indicate an action focused on table data.                                                                                                                                                                                                                                                                                                                                                                                                   |
|        `pageSize`        |                      `number`                       |  `false`  |  `100`  | 100 is currently the maximum due to a [limitation in MUI's open-source Data Grid](https://mui.com/x/react-data-grid/pagination/#size-of-the-page) component.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
|         `hidden`         |                      `boolean`                      |  `false`  | `false` | If set to true, the table will not be visible, but will still occupy it's spot on the suitereact component grid.<br /><br />This is a good way to dynamically display the results of actions in a new table.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
|      `hideToolbar`       |                      `boolean`                      |  `false`  | `false` | If set to true, the Data Grid toolbar will be simplified to only contain the Rows Per Page element.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `exportFileNameTemplate` |                      `string`                       |  `false`  |         | Template literal string to determine the name of the `.csv` & `.xlsx` export files.<br /><br />For example, if you want the export file to be something like `customer name-statement-05312023` you could use `${props.visibleRows[0].customer.label.toLowerCase()}-statement-${dayjs().format('MDDYYYY')}` as your `exportFileNameTemplate`.                                                                                                                                                                                                                                                                                                                   |

#### NsReactTableHeaderProps

|    Name     |         Type          | Mandatory | Default  | Description                                                                                                                                                                                                                                                                                                    |
| :---------: | :-------------------: | :-------: | :------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    `id`     |       `string`        |  `true`   |          | ID used to identify the column.<br /><br />This column will also be used as the `key` for the `NsReactTableRowProps` value of this column.                                                                                                                                                                     |
|   `label`   |       `string`        |  `true`   |          | Label displayed as the column header.                                                                                                                                                                                                                                                                          |
|   `align`   | TableCellAlignOptions |  `false`  | `CENTER` | Alignment of the header and the contents of the column.                                                                                                                                                                                                                                                        |
|  `visible`  |       `boolean`       |  `false`  |  `true`  | If set to `false`, the column will be hidden when the table renders.<br /><br />Visibility can still be toggled by the user via the `Columns` toolbar icon.                                                                                                                                                    |
| `appWidth`  |       `number`        |  `false`  |   `1`    | Sets the UI width of a column relative to the other columns.<br /><br />By default, all columns are equally spaced with a `appWidth` of `1`. So, if you set one column to have an `appWidth` of `2`, it will be twice as wide as the standard column.                                                          |
| `xlsxWidth` |       `number`        |  `false`  |          | Sets the width of the column when it is exported to an `.xslx` file.<br /><br />Number corresponds to [Excel's default character width](https://learn.microsoft.com/en-us/office/troubleshoot/excel/determine-column-widths).<br /><br />If no value is supplied, the default Excel column width will be used. |

#### NsReactTableRowProps

|     Name      |   Type    | Mandatory | Default | Description                                                                                                                                                                                                                                                                                                              |
| :-----------: | :-------: | :-------: | :-----: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     `id`      | `string`  |  `true`   |         | ID used to identify the row in the table.<br /><br />For NetSuite records, this should be the NetSuite Internal ID.                                                                                                                                                                                                      |
|    `type`     | `string`  |  `true`   |         | Type of row data.<br /><br />For NetSuite records, this should be the [NetSuite Record Type ID](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4273205732.html).                                                                                                                                  |
| `[x: string]` | `unknown` |  `false`  |         | You can provide any other `key/value` pairs to pass to the Data Grid.<br /><br />If a `key` matches the `id` prop of a `headerCell`, that data will be populated in that column.<br /><br />Type will be automatically inferred by the corresponding data values, but will default to `string` if it cannot be inferred. |
|  `selected`   | `boolean` |  `false`  | `false` | Only present if the table's `checkboxSelection` prop is set to `true`.<br /><br />Defaults to false. Set to true when a user checks the row's checkbox.                                                                                                                                                                  |
|   `visible`   | `boolean` |  `false`  | `true`  | Defaults to true. Set to false when a row is hidden via filter.                                                                                                                                                                                                                                                          |

### NsReactChatbot

The `NsReactChatbot` component provides an AI-powered chat interface that supports multiple LLM providers (OpenAI and OpenRouter) with optional structured output capabilities. **All AI requests are securely routed through a NetSuite RESTlet proxy that manages API keys using NetSuite's built-in API Secrets Management.**

#### Key Features

- **Secure API Key Management**: API keys are managed securely in NetSuite (Setup > Company > API Secrets)
- **Multi-Provider Support**: Supports OpenAI and OpenRouter APIs through unified proxy interface
- **Model Selection**: Dynamic dropdown to switch between available models
- **Structured Output**: Optional schema-based responses with automatic action triggers
- **Conversation History**: Persistent chat messages with timestamps
- **Real-time Processing**: Loading states and error handling
- **Customizable UI**: Configurable height, styling, and placeholders

#### NsReactChatbotProps

|        Name        |                            Type                             | Mandatory |         Default          | Description                                                |
| :----------------: | :---------------------------------------------------------: | :-------: | :----------------------: | :--------------------------------------------------------- |
|    `chatbotId`     |                          `string`                           |  `true`   |                          | ID used to identify the chatbot element in functions.      |
|   `clientConfig`   |     [NsReactChatClientConfig](#nsreactchatclientconfig)     |  `false`  |                          | Configuration for AI providers (OpenAI and/or OpenRouter). |
| `availableModels`  | [NsReactChatModelDefinition[]](#nsreactchatmodeldefinition) |  `false`  |      Default models      | Array of chat models available for selection.              |
|  `defaultModelId`  |                          `string`                           |  `false`  |     First available      | ID of the model to select by default.                      |
|      `title`       |                          `string`                           |  `false`  |  `'AI Chat Assistant'`   | Title displayed in the chatbot header.                     |
|   `placeholder`    |                          `string`                           |  `false`  | `'Type your message...'` | Placeholder text for the input field.                      |
|      `height`      |                          `string`                           |  `false`  |        `'400px'`         | Height of the chatbot container.                           |
|   `customStyle`    |                    `React.CSSProperties`                    |  `false`  |                          | Custom CSS properties for the container.                   |
|      `value`       |         [NsReactChatMessage[]](#nsreactchatmessage)         |  `false`  |           `[]`           | Array of chat messages for controlled state.               |
| `structuredOutput` |     [NsReactStructuredOutput](#nsreactstructuredoutput)     |  `false`  |                          | Schema for structured AI responses.                        |
|    `onResponse`    |          [NsReactActionProps](#nsreactactionprops)          |  `false`  |                          | Action to execute when receiving structured responses.     |
|   `handleAction`   |  `(props: NsReactHandleActionInputProps) => Promise<any>`   |  `false`  |                          | Function to handle action execution.                       |
|     `onChange`     |      `(props: NsReactHandleChangeInputProps) => void`       |  `false`  |                          | Callback for conversation changes.                         |

#### NsReactChatClientConfig

```typescript
interface NsReactChatClientConfig {
  systemContext?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
  restletUrl?: string; // Optional - defaults to standard LLM proxy RESTlet
}
```

#### NsReactChatModelDefinition

Model definition for the dropdown selector:

```typescript
interface NsReactChatModelDefinition {
  id: string; // Unique identifier
  name: string; // Display name
  model: string; // Provider model name
  clientType: 'openai' | 'openrouter';
}
```

#### NsReactStructuredOutput

Configuration for structured AI responses:

```typescript
interface NsReactStructuredOutput {
  name: string; // Schema name
  schema: ZodSchema; // Zod validation schema
}
```

#### Usage Example

```typescript
{
  element: {
    chatbotId: 'myBot',
    clientConfig: {
      systemContext: 'You are a helpful assistant.',
      defaultTemperature: 0.7,
      defaultMaxTokens: 10000
    },
    availableModels: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        model: 'gpt-4o',
        clientType: 'openai'
      },
      {
        id: 'claude-sonnet-4',
        name: 'Claude Sonnet 4 (OpenRouter)',
        clientType: 'openrouter',
        model: 'anthropic/claude-sonnet-4',
      },
    ],
    title: 'AI Assistant',
    height: '500px'
  },
  width: 6
}

// Advanced chatbot with structured output
{
  element: {
    chatbotId: 'queryBot',
    clientConfig: {
      systemContext: 'You are a NetSuite query expert.',
      defaultTemperature: 0.3,
      defaultMaxTokens: 15000
    },
    availableModels: [
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini (Fast & Economical)',
        model: 'gpt-4o-mini',
        clientType: 'openai'
      }
    ],
    structuredOutput: {
      name: 'queryResponse',
      schema: z.object({
        query: z.string(),
        confidence: z.number(),
        suggestions: z.array(z.string())
      })
    },
    onResponse: {
      action: 'handleQueryResponse',
      paramIds: ['queryBot']
    }
  },
  width: 8
}
```

#### Integration Notes

- **🔐 Secure Setup**: API keys are stored in NetSuite (Setup > Company > API Secrets) with script IDs:
  - `custsecret_openai_api_key` - Your OpenAI API key
  - `custsecret_openrouter_api_key` - Your OpenRouter API key
- **🏗️ Model Configuration**: Use `clientType` in model definitions to specify which API platform to use (supports OpenAI & OpenRouter)
- **📊 Structured Responses**: Use `structuredOutput` to specify the JSON structure of the model output. A `botExplanation` field will be automatically added for user-friendly display
- **⚡ Action Integration**: Use `onResponse` to interact with structured data returned by the LLM
- **🛠️ Error Handling**: Built-in error display for API failures and network issues
