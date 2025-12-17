import { Header } from "@/components/header";
import { KeyboardShortcutsTrigger } from "@/components/keyboard-shortcuts-trigger";
import { KeyboardShortcutProvider } from "@/lib/hooks/use-keyboard-shortcuts";
import { UserSettingsProvider } from "@/lib/hooks/use-user-settings";

export default function QREditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserSettingsProvider>
      <KeyboardShortcutProvider>
        <KeyboardShortcutsTrigger>
          <div className="relative isolate flex h-svh flex-col overflow-hidden">
            <Header />
            <main className="isolate flex flex-1 flex-col overflow-hidden">{children}</main>
          </div>
        </KeyboardShortcutsTrigger>
      </KeyboardShortcutProvider>
    </UserSettingsProvider>
  );
}

