'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Upload, PackageCheck, Users,
  BookOpen, Leaf, Menu, X
} from 'lucide-react';
import clsx from 'clsx';

const navLinks = [
  { href: '/',         label: 'Dashboard', icon: LayoutDashboard },
  { href: '/upload',   label: 'Upload',    icon: Upload },
  { href: '/picking',  label: 'Picking',   icon: PackageCheck },
  { href: '/partners', label: 'Partners',  icon: Users },
  { href: '/catalog',  label: 'Catalog',   icon: BookOpen },
];

export default function Navbar() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  const isActive = (href) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <>
      <nav className="bg-tea-800 text-white shadow-warm-lg sticky top-0 z-30">
        <div className="max-w-screen-2xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <Link href="/" className="flex items-center gap-2 flex-shrink-0">
              <div className="w-8 h-8 rounded-lg bg-tea-600 flex items-center justify-center">
                <Leaf className="w-4 h-4 text-tea-200" />
              </div>
              <span className="font-serif text-lg text-white tracking-wide">TSOT</span>
              <span className="text-tea-400 font-sans font-normal text-xs hidden sm:inline">
                Order Manager
              </span>
            </Link>

            {/* Desktop links */}
            <div className="hidden md:flex items-center gap-0.5">
              {navLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                    isActive(href)
                      ? 'bg-tea-400/20 text-tea-300 border border-tea-400/30'
                      : 'text-tea-300 hover:bg-tea-700 hover:text-white'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="md:hidden p-2 rounded-lg text-tea-300 hover:bg-tea-700 hover:text-white transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile drawer panel */}
      <div
        className={clsx(
          'fixed top-0 right-0 bottom-0 w-72 bg-tea-800 z-50 shadow-warm-lg flex flex-col md:hidden',
          'transform transition-transform duration-300',
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-tea-700">
          <div className="flex items-center gap-2">
            <Leaf className="w-5 h-5 text-tea-400" />
            <span className="font-serif text-lg text-white">TSOT CRM</span>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-2 rounded-lg text-tea-400 hover:bg-tea-700 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer links */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-all duration-150',
                isActive(href)
                  ? 'bg-tea-400/20 text-tea-300 border border-tea-400/30'
                  : 'text-tea-300 hover:bg-tea-700 hover:text-white'
              )}
            >
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-tea-700">
          <p className="text-xs text-tea-500">The Secret of Tea · Internal Tools</p>
        </div>
      </div>
    </>
  );
}
