# Design System Specification: High-Fidelity Sports Analytics

## 1. Overview & Creative North Star: "The Digital Curator"
The Creative North Star for this design system is **The Digital Curator**. In the world of high-stakes sports analytics, data is often chaotic. This system rejects the cluttered "dashboard" trope in favor of an editorial, high-end experience. It treats every data point like an artifact in a gallery.

To break the "template" look, we move away from rigid, boxed grids. We utilize **intentional asymmetry**, where large `display-lg` typography sits offset against dense data visualizations. We use overlapping elements—such as player cards partially submerged in `surface-container` backgrounds—to create a sense of three-dimensional space. This is not just a tool; it is a premium command center.

---

## 2. Colors & Tonal Depth
The palette is rooted in a deep, nocturnal foundation, utilizing the tension between `Deep Navy` and `Electric Indigo` to signify intelligence and kinetic energy.

### The "No-Line" Rule
**Strict Prohibition:** Designers are prohibited from using 1px solid borders for sectioning or containment. Traditional lines create visual noise that cheapens the "Elite" feel.
- **The Alternative:** Define boundaries through background color shifts. A `surface-container-low` section sitting on a `surface` background provides all the separation the eye needs.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of materials. 
- **Base Layer:** `surface` (#0b1326).
- **Secondary Sections:** `surface-container-low` (#131b2e).
- **Interactive Cards:** `surface-container-high` (#222a3d).
- **Hover/Active States:** `surface-container-highest` (#2d3449).
*Nesting Example:* An analytics widget (`surface-container-high`) should sit inside a sidebar (`surface-container-low`) to create a natural "lift" without a single line of stroke.

### The Glass & Gradient Rule
To inject "soul" into the interface:
- **Glassmorphism:** Use `surface-variant` at 60% opacity with a `24px` backdrop blur for floating navigation bars or modal overlays.
- **Signature Gradients:** For primary CTAs and hero data points, use a linear gradient: `primary` (#c0c1ff) to `primary-container` (#8083ff). This prevents the UI from feeling "flat" or "default."

---

## 3. Typography: The Editorial Voice
We use a dual-font strategy to balance high-end editorial flair with technical precision.

*   **Display & Headlines (Manrope):** Chosen for its modern, geometric character. Use `display-lg` for "Big Numbers" (e.g., Win Probabilities) to create an authoritative, magazine-like feel.
*   **Body & Labels (Inter):** The workhorse for high-density data. Inter’s tall x-height ensures readability in complex stat tables.

**Hierarchy as Identity:**
- **Asymmetric Scaling:** Use `display-md` next to `label-sm` to create high-contrast layouts. This "Large-vs-Small" dynamic feels more intentional and premium than standard incremental scaling.

---

## 4. Elevation & Depth: Tonal Layering
We do not use shadows to simulate height; we use light and opacity.

### The Layering Principle
Depth is achieved by "stacking" the surface-container tiers. Place a `surface-container-lowest` card on a `surface-container-low` section to create a soft "recessed" effect. This mimics high-end automotive interiors where materials are layered, not just outlined.

### Ambient Shadows & Ghost Borders
- **Shadows:** When an element must "float" (like a dropdown), use an extra-diffused shadow: `0px 20px 40px rgba(0, 0, 0, 0.4)`. The shadow must be tinted with the `on-surface` color to feel natural.
- **The Ghost Border:** If accessibility requires a stroke, use `outline-variant` at **20% opacity**. It should be felt, not seen.

---

## 5. Component Guidelines

### Buttons (The "Action" Primitive)
- **Primary:** Gradient fill (`primary` to `primary-container`) with `on-primary` text. No border. `xl` (0.75rem) corner radius.
- **Secondary:** `surface-container-highest` fill. Soft transition on hover to 100% opacity.
- **Tertiary:** Ghost style. No background, `primary` text. Use for low-priority actions like "Cancel" or "View All."

### Cards & Lists (Data Containers)
- **Strict Rule:** **Forbid divider lines.** 
- Use `spacing-6` (1.5rem) of vertical whitespace to separate list items. 
- For cards, use `surface-container-high` and a subtle `0.5rem` (lg) or `0.75rem` (xl) corner radius.

### Input Fields
- **Resting State:** `surface-container-lowest` fill.
- **Focus State:** `ghost border` (outline-variant at 40%) and a subtle glow using the `primary` color at 10% opacity.
- **Typography:** Labels must use `label-md` in `on-surface-variant` for a sophisticated, muted look.

### Analytics Chips
- Use `secondary-container` for resting states. 
- Use a `tertiary` (#ffb95f) accent for "Live" or "Critical" data chips to provide a sophisticated gold pop against the deep navy.

---

## 6. Do's and Don'ts

### Do:
- **Do** use whitespace as a structural element. If an interface feels "empty," increase the typography scale of the headline rather than adding a border.
- **Do** use `manrope` for any number over 24px. Statistics are the "hero" of this system.
- **Do** ensure all text on `surface` backgrounds meets WCAG AA contrast ratios using the `on-surface` and `on-background` tokens.

### Don't:
- **Don't** use pure black (#000). Always use the `surface` (#0b1326) for true premium depth.
- **Don't** use standard "drop shadows" with 0 blur. It breaks the "Digital Curator" aesthetic.
- **Don't** use 100% opaque borders. This is the fastest way to make a high-fidelity system look like a low-fidelity wireframe.