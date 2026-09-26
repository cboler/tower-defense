import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const outputDir = path.resolve('public/assets/monsters');

// 1. Generate Swiftbeak Battle Sprite (185x195 transparent PNG)
// An original, fierce razor-crested raptor runner in an aerodynamic sprint posture
const swiftbeakSpriteSvg = `
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Gradients -->
    <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="45%" stop-color="#0369a1" />
      <stop offset="100%" stop-color="#0c4a6e" />
    </linearGradient>

    <linearGradient id="crestGrad" x1="0%" y1="0%" x2="100%" y2="50%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="50%" stop-color="#0ea5e9" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>

    <linearGradient id="beakGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e2e8f0" />
      <stop offset="50%" stop-color="#94a3b8" />
      <stop offset="100%" stop-color="#475569" />
    </linearGradient>

    <linearGradient id="wingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="40%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#082f49" />
    </linearGradient>

    <linearGradient id="legGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#64748b" />
      <stop offset="100%" stop-color="#334155" />
    </linearGradient>

    <linearGradient id="windTrail" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0" />
      <stop offset="50%" stop-color="#38bdf8" stop-opacity="0.4" />
      <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
    </linearGradient>

    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Ground Shadow -->
  <ellipse cx="120" cy="225" rx="55" ry="12" fill="#05131f" opacity="0.6" />

  <!-- Speed Wind Streaks behind runner -->
  <path d="M 20 120 Q 60 115 90 125" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" opacity="0.45" />
  <path d="M 10 145 Q 50 140 85 150" stroke="#0ea5e9" stroke-width="3" stroke-linecap="round" opacity="0.5" />
  <path d="M 30 170 Q 70 168 100 175" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" opacity="0.4" />

  <!-- Back Leg (Trailing in sprint) -->
  <g id="back-leg">
    <!-- Thigh -->
    <path d="M 95 160 Q 70 185 60 200 Q 66 205 78 190 Q 95 175 105 165 Z" fill="#1e293b" stroke="#0f172a" stroke-width="2" />
    <!-- Shin & Foot -->
    <path d="M 60 200 L 45 220 L 35 224 M 45 220 L 48 226 M 45 220 L 55 225" stroke="#334155" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
    <!-- Back Claw Spurs -->
    <path d="M 50 215 L 56 218" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" />
  </g>

  <!-- Streaming Plume Tail (Layered feathers) -->
  <g id="tail-plumes">
    <path d="M 90 145 C 50 150 25 130 15 110 C 35 125 65 135 85 140 Z" fill="#0369a1" stroke="#082f49" stroke-width="1.5" />
    <path d="M 92 152 C 55 165 30 150 10 135 C 32 148 68 155 88 148 Z" fill="#0284c7" stroke="#082f49" stroke-width="1.5" />
    <path d="M 90 158 C 60 178 35 175 18 160 C 40 170 70 170 88 156 Z" fill="#38bdf8" stroke="#082f49" stroke-width="1.5" />
  </g>

  <!-- Muscular Torso & Breast (Aerodynamic crouch) -->
  <path d="M 85 140 C 95 115 130 115 160 135 C 185 150 180 185 145 190 C 115 195 90 175 85 140 Z" fill="url(#bodyGrad)" stroke="#082f49" stroke-width="3" />

  <!-- Belly and Chest highlights -->
  <path d="M 125 150 C 145 155 168 165 155 185 C 135 188 115 182 110 170 C 110 158 120 150 125 150 Z" fill="#0ea5e9" opacity="0.6" />

  <!-- Front Leg (Pumping forward in power stride) -->
  <g id="front-leg">
    <!-- Muscular Drumstick / Thigh -->
    <path d="M 130 165 C 150 170 155 195 140 210 C 130 200 125 185 122 170 Z" fill="url(#legGrad)" stroke="#0f172a" stroke-width="2.5" />
    <!-- Knee & Digitigrade Metatarsal -->
    <path d="M 140 208 L 155 226 L 165 228" stroke="#475569" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
    <!-- Raptor Talons (Fierce curved claws) -->
    <path d="M 155 226 L 175 228 L 180 231" stroke="#e2e8f0" stroke-width="3" stroke-linecap="round" />
    <path d="M 155 226 L 170 232 L 174 235" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round" />
    <path d="M 155 226 L 148 232" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round" />
    <!-- Sickle Claw on Inner Toe (Raptor characteristic) -->
    <path d="M 160 220 Q 166 212 170 215 Q 168 222 162 225 Z" fill="#f8fafc" stroke="#334155" stroke-width="1.5" />
  </g>

  <!-- Folded Swept Wing (Razor plumage) -->
  <g id="wing">
    <path d="M 115 130 C 145 130 170 145 175 160 C 160 172 135 180 105 162 C 100 148 105 135 115 130 Z" fill="url(#wingGrad)" stroke="#0c4a6e" stroke-width="2.5" />
    <!-- Feather Layer 1 -->
    <path d="M 125 142 C 148 145 165 155 168 165 C 150 175 130 175 115 160 Z" fill="#0284c7" stroke="#082f49" stroke-width="1.5" />
    <!-- Feather Layer 2 (Razor tipped) -->
    <path d="M 135 150 L 178 162 M 130 156 L 170 170 M 120 162 L 158 176" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" />
  </g>

  <!-- Sleek Aerodynamic Neck -->
  <path d="M 155 140 C 175 125 185 105 195 85 C 205 92 205 105 180 145 Z" fill="url(#bodyGrad)" stroke="#082f49" stroke-width="2.5" />

  <!-- Fierce Raptor Head & Crest -->
  <g id="head-crest">
    <!-- Back Horn / Razor Crest (Signature horn-crest, curves back dynamically) -->
    <path d="M 188 82 C 180 60 155 35 130 25 C 155 40 175 60 182 80 Z" fill="url(#crestGrad)" stroke="#0369a1" stroke-width="2" filter="url(#glow)" />
    <!-- Secondary Crest Spines -->
    <path d="M 192 78 C 178 55 158 45 140 40 C 160 52 178 68 185 78 Z" fill="#38bdf8" stroke="#0284c7" stroke-width="1.5" />
    <path d="M 194 85 C 180 72 165 65 152 62 C 168 70 182 80 188 86 Z" fill="#7dd3fc" stroke="#0369a1" stroke-width="1.5" />

    <!-- Head Skull Structure -->
    <path d="M 182 82 C 190 68 210 68 220 78 C 225 85 220 100 205 102 C 192 104 184 95 182 82 Z" fill="#0284c7" stroke="#082f49" stroke-width="2.5" />

    <!-- Sharp Curved Hooked Beak (Metallic Razorbeak) -->
    <path d="M 218 78 C 235 78 248 85 252 98 C 248 108 238 108 226 102 L 216 100 Z" fill="url(#beakGrad)" stroke="#1e293b" stroke-width="2" />
    <!-- Beak cutting edge & Rune groove -->
    <path d="M 220 86 Q 238 88 248 98" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" />
    <circle cx="225" cy="84" r="1.5" fill="#38bdf8" />

    <!-- Piercing Predatory Eye -->
    <ellipse cx="205" cy="82" rx="5" ry="3.5" fill="#f59e0b" stroke="#0f172a" stroke-width="1.2" />
    <circle cx="206" cy="82" r="2" fill="#090d16" />
    <circle cx="207.5" cy="81" r="0.8" fill="#ffffff" />
    <!-- Fierce Brow Feather -->
    <path d="M 198 78 Q 208 76 215 80" stroke="#082f49" stroke-width="2.2" stroke-linecap="round" />
  </g>

  <!-- Speed Energy Sparks / Storm Celerity Fx -->
  <circle cx="242" cy="74" r="1.5" fill="#38bdf8" opacity="0.8" />
  <circle cx="160" cy="30" r="2" fill="#7dd3fc" opacity="0.7" />
  <path d="M 235 70 L 240 75 L 235 80" stroke="#38bdf8" stroke-width="1.2" fill="none" opacity="0.6" />
  <circle cx="18" cy="115" r="1.5" fill="#38bdf8" opacity="0.7" />
</svg>
`;

// 2. Generate Swiftbeak Tactical Portrait (135x135 PNG)
// A high-stakes tactical card portrait showing a menacing close-up of the Razorbeak Strider
const swiftbeakPortraitSvg = `
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="45%" r="60%">
      <stop offset="0%" stop-color="#0f2b48" />
      <stop offset="60%" stop-color="#08182b" />
      <stop offset="100%" stop-color="#020813" />
    </radialGradient>

    <linearGradient id="crestP" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="50%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#bae6fd" />
    </linearGradient>

    <linearGradient id="beakP" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f1f5f9" />
      <stop offset="40%" stop-color="#94a3b8" />
      <stop offset="100%" stop-color="#334155" />
    </linearGradient>

    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="50%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#0369a1" />
    </linearGradient>

    <filter id="portraitGlow">
      <feGaussianBlur stdDeviation="4" result="glow" />
      <feComposite in="SourceGraphic" in2="glow" operator="over" />
    </filter>
  </defs>

  <!-- Background Canvas -->
  <rect width="256" height="256" fill="url(#bgGrad)" />

  <!-- Speed Energy Gusts behind portrait -->
  <path d="M 0 60 Q 120 40 256 90" stroke="#0284c7" stroke-width="3" opacity="0.3" fill="none" />
  <path d="M 0 110 Q 140 90 256 150" stroke="#38bdf8" stroke-width="2" opacity="0.25" fill="none" />
  <path d="M 0 180 Q 100 160 256 210" stroke="#0ea5e9" stroke-width="2.5" opacity="0.3" fill="none" />

  <!-- Massive Curved Horn Crest (Signature Feature) -->
  <g filter="url(#portraitGlow)">
    <!-- Primary Silver-Azure Horn -->
    <path d="M 125 105 C 100 65 65 30 15 15 C 55 35 90 68 115 110 Z" fill="url(#crestP)" stroke="#0369a1" stroke-width="2.5" />
    <!-- Secondary Crest Plumes -->
    <path d="M 135 100 C 115 65 85 42 45 32 C 80 50 110 75 128 105 Z" fill="#38bdf8" stroke="#0284c7" stroke-width="2" />
    <path d="M 142 110 C 125 80 102 60 70 52 C 98 68 120 88 135 115 Z" fill="#7dd3fc" stroke="#0c4a6e" stroke-width="1.8" />
  </g>

  <!-- Feathery Neck & Shoulders -->
  <path d="M 80 256 C 90 190 120 165 145 145 C 175 170 210 215 230 256 Z" fill="#0369a1" stroke="#082f49" stroke-width="3" />
  <!-- Feather Texture Scales -->
  <path d="M 110 200 Q 130 185 150 200" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.7" />
  <path d="M 130 225 Q 150 210 170 225" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.7" />
  <path d="M 150 250 Q 170 235 190 250" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.7" />

  <!-- Head Base -->
  <path d="M 120 110 C 130 85 165 80 190 95 C 205 105 200 135 170 145 C 145 148 128 135 120 110 Z" fill="#0284c7" stroke="#082f49" stroke-width="3" />

  <!-- Hooked Razor Beak -->
  <path d="M 188 95 C 215 95 240 108 248 125 C 242 142 225 142 205 135 L 185 130 Z" fill="url(#beakP)" stroke="#1e293b" stroke-width="3" />
  <!-- Razor Sharp Cutting Edge Highlight -->
  <path d="M 190 108 Q 222 110 242 125" stroke="#bae6fd" stroke-width="2" stroke-linecap="round" fill="none" />
  <!-- Beak Nostril & Detail -->
  <ellipse cx="198" cy="104" rx="3" ry="1.5" fill="#334155" />

  <!-- Glowing Raptor Eye -->
  <g>
    <!-- Dark Eye Socket -->
    <polygon points="152,104 168,98 180,105 168,110" fill="#090d16" stroke="#082f49" stroke-width="1.5" />
    <!-- Iris -->
    <ellipse cx="166" cy="104" rx="7" ry="5" fill="#f59e0b" stroke="#78350f" stroke-width="1.2" />
    <!-- Slit Pupil (Predatory) -->
    <ellipse cx="167" cy="104" rx="2.5" ry="4.5" fill="#030712" />
    <!-- Specular Glimmer -->
    <circle cx="169" cy="102" r="1.5" fill="#ffffff" />
    <!-- Eye Brow Ridge -->
    <path d="M 150 98 Q 168 93 182 100" stroke="#082f49" stroke-width="3.5" stroke-linecap="round" fill="none" />
  </g>

  <!-- Storm Spark Particles -->
  <circle cx="230" cy="85" r="2" fill="#38bdf8" opacity="0.8" />
  <circle cx="50" cy="25" r="2.5" fill="#bae6fd" opacity="0.85" />
  <circle cx="35" cy="50" r="1.5" fill="#38bdf8" opacity="0.6" />

  <!-- Vignette & Frame Overlay -->
  <rect x="3" y="3" width="250" height="250" rx="8" fill="none" stroke="url(#borderGrad)" stroke-width="6" />
  <rect x="8" y="8" width="240" height="240" rx="6" fill="none" stroke="#082f49" stroke-width="2" opacity="0.8" />
  <!-- Corner Tech Gems -->
  <circle cx="12" cy="12" r="3.5" fill="#38bdf8" />
  <circle cx="244" cy="12" r="3.5" fill="#38bdf8" />
  <circle cx="12" cy="244" r="3.5" fill="#38bdf8" />
  <circle cx="244" cy="244" r="3.5" fill="#38bdf8" />
</svg>
`;

async function main() {
  console.log('Rendering new original Swiftbeak assets with Sharp...');

  // Render Sprite (185x195 to match original sprite bbox)
  const spritePng = await sharp(Buffer.from(swiftbeakSpriteSvg))
    .resize(185, 195, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const spritePath = path.join(outputDir, 'swiftbeak-sprite.png');
  fs.writeFileSync(spritePath, spritePng);
  console.log(`Saved new Swiftbeak battle sprite to ${spritePath} (${spritePng.length} bytes)`);

  // Render Portrait (135x135 to match standard portrait dimensions)
  const portraitPng = await sharp(Buffer.from(swiftbeakPortraitSvg))
    .resize(135, 135)
    .png()
    .toBuffer();

  const portraitPath = path.join(outputDir, 'swiftbeak-portrait.png');
  fs.writeFileSync(portraitPath, portraitPng);
  console.log(`Saved new Swiftbeak portrait to ${portraitPath} (${portraitPng.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
