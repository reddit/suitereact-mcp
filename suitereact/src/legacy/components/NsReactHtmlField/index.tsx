import React from 'react';

export default function NsReactHtmlField(props: {
  id: string;
  label: string;
  onChange: any;
  customStyle?: React.CSSProperties;
}) {
  return (
    <div
      dangerouslySetInnerHTML={{ __html: props.label }}
      style={props.customStyle}
    />
  );
}
