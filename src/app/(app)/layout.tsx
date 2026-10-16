import Image from "next/image";
import Link from "next/link";
import { getRole } from "@/lib/session";
import { logout } from "../login/actions";

const navLink = "py-1 text-sm whitespace-nowrap text-neutral-600 hover:text-foreground";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const superAdmin = (await getRole()) === "superadmin";
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-black/10 bg-white">
        {/* Phone: logo and account links on the first row, the menu on its own row below. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3">
          <Link href="/" className="flex items-center gap-3 font-semibold">
            <Image src="/appintouch-logo.png" alt="App Intouch" width={2539} height={519} priority className="h-7 w-auto" />
            <span className="hidden border-l border-black/15 pl-3 whitespace-nowrap md:inline">Smart Document Capture</span>
          </Link>
          <div className="order-2 ml-auto flex items-center gap-5 md:order-3">
            <Link href="/demo" className="text-xs whitespace-nowrap text-neutral-400 hover:text-foreground">
              รีเซ็ต demo
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="flex items-center gap-1.5 text-sm whitespace-nowrap text-primary hover:text-primary-hover"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12.5 6.5L16 10l-3.5 3.5M16 10H8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                ออกจากระบบ
              </button>
            </form>
          </div>
          <nav className="order-3 flex w-full gap-5 overflow-x-auto md:order-2 md:w-auto md:flex-1 md:gap-4">
            <Link href="/" className={navLink}>
              รายการเอกสาร
            </Link>
            <Link href="/upload" className={navLink}>
              อัปโหลด
            </Link>
            <Link href="/document-types" className={navLink}>
              ประเภทเอกสาร
            </Link>
            {superAdmin && (
              <Link href="/ai-dashboard" className={navLink}>
                แดชบอร์ด AI
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
