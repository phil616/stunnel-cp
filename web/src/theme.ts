import { createTheme } from "@mantine/core";
export const theme = createTheme({
  primaryColor: "forest",
  defaultRadius: "md",
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  colors: {
    forest: [
      "#eff7f2",
      "#dcece2",
      "#b9d9c5",
      "#93c5a7",
      "#72b48e",
      "#5ca97d",
      "#4d9b70",
      "#3d835c",
      "#2d6a48",
      "#245b3d",
    ],
  },
  fontSizes: {
    xs: "0.75rem",
    sm: "0.875rem",
    md: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
  },
  components: {
    Button: { defaultProps: { size: "sm", type: "button" } },
    TextInput: { defaultProps: { size: "sm", withAsterisk: false } },
    PasswordInput: { defaultProps: { size: "sm", withAsterisk: false } },
    NumberInput: { defaultProps: { size: "sm", withAsterisk: false } },
    NativeSelect: { defaultProps: { size: "sm", withAsterisk: false } },
    Textarea: { defaultProps: { size: "sm", withAsterisk: false } },
    Modal: {
      defaultProps: {
        centered: true,
        transitionProps: { duration: 100 },
        overlayProps: { backgroundOpacity: 0.4, blur: 2 },
      },
    },
  },
});
