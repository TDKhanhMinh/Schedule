import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";

const labels = {
  light: "Chuyển sang giao diện tối",
  dark: "Chuyển sang giao diện hệ thống",
  system: "Chuyển sang giao diện sáng",
} as const;

export function ModeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const currentTheme = theme === "system" ? (resolvedTheme ?? "light") : (theme ?? "light");
  const nextTheme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={labels[theme as keyof typeof labels] ?? labels.light}
      onClick={() => setTheme(nextTheme)}
    >
      {theme === "system" ? <Monitor /> : currentTheme === "dark" ? <Moon /> : <Sun />}
      <span className="sr-only">{labels[theme as keyof typeof labels] ?? labels.light}</span>
    </Button>
  );
}
