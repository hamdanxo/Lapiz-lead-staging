import './globals.css';

export const metadata = { title: 'Lead Staging | Lapiz Blue', description: 'Review leads before they go to Zoho CRM' };
export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
