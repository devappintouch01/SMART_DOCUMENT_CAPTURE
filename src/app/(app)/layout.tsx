import Link from "next/link";
import { logout } from "../login/actions";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-black/10 bg-white dark:border-white/10 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-semibold">
            Smart Document Capture
          </Link>
          <form action={logout}>
            <button type="submit" className="text-sm text-neutral-500 hover:text-foreground">
              ออกจากระบบ
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
