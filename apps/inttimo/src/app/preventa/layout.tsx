import { PresaleShell } from "@/components/layout/PresaleShell";

export default function PresaleLayout({ children }: LayoutProps<"/preventa">) {
  return <PresaleShell>{children}</PresaleShell>;
}
