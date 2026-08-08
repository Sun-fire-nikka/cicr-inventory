<div align="center">

<img src="./logo.png" width="90" alt="CICR Logo" />

### Creative & Innovative Cell in Robotics — Inventory System

**Where creative hardware meets autonomous coordination.**
Track, reserve, and deploy microcontrollers, sensors, and actuators from JIIT's robotics vault to your development bench.

[![Live Demo](https://img.shields.io/badge/LIVE-cicrinventory.vercel.app-00f0ff?style=for-the-badge&logo=vercel&logoColor=white)](https://cicrinventory.vercel.app/)
[![Repo](https://img.shields.io/badge/GITHUB-CICR__Inventory-bd00ff?style=for-the-badge&logo=github&logoColor=white)](https://github.com/simplyvardaan/CICR_Inventory)
[![License](https://img.shields.io/badge/LICENSE-MIT-1e2327?style=for-the-badge)](#license)

</div>

<br>

<div align="center">
<img src="https://img.shields.io/badge/STATUS-ACTIVE-00f0ff?style=flat-square" />
<img src="https://img.shields.io/badge/BUILD-Vite%20%2B%20TypeScript-bd00ff?style=flat-square" />
<img src="https://img.shields.io/badge/DEPLOY-Vercel-black?style=flat-square" />
</div>

<br>

---

## 📡 System Overview

**CICR VAULT** is the official inventory management platform for the **Creative & Innovative Cell in Robotics (CICR)** at **Jaypee Institute of Information Technology (JIIT), Sector-128, Noida**.

No more group-chat scavenger hunts for a missing Arduino or a lost servo. CICR VAULT gives every club member a single, live registry of the cell's hardware — what exists, where it's stored, who has it, and when it's coming back.

```
> INIT CICR_VAULT...
> LOADING COMPONENT DATABASE...
> SIGNAL STABLE // NODES ACTIVE
> READY FOR DEPLOYMENT.
```

---

## ⚙️ Core Features

| Module | What it does |
|---|---|
| 🔐 **Auth** | Username/password login + sign-up, so every checkout is tied to a real member |
| 📊 **Dashboard** | Live counters — total vaulted stock, active loans, low reserves, active project groups |
| 🗂️ **Vault Registry** | Searchable, filterable catalog across Microcontrollers, Sensors, Actuators, Power, and Tools |
| ➕ **Add Component** | Register new hardware with category, quantity, storage location, and full specs |
| 🔄 **Borrow / Return** | Checkout flow that logs borrower name, roll number, quantity, and purpose — with live stock limits |
| 🕓 **History** | Full transaction log of every checkout, return, and inventory update, for accountability |
| ℹ️ **About** | Info on the CICR cell, specializations, and lab facility |

---

## 🛠️ Tech Stack

<div align="center">

| Frontend | Tooling | Deployment |
|:---:|:---:|:---:|
| TypeScript | Vite | Vercel |
| HTML5 / CSS3 | npm | GitHub |

</div>

> Styled with a dark, neon cyberpunk aesthetic — glassmorphism panels, cyan/purple glow accents, and a HUD-style status bar (`SIGNAL STABLE // LATENCY 14MS // NODES ACTIVE`) baked right into the UI.

---

## 🚀 Getting Started

```bash
# Clone the vault
git clone https://github.com/simplyvardaan/CICR_Inventory.git
cd CICR_Inventory

# Install dependencies
npm install

# Run the dev server
npm run dev
```

Then open the printed local URL (usually `http://localhost:5173`) in your browser.

**Build for production:**

```bash
npm run build
```

---

## 📁 Project Structure

```
CICR_Inventory/
├── public/          # Static assets
├── src/             # Application source
├── index.html       # Entry point
├── logo.png         # CICR logo
├── package.json     # Dependencies & scripts
├── tsconfig.json     # TypeScript config
└── README.md         # You are here
```

---

## 🧭 Roadmap

- [ ] Role-based access (admin vs. member)
- [ ] QR-code component tagging for instant lookup
- [ ] Overdue-loan notifications
- [ ] Export vault data (CSV / PDF reports)

---

## 🤝 Contributing

Built by and for CICR members — contributions, bug reports, and feature ideas are welcome.

1. Fork the repo
2. Create a branch (`git checkout -b feature/your-idea`)
3. Commit your changes
4. Open a pull request

---

## 📜 License

Distributed under the MIT License. Built with 🧠 + 🔧 by the Creative & Innovative Cell in Robotics, JIIT-128.

<div align="center">

**© 2026 CICR VAULT — Creative & Innovative Cell in Robotics**
*Instant component access. Robotics vault system.*

</div>
