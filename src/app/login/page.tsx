import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Smart Document Capture</h1>
        <p className="mt-1 text-sm text-neutral-500">
          ถอดข้อมูลจากเอกสารบัญชีด้วย AI
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
