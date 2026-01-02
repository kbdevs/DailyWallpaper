import { Resvg, initWasm } from "@resvg/resvg-wasm";
// @ts-ignore - wasm import
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import { INTER_FONT_BASE64 } from "./font-data";

let wasmInitialized = false;

// Helper to decode base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// iPhone 15 Pro dimensions
const WIDTH = 1179;
const HEIGHT = 2556;

// Design constants - matching reference color palette
const COLORS = {
  background: "#1C1D17",
  completedDay: "#D9D9DA",
  incompleteDayStroke: "#A6A6A4",
  monthLabel: "#898989ff",
  summerYellow: "#E8D9A0", // Yellow hue for summer (June 5 - Aug 13)
  springGreen: "#C5E0B4",  // Green hue for spring (Feb 3 - May 7)
  winterPurple: "#D4C5E8", // Purple hue for winter (Nov 12 - Feb 2)
  holiday: "#B0B0B0",      // Darker white for holidays
};

// Layout constants
const GRID_COLS = 4;
const GRID_ROWS = 3;
const PADDING_TOP = 450; // Space for notch/dynamic island and clock
const PADDING_BOTTOM = 200; // Space for home indicator
const PADDING_HORIZONTAL = 60;
const MONTH_GAP_X = 30;
const MONTH_GAP_Y = 50;
const DOT_RADIUS = 12;
const DOT_GAP = 8;
const LABEL_HEIGHT = 45;

const MONTH_NAMES = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}


const SCHOOL_HOLIDAYS: Array<{month: number, day: number}> = [
  // August - Pre-school Days (before school starts)
  { month: 7, day: 11 }, { month: 7, day: 12 }, { month: 7, day: 13 },
  // September
  { month: 8, day: 1 },  // Labor Day
  { month: 8, day: 29 }, // Professional Development
  // October
  { month: 9, day: 13 }, // Indigenous Peoples Day
  // November
  { month: 10, day: 11 }, // Veterans Day
  { month: 10, day: 26 }, { month: 10, day: 27 }, { month: 10, day: 28 }, // Thanksgiving
  // December - Winter Break
  { month: 11, day: 22 }, { month: 11, day: 23 }, { month: 11, day: 24 },
  { month: 11, day: 25 }, { month: 11, day: 26 }, { month: 11, day: 29 },
  { month: 11, day: 30 }, { month: 11, day: 31 },
  // January
  { month: 0, day: 1 }, { month: 0, day: 2 },  // New Year's
  { month: 0, day: 5 }, { month: 0, day: 6 },  // Professional Development
  { month: 0, day: 19 }, // Martin Luther King Jr Day
  // February - Mid Winter Break
  { month: 1, day: 16 }, { month: 1, day: 17 }, { month: 1, day: 18 },
  { month: 1, day: 19 }, { month: 1, day: 20 },
  // March
  { month: 2, day: 16 }, { month: 2, day: 20 }, // Professional Development
  // April - Spring Break
  { month: 3, day: 6 }, { month: 3, day: 7 }, { month: 3, day: 8 },
  { month: 3, day: 9 }, { month: 3, day: 10 },
  // May
  { month: 4, day: 25 }, // Memorial Day
];

function isHoliday(month: number, day: number): boolean {
  return SCHOOL_HOLIDAYS.some(h => h.month === month && h.day === day);
}

function isSpring(month: number, day: number): boolean {
  // Feb 3 to May 7
  if (month === 1 && day >= 3) return true;
  if (month === 2 || month === 3) return true;
  if (month === 4 && day <= 7) return true;
  return false;
}

function isSummer(month: number, day: number): boolean {
  // June 5 to Aug 13
  if (month === 5 && day >= 5) return true;
  if (month === 6) return true;
  if (month === 7 && day <= 13) return true;
  return false;
}

function isWinter(month: number, day: number): boolean {
  // Nov 12 to Feb 2 (wraps around year)
  if (month === 10 && day >= 12) return true;
  if (month === 11) return true;
  if (month === 0) return true;
  if (month === 1 && day <= 2) return true;
  return false;
}

function generateSVG(currentDate: Date, colored: boolean = false): string {
  const year = currentDate.getFullYear();
  const currentDayOfYear = getDayOfYear(currentDate);
  
  // Calculate total days in the year (account for leap years)
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const totalDaysInYear = isLeapYear ? 366 : 365;
  const yearProgress = (currentDayOfYear - 1) / totalDaysInYear; // -1 because we haven't completed today yet
  const yearPercentage = Math.round(yearProgress * 100);
  
  // Calculate month dimensions
  const availableWidth = WIDTH - (2 * PADDING_HORIZONTAL) - ((GRID_COLS - 1) * MONTH_GAP_X);
  const monthWidth = availableWidth / GRID_COLS;
  
  // Calendar-style layout: 7 columns for days of the week (Sun-Sat)
  const dotsPerRow = 7;
  
  // Max 6 rows needed for calendar view (a month can span up to 6 weeks)
  const maxDotRows = 6;
  const monthHeight = LABEL_HEIGHT + (maxDotRows * (DOT_RADIUS * 2 + DOT_GAP));
  
  // Progress bar constants
  const PROGRESS_BAR_HEIGHT = 16;
  const PROGRESS_BAR_GAP = 35; // Gap between last row and progress bar
  const PROGRESS_LABEL_GAP = 20; // Gap between bar and percentage label
  
  // Calculate total grid height including progress bar and center vertically
  const totalGridHeight = (GRID_ROWS * monthHeight) + ((GRID_ROWS - 1) * MONTH_GAP_Y) + PROGRESS_BAR_GAP + PROGRESS_BAR_HEIGHT;
  const verticalOffset = (HEIGHT - totalGridHeight) / 2;
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${COLORS.background}"/>
  <style>
    .month-label { font-family: sans-serif; font-size: 32px; font-weight: 600; fill: ${COLORS.monthLabel}; letter-spacing: 2px; }
    .progress-label { font-family: sans-serif; font-size: 24px; font-weight: 500; fill: ${COLORS.monthLabel}; }
  </style>`;

  let dayCounter = 0;
  
  // Calculate dot spacing to center 7 dots within monthWidth
  // First dot center at monthX + DOT_RADIUS, last dot center at monthX + monthWidth - DOT_RADIUS
  const dotSpacing = (monthWidth - 2 * DOT_RADIUS) / (dotsPerRow - 1);
  
  for (let month = 0; month < 12; month++) {
    const col = month % GRID_COLS;
    const row = Math.floor(month / GRID_COLS);
    
    const monthX = PADDING_HORIZONTAL + col * (monthWidth + MONTH_GAP_X);
    const monthY = verticalOffset + row * (monthHeight + MONTH_GAP_Y);
    
    const daysInMonth = getDaysInMonth(year, month);
    
    // Get the day of week for the 1st of this month (0 = Sunday, 6 = Saturday)
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    
    // Month label - centered on the month width
    svg += `\n  <text x="${monthX + monthWidth / 2}" y="${monthY}" text-anchor="middle" class="month-label">${MONTH_NAMES[month]}</text>`;
    
    // Day dots
    const dotStartY = monthY + LABEL_HEIGHT;
    
    for (let day = 0; day < daysInMonth; day++) {
      dayCounter++;
      
      // Calculate position based on actual weekday
      const dayOfWeek = (firstDayOfWeek + day) % 7; // 0 = Sunday, 6 = Saturday
      const weekNum = Math.floor((firstDayOfWeek + day) / 7);
      
      const cx = monthX + DOT_RADIUS + dayOfWeek * dotSpacing;
      const cy = dotStartY + weekNum * (DOT_RADIUS * 2 + DOT_GAP) + DOT_RADIUS;
      
      // Completed days are filled, incomplete days (including today) are outlined
      if (dayCounter < currentDayOfYear) {
        // Determine fill color based on season/holiday (colored mode only)
        const dayNum = day + 1; // Convert 0-indexed to 1-indexed day
        let fillColor = COLORS.completedDay;
        
        if (colored) {
          // Priority: holidays > weekends > seasons
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
          if (isHoliday(month, dayNum)) {
            fillColor = COLORS.holiday;
          } else if (isWeekend) {
            fillColor = COLORS.holiday;
          } else if (isWinter(month, dayNum)) {
            fillColor = COLORS.winterPurple;
          } else if (isSpring(month, dayNum)) {
            fillColor = COLORS.springGreen;
          } else if (isSummer(month, dayNum)) {
            fillColor = COLORS.summerYellow;
          }
        }
        
        // Filled circle for completed days
        svg += `\n  <circle cx="${cx}" cy="${cy}" r="${DOT_RADIUS}" fill="${fillColor}"/>`;
      } else {
        // Outlined circle for incomplete days (including today)
        const dayNum = day + 1;
        let strokeColor = COLORS.incompleteDayStroke;
        
        if (colored) {
          // Use muted version of the day's color for the stroke
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          if (isHoliday(month, dayNum)) {
            strokeColor = COLORS.holiday + "80"; // 50% opacity
          } else if (isWeekend) {
            strokeColor = COLORS.holiday + "80";
          } else if (isWinter(month, dayNum)) {
            strokeColor = COLORS.winterPurple + "80";
          } else if (isSpring(month, dayNum)) {
            strokeColor = COLORS.springGreen + "80";
          } else if (isSummer(month, dayNum)) {
            strokeColor = COLORS.summerYellow + "80";
          } else {
            strokeColor = COLORS.completedDay + "80";
          }
        }
        
        svg += `\n  <circle cx="${cx}" cy="${cy}" r="${DOT_RADIUS - 1.5}" fill="none" stroke="${strokeColor}" stroke-width="3"/>`;
      }
    }
    
    // After drawing all months, add the progress bar below the grid
    if (month === 11) { // After December (last month)
      const progressBarY = verticalOffset + (GRID_ROWS * monthHeight) + ((GRID_ROWS - 1) * MONTH_GAP_Y) + PROGRESS_BAR_GAP;
      
      // Calculate the left edge (align with first dot's left edge in first column)
      const leftEdge = PADDING_HORIZONTAL;
      
      // Calculate the right edge (align with last dot's right edge in rightmost column)
      const rightMonthX = PADDING_HORIZONTAL + (GRID_COLS - 1) * (monthWidth + MONTH_GAP_X);
      const rightEdge = rightMonthX + monthWidth;
      
      const totalWidth = rightEdge - leftEdge;
      const labelWidth = 60; // Reserve space for percentage label
      const barWidth = totalWidth - labelWidth - PROGRESS_LABEL_GAP;
      const filledWidth = barWidth * yearProgress;
      
      // Background bar (unfilled portion)
      svg += `\n  <rect x="${leftEdge}" y="${progressBarY}" width="${barWidth}" height="${PROGRESS_BAR_HEIGHT}" rx="${PROGRESS_BAR_HEIGHT / 2}" fill="${COLORS.incompleteDayStroke}" opacity="0.3"/>`;
      
      // Filled portion - use gradient for colored mode
      if (filledWidth > 0) {
        if (colored) {
          // Define gradient with seasonal colors
          // Winter: Jan 1 - Feb 2 (~9%), Spring: Feb 3 - May 7 (~26%), Summer: June 5 - Aug 13 (~19%)
          // Fall: Aug 14 - Nov 11 (~25%), Winter: Nov 12 - Dec 31 (~14%)
          const gradientId = "seasonGradient";
          svg += `\n  <defs>
    <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${COLORS.winterPurple}"/>
      <stop offset="9%" stop-color="${COLORS.winterPurple}"/>
      <stop offset="10%" stop-color="${COLORS.springGreen}"/>
      <stop offset="35%" stop-color="${COLORS.springGreen}"/>
      <stop offset="42%" stop-color="${COLORS.summerYellow}"/>
      <stop offset="61%" stop-color="${COLORS.summerYellow}"/>
      <stop offset="62%" stop-color="${COLORS.completedDay}"/>
      <stop offset="86%" stop-color="${COLORS.completedDay}"/>
      <stop offset="87%" stop-color="${COLORS.winterPurple}"/>
      <stop offset="100%" stop-color="${COLORS.winterPurple}"/>
    </linearGradient>
  </defs>`;
          svg += `\n  <rect x="${leftEdge}" y="${progressBarY}" width="${filledWidth}" height="${PROGRESS_BAR_HEIGHT}" rx="${PROGRESS_BAR_HEIGHT / 2}" fill="url(#${gradientId})"/>`;
        } else {
          svg += `\n  <rect x="${leftEdge}" y="${progressBarY}" width="${filledWidth}" height="${PROGRESS_BAR_HEIGHT}" rx="${PROGRESS_BAR_HEIGHT / 2}" fill="${COLORS.completedDay}"/>`;
        }
      }
      
      // Percentage label on the right (aligned with right edge)
      svg += `\n  <text x="${rightEdge}" y="${progressBarY + PROGRESS_BAR_HEIGHT / 2 + 8}" text-anchor="end" class="progress-label">${yearPercentage}%</text>`;
    }
  }
  
  svg += "\n</svg>";
  return svg;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Get timezone from Cloudflare's geolocation (automatic based on request IP)
    const cf = request.cf as { timezone?: string } | undefined;
    const timezone = cf?.timezone || "UTC";
    
    // Allow specifying a date for testing: ?date=2025-06-15
    let currentDate: Date;
    const dateParam = url.searchParams.get("date");
    if (dateParam) {
      const parsed = new Date(dateParam);
      if (!isNaN(parsed.getTime())) {
        currentDate = parsed;
      } else {
        currentDate = new Date();
      }
    } else {
      // Get current date in the specified timezone
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const parts = formatter.formatToParts(now);
      const year = parseInt(parts.find(p => p.type === "year")?.value || "2025");
      const month = parseInt(parts.find(p => p.type === "month")?.value || "1") - 1;
      const day = parseInt(parts.find(p => p.type === "day")?.value || "1");
      currentDate = new Date(year, month, day);
    }
    
    // Check if colored style is requested
    const colored = url.searchParams.get("style") === "colored";
    
    // Check if user wants SVG directly (no font embedding needed)
    if (url.searchParams.get("format") === "svg") {
      const svg = generateSVG(currentDate, colored);
      return new Response(svg, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
    
    // Decode the base64 font for resvg-wasm
    const fontBuffer = base64ToUint8Array(INTER_FONT_BASE64);
    
    // Generate SVG
    const svg = generateSVG(currentDate, colored);
    
    // Initialize WASM if needed
    if (!wasmInitialized) {
      await initWasm(resvgWasm);
      wasmInitialized = true;
    }
    
    // Convert SVG to PNG with font loaded
    const resvg = new Resvg(svg, {
      font: {
        fontBuffers: [new Uint8Array(fontBuffer)],
        loadSystemFonts: false,
        defaultFontFamily: "Inter",
        sansSerifFamily: "Inter",
      },
      fitTo: {
        mode: "original",
      },
    });
    
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    
    return new Response(pngBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
        "Content-Disposition": 'inline; filename="wallpaper.png"',
      },
    });
  },
};
