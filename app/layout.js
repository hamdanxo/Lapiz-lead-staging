import './globals.css';

export const metadata = { title: 'Lead Staging | Lapiz Blue', description: 'Review leads before they go to Zoho CRM' };
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#030814' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Cormorant Garamond for titles, Nunito Sans for everything else */}
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Nunito+Sans:opsz,wght@6..12,300;6..12,400;6..12,600;6..12,700&display=swap" rel="stylesheet" />
      </head>
      <body><div className="backdrop" aria-hidden="true" /><div className="grain" aria-hidden="true" />{children}</body>
    </html>
  );
}
