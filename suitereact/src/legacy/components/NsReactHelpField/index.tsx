import Typography from '@mui/material/Typography';
import { SxProps } from '@mui/system';

export default function NsReactHelpField(props: {
  id: string;
  label: string;
  onChange: any;
  customStyle?: SxProps;
}) {
  return (
    <Typography variant="body1" sx={props.customStyle}>
      {props.label}
    </Typography>
  );
}
