import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

// Rendered on each request so the year follows the clock, not the build date.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
      <div className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Smart Document Capture</h1>
        <p className="mt-1 text-sm text-neutral-500">
          ถอดข้อมูลจากเอกสารด้วย AI
        </p>
        <LoginForm />
      </div>
      <p className="text-xs text-neutral-400">powered by App Intouch {new Date().getFullYear()}</p>
    </main>
  );
}
