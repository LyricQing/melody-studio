import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteName = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Melody Studio";

export const metadata: Metadata = {
  title: {
    default: `${siteName} — 多提供商音乐生成工作室`,
    template: `%s · ${siteName}`,
  },
  description:
    "连接你自己的 API Key，用 RunningHub、Replicate、fal.ai 或 OpenAI 兼容接口把文字变成音乐。无需注册，不保存密钥。",
  applicationName: siteName,
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0b12",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}