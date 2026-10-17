import "./globals.css";

export const metadata = {
  title: "ShopScroller — Find your next favorite thing",
  description:
    "Discover thoughtful finds, save what you love, and shop together on a budget.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
