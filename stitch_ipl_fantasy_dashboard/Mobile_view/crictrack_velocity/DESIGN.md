# Design System Document: The Kinetic Pulse

## 1. Overview & Creative North Star

### Creative North Star: "The Neon Arena"
This design system is not merely a data interface; it is a high-octane, editorialized digital stadium. We move away from the "SaaS-grid" fatigue by embracing **The Neon Arena**—a philosophy that treats every screen as a premium match-day broadcast. We achieve this through deep tonal immersion, aggressive typographic hierarchy, and intentional "breathing room" that allows complex player statistics to feel like curated insights rather than raw data.

### Breaking the Template
To avoid a generic look, this system utilizes:
*   **Intentional Asymmetry:** Off-setting data densities to guide the eye toward "MVP" moments.
*   **Cinematic Depth:** Using layered dark surfaces that mimic the physical depth of a stadium under floodlights.
*   **High-Contrast Chronology:** Prioritizing numbers and names through massive scale shifts, ensuring the "Who" and the "Score" are undeniable.

---

## 2. Colors

The palette is rooted in a "Deep Space" navy, providing a low-fatigue foundation for vibrant, high-energy accents.

### Core Tokens
*   **Background:** `#0b0e14` (The infinite canvas)
*   **Primary (Action):** `#b6a0ff` / `#7e51ff` (Vibrant Indigo for primary focus)
*   **Secondary (Momentum):** `#fd9000` (Orange for upcoming events/warnings)
*   **Tertiary (Success):** `#24f07e` (Electric Green for online status and point gains)

### The "No-Line" Rule
**Designers are prohibited from using 1px solid borders to section content.** 
Traditional borders create visual "noise" that traps data. Instead, define boundaries through:
1.  **Background Shifts:** Use `surface_container_low` vs. `surface` to designate a new area.
2.  **Tonal Transitions:** Use a soft gradient or a change in surface tier to imply a container.

### The "Glass & Gradient" Rule
To elevate the UI beyond standard components:
*   **Floating Elements:** Use Glassmorphism (Backdrop blur 20px + `surface_variant` at 40% opacity) for headers or sidebars.
*   **Signature Textures:** Apply a subtle linear gradient from `primary` to `primary_dim` (135°) for main CTAs to add a "poly-synthetic" premium feel.

---

## 3. Typography

The typographic system uses a "Dual-Engine" approach: **Plus Jakarta Sans** for commanding headlines and **Manrope** for high-performance data reading.

| Level | Token | Font | Size | Character |
| :--- | :--- | :--- | :--- | :--- |
| **Display** | `display-lg` | Plus Jakarta Sans | 3.5rem | Bold, tight tracking. For major scores. |
| **Headline** | `headline-md` | Plus Jakarta Sans | 1.75rem | Medium. For section headers (e.g., "LOBBY"). |
| **Title** | `title-sm` | Manrope | 1.0rem | Semi-bold. For player names and card titles. |
| **Body** | `body-md` | Manrope | 0.875rem | Regular. For secondary stats and descriptions. |
| **Label** | `label-sm` | Inter | 0.6875rem | All-caps, tracked out (+5%). For meta-data labels. |

**The Identity Rule:** Typography must convey authority. Large numbers should be at least 2x the size of their accompanying labels to ensure immediate data ingestion.

---

## 4. Elevation & Depth

We eschew "flat" design for **Tonal Layering**.

*   **The Layering Principle:** Depth is achieved by "stacking" surface tiers. Place a `surface_container_highest` player card on a `surface_container_low` section background. This creates a natural, soft lift.
*   **Ambient Shadows:** Use shadows sparingly. When used for floating modals, use a custom formula: `0 24px 48px rgba(0, 0, 0, 0.4)`. The shadow must never look gray; it must look like the background color is simply darker.
*   **The "Ghost Border":** If a separation is required for accessibility, use the `outline_variant` token at **15% opacity**. It should be felt, not seen.
*   **Backdrop Blurs:** On mobile, sidebars must use a `20px` blur to allow the stadium colors to bleed through, maintaining the "Neon Arena" immersion.

---

## 5. Components

### Cards & Leaderboards
*   **The Rule:** No dividers. Separate player rows using a background shift to `surface_container_high` on hover, or 16px of vertical white space.
*   **Visual Soul:** Cards should have a `xl` (0.75rem) corner radius to feel modern and tactile.

### Buttons (The Kinetic Triggers)
*   **Primary:** `primary` background with `on_primary` text. No border. Subtle `primary_dim` shadow on hover.
*   **Secondary (The Outlined Ghost):** No background. `outline_variant` at 20% opacity for the border. Text in `primary`.

### Segmented Controls (Filter Bars)
*   Use a "Pill" container (`surface_container_highest`).
*   Selected state uses the `primary` color with a subtle inner glow. This mimics a tactile physical switch.

### Interaction Elements
*   **Checkboxes/Radios:** Use `primary` for selected states. The transition should be a smooth 200ms "pop" to reinforce the kinetic feel.
*   **Input Fields:** Ghost style. No background fill, only a bottom border using `outline_variant` at 30%. On focus, animate the bottom border to `primary` with 2px thickness.

---

## 6. Do's and Don'ts

### Do
*   **Do** use extreme contrast for point values (e.g., White text on Deep Navy).
*   **Do** allow for generous horizontal padding in tables (at least 24px) to let the data "breathe."
*   **Do** use `tertiary` (Green) for all "Live" or "Online" indicators to signify active energy.

### Don't
*   **Don't** use pure black (`#000000`) for backgrounds; it kills the "Neon Arena" glow. Stick to the `surface` tokens.
*   **Don't** use 1px solid white borders; they look like a template. Use the "Ghost Border" at low opacity.
*   **Don't** clutter the mobile view. Hide non-essential stats behind a "Details" chevron to maintain the sleek aesthetic.

---

*Director's Note: Every pixel should feel like it was placed by a curator, not a framework. If a component feels "standard," break it. Use the tokens to build depth, not just boxes.*