import { redirect } from 'next/navigation';
import { currentUser } from '@/server/lib/auth';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  if (await currentUser()) redirect('/dashboard');
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[380px] rounded-xl border border-border bg-surface p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-[14px] font-bold text-white">TM</span>
          <div className="leading-tight">
            <h1 className="text-[18px] font-semibold">Tools Management</h1>
            <p className="text-[13px] text-muted">เข้าสู่ระบบสำหรับเจ้าหน้าที่</p>
          </div>
        </div>
        <LoginForm />
        {process.env.SIMULATOR_ENABLED === 'true' && (
          <p className="mt-6 border-t border-divider pt-4 text-[12px] text-muted">
            สภาพแวดล้อมทดสอบ: บัญชีตัวอย่างอยู่ในคู่มือทดสอบ · <a className="text-accent underline" href="/simulator">เปิด LINE Simulator</a>
          </p>
        )}
      </div>
    </main>
  );
}
