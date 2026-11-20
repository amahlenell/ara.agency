// Fictional example report from embedded sample HTML; no live website was fetched.
import type { AuditReport } from './audit-report.ts';
export const previewReport: AuditReport = {
  "version": 1,
  "method": "html-baseline",
  "analyzedAt": "2026-11-19T22:00:00.000Z",
  "finalUrl": "https://example.com/",
  "requestedUrl": "https://example.com/",
  "pageTitle": "Sample Beauty Studio | Treatments and bookings",
  "description": "",
  "httpStatus": 200,
  "htmlBytes": 359,
  "responseMs": 120,
  "checksPassed": 14,
  "checksTotal": 16,
  "findings": [
    {
      "id": "title",
      "category": "SEO",
      "status": "pass",
      "priority": "medium",
      "title": "Page title",
      "evidence": "“Sample Beauty Studio | Treatments and bookings” (46 characters).",
      "recommendation": "Keep this in place and verify it after website changes."
    },
    {
      "id": "description",
      "category": "SEO",
      "status": "warning",
      "priority": "medium",
      "title": "Search description",
      "evidence": "No meta description was found.",
      "recommendation": "Add a concise summary of the business and page, usually around 50–170 characters."
    },
    {
      "id": "h1",
      "category": "SEO",
      "status": "pass",
      "priority": "medium",
      "title": "Main page heading",
      "evidence": "1 H1 heading(s) found: Sample Beauty Studio",
      "recommendation": "Keep this in place and verify it after website changes."
    },
    {
      "id": "canonical",
      "category": "SEO",
      "status": "pass",
      "priority": "medium",
      "title": "Canonical URL",
      "evidence": "Declared canonical: https://example.com/",
      "recommendation": "Keep this in place and verify it after website changes."
    },
    {
      "id": "indexing",
      "category": "SEO",
      "status": "pass",
      "priority": "high",
      "title": "Indexing directive",
      "evidence": "No noindex directive was found in HTML or response headers.",
      "recommendation": "Keep this in place and verify it after website changes."
    },
    {
      "id": "viewport",
      "category": "Mobile setup",
      "status": "pass",
      "priority": "high",
      "title": "Mobile viewport",
      "evidence": "Viewport: width=device-width, initial-scale=1",
      "recommendation": "Keep this in place and verify it after website changes."
    },
    {
      "id": "zoom",
      "category": "Mobile setup",
      "status": "pass",
      "priority": "medium",
      "title": "User zoom",
      "evidence": "Viewport checked: width=device-width, initial-scale=1",
      "recommendation": "Keep this in place and verify it after website changes."
    },
    {
      "id": "language",
      "category": "Accessibility",
      "status": "pass",
      "priority": "medium",
      "title": "Document language",
      "evidence": "Document language: en",
      "recommendation": "Keep this in place and verify it after website changes."
    },
    {
      "id": "image-alt",
      "category": "Accessibility",
      "status": "warning",
      "priority": "medium",
      "title": "Image alternatives",
      "evidence": "1 of 1 image(s) have no alt attribute. Empty alt text is allowed for decorative images.",
      "recommendation": "Add useful alt text to informative images and alt=\"\" to decorative images. Review wording manually."
    },
    {
      "id": "form-labels",
      "category": "Accessibility",
      "status": "pass",
      "priority": "high",
      "title": "Form field labels",
      "evidence": "0 of 0 input field(s) lack a detectable label.",
      "recommendation": "Keep this in place and verify it after website changes."
    },
    {
      "id": "html-response",
      "category": "Performance",
      "status": "pass",
      "priority": "medium",
      "title": "HTML response time",
      "evidence": "120 ms from the audit server to the first response headers. This is a single sample, not browser load time.",
      "recommendation": "Keep this in place and verify it after website changes."
    },
    {
      "id": "html-size",
      "category": "Performance",
      "status": "pass",
      "priority": "medium",
      "title": "HTML document size",
      "evidence": "0 KiB of HTML received. Scripts, images, fonts and stylesheets are not included.",
      "recommendation": "Keep this in place and verify it after website changes."
    },
    {
      "id": "scripts",
      "category": "Performance",
      "status": "pass",
      "priority": "medium",
      "title": "Potentially blocking scripts",
      "evidence": "0 external script(s) without async, defer or type=module. Script position and runtime cost need browser review.",
      "recommendation": "Keep this in place and verify it after website changes."
    },
    {
      "id": "contact-action",
      "category": "Conversion",
      "status": "pass",
      "priority": "high",
      "title": "Contact or purchase action",
      "evidence": "Detected link: Book a treatment",
      "recommendation": "Keep this in place and verify it after website changes."
    },
    {
      "id": "https",
      "category": "Security",
      "status": "pass",
      "priority": "high",
      "title": "HTTPS",
      "evidence": "The final page uses HTTPS.",
      "recommendation": "Keep this in place and verify it after website changes."
    },
    {
      "id": "mixed-content",
      "category": "Security",
      "status": "pass",
      "priority": "medium",
      "title": "HTTP asset references",
      "evidence": "0 explicit HTTP asset reference(s) in the page HTML. CSS and runtime requests are not inspected.",
      "recommendation": "Keep this in place and verify it after website changes."
    },
    {
      "id": "visual",
      "category": "Conversion",
      "status": "manual",
      "priority": "medium",
      "title": "Visual design and trust",
      "evidence": "Layout, typography, contrast, visual hierarchy and trust cues have not been visually reviewed.",
      "recommendation": "Review desktop and phone layouts, branding, testimonials and the primary action."
    },
    {
      "id": "mobile-layout",
      "category": "Mobile setup",
      "status": "manual",
      "priority": "medium",
      "title": "Rendered mobile layout",
      "evidence": "Viewport configuration is checked; overflow, tap targets and actual responsive layout are not measured.",
      "recommendation": "Test the page at phone and tablet widths and complete the main customer journey."
    },
    {
      "id": "vitals",
      "category": "Performance",
      "status": "manual",
      "priority": "medium",
      "title": "Browser speed and Core Web Vitals",
      "evidence": "No Lighthouse score, LCP, CLS, INP or real-user performance measurement is included.",
      "recommendation": "Run Lighthouse or PageSpeed Insights and review field data where available."
    },
    {
      "id": "keyboard",
      "category": "Accessibility",
      "status": "manual",
      "priority": "medium",
      "title": "Keyboard and contrast review",
      "evidence": "HTML checks do not establish WCAG compliance. Contrast, keyboard order and screen-reader behavior need testing.",
      "recommendation": "Test the main flow using keyboard navigation, a screen reader and a contrast checker."
    }
  ],
  "limitations": [
    "SAMPLE REPORT: findings come from embedded fictional HTML. No live website was fetched.",
    "One public page is inspected. This is a baseline HTML audit, not a whole-site crawl, visual redesign or compliance assessment.",
    "JavaScript, remote assets and embedded frames are not executed. Client-rendered content may be missing; absent HTML signals require review.",
    "Response time and HTML size describe this request only. They are not a Lighthouse score or a measurement of full page speed."
  ]
};
