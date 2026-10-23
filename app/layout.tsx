import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "McBeat · 今天这顿，有点节奏",
  description: "把餐盘变成一首歌。听、换一道菜、分享给朋友接着改编。",
  icons: { icon: "/favicon.svg" },
  referrer: "no-referrer",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
