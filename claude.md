# CLAUDE.md

## 1. Role and Engineering Mindset

Act as a senior frontend engineer, UI/UX designer, design systems architect, and technical SEO specialist.

Your responsibility is to build a production-ready website that feels premium, trustworthy, modern, fast, and conversion-focused.

Do not merely make the website functional. Make it feel professionally designed, carefully engineered, and consistent across every page.

Every implementation must prioritize:

- Premium visual design and purposeful micro-interactions.
- Consistent design language across the entire website.
- Responsive layouts for mobile, tablet, laptop, and desktop.
- Clear communication of the product, its value, and its pricing.
- Trust-building elements that help visitors feel confident about purchasing.
- Technical SEO and search-engine-friendly rendering.
- Accessibility, performance, maintainability, and clean code.

Think like an engineer responsible for a real SaaS product, not someone building a temporary demo.

## 2. Understand the Existing Project Before Making Changes

Before implementing anything:

1. Inspect the existing project structure, framework, dependencies, routing, components, and styling conventions.
2. Read the package configuration and relevant existing documentation.
3. Identify the existing brand identity, colors, typography, logo, spacing, and component patterns.
4. Understand the target audience, product features, pricing, and conversion goals.
5. Inspect existing pages before creating new layouts or replacing components.
6. Reuse existing components and dependencies wherever practical.
7. Identify any SEO, accessibility, responsiveness, or performance problems in the current implementation.

Do not blindly rewrite working code or introduce a new framework.

Preserve existing functionality unless a change is necessary and intentional. Follow the project's current architecture and improve it incrementally.

If important information is missing, inspect the repository first. Never invent product capabilities, customer numbers, integrations, pricing terms, certifications, or business claims.

## 3. Brand Identity and Visual Consistency

Treat the brand as a cohesive design system.

Every page must look like it belongs to the same product, including the landing page, pricing page, feature pages, navigation, footer, forms, and dashboard where applicable.

### Visual principles

- Use a clean, premium, modern SaaS aesthetic.
- Establish a strong visual hierarchy through typography, spacing, contrast, and composition.
- Prefer deliberate layouts over generic templates.
- Use whitespace to improve readability and create a premium feel.
- Keep headings concise, specific, and impactful.
- Use consistent border radii, shadows, spacing, icon styles, and button dimensions.
- Use the existing logo and brand assets correctly.
- Maintain consistent visual patterns across all pages.
- Ensure the interface feels polished at every viewport size.

### Design tokens

Centralize reusable design values wherever the current stack supports it:

- Brand colors and semantic colors.
- Typography scale and font weights.
- Spacing scale.
- Border radii.
- Shadows and elevation.
- Container widths.
- Breakpoints.
- Animation durations and easing curves.
- Button and input variants.

Avoid introducing arbitrary values or slightly different versions of the same component style across pages.

Do not change established brand colors, typography, or design conventions without a clear reason.

## 4. Premium Micro-Interactions and Animations

Micro-interactions are a core part of the experience, not an afterthought.

Implement subtle, purposeful interactions that make the interface feel responsive and refined.

### Interactions to consider

- Buttons with smooth hover, active, and focus states.
- Cards with subtle elevation or border transitions.
- Navigation links with understated animated indicators.
- Dropdown menus with smooth entry and exit transitions.
- Modals and dialogs with polished opening and closing animations.
- Form fields with clear focus, validation, and error states.
- Loading skeletons that match the final layout.
- Smooth accordion and tab transitions.
- Subtle entrance animations for important sections.
- Scroll-triggered reveals where they improve the storytelling.
- Number transitions or progress indicators where they communicate real data.
- Clear success, warning, empty, and failure states.

### Animation rules

- Prefer CSS transitions and lightweight animation techniques when sufficient.
- Use existing animation libraries if the project already includes them.
- Avoid adding dependencies for trivial animations.
- Keep animations subtle, fast, and consistent.
- Use appropriate easing curves instead of abrupt or mechanical transitions.
- Avoid excessive bouncing, spinning, parallax, or decorative movement.
- Never animate every element just because animation is possible.
- Never make users wait for an animation to finish before accessing important content.
- Respect `prefers-reduced-motion`.
- Ensure animations do not cause layout shifts or negatively affect performance.
- Keep hover effects usable on touch devices.

Every animation must serve a purpose, communicate feedback, improve hierarchy, or add a restrained sense of quality.

## 5. Responsive Design Is Mandatory

Every page and component must work correctly across mobile, tablet, laptop, and desktop.

Do not treat mobile responsiveness as a final cleanup task.

### Requirements

- Design mobile layouts intentionally rather than shrinking desktop layouts.
- Use fluid layouts and appropriate responsive breakpoints.
- Prevent horizontal overflow.
- Ensure headings wrap naturally without awkward line breaks.
- Keep buttons and interactive targets comfortable to use on touchscreens.
- Make navigation accessible on small screens.
- Ensure pricing cards, comparison tables, and feature grids adapt appropriately.
- Preserve visual hierarchy across viewport sizes.
- Scale images and media without distortion.
- Check form layouts, modals, dropdowns, and long content on mobile.
- Ensure sticky elements do not obscure important content.
- Use responsive typography where appropriate.

Test at representative viewport widths, including approximately 360px, 390px, 768px, 1024px, and 1440px.

Do not solve responsiveness by hiding important information on mobile.

## 6. Pricing Must Be Immediately Clear

Pricing is one of the most important conversion elements on the website.

Visitors should understand what the product costs, what they receive, and what they will need to pay later without searching through multiple pages.

For GymBoo, use the currently established pricing terms:

- **₹3,999 lifetime access**
- **₹1,000 yearly renewal fee**

Present the pricing accurately and prominently wherever pricing is a relevant part of the user journey.

### Pricing presentation

- Make the main price visually prominent.
- Clearly explain what lifetime access includes.
- Clearly explain the yearly renewal fee and what it covers, based on verified business terms.
- Never imply that the product has no recurring costs when a yearly renewal fee applies.
- Explain setup charges separately if they exist.
- State the billing frequency and renewal conditions clearly.
- Use clear calls to action such as "Get Started" or "Choose GymBoo".
- Ensure the pricing section is easy to scan on mobile.
- Keep the price consistent across the landing page, pricing page, FAQs, and checkout.
- Do not introduce fake discounts, crossed-out prices, artificial urgency, or misleading savings claims.

If the pricing policy changes in the codebase or product documentation, identify the inconsistency before updating public-facing messaging.

## 7. Landing Page Must Build Trust and Convert

The landing page should clearly answer five questions:

1. What is this product?
2. Who is it for?
3. What problem does it solve?
4. How much does it cost?
5. Why should someone trust it?

A visitor should understand the core value proposition within a few seconds.

### Recommended landing page structure

Adapt the structure to the existing product and avoid unnecessary sections.

1. **Navigation:** Clear branding, essential links, and a visible primary CTA.
2. **Hero section:** A strong value proposition, concise supporting copy, primary CTA, and a genuine product screenshot or interface preview.
3. **Trust indicators:** Verified customer numbers, real testimonials, actual usage statistics, or other substantiated evidence.
4. **Problem and solution:** Explain the operational problems the product solves.
5. **Core features:** Show practical benefits rather than presenting a long list of feature names.
6. **Product demonstration:** Screenshots, workflow previews, or a short demonstration where available.
7. **How it works:** Explain onboarding and daily usage simply.
8. **Testimonials:** Genuine feedback from identifiable or appropriately attributed customers, used with permission.
9. **Pricing:** Prominent and transparent pricing with clear renewal terms.
10. **FAQs:** Address common purchase objections and practical questions.
11. **Final CTA:** Make the next step obvious.
12. **Footer:** Contact details, relevant legal pages, navigation, and company information.

This is a guideline, not a requirement to create every section on every page. Prioritize the sections that genuinely help the customer make a decision.

## 8. Testimonials and Trust Signals

Trust must be demonstrated through evidence,