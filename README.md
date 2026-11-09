B2B RFQ-to-Quote Estimation Platform


A full-stack, AI-assisted web application designed for manufacturing estimators to reduce RFQ turnaround time from 9 days to under 4 days. This platform replaces manual Excel-based workflows with a centralized, trace-driven quoting engine.

🚀 Core Features
RFQ Dashboard: A centralized register to track RFQ statuses (Estimating, Sent, Won, Lost), due dates, and assigned owners.

AI-Assisted Intake: Automatically extracts part details and suggests routings from uploaded RFQ documents, requiring human-in-the-loop validation by the estimator.

Dense Costing Interface: A purpose-built, spreadsheet-like UI designed for speed. Calculates material weights, routing, cycle times, scrap, overhead, and freight across multiple volume tiers.

Versioned Rate Master: Implements effective dates for standard rates (Machine Hour Rates, etc.) ensuring that historical quotes perfectly retain the pricing active at the time they were generated.

Approval Workflow: Automated gates requiring Sales Head approval for quotes exceeding ₹25 Lakh annual value.

PDF Generation: One-click export of finalized quotes with complete cost breakups.

💻 Tech Stack
Frontend: React / Next.js, Tailwind CSS (Minimal, high-density enterprise UI)

Backend: Node.js, Express / Next API Routes

📁 Repository Structure
├── frontend/          # React/Next.js application (Estimator & Sales Head UI)
├── backend/           # API routes, costing math engine, and PDF generation
├── docs/              # (Optional) Architecture diagrams and schemas
└── README.md          # Project overview

Database: PostgreSQL (Relational schema for complex part/quote/rate relationships)

AI Integration: LLM API (Strict zero-data-retention tier to comply with customer NDAs)
