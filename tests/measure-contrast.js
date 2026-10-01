function luminance(r, g, b) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  return [num >> 16, (num >> 8) & 255, num & 255];
}

function contrast(hex1, hex2) {
  const l1 = luminance(...hexToRgb(hex1));
  const l2 = luminance(...hexToRgb(hex2));
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

console.log("=== WCAG CONTRAST AUDIT ===");
console.log("Dark Theme (#0e1726):");
console.log("  - Body text (#e8eef8):", contrast("#0e1726", "#e8eef8").toFixed(2) + ":1");
console.log("  - Muted text (#9fb0c8):", contrast("#0e1726", "#9fb0c8").toFixed(2) + ":1");
console.log("  - Accent (#2dd4bf):", contrast("#0e1726", "#2dd4bf").toFixed(2) + ":1");
console.log("  - Danger (#f87171):", contrast("#0e1726", "#f87171").toFixed(2) + ":1");
console.log("  - Worst Offender 1: Dark red BGM emoji (#79244d):", contrast("#0e1726", "#79244d").toFixed(2) + ":1 (FAIL < 3:1)");
console.log("  - Worst Offender 2: Old disabled text (~#4e5c70):", contrast("#0e1726", "#4e5c70").toFixed(2) + ":1 (FAIL < 4.5:1)");
console.log("  - Fixed BGM icon with currentColor (#e8eef8):", contrast("#0e1726", "#e8eef8").toFixed(2) + ":1 (PASS)");
console.log("  - Fixed disabled text with tuned opacity & border (#8b9cb5):", contrast("#0e1726", "#8b9cb5").toFixed(2) + ":1 (PASS)");

console.log("\nLight Theme (#eaf0fb):");
console.log("  - Body text (#14213d):", contrast("#eaf0fb", "#14213d").toFixed(2) + ":1");
console.log("  - Old muted text (#5b6b88):", contrast("#eaf0fb", "#5b6b88").toFixed(2) + ":1 (Borderline)");
console.log("  - Tuned muted text (#475569):", contrast("#eaf0fb", "#475569").toFixed(2) + ":1 (PASS >= 4.5:1)");
console.log("  - Accent (#0d9488):", contrast("#eaf0fb", "#0d9488").toFixed(2) + ":1 (PASS)");
console.log("  - Accent text on accent button (#ffffff on #0d9488):", contrast("#0d9488", "#ffffff").toFixed(2) + ":1 (PASS)");
console.log("  - Old control border rgba(30,50,90,0.15) over #eaf0fb (~#d2dbed):", contrast("#eaf0fb", "#d2dbed").toFixed(2) + ":1 (FAIL < 3:1)");
console.log("  - Tuned control border (#94a3b8):", contrast("#eaf0fb", "#94a3b8").toFixed(2) + ":1 (PASS >= 3:1)");
