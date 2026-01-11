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
    MuiLink: {
      styleOverrides: {
        root: ({ theme }) => ({
          color: theme.palette.primary.main,
          '&:hover': {
            color: theme.palette.primary.main,
            textDecorationColor: theme.palette.primary.main,
          },
        }),
      },
    },
  }
});
export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
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
      default: '#3a3a3a',
      paper: '#4a4a4a',
    },
    text: {
      primary: '#ffffff',
      secondary: '#b0b0b0',
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
    MuiLink: {
      styleOverrides: {
        root: ({ theme }) => ({
          color: theme.palette.secondary.main,
            textDecorationColor: theme.palette.secondary.main,

          '&:hover': {
            color: theme.palette.secondary.light,
            textDecorationColor: theme.palette.secondary.light,
          },
        }),
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(255, 255, 255, 0.23)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: theme.palette.primary.light,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: theme.palette.primary.light,
          },
        }),
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: ({ theme }) => ({
          '&.Mui-focused': {
            color: theme.palette.primary.light,
          },
        }),
      },
    },
    MuiButton: {
      styleOverrides: {
        containedPrimary: ({ theme }) => ({
          backgroundColor: theme.palette.primary.light,
          color: '#000000',
          '&:hover': {
            backgroundColor: theme.palette.primary.dark,
          },
        }),
        textPrimary: ({ theme }) => ({
          color: theme.palette.primary.light,
          '&:hover': {
            backgroundColor: `rgba(${parseInt(theme.palette.primary.main.slice(1, 3), 16)}, ${parseInt(theme.palette.primary.main.slice(3, 5), 16)}, ${parseInt(theme.palette.primary.main.slice(5, 7), 16)}, 0.08)`,
          },
        }),
        outlinedPrimary: ({ theme }) => ({
          color: theme.palette.primary.light,
          borderColor: theme.palette.primary.light,
          '&:hover': {
            borderColor: theme.palette.primary.light,
            backgroundColor: `rgba(${parseInt(theme.palette.primary.light.slice(1, 3), 16)}, ${parseInt(theme.palette.primary.main.slice(3, 5), 16)}, ${parseInt(theme.palette.primary.main.slice(5, 7), 16)}, 0.08)`,
          },
        }),
      },
    },
    MuiIconButton: {
      styleOverrides: {
        colorPrimary: ({ theme }) => ({
          color: theme.palette.primary.light,
          '&:hover': {
            backgroundColor: `rgba(${parseInt(theme.palette.primary.main.slice(1, 3), 16)}, ${parseInt(theme.palette.primary.main.slice(3, 5), 16)}, ${parseInt(theme.palette.primary.main.slice(5, 7), 16)}, 0.08)`,
          },
        }),
      },
    },
  }
});