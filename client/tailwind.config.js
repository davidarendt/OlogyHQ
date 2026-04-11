/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Rebrand palette — branch: rebrand-palette
        // Previously: orange-500 = Tailwind default #f97316, brand inline = #FF6B00
        orange: {
          50:  '#fef4ef',
          100: '#fde8db',
          200: '#fbc9b3',
          300: '#f8a07a',
          400: '#f47a50',
          500: '#F05A28', // brand primary (was #FF6B00)
          600: '#D94F22',
          700: '#b33f1a',
          800: '#8c3214',
          900: '#66240e',
        },
        // gray overridden with zinc values — less blue, more neutral/warm
        // Previously: Tailwind default gray (blue-tinted)
        gray: {
          50:  '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
          950: '#09090b',
        },
        cream: '#F2EDE4',   // warm off-white from brand card
        midgray: '#636363', // mid grey tone added per rebrand
      },
    },
  },
  plugins: [],
}