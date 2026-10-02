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
  { id: 'emerald-circuit', name: 'Emerald Circuit', icon: '◎', pillClass: 'pill-emerald' }
];
