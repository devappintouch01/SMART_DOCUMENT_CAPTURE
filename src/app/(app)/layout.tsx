import Link from "next/link";
import { logout } from "../login/actions";

const navLink = "text-sm text-neutral-600 hover:text-foreground";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold">
              Smart Document Capture
            </Link>
            <nav className="flex gap-4">
              <Link href="/" className={navLink}>
                รายการเอกสาร
              </Link>
              <Link href="/upload" className={navLink}>
                อัปโหลด
              </Link>
            </nav>
          </div>
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
