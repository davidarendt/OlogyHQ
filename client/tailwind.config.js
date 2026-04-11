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
        cream: '#F2EDE4',   // warm off-white from brand card
        midgray: '#636363', // mid grey tone added per rebrand
      },
    },
  },
  plugins: [],
}