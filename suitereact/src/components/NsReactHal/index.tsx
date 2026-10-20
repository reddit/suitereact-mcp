import { styled } from '@mui/system';
import * as React from 'react';

const HalBorder = styled('div')({
  position: 'relative',
  height: '436px',
  width: '416px',
  margin: '0px auto 60px auto',
  borderRadius: '4px',
  backgroundImage: `linear-gradient(
    -180deg,
    #aeaeae 0%,
    #787878 12%,
    #717171 100%
  )`,
  boxShadow: '1px 3px 5px 1px rgba(0, 0, 0, 0.81)',
});

const HalBox = styled('div')({
  position: 'absolute',
  top: '8px',
  left: '8px',
  height: '420px',
  width: '400px',
  borderRadius: '1px',
  background: '#1e1e1e',
  boxShadow: 'inset 0px 3px 5px 2px rgba(0, 0, 0, 0.69)',
});

const OuterSocket = styled('div')({
  position: 'absolute',
  left: '24px',
  top: '36px',
  height: '352px',
  width: '352px',
  borderRadius: '1000px',
  backgroundImage: `linear-gradient(
    -180deg,
    #c5acac 0%,
    #b1a8a8 34%,
    #564d4d 50%,
    #3f3535 100%
  )`,
  boxShadow: '0px 2px 2px 0px rgba(0, 0, 0, 0.81)',
});

const InnerSocket = styled('div')({
  position: 'absolute',
  top: '10px',
  left: '10px',
  height: '332px',
  width: '332px',
  borderRadius: '1000px',
  backgroundImage: `linear-gradient(
    -180deg,
    #644a4a 0%,
    #6a5151 44%,
    #bca9a9 53%,
    #cbbaba 100%
  )`,
});

const Eye = styled('div')({
  position: 'absolute',
  top: '16px',
  left: '16px',
  height: '300px',
  width: '300px',
  borderRadius: '1000px',
  background: `radial-gradient(
    #fffeee 0%,
    #fff000 5%,
    #ff0000 8%,
    #870000 22%,
    #290000 27%,
    #290707 37%,
    #3d0a0a 42%,
    #270c0c 47%,
    #1e0c0c 100%
  )`,
  border: '1px solid #111',
  boxSizing: 'border-box',
  transition: 'all 0.2s',
  '&:hover': {
    background: `radial-gradient(
      #fffeee 0%,
      #fff000 5%,
      #ff0000 8%,
      #870000 23%,
      #290000 28%,
      #290707 39%,
      #3d0a0a 42%,
      #270c0c 47%,
      #1e0c0c 100%
    )`,
    border: '1px solid red',
  },
});

export default function NsReactHal() {
  return (
    <HalBorder>
      <HalBox>
        <OuterSocket>
          <InnerSocket>
            <Eye></Eye>
          </InnerSocket>
        </OuterSocket>
      </HalBox>
    </HalBorder>
  );
}
