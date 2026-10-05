import './globals.css';

export const metadata = { title: 'Lead Staging | Lapiz Blue', description: 'Review leads before they go to Zoho CRM' };
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#07060b' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Dancing Script for titles, Outfit for everything else */}
        <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600;700&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
