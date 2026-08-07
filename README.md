# NYC Permit Path

**Scout the right neighborhood before you sign a lease.**

A neighborhood-level explorer for NYC building permit and business license approval timelines. Compare 80 NYC ZIP codes by how long DOB permits actually take to issue, layer in the DCWP licenses your business type requires, and get a projected wait time before you commit to a location.

🔗 **Live app:** [permit-pathfinder-nyc.lovable.app](https://permit-pathfinder-nyc.lovable.app/)

---

## The Problem

Opening a small business in New York City means navigating two separate permitting systems — the Department of Buildings (DOB) for construction and build-out permits, and the Department of Consumer and Worker Protection (DCWP) for business licenses. Approval times vary widely by neighborhood, permit type, and review stage, but that variation isn't visible anywhere at the point where it matters most: **before you sign a lease.**

A prospective restaurant owner comparing two storefronts has no practical way to know that one ZIP code's plumbing review runs a median of 23 days while another's sprinkler review runs 118. That gap can mean months of paying rent on a space you can't open.

NYC Permit Path makes that difference visible.

---

## What It Does

### 🗺️ Explorer
Rank and compare ZIP codes by estimated days to permit issuance, benchmarked against the citywide estimate. Filter by borough and permit type (General Construction, Plumbing, Mechanical Systems, Sprinklers, Sign, Solar). Each ZIP surfaces its specific **review bottleneck** — the stage most likely to hold up your timeline.

### ⏱️ Timeline Estimator
Select a DOB permit type, target ZIP, and business category to generate a projected wait with a confidence score and a min/max range. Because permits and licenses file in parallel, the estimator identifies which single requirement sets your realistic launch date.

### 📊 Borough & Neighborhood Benchmarks
Aggregate views comparing permit performance across boroughs and neighborhoods, for users scouting broadly rather than evaluating a specific address.

### 📡 Live Approvals Feed
Recent permit issuances as they happen, with each one flagged against typical timelines for that ZIP and permit type.

---

## Data Sources

All data comes from [NYC Open Data](https://opendata.cityofnewyork.us/):

| Source | Dataset ID | Used For |
|---|---|---|
| DOB NOW: Build | `rbx6-tga4` | Permit filing and issuance dates, permit types, review stages |
| DCWP License Applications | `ptev-4hud` | Business license categories and application processing times |

Data is cached server-side and refreshed hourly.

**A note on methodology:** estimates are derived from historical medians and reflect observed patterns, not guarantees. Permit timelines depend on application completeness, scope of work, and factors outside the data. This tool is a planning aid, not a substitute for professional guidance from an expeditor or attorney.

---

## Tech Stack

- **Framework:** React + TypeScript
- **Build:** Vite
- **Package manager:** Bun
- **Styling:** Tailwind CSS + shadcn/ui
- **Tooling:** ESLint, Prettier
- **Built with:** [Lovable](https://lovable.dev)

---

## Running Locally

```bash
# Clone the repo
git clone https://github.com/reneej6573/permit-pathfinder-nyc.git
cd permit-pathfinder-nyc

# Install dependencies
bun install

# Start the dev server
bun run dev
```

The app will be available at `http://localhost:5173`.

### Environment Variables

Copy `.env.example` to `.env` and populate the required values:

```bash
cp .env.example .env
```

---

## Project Context

Built for the **Knowledge House × Bloomberg Hackathon** and presented on **June 29, 2026**.

**Team O:**
- Renée Jackson
- Anna Malaschenko
- Jared Turner
- Usman Javid

---

## What's Next?


- [ ] Expand coverage beyond NYC to outer regions
- [ ] Historical trend view — are approval times improving or degrading over time?
- [ ] Cost estimation layered onto timeline projections
- [ ] Saved comparisons and shareable ZIP shortlists
- [ ] Seasonality analysis (does filing month affect approval speed?)
- [ ] AI agent that can show everything above + submit secondary applications on owner's behalf, or send reminders
      in accordance with deadlines

