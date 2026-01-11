import { createTheme } from '@mui/material/styles'

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#003162',
      light: '#42a5f5',
      dark: '#1565c0',
    },
    secondary: {
      main: '#fecf18',
      light: '#fed54a',
      dark: '#cab210',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
    text: {
      primary: '#212121',
      secondary: '#757575',
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        colorPrimary: {
          backgroundColor: '#003162',
          color: '#ffffff',
        },
      },
    },
  }
});
