import UploadFileIcon from '@mui/icons-material/UploadFile';
import { Box, Button } from '@mui/material';
import * as React from 'react';

export default function NsReactFileField(props: {
  id: string;
  label: string;
  onChange: any;
}) {
  const [filename, setFilename] = React.useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) {
      return;
    }
    const file = e.target.files[0];
    const { name } = file;
    setFilename(name);

    const reader = new FileReader();
    reader.onload = evt => {
      if (!evt?.target?.result) {
        return;
      }
      const { result } = evt.target;
      props.onChange(result);
    };
    reader.readAsBinaryString(file);
  };

  return (
    <>
      <Button
        id={props.id}
        component="label"
        variant="outlined"
        startIcon={<UploadFileIcon />}
        sx={{ marginRight: '1rem' }}
      >
        {props.label}
        <input type="file" accept=".csv" hidden onChange={handleFileUpload} />
      </Button>
      <Box>{filename}</Box>
    </>
  );
}
