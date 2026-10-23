/**
 * Animated Toolbar Themes & Luxury Pro Badge Styles
 * High-fidelity vector illustrations and metadata matching design specs.
 */

export const TOOLBAR_THEMES = [
  {
    id: 'capy-cafe',
    name: 'Capy Café',
    desc: 'Warm coffee beans and a cozy capybara barista.',
    accent: '#f59e0b',
    flowGradient: 'linear-gradient(90deg, #f59e0b, #d97706, #b45309, #f59e0b)',
    headerBg: 'radial-gradient(ellipse at 85% 50%, rgba(245, 158, 11, 0.12) 0%, transparent 60%)',
    renderMascotSvg: () => `
      <svg viewBox="0 0 100 100" class="mascot-svg" width="60" height="60">
        <!-- Floating coffee beans -->
        <g class="bean-particles">
          <ellipse cx="18" cy="28" rx="6" ry="4" transform="rotate(-30 18 28)" fill="#78350f" opacity="0.8"/>
          <path d="M15 28 Q18 27 21 28" stroke="#451a03" stroke-width="1.2" fill="none"/>
          <ellipse cx="82" cy="35" rx="5" ry="3.5" transform="rotate(25 82 35)" fill="#78350f" opacity="0.8"/>
          <path d="M79 35 Q82 34 85 35" stroke="#451a03" stroke-width="1.2" fill="none"/>
          <ellipse cx="22" cy="75" rx="5.5" ry="3.8" transform="rotate(45 22 75)" fill="#78350f" opacity="0.65"/>
        </g>
        <!-- Steam swirls -->
        <path class="steam-float" d="M68 50 Q72 42 69 36 T73 28" fill="none" stroke="#fef08a" stroke-width="2" stroke-linecap="round" opacity="0.75"/>
        <path class="steam-float-delay" d="M74 52 Q77 46 75 40 T78 32" fill="none" stroke="#fef08a" stroke-width="1.6" stroke-linecap="round" opacity="0.6"/>
        <!-- Capybara Body & Head -->
        <g class="capy-character">
          <path d="M30 85 C30 55 42 45 62 45 C78 45 88 56 88 85 Z" fill="#92400e"/>
          <!-- Head -->
          <rect x="36" y="32" width="40" height="34" rx="14" fill="#b45309"/>
          <!-- Snout / Muzzle -->
          <rect x="48" y="44" width="32" height="24" rx="10" fill="#78350f"/>
          <!-- Nose & Smile -->
          <ellipse cx="74" cy="52" rx="4" ry="3" fill="#451a03"/>
          <path d="M74 55 Q73 60 67 60" stroke="#451a03" stroke-width="2" stroke-linecap="round" fill="none"/>
          <!-- Calm closed eye -->
          <path d="M52 46 Q56 42 60 46" stroke="#451a03" stroke-width="2.5" stroke-linecap="round" fill="none"/>
          <!-- Little ear -->
          <circle cx="38" cy="34" r="5" fill="#78350f"/>
          <circle cx="39" cy="34" r="3" fill="#92400e"/>
          <!-- Coffee Mug -->
          <rect x="62" y="58" width="18" height="22" rx="4" fill="#fef3c7"/>
          <path d="M80 62 C85 62 85 74 80 74" stroke="#fef3c7" stroke-width="3" fill="none"/>
          <rect x="64" y="60" width="14" height="4" rx="2" fill="#78350f"/>
        </g>
      </svg>
    `
  },
  {
    id: 'cool-panda',
    name: 'Cool Panda',
    desc: 'Teal bubbles and a laid-back panda wave.',
    accent: '#14b8a6',
    flowGradient: 'linear-gradient(90deg, #14b8a6, #06b6d4, #10b981, #14b8a6)',
    headerBg: 'radial-gradient(ellipse at 85% 50%, rgba(20, 184, 166, 0.12) 0%, transparent 60%)',
    renderMascotSvg: () => `
      <svg viewBox="0 0 100 100" class="mascot-svg" width="60" height="60">
        <!-- Floating bubbles -->
        <g class="bubble-particles">
          <circle cx="18" cy="30" r="5" fill="none" stroke="#2dd4bf" stroke-width="1.5" opacity="0.7"/>
          <circle cx="20" cy="28" r="1.5" fill="#5eead4" opacity="0.9"/>
          <circle cx="82" cy="25" r="7" fill="none" stroke="#2dd4bf" stroke-width="1.8" opacity="0.6"/>
          <circle cx="84" cy="23" r="2" fill="#5eead4" opacity="0.8"/>
          <circle cx="24" cy="72" r="4" fill="none" stroke="#2dd4bf" stroke-width="1.2" opacity="0.5"/>
        </g>
        <!-- Panda Body with sporty jacket -->
        <g class="panda-character">
          <path d="M28 85 C28 62 42 55 58 55 C74 55 86 64 86 85 Z" fill="#0d9488"/>
          <!-- White jacket stripe & zipper -->
          <path d="M57 55 L57 85" stroke="#f8fafc" stroke-width="3"/>
          <path d="M42 66 L50 85" stroke="#f8fafc" stroke-width="2" opacity="0.7"/>
          <!-- Panda Head -->
          <circle cx="56" cy="40" r="22" fill="#f8fafc"/>
          <!-- Ears -->
          <circle cx="39" cy="23" r="7.5" fill="#1e293b"/>
          <circle cx="73" cy="23" r="7.5" fill="#1e293b"/>
          <!-- Eye patches -->
          <ellipse cx="47" cy="38" rx="6" ry="7.5" transform="rotate(-15 47 38)" fill="#1e293b"/>
          <ellipse cx="65" cy="38" rx="6" ry="7.5" transform="rotate(15 65 38)" fill="#1e293b"/>
          <!-- Eye glints -->
          <circle cx="48" cy="37" r="2" fill="#ffffff"/>
          <circle cx="64" cy="37" r="2" fill="#ffffff"/>
          <!-- Cute nose & grin -->
          <polygon points="56,45 53,49 59,49" fill="#1e293b"/>
          <path d="M53 50 Q56 53 59 50" stroke="#1e293b" stroke-width="1.5" fill="none"/>
          <!-- Waving paw -->
          <circle cx="82" cy="54" r="7" fill="#1e293b"/>
          <circle cx="82" cy="54" r="3.5" fill="#f43f5e" opacity="0.8"/>
        </g>
      </svg>
    `
  },
  {
    id: 'peace-goose',
    name: 'Peace Goose',
    desc: 'Soft sky ripples with a peaceful goose.',
    accent: '#38bdf8',
    flowGradient: 'linear-gradient(90deg, #38bdf8, #0ea5e9, #60a5fa, #38bdf8)',
    headerBg: 'radial-gradient(ellipse at 85% 50%, rgba(56, 189, 248, 0.12) 0%, transparent 60%)',
    renderMascotSvg: () => `
      <svg viewBox="0 0 100 100" class="mascot-svg" width="60" height="60">
        <!-- Ripple rings -->
        <g class="water-ripples">
          <ellipse cx="50" cy="80" rx="35" ry="8" fill="none" stroke="#38bdf8" stroke-width="1.5" opacity="0.5"/>
          <ellipse cx="50" cy="80" rx="24" ry="5.5" fill="none" stroke="#7dd3fc" stroke-width="1.2" opacity="0.6"/>
          <circle cx="18" cy="40" r="3" fill="#bae6fd" opacity="0.6"/>
          <circle cx="85" cy="55" r="2" fill="#bae6fd" opacity="0.5"/>
        </g>
        <!-- Goose Figure -->
        <g class="goose-character">
          <ellipse cx="52" cy="74" rx="22" ry="14" fill="#f8fafc"/>
          <!-- Neck & Head -->
          <path d="M42 74 C42 54 48 38 58 26 C64 26 68 30 66 38 C62 48 56 62 56 74 Z" fill="#f8fafc"/>
          <circle cx="62" cy="28" r="8" fill="#f8fafc"/>
          <!-- Beak -->
          <path d="M68 26 L80 30 L67 34 Z" fill="#f97316"/>
          <!-- Eye -->
          <circle cx="60" cy="27" r="1.8" fill="#0f172a"/>
          <!-- Peaceful feather line -->
          <path d="M40 70 Q52 75 64 68" stroke="#cbd5e1" stroke-width="1.5" fill="none"/>
        </g>
      </svg>
    `
  },
  {
    id: 'shiba-swagger',
    name: 'Shiba Swagger',
    desc: 'Amber sparkles and a shades-on shiba smirk.',
    accent: '#f59e0b',
    flowGradient: 'linear-gradient(90deg, #f59e0b, #fbbf24, #ea580c, #f59e0b)',
    headerBg: 'radial-gradient(ellipse at 85% 50%, rgba(245, 158, 11, 0.15) 0%, transparent 60%)',
    renderMascotSvg: () => `
      <svg viewBox="0 0 100 100" class="mascot-svg" width="60" height="60">
        <!-- Gold sparkles -->
        <g class="sparkle-particles">
          <path d="M82 25 L84 20 L86 25 L91 27 L86 29 L84 34 L82 29 L77 27 Z" fill="#fde047"/>
          <path d="M18 45 L19.5 41 L21 45 L25 46.5 L21 48 L19.5 52 L18 48 L14 46.5 Z" fill="#fde047" opacity="0.8"/>
        </g>
        <!-- Shiba Character -->
        <g class="shiba-character">
          <!-- Ears -->
          <polygon points="30,38 35,16 50,30" fill="#d97706"/>
          <polygon points="34,34 38,22 47,30" fill="#fef3c7"/>
          <polygon points="70,38 65,16 50,30" fill="#d97706"/>
          <polygon points="66,34 62,22 53,30" fill="#fef3c7"/>
          <!-- Head -->
          <ellipse cx="50" cy="50" rx="28" ry="25" fill="#f59e0b"/>
          <!-- White cheeks & muzzle -->
          <path d="M28 55 C28 68 40 74 50 74 C60 74 72 68 72 55 C72 48 68 44 60 48 C54 51 46 51 40 48 C32 44 28 48 28 55 Z" fill="#fffbeb"/>
          <!-- Eyebrow white dots -->
          <ellipse cx="38" cy="38" rx="3" ry="2" fill="#fffbeb"/>
          <ellipse cx="62" cy="38" rx="3" ry="2" fill="#fffbeb"/>
          <!-- Black Aviator Sunglasses -->
          <path d="M32 44 L48 45 L46 56 L34 55 Z" fill="#09090b" rx="2"/>
          <path d="M52 45 L68 44 L66 55 L54 56 Z" fill="#09090b" rx="2"/>
          <path d="M47 47 L53 47" stroke="#09090b" stroke-width="2.5"/>
          <!-- Sunglass White Gleams -->
          <line x1="36" y1="46" x2="42" y2="54" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" opacity="0.8"/>
          <line x1="56" y1="46" x2="62" y2="54" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" opacity="0.8"/>
          <!-- Nose & Smug smirk -->
          <ellipse cx="50" cy="58" rx="3.5" ry="2.5" fill="#18181b"/>
          <path d="M47 62 Q52 64 56 61" stroke="#18181b" stroke-width="2" stroke-linecap="round" fill="none"/>
        </g>
      </svg>
    `
  },
  {
    id: 'neon-hellion',
    name: 'Neon Hellion',
    desc: 'Electric embers and a mischievous devil skull.',
    accent: '#c084fc',
    flowGradient: 'linear-gradient(90deg, #c084fc, #ec4899, #a855f7, #c084fc)',
    headerBg: 'radial-gradient(ellipse at 85% 50%, rgba(192, 132, 252, 0.15) 0%, transparent 60%)',
    renderMascotSvg: () => `
      <svg viewBox="0 0 100 100" class="mascot-svg" width="60" height="60">
        <!-- Embers -->
        <g class="ember-particles">
          <circle cx="20" cy="25" r="2.5" fill="#f43f5e" opacity="0.8"/>
          <circle cx="80" cy="30" r="3" fill="#c084fc" opacity="0.9"/>
          <circle cx="85" cy="65" r="2" fill="#ec4899" opacity="0.7"/>
        </g>
        <!-- Demon Character -->
        <g class="hellion-character">
          <!-- Curved Horns -->
          <path d="M36 38 C32 20 22 14 18 16 C16 26 24 38 32 44 Z" fill="#9333ea" stroke="#c084fc" stroke-width="1.5"/>
          <path d="M64 38 C68 20 78 14 82 16 C84 26 76 38 68 44 Z" fill="#9333ea" stroke="#c084fc" stroke-width="1.5"/>
          <!-- Head Base -->
          <ellipse cx="50" cy="52" rx="25" ry="24" fill="#a855f7"/>
          <!-- Cheeks / Jaw -->
          <path d="M35 62 L42 76 L58 76 L65 62 Z" fill="#7e22ce"/>
          <!-- Glowing Eyes -->
          <polygon points="34,48 44,52 38,56" fill="#f43f5e"/>
          <circle cx="40" cy="52" r="1.5" fill="#ffffff"/>
          <polygon points="66,48 56,52 62,56" fill="#f43f5e"/>
          <circle cx="60" cy="52" r="1.5" fill="#ffffff"/>
          <!-- Cheeky Grin with tiny fangs -->
          <path d="M40 66 Q50 72 60 66" stroke="#fdf4ff" stroke-width="2" fill="#581c87"/>
          <polygon points="44,66 46,69 48,66" fill="#ffffff"/>
          <polygon points="52,66 54,69 56,66" fill="#ffffff"/>
        </g>
      </svg>
    `
  },
  {
    id: 'halo-bones',
    name: 'Halo Bones',
    desc: 'Soft golden halos and an angelic little skull.',
    accent: '#fbbf24',
    flowGradient: 'linear-gradient(90deg, #fbbf24, #60a5fa, #f59e0b, #fbbf24)',
    headerBg: 'radial-gradient(ellipse at 85% 50%, rgba(251, 191, 36, 0.15) 0%, transparent 60%)',
    renderMascotSvg: () => `
      <svg viewBox="0 0 100 100" class="mascot-svg" width="60" height="60">
        <!-- Floating Halo -->
        <g class="halo-glow">
          <ellipse cx="50" cy="22" rx="26" ry="7" fill="none" stroke="#fef08a" stroke-width="4.5" opacity="0.95" filter="drop-shadow(0 0 5px #f59e0b)"/>
          <ellipse cx="50" cy="22" rx="26" ry="7" fill="none" stroke="#ffffff" stroke-width="1.5"/>
        </g>
        <!-- Angelic Skull -->
        <g class="skull-character">
          <!-- Cranium -->
          <path d="M26 50 C26 34 36 28 50 28 C64 28 74 34 74 50 C74 60 68 64 64 66 L64 74 L36 74 L36 66 C32 64 26 60 26 50 Z" fill="#f8fafc"/>
          <!-- Eye Sockets (Cute Chibi Eyes) -->
          <ellipse cx="40" cy="48" rx="7" ry="9" fill="#0f172a"/>
          <circle cx="42" cy="45" r="2.5" fill="#ffffff"/>
          <ellipse cx="60" cy="48" rx="7" ry="9" fill="#0f172a"/>
          <circle cx="62" cy="45" r="2.5" fill="#ffffff"/>
          <!-- Heart nose notch -->
          <path d="M48 57 C48 55 52 55 52 57 L50 60 Z" fill="#0f172a"/>
          <!-- Smiling teeth -->
          <line x1="43" y1="68" x2="43" y2="74" stroke="#0f172a" stroke-width="1.8"/>
          <line x1="50" y1="68" x2="50" y2="74" stroke="#0f172a" stroke-width="1.8"/>
          <line x1="57" y1="68" x2="57" y2="74" stroke="#0f172a" stroke-width="1.8"/>
        </g>
      </svg>
    `
  },
  {
    id: 'duck-deluxe',
    name: 'Duck Deluxe',
    desc: 'Sunny starbursts and a shades-on duck thumbs-up.',
    accent: '#facc15',
    flowGradient: 'linear-gradient(90deg, #facc15, #38bdf8, #f59e0b, #facc15)',
    headerBg: 'radial-gradient(ellipse at 85% 50%, rgba(250, 204, 21, 0.15) 0%, transparent 60%)',
    renderMascotSvg: () => `
      <svg viewBox="0 0 100 100" class="mascot-svg" width="60" height="60">
        <!-- Sunburst sparks -->
        <g class="starburst-particles">
          <circle cx="16" cy="32" r="3.5" fill="#fde047" opacity="0.9"/>
          <circle cx="84" cy="26" r="4.5" fill="#fde047" opacity="0.9"/>
          <path d="M84 20 L84 32 M78 26 L90 26" stroke="#facc15" stroke-width="1.5"/>
        </g>
        <!-- Cool Duck -->
        <g class="duck-character">
          <ellipse cx="50" cy="68" rx="24" ry="18" fill="#facc15"/>
          <!-- Head -->
          <circle cx="50" cy="42" r="20" fill="#facc15"/>
          <!-- Tuft of feathers on top -->
          <path d="M48 22 Q52 14 56 22" stroke="#eab308" stroke-width="3" fill="none" stroke-linecap="round"/>
          <!-- Sunglasses -->
          <rect x="32" y="38" width="16" height="12" rx="3" fill="#09090b"/>
          <rect x="52" y="38" width="16" height="12" rx="3" fill="#09090b"/>
          <line x1="48" y1="42" x2="52" y2="42" stroke="#09090b" stroke-width="2"/>
          <line x1="35" y1="41" x2="41" y2="47" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="55" y1="41" x2="61" y2="47" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
          <!-- Smiling Bill -->
          <path d="M42 50 C42 46 58 46 58 50 C62 56 38 56 42 50 Z" fill="#f97316"/>
          <!-- Thumbs-up Wing -->
          <path d="M70 60 C76 56 84 52 86 58 C88 64 80 70 72 70 Z" fill="#eab308"/>
          <!-- Thumbs up tip -->
          <circle cx="86" cy="54" r="3" fill="#facc15"/>
        </g>
      </svg>
    `
  },
  {
    id: 'neon-deck-skull',
    name: 'Neon Deck Skull',
    desc: 'Electric equalizers and a skull spinning a midnight set.',
    accent: '#818cf8',
    flowGradient: 'linear-gradient(90deg, #818cf8, #ec4899, #06b6d4, #818cf8)',
    headerBg: 'radial-gradient(ellipse at 85% 50%, rgba(129, 140, 248, 0.15) 0%, transparent 60%)',
    renderMascotSvg: () => `
      <svg viewBox="0 0 100 100" class="mascot-svg" width="60" height="60">
        <!-- Equalizer waves -->
        <g class="eq-bars">
          <rect x="12" y="45" width="4" height="25" rx="2" fill="#06b6d4" opacity="0.8"/>
          <rect x="18" y="35" width="4" height="35" rx="2" fill="#ec4899" opacity="0.8"/>
          <rect x="78" y="32" width="4" height="38" rx="2" fill="#ec4899" opacity="0.8"/>
          <rect x="84" y="42" width="4" height="28" rx="2" fill="#818cf8" opacity="0.8"/>
        </g>
        <!-- DJ Skull -->
        <g class="dj-character">
          <!-- Skull Base -->
          <path d="M30 48 C30 32 40 26 50 26 C60 26 70 32 70 48 C70 58 65 62 62 64 L62 72 L38 72 L38 64 C35 62 30 58 30 48 Z" fill="#f8fafc"/>
          <!-- Headphones Headband -->
          <path d="M22 45 C22 22 78 22 78 45" fill="none" stroke="#8b5cf6" stroke-width="5" stroke-linecap="round"/>
          <!-- Headphone Earcups -->
          <rect x="20" y="42" width="8" height="18" rx="4" fill="#06b6d4"/>
          <rect x="72" y="42" width="8" height="18" rx="4" fill="#06b6d4"/>
          <!-- Neon Shades -->
          <path d="M33 44 L67 44 L64 54 L36 54 Z" fill="#1e1b4b" stroke="#ec4899" stroke-width="1.8"/>
          <line x1="38" y1="49" x2="62" y2="49" stroke="#06b6d4" stroke-width="2"/>
          <!-- Teeth -->
          <line x1="44" y1="67" x2="44" y2="72" stroke="#1e1b4b" stroke-width="2"/>
          <line x1="50" y1="67" x2="50" y2="72" stroke="#1e1b4b" stroke-width="2"/>
          <line x1="56" y1="67" x2="56" y2="72" stroke="#1e1b4b" stroke-width="2"/>
        </g>
      </svg>
    `
  },
  {
    id: 'blue-flame-reaper',
    name: 'Blue Flame Reaper',
    desc: 'Cold ghost flames and a bright-eyed reaper emerging from the dark.',
    accent: '#38bdf8',
    flowGradient: 'linear-gradient(90deg, #38bdf8, #0284c7, #22d3ee, #38bdf8)',
    headerBg: 'radial-gradient(ellipse at 85% 50%, rgba(56, 189, 248, 0.16) 0%, transparent 60%)',
    renderMascotSvg: () => `
      <svg viewBox="0 0 100 100" class="mascot-svg" width="60" height="60">
        <!-- Ghost Flames -->
        <g class="ghost-flames">
          <path d="M16 48 Q22 36 18 24 Q26 32 24 48 Z" fill="#38bdf8" opacity="0.6"/>
          <path d="M82 46 Q78 34 84 22 Q74 30 78 46 Z" fill="#38bdf8" opacity="0.6"/>
        </g>
        <!-- Hooded Reaper -->
        <g class="reaper-character">
          <!-- Hood Exterior -->
          <path d="M26 78 C24 45 32 24 50 20 C68 24 76 45 74 78 C65 74 58 76 50 74 C42 76 35 74 26 78 Z" fill="#0f172a" stroke="#0284c7" stroke-width="1.5"/>
          <!-- Hood Shadow Interior -->
          <ellipse cx="50" cy="52" rx="16" ry="18" fill="#020617"/>
          <!-- Piercing Cyan Glowing Eyes -->
          <ellipse cx="44" cy="50" rx="3.5" ry="4" fill="#38bdf8" filter="drop-shadow(0 0 4px #38bdf8)"/>
          <circle cx="44" cy="50" r="1.5" fill="#ffffff"/>
          <ellipse cx="56" cy="50" rx="3.5" ry="4" fill="#38bdf8" filter="drop-shadow(0 0 4px #38bdf8)"/>
          <circle cx="56" cy="50" r="1.5" fill="#ffffff"/>
        </g>
      </svg>
    `
  },
  {
    id: 'royal-skull-king',
    name: 'Royal Skull King',
    desc: 'Golden halos and a jewel-crowned ruler in royal purple.',
    accent: '#fbbf24',
    flowGradient: 'linear-gradient(90deg, #fbbf24, #a855f7, #f59e0b, #fbbf24)',
    headerBg: 'radial-gradient(ellipse at 85% 50%, rgba(251, 191, 36, 0.18) 0%, transparent 60%)',
    renderMascotSvg: () => `
      <svg viewBox="0 0 100 100" class="mascot-svg" width="60" height="60">
        <!-- Crown & Skull -->
        <g class="king-character">
          <!-- Regal Collar -->
          <path d="M30 76 C30 70 70 70 70 76 Z" fill="#581c87" stroke="#fbbf24" stroke-width="2"/>
          <!-- Skull Base -->
          <path d="M32 52 C32 38 40 32 50 32 C60 32 68 38 68 52 C68 62 64 66 61 68 L61 74 L39 74 L39 68 C36 66 32 62 32 52 Z" fill="#f8fafc"/>
          <!-- Eye Sockets -->
          <ellipse cx="43" cy="52" rx="5.5" ry="7" fill="#1e1b4b"/>
          <ellipse cx="57" cy="52" rx="5.5" ry="7" fill="#1e1b4b"/>
          <!-- Smile -->
          <line x1="45" y1="70" x2="45" y2="74" stroke="#1e1b4b" stroke-width="1.8"/>
          <line x1="50" y1="70" x2="50" y2="74" stroke="#1e1b4b" stroke-width="1.8"/>
          <line x1="55" y1="70" x2="55" y2="74" stroke="#1e1b4b" stroke-width="1.8"/>
          <!-- Jewel Crown -->
          <polygon points="30,34 32,18 42,26 50,14 58,26 68,18 70,34" fill="#fbbf24" stroke="#d97706" stroke-width="1.5"/>
          <!-- Crown Jewels -->
          <circle cx="32" cy="18" r="2" fill="#ef4444"/>
          <circle cx="50" cy="14" r="2.5" fill="#3b82f6"/>
          <circle cx="68" cy="18" r="2" fill="#10b981"/>
          <rect x="44" y="28" width="12" height="4" rx="1.5" fill="#ef4444"/>
        </g>
      </svg>
    `
  },
  {
    id: 'cyber-samurai',
    name: 'Cyber Samurai',
    desc: 'Neon cherry blossom sparks and a cyber-armored warrior.',
    accent: '#f43f5e',
    flowGradient: 'linear-gradient(90deg, #f43f5e, #fb7185, #e11d48, #f43f5e)',
    headerBg: 'radial-gradient(ellipse at 85% 50%, rgba(244, 63, 94, 0.16) 0%, transparent 60%)',
    renderMascotSvg: () => `
      <svg viewBox="0 0 100 100" class="mascot-svg" width="60" height="60">
        <!-- Floating Cherry Blossom Sparks -->
        <g class="cherry-particles">
          <ellipse cx="18" cy="30" rx="3.5" ry="5" transform="rotate(35 18 30)" fill="#fb7185" opacity="0.8"/>
          <ellipse cx="82" cy="28" rx="4" ry="2.5" transform="rotate(-20 82 28)" fill="#fda4af" opacity="0.85"/>
          <circle cx="86" cy="62" r="2.2" fill="#f43f5e" opacity="0.7"/>
          <circle cx="16" cy="70" r="2" fill="#f43f5e" opacity="0.6"/>
        </g>
        <!-- Cyber Samurai Character -->
        <g class="samurai-character">
          <!-- Kabuto Crest (Golden Horns) -->
          <path d="M50 20 L40 8 C48 14 52 14 60 8 Z" fill="#fbbf24" stroke="#d97706" stroke-width="1.2"/>
          <circle cx="50" cy="19" r="3" fill="#f43f5e"/>
          <!-- Helmet Dome -->
          <path d="M26 44 C26 26 36 20 50 20 C64 20 74 26 74 44 C74 52 68 56 68 56 L32 56 C32 56 26 52 26 44 Z" fill="#0f172a" stroke="#f43f5e" stroke-width="1.8"/>
          <!-- Neck Guards (Shikoro) -->
          <path d="M22 48 Q18 64 30 68" stroke="#e11d48" stroke-width="3" stroke-linecap="round" fill="none"/>
          <path d="M78 48 Q82 64 70 68" stroke="#e11d48" stroke-width="3" stroke-linecap="round" fill="none"/>
          <!-- Cyber Visor (Glowing Neon Slit) -->
          <path d="M34 40 L66 40 L62 48 L38 48 Z" fill="#030712" stroke="#38bdf8" stroke-width="1.5"/>
          <line x1="38" y1="44" x2="62" y2="44" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" filter="drop-shadow(0 0 3px #38bdf8)"/>
          <!-- Faceplate (Mempo) -->
          <path d="M34 50 L50 64 L66 50 L62 60 L50 68 L38 60 Z" fill="#1e293b" stroke="#f43f5e" stroke-width="1.2"/>
          <!-- Dual Katana Handles in background -->
          <line x1="20" y1="20" x2="32" y2="34" stroke="#e2e8f0" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="80" y1="20" x2="68" y2="34" stroke="#e2e8f0" stroke-width="2.5" stroke-linecap="round"/>
        </g>
      </svg>
    `
  },
  {
    id: 'astral-fox',
    name: 'Astral Fox',
    desc: 'Cosmic star trails and a mystical celestial kitsune.',
    accent: '#8b5cf6',
    flowGradient: 'linear-gradient(90deg, #8b5cf6, #c084fc, #6366f1, #8b5cf6)',
    headerBg: 'radial-gradient(ellipse at 85% 50%, rgba(139, 92, 246, 0.16) 0%, transparent 60%)',
    renderMascotSvg: () => `
      <svg viewBox="0 0 100 100" class="mascot-svg" width="60" height="60">
        <!-- Floating Stardust Stars -->
        <g class="astral-particles">
          <polygon points="16,24 18,29 23,30 19,34 20,39 16,36 12,39 13,34 9,30 14,29" fill="#c084fc" opacity="0.85"/>
          <circle cx="84" cy="34" r="2.5" fill="#a78bfa" opacity="0.9"/>
          <circle cx="20" cy="65" r="1.8" fill="#e9d5ff" opacity="0.75"/>
          <circle cx="80" cy="68" r="2.2" fill="#c084fc" opacity="0.8"/>
        </g>
        <!-- Kitsune Character -->
        <g class="fox-character">
          <!-- Fluffy Astral Tails -->
          <path d="M22 68 Q12 48 24 38 Q30 52 28 68 Z" fill="#7c3aed" opacity="0.7"/>
          <path d="M78 68 Q88 48 76 38 Q70 52 72 68 Z" fill="#7c3aed" opacity="0.7"/>
          <!-- Fox Ears -->
          <polygon points="32,40 34,14 48,32" fill="#8b5cf6"/>
          <polygon points="36,36 37,20 45,30" fill="#fdf4ff"/>
          <polygon points="68,40 66,14 52,32" fill="#8b5cf6"/>
          <polygon points="64,36 63,20 55,30" fill="#fdf4ff"/>
          <!-- Fox Head -->
          <path d="M30 46 C30 35 40 32 50 32 C60 32 70 35 70 46 C70 58 58 68 50 72 C42 68 30 58 30 46 Z" fill="#f8fafc"/>
          <!-- Celestial Markings (Crimson forehead diamond) -->
          <polygon points="50,38 52,43 50,48 48,43" fill="#c084fc"/>
          <!-- Slanted Fox Eyes -->
          <path d="M38 46 Q43 43 46 48" stroke="#4c1d95" stroke-width="2.5" stroke-linecap="round" fill="none"/>
          <path d="M62 46 Q57 43 54 48" stroke="#4c1d95" stroke-width="2.5" stroke-linecap="round" fill="none"/>
          <!-- Glowing Iris -->
          <circle cx="42" cy="46" r="1.8" fill="#a855f7"/>
          <circle cx="58" cy="46" r="1.8" fill="#a855f7"/>
          <!-- Nose & Smile -->
          <circle cx="50" cy="62" r="2.2" fill="#312e81"/>
          <path d="M48 65 Q50 67 52 65" stroke="#312e81" stroke-width="1.5" stroke-linecap="round" fill="none"/>
        </g>
      </svg>
    `
  },
  {
    id: 'pixel-knight',
    name: 'Pixel Knight',
    desc: 'Retro 8-bit emerald sparkles and a chibi paladin.',
    accent: '#10b981',
    flowGradient: 'linear-gradient(90deg, #10b981, #34d399, #059669, #10b981)',
    headerBg: 'radial-gradient(ellipse at 85% 50%, rgba(16, 185, 129, 0.16) 0%, transparent 60%)',
    renderMascotSvg: () => `
      <svg viewBox="0 0 100 100" class="mascot-svg" width="60" height="60">
        <!-- Floating Pixel Sparkles -->
        <g class="pixel-particles">
          <rect x="16" y="26" width="5" height="5" fill="#34d399" opacity="0.85"/>
          <rect x="80" y="32" width="6" height="6" fill="#6ee7b7" opacity="0.9"/>
          <rect x="22" y="68" width="4" height="4" fill="#10b981" opacity="0.75"/>
          <rect x="84" y="64" width="5" height="5" fill="#34d399" opacity="0.8"/>
        </g>
        <!-- 8-Bit Paladin Character -->
        <g class="knight-character">
          <!-- Helmet Plume (Emerald Feather) -->
          <rect x="47" y="14" width="6" height="12" fill="#10b981"/>
          <rect x="53" y="16" width="6" height="8" fill="#34d399"/>
          <rect x="43" y="18" width="4" height="6" fill="#059669"/>
          <!-- Knight Helmet Block -->
          <rect x="30" y="26" width="40" height="38" rx="6" fill="#e2e8f0" stroke="#0f172a" stroke-width="2"/>
          <!-- Helmet Crest Band -->
          <rect x="30" y="34" width="40" height="6" fill="#94a3b8"/>
          <!-- Visor Slit -->
          <rect x="34" y="42" width="32" height="8" rx="2" fill="#0f172a"/>
          <!-- Cute Glowing Eyes in Visor -->
          <rect x="40" y="44" width="6" height="4" fill="#34d399"/>
          <rect x="54" y="44" width="6" height="4" fill="#34d399"/>
          <!-- Visor Breathing Grill -->
          <line x1="44" y1="56" x2="44" y2="60" stroke="#0f172a" stroke-width="2"/>
          <line x1="50" y1="56" x2="50" y2="60" stroke="#0f172a" stroke-width="2"/>
          <line x1="56" y1="56" x2="56" y2="60" stroke="#0f172a" stroke-width="2"/>
          <!-- Shield Shoulder -->
          <rect x="22" y="52" width="10" height="20" rx="3" fill="#10b981" stroke="#0f172a" stroke-width="1.5"/>
          <rect x="24" y="56" width="6" height="12" fill="#34d399"/>
        </g>
      </svg>
    `
  },
  {
    id: 'phoenix-blaze',
    name: 'Phoenix Blaze',
    desc: 'Solar flare embers and a radiant celestial firebird.',
    accent: '#ff5722',
    flowGradient: 'linear-gradient(90deg, #ff5722, #f59e0b, #ef4444, #ff5722)',
    headerBg: 'radial-gradient(ellipse at 85% 50%, rgba(255, 87, 34, 0.18) 0%, transparent 60%)',
    renderMascotSvg: () => `
      <svg viewBox="0 0 100 100" class="mascot-svg" width="60" height="60">
        <!-- Floating Solar Embers -->
        <g class="phoenix-particles">
          <circle cx="16" cy="34" r="3" fill="#fbbf24" opacity="0.85"/>
          <circle cx="84" cy="24" r="3.5" fill="#f97316" opacity="0.8"/>
          <path d="M22 68 Q24 58 20 54 Q26 62 24 68 Z" fill="#ef4444" opacity="0.75"/>
          <circle cx="82" cy="62" r="2.5" fill="#f59e0b" opacity="0.85"/>
        </g>
        <!-- Phoenix Character -->
        <g class="phoenix-character">
          <!-- Solar Crest Plumes -->
          <path d="M46 12 Q50 6 56 14 Q52 18 46 16 Z" fill="#fbbf24"/>
          <path d="M50 16 Q58 8 64 18 Q58 22 50 20 Z" fill="#f97316"/>
          <path d="M42 18 Q40 10 46 22 Z" fill="#ef4444"/>
          <!-- Wings Spread -->
          <path d="M22 54 C16 40 28 32 38 42 C28 48 26 56 22 54 Z" fill="#f97316"/>
          <path d="M78 54 C84 40 72 32 62 42 C72 48 74 56 78 54 Z" fill="#f97316"/>
          <!-- Body & Head -->
          <ellipse cx="50" cy="54" rx="16" ry="20" fill="#ea580c"/>
          <circle cx="50" cy="32" r="14" fill="#f97316"/>
          <circle cx="50" cy="34" r="10" fill="#fde047"/>
          <!-- Piercing Amber Eyes -->
          <ellipse cx="44" cy="32" rx="2.5" ry="3.5" fill="#7c2d12"/>
          <circle cx="45" cy="31" r="1" fill="#ffffff"/>
          <ellipse cx="56" cy="32" rx="2.5" ry="3.5" fill="#7c2d12"/>
          <circle cx="57" cy="31" r="1" fill="#ffffff"/>
          <!-- Sharp Golden Beak -->
          <polygon points="50,36 45,42 55,42" fill="#fbbf24"/>
        </g>
      </svg>
    `
  },
  {
    id: 'mecha-cat',
    name: 'Mecha Cat',
    desc: 'Holographic radar rings and an ultra-cute cybernetic kitten.',
    accent: '#06b6d4',
    flowGradient: 'linear-gradient(90deg, #06b6d4, #38bdf8, #0ea5e9, #06b6d4)',
    headerBg: 'radial-gradient(ellipse at 85% 50%, rgba(6, 182, 212, 0.16) 0%, transparent 60%)',
    renderMascotSvg: () => `
      <svg viewBox="0 0 100 100" class="mascot-svg" width="60" height="60">
        <!-- Holographic Radar Wavelets -->
        <g class="radar-particles">
          <circle cx="20" cy="28" r="6" fill="none" stroke="#22d3ee" stroke-width="1.2" opacity="0.6"/>
          <circle cx="20" cy="28" r="2" fill="#67e8f9" opacity="0.9"/>
          <circle cx="82" cy="28" r="6" fill="none" stroke="#22d3ee" stroke-width="1.2" opacity="0.6"/>
          <circle cx="82" cy="28" r="2" fill="#67e8f9" opacity="0.9"/>
          <line x1="84" y1="64" x2="90" y2="60" stroke="#06b6d4" stroke-width="1.5" opacity="0.8"/>
        </g>
        <!-- Mecha Cat Character -->
        <g class="cat-character">
          <!-- Cyber Ears with LED tips -->
          <polygon points="30,36 32,16 48,30" fill="#0f172a" stroke="#06b6d4" stroke-width="1.5"/>
          <polygon points="34,32 35,22 44,28" fill="#22d3ee"/>
          <polygon points="70,36 68,16 52,30" fill="#0f172a" stroke="#06b6d4" stroke-width="1.5"/>
          <polygon points="66,32 65,22 56,28" fill="#22d3ee"/>
          <!-- Head Shell -->
          <ellipse cx="50" cy="48" rx="26" ry="22" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.8"/>
          <!-- Cyber Visor Glasses -->
          <rect x="30" y="40" width="40" height="15" rx="5" fill="#082f49" stroke="#06b6d4" stroke-width="1.5"/>
          <!-- Digital Cat Eyes (LED Segments) -->
          <ellipse cx="40" cy="47" rx="4" ry="5" fill="#22d3ee" filter="drop-shadow(0 0 3px #06b6d4)"/>
          <circle cx="41" cy="45" r="1.5" fill="#ffffff"/>
          <ellipse cx="60" cy="47" rx="4" ry="5" fill="#22d3ee" filter="drop-shadow(0 0 3px #06b6d4)"/>
          <circle cx="61" cy="45" r="1.5" fill="#ffffff"/>
          <!-- Cute Nose & Whisker Sensor Lines -->
          <polygon points="50,58 48,61 52,61" fill="#ec4899"/>
          <path d="M48 62 Q50 64 52 62" stroke="#0284c7" stroke-width="1.2" fill="none"/>
          <line x1="24" y1="54" x2="16" y2="52" stroke="#06b6d4" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="24" y1="58" x2="18" y2="60" stroke="#06b6d4" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="76" y1="54" x2="84" y2="52" stroke="#06b6d4" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="76" y1="58" x2="82" y2="60" stroke="#06b6d4" stroke-width="1.5" stroke-linecap="round"/>
        </g>
      </svg>
    `
  }
];

export const PRO_BADGE_STYLES = [
  { id: 'classic-violet', name: 'Classic Violet', icon: '◇', pillClass: 'pill-violet' },
  { id: 'royal-gold', name: 'Royal Gold', icon: '👑', pillClass: 'pill-gold' },
  { id: 'aurora-ring', name: 'Aurora Ring', icon: '◎', pillClass: 'pill-aurora' },
  { id: 'neon-pulse', name: 'Neon Pulse', icon: '⚡', pillClass: 'pill-neon' },
  { id: 'liquid-chrome', name: 'Liquid Chrome', icon: '🛡', pillClass: 'pill-chrome' },
  { id: 'ruby-pulse', name: 'Ruby Pulse', icon: '♥', pillClass: 'pill-ruby' },
  { id: 'holo-foil', name: 'Holo Foil', icon: '◇', pillClass: 'pill-holo' },
  { id: 'deep-galaxy', name: 'Deep Galaxy', icon: '✦', pillClass: 'pill-galaxy' },
  { id: 'emerald-circuit', name: 'Emerald Circuit', icon: '◎', pillClass: 'pill-emerald' },
  { id: 'mint-frost', name: 'Mint Frost', icon: '❄️', pillClass: 'pill-mint' },
  { id: 'solar-flare', name: 'Solar Flare', icon: '☀️', pillClass: 'pill-solar' },
  { id: 'cyber-neon', name: 'Cyber Neon', icon: '⚡', pillClass: 'pill-cyber' },
  { id: 'electric-lime', name: 'Electric Lime', icon: '✦', pillClass: 'pill-lime' },
  { id: 'cosmic-prism', name: 'Cosmic Prism', icon: '💎', pillClass: 'pill-prism' },
  { id: 'obsidian-gold', name: 'Obsidian Gold', icon: '★', pillClass: 'pill-obsidian' }
];
