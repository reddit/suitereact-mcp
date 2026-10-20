import LoadingButton from '@mui/lab/LoadingButton';
import * as React from 'react';

import {
  NsReactActionProps,
  NsReactFormGridElementProps,
  NsReactHandleActionInputProps,
} from '../../domain';

export default function NsReactButton(props: {
  id: string;
  label: string;
  onClick: NsReactActionProps;
  formElements: NsReactFormGridElementProps[];
  handleAction: (props: NsReactHandleActionInputProps) => Promise<any>;
  params?: { [x: string]: unknown };
  customStyle?: React.CSSProperties;
}) {
  const [loading, setLoading] = React.useState<boolean>(false);

  const handleClick = () => {
    setLoading(true);
    props
      .handleAction({ actionProps: props.onClick, inputData: props.params })
      .then(() => {
        setLoading(false);
      })
      .catch(err => {
        console.error('handleClick error', err);
        setLoading(false);
      });
  };

  return (
    <LoadingButton
      sx={props.customStyle ? props.customStyle : { ml: 0.5 }}
      className="runActionButton"
      variant="contained"
      onClick={handleClick}
      loading={loading}
    >
      {props.label}
    </LoadingButton>
  );
}
