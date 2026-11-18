import type { Metadata } from "next";
import "./globals.css";
import ThemeRegistry from "@/theme/ThemeRegistry";

export const metadata: Metadata = {
  title: "Expo-Lanes · 纯数字指数赛道竞速实验室",
  description:
    "零技能、100% 纯数学算符驱动的指数赛道竞速与动态赔率竞猜平台。支持超大数 BigFloat 运算、120Hz 确定性物理模拟、筹码复利竞猜与沙盒出题分享。",
  keywords: [
    "Expo-Lanes",
    "指数增长",
    "数学模拟",
    "电子斗蛐蛐",
    "大数字游戏",
    "沙盒竞速",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="dark" suppressHydrationWarning>
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
