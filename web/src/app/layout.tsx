import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '面试诊断 Agent',
  description: 'AI Agent 面试辅导系统',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
