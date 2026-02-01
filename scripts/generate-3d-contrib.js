// scripts/generate-3d-contrib.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ISO_ANGLE = Math.PI / 6; // 30 degrees for isometric projection
const COS_A = Math.cos(ISO_ANGLE);
const SIN_A = Math.sin(ISO_ANGLE);

async function fetchContributions(username, token) {
  const query = `
    query($userName:String!) {
      user(login: $userName) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }
    }
  `;
  const response = await axios.post(
    'https://api.github.com/graphql',
    { query, variables: { userName: username } },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'github-actions-contrib-script'
      },
      timeout: 15000
    }
  );
  console.log('GraphQL response keys:', Object.keys(response.data || {}));
  if (response.data && response.data.errors) {
    console.error('GraphQL errors:', JSON.stringify(response.data.errors, null, 2));
  }
  return response.data;
}

function getColor(count) {
  // Base green palette; adjust brightness by count
  if (count === 0) return '#0d1117';
  if (count < 5) return '#0e4429';
  if (count < 10) return '#006d32';
  if (count < 20) return '#26a641';
  if (count < 50) return '#39d353';
  return '#56d364';
}

function shadeColor(hex, percent) {
  // simple shade function: percent negative -> darker, positive -> lighter
  const num = parseInt(hex.replace('#',''),16);
  const r = (num >> 16) + Math.round(255 * percent);
  const g = ((num >> 8) & 0x00FF) + Math.round(255 * percent);
  const b = (num & 0x0000FF) + Math.round(255 * percent);
  const clamp = v => Math.max(0, Math.min(255, v));
  return '#' + ((1<<24) + (clamp(r)<<16) + (clamp(g)<<8) + clamp(b)).toString(16).slice(1);
}

function isoProject(x, y, z, cellSize, depthScale, originX, originY) {
  // isometric projection of a 3D point to 2D SVG coordinates
  const px = originX + (x - y) * cellSize * COS_A;
  const py = originY + (x + y) * cellSize * SIN_A - z * depthScale;
  return { x: px, y: py };
}

function polygon(points) {
  return points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

function generate3DGridSvg(contributions, username) {
  if (!contributions || !contributions.data || !contributions.data.user || !contributions.data.user.contributionsCollection) {
    throw new Error('Invalid API response structure. Missing contributionsCollection.');
  }

  const calendar = contributions.data.user.contributionsCollection.contributionCalendar;
  const weeks = calendar.weeks;
  const totalContributions = calendar.totalContributions || 0;

  // Layout parameters
  const cellSize = 18;         // base footprint size
  const spacing = 4;           // gap between cells
  const depthScale = 4;        // how many px per contribution unit in height
  const maxHeightUnits = 12;   // cap height for visual reasons
  const originX = 80;          // left margin
  const originY = 140;         // top margin

  // Compute width/height for SVG canvas
  const cols = weeks.length;
  const rows = weeks[0] ? weeks[0].contributionDays.length : 7;
  const approxWidth = originX + (cols + rows) * (cellSize + spacing) * COS_A + 200;
  const approxHeight = originY + (cols + rows) * (cellSize + spacing) * SIN_A + maxHeightUnits * depthScale + 200;

  // SVG header
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${Math.ceil(approxWidth)}" height="${Math.ceil(approxHeight)}" viewBox="0 0 ${Math.ceil(approxWidth)} ${Math.ceil(approxHeight)}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#071018"/>
      <stop offset="100%" stop-color="#071a12"/>
    </linearGradient>
    <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="0.6"/>
    </filter>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; fill: #cfe8d6; }
      .label { font-size: 20px; font-weight: 700; }
      .sub { font-size: 12px; fill: #9fb7a6; }
      .cube { filter: url(#softShadow); }
      .animate-rise { animation: rise 1.2s ease-out both; }
      @keyframes rise {
        from { transform: translateY(20px) scale(0.98); opacity: 0; }
        to { transform: translateY(0) scale(1); opacity: 1; }
      }
    </style>
  </defs>

  <rect width="100%" height="100%" fill="url(#bgGrad)"/>
  <text x="${Math.ceil(approxWidth/2)}" y="36" class="label" text-anchor="middle">${username}'s 3D Contributions</text>
  <text x="${Math.ceil(approxWidth/2)}" y="58" class="sub" text-anchor="middle">Total ${totalContributions} contributions</text>
`;

  // Draw cubes week by week
  weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day, dayIndex) => {
      const count = day.contributionCount || 0;
      // Map count to height units
      const heightUnits = Math.min(maxHeightUnits, Math.round(Math.log2(count + 1) * 2)); // logarithmic scaling for nicer visuals
      const z = heightUnits; // z in units
      const baseColor = getColor(count);
      const topColor = shadeColor(baseColor, 0.18);
      const leftColor = shadeColor(baseColor, -0.12);
      const rightColor = shadeColor(baseColor, -0.25);

      // compute grid x,y in footprint coordinates
      const gx = weekIndex;
      const gy = dayIndex;

      // footprint origin for this cell (in grid units)
      const footprintX = gx * (cellSize + spacing);
      const footprintY = gy * (cellSize + spacing);

      // corners of the top face in 3D (z = heightUnits)
      const p0 = isoProject(footprintX, footprintY, z, cellSize, depthScale, originX, originY);
      const p1 = isoProject(footprintX + cellSize, footprintY, z, cellSize, depthScale, originX, originY);
      const p2 = isoProject(footprintX + cellSize, footprintY + cellSize, z, cellSize, depthScale, originX, originY);
      const p3 = isoProject(footprintX, footprintY + cellSize, z, cellSize, depthScale, originX, originY);

      // corners of the bottom face (z = 0)
      const b0 = isoProject(footprintX, footprintY, 0, cellSize, depthScale, originX, originY);
      const b1 = isoProject(footprintX + cellSize, footprintY, 0, cellSize, depthScale, originX, originY);
      const b2 = isoProject(footprintX + cellSize, footprintY + cellSize, 0, cellSize, depthScale, originX, originY);
      const b3 = isoProject(footprintX, footprintY + cellSize, 0, cellSize, depthScale, originX, originY);

      // Build faces: top, left, right
      const topPoly = polygon([p0, p1, p2, p3]);
      const leftPoly = polygon([p3, p2, b2, b3]);   // back/left face
      const rightPoly = polygon([p1, p2, b2, b1]);  // right face

      // Slight animation delay by position for nicer effect
      const delay = (weekIndex * 0.02 + dayIndex * 0.01).toFixed(2);

      // If count is zero, draw a subtle flat tile instead of a tall cube
      if (count === 0) {
        const flatTop = polygon([b0, b1, b2, b3]);
        svg += `  <polygon points="${flatTop}" fill="#071014" stroke="#0b1a12" stroke-opacity="0.4" />\n`;
      } else {
        svg += `  <g class="cube animate-rise" style="animation-delay:${delay}s">\n`;
        svg += `    <polygon points="${leftPoly}" fill="${leftColor}" stroke="${shadeColor(leftColor, -0.08)}" stroke-width="0.4"/>\n`;
        svg += `    <polygon points="${rightPoly}" fill="${rightColor}" stroke="${shadeColor(rightColor, -0.08)}" stroke-width="0.4"/>\n`;
        svg += `    <polygon points="${topPoly}" fill="${topColor}" stroke="${shadeColor(topColor, -0.06)}" stroke-width="0.6"/>\n`;
        // small tooltip-like data attributes for debugging
        svg += `    <title>${day.date}: ${count} contributions</title>\n`;
        svg += `  </g>\n`;
      }
    });
  });

  svg += `</svg>\n`;
  return svg;
}

async function main() {
  const username = process.env.GITHUB_ACTOR;
  const token = process.env.GH_PAT || process.env.GITHUB_TOKEN || process.env.PAT;

  if (!username) {
    console.error('GITHUB_ACTOR is not set. Aborting.');
    process.exit(1);
  }
  if (!token) {
    console.error('No GitHub token found. Set secret GH_PAT or GITHUB_TOKEN in the workflow.');
    process.exit(1);
  }

  console.log(`Generating 3D contribution visualization for ${username}...`);

  try {
    const contributions = await fetchContributions(username, token);

    if (!contributions || !contributions.data || !contributions.data.user) {
      console.error('No user data returned from GitHub GraphQL API. Full response:');
      console.error(JSON.stringify(contributions, null, 2));
      process.exit(1);
    }

    const svg = generate3DGridSvg(contributions, username);

    const dir = path.join(process.cwd(), 'profile-3d-contrib');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, 'profile-green-3d.svg');
    fs.writeFileSync(filePath, svg, 'utf8');
    console.log(`✓ 3D SVG generated successfully at ${filePath}`);
  } catch (err) {
    console.error('Fatal error:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();

