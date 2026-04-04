import './globals.css';
import { Playfair_Display, Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import Navbar from '@/components/Navbar';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  title: 'TSOT CRM — Order Management',
  description: 'The Secret of Tea — Internal Order Management System',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-tea-50 font-sans">
        <Navbar />
        <main className="max-w-screen-2xl mx-auto px-4 py-6">{children}</main>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              borderRadius: '12px',
              background: '#fff',
              color: '#3B2314',
              border: '1px solid #E8DDD3',
              fontSize: '14px',
              fontFamily: 'var(--font-inter)',
              boxShadow: '0 10px 15px -3px rgba(91,58,41,0.12)',
            },
            success: { iconTheme: { primary: '#7A9B6D', secondary: '#fff' } },
            error:   { iconTheme: { primary: '#C0392B', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  );
}
