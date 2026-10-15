import Image from "next/image";
import Link from "next/link";
import { logout } from "../login/actions";

const navLink = "text-sm text-neutral-600 hover:text-foreground";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-3 font-semibold">
              <Image src="/appintouch-logo.png" alt="App Intouch" width={2539} height={519} priority className="h-7 w-auto" />
              <span className="border-l border-black/15 pl-3">Smart Document Capture</span>
            </Link>
            <nav className="flex gap-4">
              <Link href="/" className={navLink}>
                รายการเอกสาร
              </Link>
              <Link href="/upload" className={navLink}>
                อัปโหลด
              </Link>
              <Link href="/document-types" className={navLink}>
                ประเภทเอกสาร
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/demo" className="text-xs text-neutral-400 hover:text-foreground">
              รีเซ็ต demo
            </Link>
            <form action={logout}>
            <button type="submit" className="text-sm text-neutral-500 hover:text-foreground">
              ออกจากระบบ
            </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
