/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['var(--font-playfair)', 'Georgia', 'serif'],
        sans:  ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      colors: {
        // tea-* mapped to TSOT brand palette so all existing tea-* classes auto-update
        tea: {
          50:  '#FDF8F3', // warm cream page bg
          100: '#F5EDE3', // light cream
          200: '#E8DDD3', // border/divider
          300: '#D4B896', // light gold
          400: '#C4956A', // brand secondary — gold/ochre accents
          500: '#A07550', // mid warm brown
          600: '#5B3A29', // brand primary — buttons, primary actions
          700: '#4A2E20', // darker brown
          800: '#3B2314', // darkest — navbar bg, headers
          900: '#2A1810', // near-black brown
        },
        // Additional semantic brand colours
        brand: {
          success: '#7A9B6D',   // muted sage green
          error:   '#C0392B',   // terracotta red
          warning: '#E8A317',   // warm amber
          'warning-bg': '#FFF8E1',
          'warning-border': '#C4956A',
        },
      },
      boxShadow: {
        'warm-sm': '0 1px 3px 0 rgba(91,58,41,0.08), 0 1px 2px -1px rgba(91,58,41,0.06)',
        'warm-md': '0 4px 6px -1px rgba(91,58,41,0.10), 0 2px 4px -2px rgba(91,58,41,0.08)',
        'warm-lg': '0 10px 15px -3px rgba(91,58,41,0.12), 0 4px 6px -4px rgba(91,58,41,0.08)',
      },
    },
  },
  plugins: [],
};
