import { createTheme, type Components, type Theme } from '@mui/material/styles'

// Shared component overrides that are the same for both themes
const sharedComponents: Components<Theme> = {
  MuiModal: {
    styleOverrides: {
      root: {
        zIndex: 1400, // Above AppBar (1100) and default Modal (1300)
      },
    },
  },
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
        color: theme.palette.primary.main,
        textDecorationColor: theme.palette.primary.main,
        '&:hover': {
          color: theme.palette.primary.main,
          textDecorationColor: theme.palette.primary.main,
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
        color: '#ffffff',
        '&:hover': {
          backgroundColor: theme.palette.primary.dark,
          color: '#ffffff',
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
      outlinedWarning: ({ theme }) => ({
        '&:hover': {
          borderColor: theme.palette.warning.main,
          backgroundColor: `rgba(${parseInt(theme.palette.warning.main.slice(1, 3), 16)}, ${parseInt(theme.palette.warning.main.slice(3, 5), 16)}, ${parseInt(theme.palette.warning.main.slice(5, 7), 16)}, 0.08)`,
        },
      }),
      outlinedSuccess: ({ theme }) => ({
        '&:hover': {
          borderColor: theme.palette.success.main,
          backgroundColor: `rgba(${parseInt(theme.palette.success.main.slice(1, 3), 16)}, ${parseInt(theme.palette.success.main.slice(3, 5), 16)}, ${parseInt(theme.palette.success.main.slice(5, 7), 16)}, 0.08)`,
        },
      }),
      outlinedInfo: ({ theme }) => ({
        '&:hover': {
          borderColor: theme.palette.info.main,
          backgroundColor: `rgba(${parseInt(theme.palette.info.main.slice(1, 3), 16)}, ${parseInt(theme.palette.info.main.slice(3, 5), 16)}, ${parseInt(theme.palette.info.main.slice(5, 7), 16)}, 0.08)`,
        },
      }),
      outlinedError: ({ theme }) => ({
        '&:hover': {
          borderColor: theme.palette.error.main,
          backgroundColor: `rgba(${parseInt(theme.palette.error.main.slice(1, 3), 16)}, ${parseInt(theme.palette.error.main.slice(3, 5), 16)}, ${parseInt(theme.palette.error.main.slice(5, 7), 16)}, 0.08)`,
        },
      }),
      containedSuccess: ({ theme }) => ({
        backgroundColor: theme.palette.success.main,
        '&:hover': {
          backgroundColor: theme.palette.success.dark,
        },
      }),
      containedError: ({ theme }) => ({
        backgroundColor: theme.palette.error.main,
        '&:hover': {
          backgroundColor: theme.palette.error.dark,
        },
      }),
      containedInfo: ({ theme }) => ({
        backgroundColor: theme.palette.info.main,
        '&:hover': {
          backgroundColor: theme.palette.info.dark,
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
  components: sharedComponents,
})

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
  components: {...sharedComponents, MuiOutlinedInput: {
    styleOverrides: {
      root: ({ theme }) => ({
        '& .MuiOutlinedInput-notchedOutline': {
          borderColor: `rgba(${parseInt(theme.palette.secondary.main.slice(1, 3), 16)}, ${parseInt(theme.palette.secondary.main.slice(3, 5), 16)}, ${parseInt(theme.palette.secondary.main.slice(5, 7), 16)}, 0.8)`,
        },
        '&:hover .MuiOutlinedInput-notchedOutline': {
          borderColor: theme.palette.secondary.light,
        },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: theme.palette.secondary.light,
        },
      }),
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
},
})